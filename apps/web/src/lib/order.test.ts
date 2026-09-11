/**
 * The basket, and the gate in front of it.
 *
 * `packages/fixtures/src/suitability.test.ts` already proves the *rules* against derived
 * customers. This file proves the *wiring* — the part `07-DECISIONS.md` §3 makes the point of
 * the whole step: that a basket is checked before checkout, on the same snapshot the order is
 * built from, that a refusal stops the sale, and that the three judgements `runGate` makes on
 * top of `evaluate()` are the right ones.
 *
 * So the gate is exercised through the real `evaluate` over real derived personas rather than a
 * stub. A stub would prove the loop and nothing about the answer, and a blocked path that only
 * works against a fake verdict is worse than no blocked path at all — it looks tested.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { derive, evaluate } from '@dhan/core'
import type { Snapshot } from '@dhan/core'
import {
  PRIYA,
  PRODUCT_SHELF,
  ROHAN,
  SUNIL,
  generateCustomerFile,
  productById,
} from '@dhan/fixtures'
import type { PersonaSpec } from '@dhan/fixtures'
import type { Verdict } from '@dhan/contracts'
import { addMonths, lastInstalment, nextOnDay, runGate, settlementOf, totals } from './order.ts'
import type { OrderLine } from './order.ts'
import { inWords, words } from './money.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const snap = (spec: PersonaSpec): Snapshot => derive(generateCustomerFile(spec, OPTS), ASOF)

/**
 * The injected `evaluate` the screens get, standing in for `/suitability/evaluate`.
 *
 * The server route fills the goal in from the session when the caller omits it, and the offline
 * chunk does the same from the built view, so the client never passes one — this mirrors that by
 * taking the goal once for the whole run.
 */
function gateFor(
  snapshot: Snapshot,
  goal: { kind: string; horizonYears: number } | null = { kind: 'wealth_target', horizonYears: 15 },
): { call: (productId: string, monthly: number) => Promise<Verdict>; seen: [string, number][] } {
  const seen: [string, number][] = []
  return {
    seen,
    call: async (productId, monthly) => {
      seen.push([productId, monthly])
      return evaluate({
        product: productById(productId),
        snapshot,
        amount: monthly,
        goal,
        alternatives: PRODUCT_SHELF,
      })
    },
  }
}

let seq = 0
function line(over: Partial<OrderLine> & Pick<OrderLine, 'productId'>): OrderLine {
  const product = productById(over.productId)
  seq += 1
  return {
    id: `L${seq}`,
    name: product.name,
    manufacturer: product.manufacturer,
    category: product.category,
    mode: 'sip',
    amount: product.minInvestment,
    startDate: '2026-10-05',
    installments: null,
    folio: 'new',
    included: true,
    ...over,
  }
}

/* ---------------------------------------------------------------- The gate */

describe('the basket goes through the gate before checkout', () => {
  it('lets a suitable order through and records every line it checked', async () => {
    const gate = gateFor(snap(ROHAN))
    const result = await runGate([line({ productId: 'MF_INDEX_103', amount: 4_000 })], gate.call)

    assert.equal(result.outcome, 'PASS')
    assert.equal(result.blocked, null)
    assert.equal(result.checked.length, 1)
    assert.equal(result.checked[0]?.verdict.verdict, 'PASS')
  })

  it('stops the sale on the first refusal and never checks the lines behind it', async () => {
    // Priya is paying 34.8% on a card, so nothing gets past HIGH_INTEREST_DEBT. The second line
    // must never reach the rules: a customer told to fix three things has been told nothing.
    const gate = gateFor(snap(PRIYA))
    const result = await runGate(
      [
        line({ productId: 'MF_INDEX_103', amount: 2_000 }),
        line({ productId: 'IDBI_SSP_002', amount: 1_000 }),
      ],
      gate.call,
    )

    assert.equal(result.outcome, 'BLOCKED')
    assert.equal(result.blocked?.verdict.ruleId, 'HIGH_INTEREST_DEBT')
    assert.equal(result.blocked?.line.productId, 'MF_INDEX_103')
    assert.equal(result.checked.length, 1)
    assert.deepEqual(
      gate.seen.map(([id]) => id),
      ['MF_INDEX_103'],
    )
  })

  it('hands the rule’s own sentence and its named alternative straight through', async () => {
    // The refusal screen shows `spoken` verbatim and makes `alternative` the primary action, so
    // nothing here may reword or drop either. The ULIP is the case that proves it: IDBI sells it
    // and the gate still says no.
    const gate = gateFor(snap(ROHAN), { kind: 'protection', horizonYears: 20 })
    const result = await runGate([line({ productId: 'LIC_ULIP_401', amount: 2_500 })], gate.call)

    assert.equal(result.outcome, 'BLOCKED')
    assert.equal(result.blocked?.verdict.ruleId, 'BUNDLED_PROTECTION')
    assert.match(result.blocked?.verdict.spoken ?? '', /IDBI sells this one/)
    assert.equal(result.blocked?.verdict.alternative?.productId, 'LIC_TERM_201')
    // The audit sentence and the spoken one are the same judgement, differently worded. Both
    // reach the screen; neither is synthesised here.
    assert.match(result.blocked?.verdict.recorded ?? '', /bundled protection-and-investment/i)
  })

  it('carries the rules cleared before the failure, so the screen can say what was checked', async () => {
    const gate = gateFor(snap(ROHAN), { kind: 'wealth_target', horizonYears: 10 })
    const result = await runGate([line({ productId: 'MF_ELSS_104', amount: 3_000 })], gate.call)

    assert.equal(result.blocked?.verdict.ruleId, 'TAX_BENEFIT_UNAVAILABLE')
    assert.ok(result.blocked?.verdict.passed.includes('HIGH_INTEREST_DEBT'))
    assert.ok(result.blocked?.verdict.passed.includes('RISK_CEILING'))
  })

  it('refuses equity to a Conservative profile — and does not refuse them cover', async () => {
    /*
     * The carve-out, which is the one a distribution app gets backwards.
     *
     * Sunil is Conservative with a missed repayment, so MISSED_REPAYMENT answers every
     * investment before RISK_CEILING is reached. Clearing that one flag is how the rule under
     * test becomes reachable; the fixtures suite isolates it the same way and for the same
     * reason. The term policy is then checked against the *unmodified* snapshot, because the
     * point is that neither flag touches protection.
     */
    const base = snap(SUNIL)
    assert.equal(base.customer.riskProfile, 'Conservative')
    assert.equal(base.debt.missedRepayment, true)

    const paying = { ...base, debt: { ...base.debt, missedRepayment: false } }
    const equity = await runGate(
      [line({ productId: 'MF_INDEX_103', amount: 1_000 })],
      gateFor(paying).call,
    )
    assert.equal(equity.blocked?.verdict.ruleId, 'RISK_CEILING')

    // Pure cover is exempt from every investment rule. Blocking a term policy on RISK_CEILING —
    // or on the missed repayment, or on the debt — is an advisory error, not a technicality:
    // if he dies his family inherits the debt and loses the income.
    const cover = await runGate(
      [line({ productId: 'LIC_TERM_201', amount: 985 })],
      gateFor(base).call,
    )
    assert.equal(cover.outcome, 'PASS')
    assert.notEqual(cover.checked[0]?.verdict.ruleId, 'RISK_CEILING')

    // And a ULIP is an investment however it is sold, so the carve-out must not reach it.
    const ulip = await runGate(
      [line({ productId: 'LIC_ULIP_401', amount: 2_500 })],
      gateFor(base).call,
    )
    assert.equal(ulip.outcome, 'BLOCKED')
    assert.equal(ulip.blocked?.verdict.ruleId, 'MISSED_REPAYMENT')
  })
})

describe('what the gate is told the amount is', () => {
  it('judges each SIP on the basket’s running monthly total, not on its own figure', async () => {
    /*
     * Three SIPs under one OTP commit the sum of the three every month. Checking each against
     * its own figure waves through an order none of them could fund together, which is the whole
     * failure mode a single-OTP basket introduces.
     */
    const s = snap(ROHAN)
    const each = Math.floor(s.surplus.deployable * 0.6)
    assert.ok(each > 0 && each * 2 > s.surplus.deployable)

    const gate = gateFor(s)
    const result = await runGate(
      [
        line({ productId: 'MF_INDEX_103', amount: each }),
        line({ productId: 'IDBI_SSP_002', amount: each }),
      ],
      gate.call,
    )

    assert.equal(result.outcome, 'BLOCKED')
    assert.equal(result.blocked?.verdict.ruleId, 'AFFORDABILITY')
    // The second line is the one that broke it, and it is the one the customer is sent back to.
    assert.equal(result.blocked?.line.productId, 'IDBI_SSP_002')
    assert.deepEqual(gate.seen, [
      ['MF_INDEX_103', each],
      ['IDBI_SSP_002', each * 2],
    ])
    // Either alone is fine, which is exactly why the aggregate has to be checked.
    const alone = await runGate(
      [line({ productId: 'IDBI_SSP_002', amount: each })],
      gateFor(s).call,
    )
    assert.equal(alone.outcome, 'PASS')
  })

  it('judges a lump sum at zero, because it has no monthly amount to judge', async () => {
    // AFFORDABILITY compares against a monthly surplus. A one-off purchase out of savings has no
    // monthly figure, and feeding it one would refuse nearly every lump sum for a false reason.
    const s = snap(ROHAN)
    const big = s.surplus.deployable * 12

    const gate = gateFor(s)
    const result = await runGate(
      [line({ productId: 'MF_INDEX_103', mode: 'lumpsum', amount: big, startDate: null })],
      gate.call,
    )

    assert.equal(result.outcome, 'PASS')
    assert.deepEqual(gate.seen, [['MF_INDEX_103', 0]])

    // Every other rule still runs on it. The same product at the same size on a two-year goal is
    // still refused, because horizon has nothing to do with the amount.
    const soon = await runGate(
      [line({ productId: 'MF_INDEX_103', mode: 'lumpsum', amount: big, startDate: null })],
      gateFor(s, { kind: 'wealth_target', horizonYears: 2 }).call,
    )
    assert.equal(soon.blocked?.verdict.ruleId, 'VOLATILITY_VS_HORIZON')

    // A lump sum does not inflate the monthly total the SIP behind it is judged on either.
    const mixed = gateFor(s)
    await runGate(
      [
        line({ productId: 'MF_INDEX_103', mode: 'lumpsum', amount: big, startDate: null }),
        line({ productId: 'IDBI_SSP_002', amount: 1_000 }),
      ],
      mixed.call,
    )
    assert.deepEqual(mixed.seen, [
      ['MF_INDEX_103', 0],
      ['IDBI_SSP_002', 1_000],
    ])
  })

  it('skips a line the customer unticked, in the total and at the gate', async () => {
    const gate = gateFor(snap(PRIYA))
    const result = await runGate(
      [
        line({ productId: 'MF_INDEX_103', amount: 2_000, included: false }),
        line({ productId: 'GOI_PMJJBY_203', amount: 36 }),
      ],
      gate.call,
    )

    // Priya's card blocks every investment, so the only way this passes is if the excluded line
    // never reached the rules.
    assert.equal(result.outcome, 'PASS')
    assert.deepEqual(
      gate.seen.map(([id]) => id),
      ['GOI_PMJJBY_203'],
    )
  })

  it('checks an empty order against nothing and passes it', async () => {
    const gate = gateFor(snap(PRIYA))
    const result = await runGate([], gate.call)
    assert.equal(result.outcome, 'PASS')
    assert.equal(gate.seen.length, 0)
  })
})

/* ---------------------------------------------------------------- Arithmetic */

describe('what the order comes to', () => {
  it('keeps today’s debit and the monthly commitment apart', () => {
    const t = totals([
      line({ productId: 'MF_INDEX_103', mode: 'lumpsum', amount: 25_000, startDate: null }),
      line({ productId: 'IDBI_SSP_002', amount: 3_000 }),
      line({ productId: 'MF_DEBT_102', amount: 9_999, included: false }),
    ])
    assert.deepEqual(t, { today: 25_000, monthly: 3_000, count: 2 })
  })

  it('dates the last instalment of a finite SIP, and refuses to date an open one', () => {
    assert.equal(
      lastInstalment(
        line({ productId: 'IDBI_SSP_002', startDate: '2026-10-05', installments: 12 }),
      ),
      '2027-09-05',
    )
    assert.equal(
      lastInstalment(
        line({ productId: 'IDBI_SSP_002', startDate: '2026-10-05', installments: null }),
      ),
      null,
    )
  })

  it('does not let a month-end date walk forward', () => {
    // `Date.setMonth` turns 31 January into 3 March and leaves it there. A SIP on the 31st has to
    // come back to the 31st in a long month.
    assert.equal(addMonths('2027-01-31', 1), '2027-02-28')
    assert.equal(addMonths('2027-01-31', 2), '2027-03-31')
    assert.equal(addMonths('2026-12-20', 1), '2027-01-20')
    assert.equal(addMonths('2026-01-20', -1), '2025-12-20')
  })

  it('finds the next debit date after today', () => {
    assert.equal(nextOnDay(5, '2026-09-01'), '2026-09-05')
    assert.equal(nextOnDay(1, '2026-09-01'), '2026-10-01')
    assert.equal(nextOnDay(25, '2026-12-26'), '2027-01-25')
  })
})

describe('how a line completes', () => {
  it('tells units, cover and a deposit apart, because the wording after checkout differs', () => {
    // A term policy given the mutual-fund disclosure is a false disclosure, not a typo.
    assert.equal(settlementOf('Index Fund'), 'units')
    assert.equal(settlementOf('ELSS'), 'units')
    assert.equal(settlementOf('Term Insurance'), 'cover')
    assert.equal(settlementOf('Government Insurance'), 'cover')
    assert.equal(settlementOf('Recurring Deposit'), 'deposit')
    assert.equal(settlementOf('PPF'), 'deposit')
    // A ULIP holds units however it is sold, which is the same reason every investment rule
    // applies to it.
    assert.equal(settlementOf('ULIP'), 'units')
  })
})

/* ---------------------------------------------------------------- Words */

describe('the amount spelled out', () => {
  it('groups the Indian way, not the western one', () => {
    // The one that matters: 1,22,841 is a lakh and change, and never "One Hundred Twenty Two
    // Thousand". Getting this wrong is the detail a banker notices in the first two seconds.
    assert.equal(words(1_22_841), 'One Lakh Twenty Two Thousand Eight Hundred Forty One')
    assert.equal(words(1_00_000), 'One Lakh')
    assert.equal(words(12_34_567), 'Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven')
    assert.equal(words(1_00_00_000), 'One Crore')
    assert.equal(words(2_50_00_000), 'Two Crore Fifty Lakh')
  })

  it('keeps counting in crores past the point the ladder runs out', () => {
    assert.equal(words(1_00_00_00_000), 'One Hundred Crore')
    assert.equal(words(12_00_00_00_000), 'One Thousand Two Hundred Crore')
  })

  it('names the small numbers the way a cheque does', () => {
    assert.equal(inWords(2_416), 'Rupees Two Thousand Four Hundred Sixteen Only')
    assert.equal(inWords(5_000), 'Rupees Five Thousand Only')
    assert.equal(inWords(0), 'Rupees Zero Only')
    assert.equal(inWords(19), 'Rupees Nineteen Only')
    assert.equal(inWords(90), 'Rupees Ninety Only')
    assert.equal(inWords(101), 'Rupees One Hundred One Only')
  })

  it('names paise only when there are any', () => {
    assert.equal(inWords(4_500.2), 'Rupees Four Thousand Five Hundred and Twenty Paise Only')
    assert.equal(inWords(4_500.0), 'Rupees Four Thousand Five Hundred Only')
  })
})

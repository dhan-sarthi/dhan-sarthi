/**
 * The order advice comes in, and the one-off/monthly distinction it rests on.
 *
 * Three defects are pinned here, all found on 17 September 2026 against Rohan's generated
 * ledger, and all three shipped advice that was wrong rather than merely untidy:
 *
 * 1. **Ranking by rupees inverted the waterfall.** `protection_gap` and `emi_ending` are both
 *    `important`, so the tiebreak decided — and it was `monthlyValue` descending. A ₹8,200 SIP
 *    increase therefore outranked a ₹985 term policy for a customer with two dependents and no
 *    cover in force. Recommending an investment ahead of protection is the precise mis-selling
 *    this product exists to refuse.
 *
 * 2. **A maturing deposit was not an event.** `maturityDate` was carried from the feed through
 *    the adapters and shown on Holdings, but nothing ever compared it to `asOf`. A deposit
 *    renews itself on its maturity date whether or not anyone looked, so silence is the
 *    expensive outcome and the only one the bank profits from.
 *
 * 3. **AFFORDABILITY read every amount as monthly.** "Move your idle ₹1,41,663 into a sweep-in"
 *    was checked against a monthly surplus of ₹10,933 and blocked — for every customer alive,
 *    because idle cash is an accumulated balance and surplus is monthly income. The single
 *    recommendation the whole pitch rests on could not reach a screen.
 *
 * This one is genuinely a fixtures test rather than a core test displaced: the waterfall is an
 * *ordering* across insights, the daily plan and the gate, and an ordering only means anything
 * over a customer with several things wrong at once. The third defect's rule half — cadence
 * against the balance rather than the surplus — is pinned separately in
 * `@dhan/core/src/suitability.test.ts`. See CONTRIBUTING.md, "Where tests live".
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDailyPlan, derive, evaluate, findInsights } from '@dhan/core'
import { generateCustomerFile } from './generate.ts'
import { ROHAN } from './personas.ts'
import { PRODUCT_SHELF } from './shelf.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const rohan = () => {
  const file = generateCustomerFile(ROHAN, OPTS)
  return { file, snapshot: derive(file, ASOF) }
}

describe('the waterfall decides the order, not the size of the cheque', () => {
  it('puts protection ahead of investing for a customer with dependents and no cover', () => {
    const { snapshot } = rohan()
    assert.equal(snapshot.protection.dependents, 2)
    assert.equal(snapshot.protection.lifeCoverInForce, 0)

    const kinds = findInsights(snapshot).map((i) => i.kind)
    const protection = kinds.indexOf('protection_gap')
    const investing = kinds.indexOf('emi_ending')

    assert.ok(protection >= 0, 'protection gap should fire with two dependents and no policy')
    assert.ok(investing >= 0, 'the education loan ends within the window')
    assert.ok(
      protection < investing,
      `protection (${protection}) must outrank investing (${investing}) — ranking by monthlyValue put ₹8,200 ahead of ₹985`,
    )
  })

  it('never recommends investing to a customer who cannot afford to', () => {
    const { snapshot, file } = rohan()
    const plan = buildDailyPlan(snapshot, null, file.transactions, PRODUCT_SHELF, ASOF)
    const kinds = [plan.primary, ...plan.secondary].filter((a) => a !== null).map((a) => a!.kind)
    // Whatever leads, an investment may never be the thing shown ahead of the cover he lacks.
    const sip = kinds.indexOf('increase_sip')
    const cover = kinds.indexOf('buy_term_cover')
    if (sip >= 0 && cover >= 0) {
      assert.ok(cover < sip, 'term cover must be offered before increasing a SIP')
    }
  })

  it('offers each action once, however many insights arrive at it', () => {
    const { snapshot, file } = rohan()
    const plan = buildDailyPlan(snapshot, null, file.transactions, PRODUCT_SHELF, ASOF)
    const shown = [plan.primary, ...plan.secondary]
      .filter((a) => a !== null)
      .map((a) => `${a!.kind}:${a!.label}`)
    assert.equal(new Set(shown).size, shown.length, `duplicate cards: ${shown.join(' | ')}`)
  })
})

describe('a deposit about to mature is an event, not an attribute', () => {
  it('finds the FD maturing ten days out', () => {
    const { snapshot } = rohan()
    const maturing = snapshot.balances.maturingSoon
    assert.ok(maturing, 'Rohan holds a ₹2,00,000 Suvidha FD maturing 2026-09-11')
    assert.equal(maturing.amount, 200_000)
    assert.equal(maturing.maturityDate, '2026-09-11')
    assert.equal(maturing.daysLeft, 10)
  })

  it('leads the day, because a deadline is the one thing that cannot wait', () => {
    const { snapshot } = rohan()
    const ranked = findInsights(snapshot)
    assert.equal(
      ranked[0]?.kind,
      'deposit_maturing',
      'inside the deadline window a dated event jumps the waterfall',
    )
    // And it does so on the deadline, not by pretending to be urgent.
    assert.equal(ranked[0]?.severity, 'important')
  })

  it('says nothing about a deposit maturing next year', () => {
    const file = generateCustomerFile(ROHAN, OPTS)
    const far = {
      ...file,
      accounts: file.accounts.map((a) =>
        a.accountType === 'FD' ? { ...a, maturityDate: '2027-09-11' } : a,
      ),
    }
    const snapshot = derive(far, ASOF)
    assert.equal(snapshot.balances.maturingSoon, null)
    assert.ok(!findInsights(snapshot).some((i) => i.kind === 'deposit_maturing'))
  })

  it('reaches a screen as a real action, sized to the deposit', () => {
    const { snapshot, file } = rohan()
    const plan = buildDailyPlan(snapshot, null, file.transactions, PRODUCT_SHELF, ASOF)
    assert.equal(plan.primary?.kind, 'open_sweep_in')
    assert.equal(
      plan.primary?.amount,
      200_000,
      'the amount in question is the deposit coming free, not a fraction of the idle floor',
    )
  })
})

describe('money you already hold is not money out of this month', () => {
  const sweepIn = PRODUCT_SHELF.find((p) => p.category === 'Sweep-in FD')

  it('blocks a monthly commitment above the surplus, as it always did', () => {
    const { snapshot } = rohan()
    assert.ok(sweepIn)
    const verdict = evaluate({
      product: sweepIn,
      snapshot,
      amount: 200_000,
      cadence: 'monthly',
      goal: null,
      alternatives: PRODUCT_SHELF,
    })
    assert.equal(verdict.verdict, 'BLOCKED')
    assert.equal(verdict.ruleId, 'AFFORDABILITY')
  })

  it('allows the same sum as a one-off, because he has it', () => {
    const { snapshot } = rohan()
    assert.ok(sweepIn)
    assert.ok(
      200_000 > snapshot.surplus.deployable,
      'the point of the test is that it exceeds the monthly surplus',
    )
    const verdict = evaluate({
      product: sweepIn,
      snapshot,
      amount: 200_000,
      cadence: 'lump_sum',
      goal: null,
      alternatives: PRODUCT_SHELF,
    })
    assert.equal(verdict.verdict, 'PASS', verdict.recorded)
  })

  it('still refuses a one-off larger than the customer actually has', () => {
    const { snapshot } = rohan()
    assert.ok(sweepIn)
    const verdict = evaluate({
      product: sweepIn,
      snapshot,
      amount: snapshot.balances.total + 1_000_000,
      cadence: 'lump_sum',
      goal: null,
      alternatives: PRODUCT_SHELF,
    })
    assert.equal(verdict.verdict, 'BLOCKED')
    assert.equal(verdict.ruleId, 'AFFORDABILITY')
  })

  it('defaults to the stricter reading when no cadence is declared', () => {
    const { snapshot } = rohan()
    assert.ok(sweepIn)
    const verdict = evaluate({
      product: sweepIn,
      snapshot,
      amount: 200_000,
      goal: null,
      alternatives: PRODUCT_SHELF,
    })
    assert.equal(verdict.verdict, 'BLOCKED', 'an un-migrated caller keeps the monthly check')
  })
})

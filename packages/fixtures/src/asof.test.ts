/**
 * The as-of arithmetic in `@dhan/core`, checked against hand-built ledgers and the generator.
 *
 * These live here rather than in core for the reason every engine test does: core may not
 * depend on the fixtures. The property that matters most is the last block — the generator
 * and the pure functions agree at every clock position — because the seeded database calls
 * the same functions, and that agreement is what lets the API quote the generator's figures.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { accountFactsAsOf, elapsedMonths, liabilityAsOf, sipHoldingAsOf } from '@dhan/core'
import type { LiabilityContract, SipContract, Transaction } from '@dhan/core'
import { generateCustomerFile, liabilityContract, sipContract } from './generate.ts'
import { PERSONAS, ROHAN } from './personas.ts'

const ANCHOR = '2026-09-01'

const txn = (txnDate: string, balanceAfterTxn: number | null, i: number): Transaction => ({
  txnId: `T${i}`,
  txnDate,
  txnAmount: 100,
  txnType: 'DEBIT',
  txnMode: 'UPI',
  narration: 'UPI/TEST',
  spendCategory: 'Shopping',
  balanceAfterTxn,
  isSalaryCredit: false,
  isRecurring: false,
})

const ledger = (rows: [string, number | null][]): Transaction[] =>
  rows.map(([date, balance], i) => txn(date, balance, i))

describe('elapsed months', () => {
  it('counts calendar months from the anchor, never days', () => {
    assert.equal(elapsedMonths(ANCHOR, ANCHOR), 0)
    assert.equal(elapsedMonths(ANCHOR, '2026-09-30'), 0)
    assert.equal(elapsedMonths(ANCHOR, '2026-10-01'), 1)
    assert.equal(elapsedMonths(ANCHOR, '2027-02-01'), 5)
  })

  it('does not run backwards before the anchor', () => {
    assert.equal(elapsedMonths(ANCHOR, '2026-03-01'), 0)
  })
})

describe('account facts as of a date', () => {
  const rows = ledger([
    ['2026-06-05', 50_000],
    ['2026-06-20', 42_000],
    ['2026-07-03', 90_000],
    ['2026-07-28', 61_000],
    ['2026-08-02', 110_000],
    ['2026-08-15', 38_000],
    ['2026-08-30', 75_000],
    // After the session date. The time machine has not revealed this yet.
    ['2026-09-10', 5_000],
  ])

  it('reads the current balance off the last row up to the date', () => {
    const facts = accountFactsAsOf(rows, ANCHOR)
    assert.equal(facts.currentBalance, 75_000)
  })

  it('averages month-end closing balances, not every row', () => {
    const facts = accountFactsAsOf(rows, ANCHOR)
    // June closes at 42,000, July at 61,000, August at 75,000.
    assert.equal(facts.avgMonthlyBalance3m, Math.round((42_000 + 61_000 + 75_000) / 3))
    assert.equal(facts.avgMonthlyBalance12m, facts.avgMonthlyBalance3m)
  })

  it('takes the floor over every running balance in the trailing twelve months', () => {
    assert.equal(accountFactsAsOf(rows, ANCHOR).minBalance12m, 38_000)
  })

  it('ignores rows dated after asOf', () => {
    const truncated = rows.filter((t) => t.txnDate <= ANCHOR)
    assert.deepEqual(accountFactsAsOf(rows, ANCHOR), accountFactsAsOf(truncated, ANCHOR))
    assert.equal(accountFactsAsOf(rows, '2026-09-30').currentBalance, 5_000)
  })

  it('falls back to the opening balance when there is no history yet', () => {
    const facts = accountFactsAsOf(rows, '2026-01-01', { openingBalance: 12_345 })
    assert.equal(facts.currentBalance, 12_345)
    assert.equal(facts.minBalance12m, 12_345)
    assert.equal(facts.avgMonthlyBalance3m, 0)
  })

  it('skips rows without a running balance', () => {
    const facts = accountFactsAsOf(
      ledger([
        ['2026-08-01', null],
        ['2026-08-02', 9_000],
      ]),
      ANCHOR,
    )
    assert.equal(facts.currentBalance, 9_000)
    assert.equal(facts.minBalance12m, 9_000)
  })
})

describe('liability as of a date', () => {
  const loan: LiabilityContract = {
    loanType: 'Education Loan',
    emiAmount: 8_200,
    rate: 9.15,
    tenureRemainingAtAnchor: 5,
  }

  it('reports the contract unchanged at the anchor', () => {
    const l = liabilityAsOf(loan, ANCHOR, ANCHOR)
    assert.ok(l)
    assert.equal(l.tenureRemainingMonths, 5)
    assert.equal(l.outstandingPrincipal, Math.round(8_200 * 5 * 0.97))
    assert.equal(l.dpdStatus, 0)
    assert.equal('isRevolving' in l, false)
  })

  it('shortens by the months the clock has advanced', () => {
    const l = liabilityAsOf(loan, ANCHOR, '2026-11-01')
    assert.ok(l)
    assert.equal(l.tenureRemainingMonths, 3)
    assert.equal(l.outstandingPrincipal, Math.round(8_200 * 3 * 0.97))
  })

  it('leaves the file once it is paid off', () => {
    assert.equal(liabilityAsOf(loan, ANCHOR, '2027-02-01'), null)
    assert.equal(liabilityAsOf(loan, ANCHOR, '2028-01-01'), null)
  })

  it('does not gain tenure when asked about a date before the anchor', () => {
    assert.equal(liabilityAsOf(loan, ANCHOR, '2026-01-01')?.tenureRemainingMonths, 5)
  })

  it('carries the days-past-due and revolving flags through', () => {
    const card = liabilityAsOf(
      { ...loan, loanType: 'Card', dpdStatus: 12, isRevolving: true },
      ANCHOR,
      ANCHOR,
    )
    assert.equal(card?.dpdStatus, 12)
    assert.equal(card?.isRevolving, true)
  })
})

describe('SIP holding as of a date', () => {
  const sip: SipContract = {
    scheme: 'Axis Flexi Cap Fund',
    amount: 5_000,
    day: 5,
    startsMonthsBeforeAnchor: 21,
    assetClass: 'Equity',
    heldOutsideIdbi: true,
  }

  it('counts the instalments paid so far at the anchor', () => {
    const h = sipHoldingAsOf(sip, ANCHOR, ANCHOR, 24)
    assert.equal(h.investedAmount, 5_000 * 21)
    assert.equal(h.currentValue, Math.round(5_000 * 21 * 1.19))
    assert.equal(h.sipActive, true)
    assert.equal(h.sipDebitDay, 5)
    assert.equal(h.heldOutsideIdbi, true)
  })

  it('gains one instalment for every month the clock advances', () => {
    assert.equal(sipHoldingAsOf(sip, ANCHOR, '2026-12-01', 24).investedAmount, 5_000 * 24)
  })

  it('cannot count instalments older than the history window', () => {
    const old: SipContract = { ...sip, startsMonthsBeforeAnchor: 40 }
    assert.equal(sipHoldingAsOf(old, ANCHOR, ANCHOR, 24).investedAmount, 5_000 * 24)
    assert.equal(sipHoldingAsOf(old, ANCHOR, '2026-11-01', 24).investedAmount, 5_000 * 26)
  })
})

describe('parity with the generator', () => {
  const DATES = [ANCHOR, '2026-09-02', '2026-09-08', '2026-10-01', '2027-03-01', '2028-03-01']

  it('produces the generator’s account figures at every clock position', () => {
    for (const spec of PERSONAS) {
      for (const asOf of DATES) {
        const file = generateCustomerFile(spec, { anchor: ANCHOR, asOf, months: 24 })
        const savings = file.accounts[0]
        assert.ok(savings)
        const facts = accountFactsAsOf(file.transactions, asOf, {
          openingBalance: spec.openingBalance,
        })
        assert.equal(savings.currentBalance, facts.currentBalance, `${spec.slug} ${asOf}`)
        assert.equal(savings.minBalance12m, facts.minBalance12m, `${spec.slug} ${asOf}`)
        assert.equal(savings.avgMonthlyBalance3m, facts.avgMonthlyBalance3m)
        assert.equal(savings.avgMonthlyBalance12m, facts.avgMonthlyBalance12m)
      }
    }
  })

  it('rolls the same loans and SIPs the generator puts in the file', () => {
    for (const spec of PERSONAS) {
      for (const asOf of DATES) {
        const file = generateCustomerFile(spec, { anchor: ANCHOR, asOf, months: 24 })
        const liabilities = spec.emis
          .map((e) => liabilityAsOf(liabilityContract(e), ANCHOR, asOf))
          .filter((l) => l !== null)
        assert.deepEqual(file.liabilities, liabilities, `${spec.slug} ${asOf}`)

        const sips = spec.sips.map((s) => sipHoldingAsOf(sipContract(s), ANCHOR, asOf, 24))
        assert.deepEqual(file.holdings.slice(0, sips.length), sips, `${spec.slug} ${asOf}`)
      }
    }
  })

  it('lets Rohan’s education loan leave the file after five months', () => {
    const before = generateCustomerFile(ROHAN, { anchor: ANCHOR, asOf: '2027-01-01', months: 24 })
    const after = generateCustomerFile(ROHAN, { anchor: ANCHOR, asOf: '2027-02-01', months: 24 })
    assert.equal(before.liabilities.length, 1)
    assert.equal(before.liabilities[0]?.tenureRemainingMonths, 1)
    assert.equal(after.liabilities.length, 0)
  })
})

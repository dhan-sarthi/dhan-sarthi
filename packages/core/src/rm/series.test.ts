/**
 * Balance history over hand-built ledgers: one point per month-end per account, the as-of date
 * last, and the change helper the attrition watch and the book table read.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { txn } from '../snapshot.testkit.ts'
import { balanceChangePct, figureBasis, monthEnds, monthlyBalanceSeries } from './series.ts'
import type { BalancePoint } from './series.ts'

const AS_OF = '2026-09-01'
const HDFC = { isHome: false }

/** A running ledger: each row's balance after it, oldest first. */
const ledger = (rows: readonly [string, number][], account: string) =>
  rows.map(([txnDate, balanceAfterTxn]) =>
    txn({ txnDate, balanceAfterTxn, accountNumberMasked: account, txnId: `${account}-${txnDate}` }),
  )

describe('monthlyBalanceSeries', () => {
  const idbi = {
    accountType: 'Savings',
    transactions: ledger(
      [
        ['2026-06-10', 40_000],
        ['2026-07-05', 52_000],
        ['2026-07-28', 48_000],
        ['2026-08-15', 61_000],
        ['2026-09-01', 1_01_000],
        // After the as-of date, so it must not count.
        ['2026-09-20', 5_000],
      ],
      'XXXX1111',
    ),
  }
  const hdfc = {
    accountType: 'Savings',
    institution: HDFC,
    openingBalance: 2_00_000,
    transactions: ledger([['2026-08-03', 2_10_000]], 'XXXX2222'),
  }

  it('reads each account’s own month-end balance, complete months only', () => {
    assert.deepEqual(monthlyBalanceSeries([idbi, hdfc], AS_OF, 3), [
      { month: '2026-06', total: 2_40_000, withIdbi: 40_000 },
      { month: '2026-07', total: 2_48_000, withIdbi: 48_000 },
      { month: '2026-08', total: 2_71_000, withIdbi: 61_000 },
    ])
  })

  it('leaves out a payday landing on the as-of date, and counts the month on its last day', () => {
    // 1 September is payday: the as-of balance is a salary above every month-end before it.
    assert.equal(monthlyBalanceSeries([idbi], AS_OF, 1)[0]?.withIdbi, 61_000)
    assert.deepEqual(
      monthlyBalanceSeries([idbi], '2026-08-31', 2).map((p) => [p.month, p.total]),
      [
        ['2026-07', 48_000],
        ['2026-08', 61_000],
      ],
    )
  })

  it('holds a declared deposit flat across the window, opened inside it or not, and leaves PPF out', () => {
    // No ledger line funds it, so a step on its opening date would be growth nothing paid for.
    const fd = {
      accountType: 'FD',
      accountOpeningDate: '2026-08-15',
      openingBalance: 2_00_000,
      transactions: [],
    }
    const ppf = { accountType: 'PPF', openingBalance: 5_00_000, transactions: [] }
    assert.deepEqual(
      monthlyBalanceSeries([fd, ppf], AS_OF, 3).map((p) => p.total),
      [2_00_000, 2_00_000, 2_00_000],
    )
  })

  it('still counts an account with rows from its opening date only', () => {
    // Its first row is what funded it, so the step is a ledger movement, not a declared figure.
    const opened = {
      accountType: 'Savings',
      accountOpeningDate: '2026-07-20',
      openingBalance: 0,
      transactions: ledger([['2026-07-20', 30_000]], 'XXXX3333'),
    }
    assert.deepEqual(
      monthlyBalanceSeries([opened], AS_OF, 3).map((p) => p.total),
      [0, 30_000, 30_000],
    )
  })

  it('gives twelve zero points, September to August, for a customer with no accounts', () => {
    const empty = monthlyBalanceSeries([], AS_OF)
    assert.equal(empty.length, 12)
    assert.equal(empty[0]?.month, '2025-09')
    assert.equal(empty[11]?.month, '2026-08')
    assert.ok(empty.every((p) => p.total === 0 && p.withIdbi === 0))
  })
})

const points = (totals: readonly number[]): BalancePoint[] =>
  totals.map((total, i) => ({ month: `2026-0${i + 1}`, total, withIdbi: total / 2 }))

describe('balanceChangePct', () => {
  it('is the change over the last three points, to one decimal', () => {
    assert.equal(balanceChangePct(points([1_00_000, 90_000, 95_000, 1_10_000])), 10)
    assert.equal(balanceChangePct(points([90_000, 1_00_000, 90_000, 95_000, 85_000])), -15)
    assert.equal(balanceChangePct(points([30_000, 0, 0, 40_000]), 3, 'withIdbi'), 33.3)
  })

  it('is null for an empty or short series, and from a base of nothing', () => {
    assert.equal(balanceChangePct([]), null)
    assert.equal(balanceChangePct(points([1_00_000, 1_10_000])), null)
    assert.equal(balanceChangePct(points([0, 10_000, 20_000, 30_000])), null)
  })
})

describe('figureBasis', () => {
  it('names the as-at date and the twelve month-ends the charts are read on', () => {
    assert.deepEqual(figureBasis(AS_OF), {
      asOf: '2026-09-01',
      asOfLabel: 'As at 1 Sep 2026',
      seriesFrom: '2025-09',
      seriesTo: '2026-08',
      lastMonthEnd: '2026-08-31',
      seriesLabel: '12 month-ends, Sep 2025 to Aug 2026',
      lastMonthEndLabel: 'Month-end, 31 Aug 2026',
    })
  })

  it('reads the same month-ends the balance series is cut on', () => {
    const series = monthlyBalanceSeries([], AS_OF)
    const ends = monthEnds(AS_OF)
    assert.deepEqual(
      series.map((p) => p.month),
      ends.map((d) => d.slice(0, 7)),
    )
    const basis = figureBasis(AS_OF)
    assert.equal(series[0]?.month, basis.seriesFrom)
    assert.equal(series[series.length - 1]?.month, basis.seriesTo)
  })

  it('counts the as-of month when the clock stands on its last day', () => {
    const basis = figureBasis('2026-08-31', 3)
    assert.equal(basis.lastMonthEnd, '2026-08-31')
    assert.equal(basis.seriesLabel, '3 month-ends, Jun 2026 to Aug 2026')
  })
})

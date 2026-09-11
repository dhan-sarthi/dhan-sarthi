/**
 * Folding a statement into months.
 *
 * Two failures this exists to prevent, both of which draw a perfectly plausible chart:
 *
 * - a month with no lines drawn as a gap in the axis rather than as a zero, which compresses the
 *   run and makes a quiet month look like a month that did not happen;
 * - the running month drawn at full weight beside eleven complete ones, which turns twelve days of
 *   spending into a collapse the customer did not achieve.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Transaction } from '@dhan/contracts'
import {
  monthKey,
  monthLabel,
  monthlyClose,
  monthlyTotals,
  shiftMonth,
  windowKeys,
} from './months.ts'

let seq = 0
function txn(date: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    txnId: `t${seq}`,
    txnDate: date,
    valueDate: date,
    txnAmount: amount,
    txnType: 'DEBIT',
    txnMode: 'UPI',
    narration: 'TEST',
    spendCategory: 'Food & dining',
    balanceAfterTxn: null,
    isSalaryCredit: false,
    isRecurring: false,
    ...extra,
  }
}

describe('the window', () => {
  it('ends at the month before the as-of month, because this month is not a month yet', () => {
    assert.deepEqual(windowKeys({ asOf: '2026-04-12', months: 3 }), [
      '2026-01',
      '2026-02',
      '2026-03',
    ])
  })

  it('draws the running month back in only when asked', () => {
    assert.deepEqual(windowKeys({ asOf: '2026-04-12', months: 3, includeCurrent: true }), [
      '2026-02',
      '2026-03',
      '2026-04',
    ])
  })

  it('walks over a year boundary on the key rather than through a Date', () => {
    assert.equal(shiftMonth('2026-01', -2), '2025-11')
    assert.equal(shiftMonth('2025-12', 1), '2026-01')
    assert.equal(shiftMonth('2026-03', -15), '2024-12')
    assert.equal(monthKey('2026-04-12'), '2026-04')
    assert.equal(monthLabel('2026-04'), 'Apr')
  })
})

describe('monthlyTotals', () => {
  const ledger: Transaction[] = [
    txn('2026-01-04', 1200),
    txn('2026-01-19', 800),
    // Nothing at all in February.
    txn('2026-03-02', 500),
    txn('2026-03-09', 900, { txnType: 'CREDIT' }),
    txn('2026-03-22', 100, { spendCategory: 'Transport' }),
    txn('2026-04-03', 4000),
  ]
  const w = { asOf: '2026-04-12', months: 3 }

  it('gives a month with no lines a zero rather than dropping it from the axis', () => {
    const s = monthlyTotals(ledger, w)
    assert.deepEqual(
      s.points.map((p) => [p.key, p.value]),
      [
        ['2026-01', 2000],
        ['2026-02', 0],
        ['2026-03', 600],
      ],
    )
    assert.equal(s.gaps, 1)
  })

  it('counts debits only, and does not net a credit off against them', () => {
    assert.equal(monthlyTotals(ledger, w).points[2]?.value, 600)
  })

  it('filters to one category when it is given one', () => {
    const s = monthlyTotals(ledger, w, 'Transport')
    assert.deepEqual(
      s.points.map((p) => p.value),
      [0, 0, 100],
    )
  })

  it('leaves the running month out, and flags it when it is drawn in', () => {
    assert.equal(
      monthlyTotals(ledger, w).points.some((p) => p.key === '2026-04'),
      false,
    )
    const withCurrent = monthlyTotals(ledger, { ...w, months: 4, includeCurrent: true })
    const april = withCurrent.points.find((p) => p.key === '2026-04')
    assert.equal(april?.value, 4000)
    assert.equal(april?.partial, true)
    assert.equal(withCurrent.points.filter((p) => p.partial).length, 1)
  })

  it('never counts a line the session cannot see yet', () => {
    const future = [...ledger, txn('2026-04-30', 99999)]
    const s = monthlyTotals(future, { ...w, months: 4, includeCurrent: true })
    assert.equal(s.points.find((p) => p.key === '2026-04')?.value, 4000)
  })

  it('reports how far back the ledger actually reaches instead of padding with zeroes', () => {
    // Twelve months asked for, three months of statement. Nine invented zeroes would draw as
    // nine months of a customer spending nothing, which is the exact lie this returns instead.
    const s = monthlyTotals(ledger, { asOf: '2026-04-12', months: 12 })
    assert.equal(s.covered, 3)
    assert.equal(s.points[0]?.key, '2026-01')
  })
})

describe('monthlyClose', () => {
  const ledger: Transaction[] = [
    txn('2026-01-04', 1200, { balanceAfterTxn: 50_000 }),
    txn('2026-01-19', 800, { balanceAfterTxn: 49_200 }),
    // February has no lines: the balance did not move, it was not emptied.
    txn('2026-03-02', 500, { balanceAfterTxn: 61_000 }),
    txn('2026-03-22', 100, { balanceAfterTxn: 60_900 }),
  ]
  const w = { asOf: '2026-04-12', months: 3 }

  it('takes the last balance of the month, which is what derive.ts calls a close', () => {
    assert.deepEqual(
      monthlyClose(ledger, w).points.map((p) => p.value),
      [49_200, 49_200, 60_900],
    )
  })

  it('carries a quiet month forward rather than drawing the account emptied', () => {
    assert.equal(monthlyClose(ledger, w).gaps, 1)
  })

  it('drops the months before the first balance instead of inventing an opening one', () => {
    const s = monthlyClose(ledger, { asOf: '2026-04-12', months: 6 })
    assert.equal(s.points[0]?.key, '2026-01')
    assert.equal(s.covered, 3)
  })

  it('ignores the rails that carry no balance at all', () => {
    const sparse = [...ledger, txn('2026-03-28', 300)]
    assert.equal(monthlyClose(sparse, w).points[2]?.value, 60_900)
  })
})

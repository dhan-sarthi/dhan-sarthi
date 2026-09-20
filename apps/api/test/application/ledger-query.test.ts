/**
 * Paging the statement, through the interface rather than through HTTP.
 *
 * Six invariants live behind `page()` — the asOf clamp, the honoured earlier `to`, the horizon
 * fallback, the category filter, the newest-first ordering with the bank's within-day order
 * reversed, and the cursor round trip. Until this module existed none of them could be reached
 * without `app.inject()`, and the within-day tiebreak had no test at any level: the integration
 * suite only asserts that dates are non-increasing, which a reordering inside one day passes.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Transaction } from '@dhan/core'
import type { TransactionsQuery } from '@dhan/contracts'
import { LedgerQuery } from '../../src/application/ledger-query.ts'
import { ValidationFailed } from '../../src/application/errors.ts'
import type { BankDataPort, Session } from '../../src/ports/index.ts'

const CIF = 'IDBI0009182731'
const HORIZON = { from: '2025-01-01', to: '2026-12-31' }

const SESSION = { cif: CIF, asOf: '2026-09-01' } as Session

function txn(txnId: string, txnDate: string, spendCategory: string): Transaction {
  return {
    txnId,
    txnDate,
    valueDate: txnDate,
    txnAmount: 100,
    txnType: 'DEBIT',
    txnMode: 'UPI',
    narration: txnId,
    spendCategory,
    balanceAfterTxn: null,
    isSalaryCredit: false,
    isRecurring: false,
  } as unknown as Transaction
}

/**
 * The bank's own order, which is what the tiebreak reverses: two lines on 2026-08-10, `b`
 * posted after `a`, so `b` must come out first.
 */
const ROWS: Transaction[] = [
  txn('a', '2026-08-10', 'Food & dining'),
  txn('b', '2026-08-10', 'Transport'),
  txn('c', '2026-08-12', 'Food & dining'),
  txn('d', '2026-08-09', 'Food & dining'),
]

interface FakeBank extends BankDataPort {
  readonly ranges: { from: string; to: string }[]
}

function fakeBank(rows: Transaction[] = ROWS): FakeBank {
  const ranges: { from: string; to: string }[] = []
  const refuse = (): never => {
    throw new Error('ledger paging reached the bank for something other than the statement')
  }
  return {
    ranges,
    ledgerHorizon: async () => HORIZON,
    getTransactions: async (_cif: string, range: { from: string; to: string }) => {
      ranges.push(range)
      return rows
    },
    listCustomers: refuse,
    getCustomer: refuse,
    getAccounts: refuse,
    getLiabilities: refuse,
    getHoldings: refuse,
    getConsent: refuse,
    loadCustomerFile: refuse,
    describe: refuse,
    health: refuse,
  } as unknown as FakeBank
}

function query(over: Partial<TransactionsQuery> = {}): TransactionsQuery {
  return { limit: 50, ...over } as TransactionsQuery
}

describe('paging the statement', () => {
  it('clamps a `to` past the session’s simulated today', async () => {
    const bank = fakeBank()
    await new LedgerQuery({ bank }).page(SESSION, query({ to: '2026-12-01' }))
    assert.deepEqual(bank.ranges, [{ from: HORIZON.from, to: '2026-09-01' }])
  })

  it('honours a `to` the session has already reached', async () => {
    const bank = fakeBank()
    await new LedgerQuery({ bank }).page(SESSION, query({ to: '2026-08-11' }))
    assert.deepEqual(bank.ranges, [{ from: HORIZON.from, to: '2026-08-11' }])
  })

  it('honours a `from` the caller named', async () => {
    const bank = fakeBank()
    await new LedgerQuery({ bank }).page(SESSION, query({ from: '2026-08-01' }))
    assert.deepEqual(bank.ranges, [{ from: '2026-08-01', to: '2026-09-01' }])
  })

  // The two clamp cases above happen to pass no `from` and so cover this incidentally; pinned
  // here on its own so deleting either of them cannot silently drop the only coverage of it.
  it('falls back to the horizon’s start where the caller named no `from`', async () => {
    const bank = fakeBank()
    await new LedgerQuery({ bank }).page(SESSION, query())
    assert.deepEqual(bank.ranges, [{ from: HORIZON.from, to: '2026-09-01' }])
  })

  it('filters by category, and computes nextCursor against the filtered length', async () => {
    const bank = fakeBank()
    const page = await new LedgerQuery({ bank }).page(
      SESSION,
      query({ category: 'Food & dining', limit: 2 }),
    )
    assert.deepEqual(
      page.items.map((t) => t.txnId),
      ['c', 'a'],
    )
    // Three Food & dining lines, two taken: there is a third, so a cursor comes back. Against
    // the unfiltered four this assertion would still hold, so the next page is what proves it.
    assert.notEqual(page.nextCursor, null)
    const rest = await new LedgerQuery({ bank }).page(
      SESSION,
      query({ category: 'Food & dining', limit: 2, cursor: page.nextCursor ?? '' }),
    )
    assert.deepEqual(
      rest.items.map((t) => t.txnId),
      ['d'],
    )
    assert.equal(rest.nextCursor, null)
  })

  it('orders newest first, and within one date reverses the bank’s own order', async () => {
    const page = await new LedgerQuery({ bank: fakeBank() }).page(SESSION, query())
    assert.deepEqual(
      page.items.map((t) => t.txnId),
      ['c', 'b', 'a', 'd'],
    )
  })

  it('round-trips the cursor, stops with null, and refuses a cursor it did not mint', async () => {
    const ledger = new LedgerQuery({ bank: fakeBank() })
    const first = await ledger.page(SESSION, query({ limit: 3 }))
    assert.deepEqual(
      first.items.map((t) => t.txnId),
      ['c', 'b', 'a'],
    )
    assert.notEqual(first.nextCursor, null)

    const second = await ledger.page(SESSION, query({ limit: 3, cursor: first.nextCursor ?? '' }))
    assert.deepEqual(
      second.items.map((t) => t.txnId),
      ['d'],
    )
    assert.equal(second.nextCursor, null)

    await assert.rejects(
      () => ledger.page(SESSION, query({ cursor: 'not-base64' })),
      (err: unknown) => err instanceof ValidationFailed && err.message === 'Invalid cursor.',
    )
  })
})

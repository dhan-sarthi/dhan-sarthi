/**
 * Paging the statement.
 *
 * The ledger is read newest-first and never past the session's simulated today, which is a
 * session fact rather than a query parameter: `to` is clamped, not trusted. The cursor is an
 * opaque offset into the filtered, ordered list, so a client cannot page into a window the
 * session has not reached.
 */
import type { TransactionsPage, TransactionsQuery } from '@dhan/contracts'
import { ValidationFailed } from './errors.ts'
import type { BankDataPort, Session } from '../ports/index.ts'

/** Opaque, and deliberately dumb: an offset into the filtered, newest-first list. */
function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url')
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { o?: unknown }
    if (typeof parsed.o === 'number' && Number.isInteger(parsed.o) && parsed.o >= 0) return parsed.o
  } catch {
    // fall through
  }
  throw new ValidationFailed('Invalid cursor.')
}

export interface LedgerQueryDeps {
  bank: BankDataPort
}

export class LedgerQuery {
  private readonly deps: LedgerQueryDeps

  constructor(deps: LedgerQueryDeps) {
    this.deps = deps
  }

  async page(session: Session, query: TransactionsQuery): Promise<TransactionsPage> {
    const horizon = await this.deps.bank.ledgerHorizon(session.cif)
    // Never past the simulated today: the future is what the clock reveals, not this query.
    const to = query.to !== undefined && query.to < session.asOf ? query.to : session.asOf
    const from = query.from ?? horizon.from

    const rows = await this.deps.bank.getTransactions(session.cif, { from, to })
    const filtered = query.category ? rows.filter((t) => t.spendCategory === query.category) : rows
    // Newest first, and within a day the bank's own order reversed.
    const ordered = filtered
      .map((t, i) => ({ t, i }))
      .sort((a, b) =>
        a.t.txnDate === b.t.txnDate ? b.i - a.i : a.t.txnDate < b.t.txnDate ? 1 : -1,
      )

    const offset = decodeCursor(query.cursor)
    const page = ordered.slice(offset, offset + query.limit).map((x) => x.t)
    const next = offset + query.limit
    return { items: page, nextCursor: next < ordered.length ? encodeCursor(next) : null }
  }
}

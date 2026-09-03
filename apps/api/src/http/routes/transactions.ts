import { routeById } from '@dhan/contracts'
import { ValidationFailed } from '../../application/errors.ts'
import type { Registrar } from '../register.ts'
import type { AppServices } from './services.ts'

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

export function transactionRoutes(r: Registrar, s: AppServices): void {
  r(routeById('listTransactions'), async ({ session, query }) => {
    const horizon = await s.bank.ledgerHorizon(session.cif)
    // Never past the simulated today: the future is what the clock reveals, not this route.
    const to = query.to !== undefined && query.to < session.asOf ? query.to : session.asOf
    const from = query.from ?? horizon.from

    const rows = await s.bank.getTransactions(session.cif, { from, to })
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
  })
}

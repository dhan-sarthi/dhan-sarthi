import type { JourneyEvent } from '@dhan/contracts'
import { useBook, useJourney } from '../../api/queries.ts'
import { daysBetween } from '../../lib/format.ts'
import { requestReason, type OpenRequest } from './next-actions.ts'

/**
 * The customer's open request to talk, if they have one: the one thing on the file more urgent
 * than any signal.
 *
 * The customer file does not carry it, so it is pieced together from two reads the console makes
 * anyway. The book (which the sidebar already holds) says whether a request is open; only then is
 * the journey read, and its latest "asked to talk" event gives the request's id, its date and
 * what was on top of the file that day. Neither read writes to the access log, and the Journey
 * tab reuses the same cached answer. Marking the request resolved refreshes both, so the pinned
 * line goes the moment it is dealt with.
 */
export function useOpenRequest(cif: string, asOf: string | undefined): OpenRequest | null {
  const book = useBook()
  const open = book.data?.rows.some((row) => row.cif === cif && row.openHandoff) ?? false
  // An empty cif leaves the journey query switched off: nothing is fetched for a customer with
  // no open request.
  const journey = useJourney(open ? cif : '')
  if (!open || !asOf || !journey.data) return null
  let latest: JourneyEvent | null = null
  for (const event of journey.data.events) {
    if (event.kind === 'handoff' && (latest === null || event.at > latest.at)) latest = event
  }
  if (!latest) return null
  return {
    id: latest.id,
    requestedOn: latest.at,
    waitingDays: Math.max(0, daysBetween(latest.at, asOf)),
    reason: requestReason(latest.detail),
  }
}

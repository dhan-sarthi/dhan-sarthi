/**
 * The call queue: who the RM should call today, and why.
 *
 * The spec's order, exactly:
 *
 * 1. **Open handoffs first, oldest first.** A customer who asked for a person is owed a call
 *    before anyone the engine merely noticed. One row per customer, the oldest request, so a
 *    customer who asked twice is not ranked above one who asked once.
 * 2. **Then one top signal per customer**, ranked across customers by the engine's own ranking:
 *    severity, then a deadline inside fourteen days, then the waterfall, then monthly value.
 *    One per customer because the queue is a list of calls, not of findings; the customer page
 *    carries the rest.
 *
 * A customer with an open handoff does not appear again lower down: the handoff row carries
 * their top signal as its context instead.
 */
import { firstName, initials } from './format.ts'
import type { Segment } from './segment.ts'
import { byEngineRank, voiceInsight } from './signals.ts'
import type { InsightLike, Signal, VoicedSignal } from './signals.ts'
import { cmp, lowerFirst } from './util.ts'

export interface QueueCustomer {
  cif: string
  name: string
  segment: Segment
  /** The engine's ranked insights for this customer, `human_handoff` included or not. */
  insights: readonly InsightLike[]
}

export interface QueueHandoff {
  id: string
  cif: string
  name: string
  /** Simulated date, YYYY-MM-DD. */
  requestedOn: string
  waitingDays: number
  status: 'open' | 'contacted' | 'resolved'
}

export interface QueueItem {
  id: string
  cif: string
  name: string
  initials: string
  segment: Segment
  source: 'handoff' | 'signal'
  signal: Signal | null
  why: string
  opener: string
}

export interface QueueOptions {
  /** Keep the first this-many rows. The desk shows about ten. */
  limit?: number | undefined
}

interface Ranked {
  customer: QueueCustomer
  insight: InsightLike
  voiced: VoicedSignal
}

/** The customer's own best signal, by the engine's comparator rather than trusting input order. */
function best(customer: QueueCustomer): Ranked | null {
  let top: Ranked | null = null
  for (const insight of customer.insights) {
    const voiced = voiceInsight(insight)
    if (voiced === null) continue
    if (top === null || byEngineRank(insight, top.insight) < 0) {
      top = { customer, insight, voiced }
    }
  }
  return top
}

function waitingSentence(days: number): string {
  if (days <= 0) return 'Asked for a call today, through Uday'
  if (days === 1) return 'Waiting 1 day for a call, asked through Uday'
  return `Waiting ${days} days for a call, asked through Uday`
}

export function callQueue(
  customers: readonly QueueCustomer[],
  handoffs: readonly QueueHandoff[],
  options: QueueOptions = {},
): QueueItem[] {
  const byCif = new Map(customers.map((c) => [c.cif, c]))

  // Oldest request first; a tie on the date goes to whoever has waited longer, then by name so
  // the order is the same on every read.
  const open = handoffs
    .filter((h) => h.status === 'open' && byCif.has(h.cif))
    .sort(
      (a, b) =>
        cmp(a.requestedOn, b.requestedOn) ||
        b.waitingDays - a.waitingDays ||
        cmp(a.name, b.name) ||
        cmp(a.id, b.id),
    )

  const out: QueueItem[] = []
  const seen = new Set<string>()

  for (const h of open) {
    const customer = byCif.get(h.cif)
    if (customer === undefined || seen.has(h.cif)) continue
    seen.add(h.cif)
    const top = best(customer)
    const context = top === null ? '' : `; top issue: ${lowerFirst(top.voiced.signal.title)}`
    out.push({
      id: `handoff:${h.id}`,
      cif: h.cif,
      name: customer.name,
      initials: initials(customer.name),
      segment: customer.segment,
      source: 'handoff',
      signal: top?.voiced.signal ?? null,
      why: `${waitingSentence(h.waitingDays)}${context}.`,
      opener: `${firstName(customer.name)}, calling back on the request made through Uday.`,
    })
  }

  const ranked = customers
    .filter((c) => !seen.has(c.cif))
    .map(best)
    .filter((r): r is Ranked => r !== null)
    .sort(
      (a, b) =>
        byEngineRank(a.insight, b.insight) ||
        cmp(a.customer.name, b.customer.name) ||
        cmp(a.customer.cif, b.customer.cif),
    )

  for (const r of ranked) {
    out.push({
      id: `signal:${r.customer.cif}:${r.voiced.signal.kind}`,
      cif: r.customer.cif,
      name: r.customer.name,
      initials: initials(r.customer.name),
      segment: r.customer.segment,
      source: 'signal',
      signal: r.voiced.signal,
      why: r.voiced.why,
      opener: r.voiced.opener,
    })
  }

  return options.limit === undefined ? out : out.slice(0, Math.max(0, options.limit))
}

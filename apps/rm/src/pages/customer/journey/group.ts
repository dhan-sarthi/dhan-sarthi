/**
 * How the journey is cut for the screen: into calendar months, and into the handful of kinds an
 * RM filters by. Pure, so the grouping can be reasoned about without a browser.
 */
import type { JourneyDiff, JourneyEvent, JourneyEventKind } from '@dhan/contracts'
import { formatCount, formatInr } from '../../../lib/format.ts'

export type FilterId = 'all' | 'plan' | 'decision' | 'advice' | 'handoff' | 'touch' | 'ledger'

export interface FilterDef {
  id: Exclude<FilterId, 'all'>
  label: string
  kinds: readonly JourneyEventKind[]
}

/**
 * The filters, in the order a conversation about the customer runs: what the plan did, what the
 * customer chose, what Uday checked, when they asked for a person, what the desk did, and what
 * the money did. Joining the bank is in "All" only: it is one row and nobody filters for it.
 */
export const FILTERS: readonly FilterDef[] = [
  { id: 'plan', label: 'Plan versions', kinds: ['plan'] },
  { id: 'decision', label: 'Decisions', kinds: ['decision'] },
  { id: 'advice', label: 'Advice checks', kinds: ['advice'] },
  { id: 'handoff', label: 'Asked for RM', kinds: ['handoff'] },
  { id: 'touch', label: 'Calls & notes', kinds: ['call', 'note', 'contact'] },
  { id: 'ledger', label: 'Money events', kinds: ['ledger'] },
]

export function matches(filter: FilterId, event: JourneyEvent): boolean {
  if (filter === 'all') return true
  return FILTERS.find((f) => f.id === filter)?.kinds.includes(event.kind) ?? false
}

export function countBy(events: readonly JourneyEvent[]): Record<FilterId, number> {
  const counts: Record<FilterId, number> = {
    all: events.length,
    plan: 0,
    decision: 0,
    advice: 0,
    handoff: 0,
    touch: 0,
    ledger: 0,
  }
  for (const event of events) {
    const def = FILTERS.find((f) => f.kinds.includes(event.kind))
    if (def) counts[def.id] += 1
  }
  return counts
}

export interface MonthGroup {
  /** `YYYY-MM` */
  month: string
  events: JourneyEvent[]
}

/** Newest month first, events in the order the API sent them (newest first) within each. */
export function byMonth(events: readonly JourneyEvent[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const event of events) {
    const month = event.at.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.events.push(event)
    else groups.push({ month, events: [event] })
  }
  return groups
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** `2026-09` → "September 2026". A timeline heading reads better spelled out than "Sep". */
export function monthHeading(month: string): string {
  const [y, m] = month.split('-')
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`
}

/* ---------------------------------------------------------------- Plan diffs */

/**
 * A diff value arrives as a string or a bare number. The contract does not carry a unit, so a
 * number is shown as rupees when its field names money (an amount, a commitment, a monthly
 * figure) and as a plain count otherwise; strings are the engine's own words and pass through.
 */
const MONEY_FIELD = /amount|commitment|monthly|sip|value|corpus|surplus|₹/i

export function diffValue(field: string, value: JourneyDiff['before']): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  return MONEY_FIELD.test(field) ? formatInr(value) : formatCount(value)
}

/** "Changed current stage" · "Set goal, goal amount and 2 more" */
export function diffSummary(diff: readonly JourneyDiff[]): string {
  const created = diff.every((d) => d.before === null)
  const names = diff.map((d) => d.field.charAt(0).toLowerCase() + d.field.slice(1))
  const verb = created ? 'Set' : 'Changed'
  if (names.length === 0) return 'No change to the goal or the current stage'
  if (names.length === 1) return `${verb} ${names[0]}`
  if (names.length <= 3) return `${verb} ${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `${verb} ${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

/* ---------------------------------------------------------------- Decisions */

/**
 * A decision's title leads with what the customer did ("Put off: Pay ₹21,126 off the card").
 * The outcome is split off so it can be drawn as a word of its own, coloured by whether the
 * customer acted; a title in any other shape is shown whole.
 */
const OUTCOMES = ['Did it', 'Declined', 'Put off', 'Pushed back'] as const
export type Outcome = (typeof OUTCOMES)[number]

export function splitDecision(title: string): { outcome: Outcome | null; rest: string } {
  for (const outcome of OUTCOMES) {
    const prefix = `${outcome}: `
    if (title.startsWith(prefix)) return { outcome, rest: title.slice(prefix.length) }
  }
  return { outcome: null, rest: title }
}

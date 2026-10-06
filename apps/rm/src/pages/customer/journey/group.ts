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
  { id: 'handoff', label: 'Asked for you', kinds: ['handoff'] },
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

export interface MonthGroup<T extends { at: string } = JourneyEvent> {
  /** `YYYY-MM` */
  month: string
  events: T[]
}

/** Newest month first, events in the order the API sent them (newest first) within each. */
export function byMonth<T extends { at: string }>(events: readonly T[]): MonthGroup<T>[] {
  const groups: MonthGroup<T>[] = []
  for (const event of events) {
    const month = event.at.slice(0, 7)
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.events.push(event)
    else groups.push({ month, events: [event] })
  }
  return groups
}

/* ---------------------------------------------------------------- Monthly reviews */

/**
 * The engine re-plans every month from the new statements. A year of those versions is twelve
 * rows that each move a figure a little, and on the screen they buried the decisions, refusals
 * and calls the journey exists to show. So a routine review is folded: under All, a run of them
 * is one row ("Plan reviewed monthly, 11 times since Oct 2025") with the net change and each
 * review a click away; under Plan versions every one is listed.
 *
 * Routine means the engine cut it from statements alone (no decision of the customer's behind
 * it) and it only re-sized what the plan already was. A version that changes what the plan *is*
 * (a new goal, a stage of a different kind, a field that appears or goes away) is never routine,
 * and nor is the first plan.
 */
const STATEMENT_REFRESH = /^Plan refreshed (?:for |with the statements|with the latest statements)/

export function isRoutineReview(event: JourneyEvent): boolean {
  if (event.kind !== 'plan' || event.source !== 'engine' || event.title !== 'Plan updated') {
    return false
  }
  if (!event.detail || !STATEMENT_REFRESH.test(event.detail)) return false
  return (event.diff ?? []).every((d) => d.field !== 'Goal' && sameShape(d.before, d.after))
}

/** "Free up about ₹2,535 a month" and "Free up about ₹2,472 a month" are one stage, re-sized. */
function sameShape(before: JourneyDiff['before'], after: JourneyDiff['after']): boolean {
  if (before === null || after === null) return false
  if (typeof before === 'number' || typeof after === 'number') {
    return typeof before === 'number' && typeof after === 'number'
  }
  const shape = (text: string) => text.replace(/[\d,.]+/g, '#')
  return shape(before) === shape(after)
}

export type JourneyRow =
  | { type: 'event'; id: string; at: string; event: JourneyEvent }
  /** A run of routine reviews, newest first; `at` is the newest one's date. */
  | { type: 'reviews'; id: string; at: string; events: JourneyEvent[] }

/**
 * The journey as rows: each run of routine reviews (consecutive among the plan versions, other
 * kinds of event in between do not break it) becomes one row where its newest review stood.
 * A run shorter than `min` is left as it is: one review needs no folding.
 */
export function foldReviews(events: readonly JourneyEvent[], min = 2): JourneyRow[] {
  const runOf = new Map<string, JourneyEvent[]>()
  let run: JourneyEvent[] | null = null
  for (const event of events) {
    if (event.kind !== 'plan') continue
    if (!isRoutineReview(event)) {
      run = null
      continue
    }
    if (run === null) run = []
    run.push(event)
    runOf.set(event.id, run)
  }

  const rows: JourneyRow[] = []
  for (const event of events) {
    const members = runOf.get(event.id)
    if (!members || members.length < min) {
      rows.push({ type: 'event', id: event.id, at: event.at, event })
    } else if (members[0] === event) {
      rows.push({ type: 'reviews', id: `reviews-${event.id}`, at: event.at, events: members })
    }
  }
  return rows
}

/**
 * What a run of reviews moved in all, field by field: the value before the oldest review against
 * the value after the newest. Strings are the engine's words and compare as they are.
 */
export function netChange(reviews: readonly JourneyEvent[]): JourneyDiff[] {
  const net = new Map<string, JourneyDiff>()
  // Oldest first, so the first time a field is seen is its starting value.
  for (const review of [...reviews].reverse()) {
    for (const d of review.diff ?? []) {
      const seen = net.get(d.field)
      if (seen) seen.after = d.after
      else net.set(d.field, { field: d.field, before: d.before, after: d.after })
    }
  }
  return [...net.values()]
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

/**
 * The word each outcome is drawn with, and what it means. "Put off" and "Pushed back" read as
 * the same thing on a chip, and they are not: the first is about timing, the second disagrees with
 * the suggestion itself. So the chip says "Objected" for the second. The hover says only what the
 * customer did: the plan engine does not drop a refused suggestion, so a journey can show the
 * same one offered and refused again months later, and a gloss promising otherwise would be
 * contradicted a few rows down.
 */
export const OUTCOME_WORDS: Record<Outcome, { word: string; meaning: string }> = {
  'Did it': { word: 'Did it', meaning: 'They acted on the suggestion.' },
  Declined: { word: 'Declined', meaning: 'They said no to the suggestion.' },
  'Put off': {
    word: 'Put off',
    meaning: 'Parked for later. Uday raises it again while it still matters.',
  },
  'Pushed back': {
    word: 'Objected',
    meaning: 'They disagreed with the suggestion itself, not only its timing.',
  },
}

/** Whether the title already prints the amount, so the row need not print it twice. */
export function titleHasAmount(title: string, amount: number | null): boolean {
  if (amount === null) return false
  return title.includes(formatInr(amount)) || title.includes(formatInr(amount, { short: true }))
}

export function splitDecision(title: string): { outcome: Outcome | null; rest: string } {
  for (const outcome of OUTCOMES) {
    const prefix = `${outcome}: `
    if (title.startsWith(prefix)) return { outcome, rest: title.slice(prefix.length) }
  }
  return { outcome: null, rest: title }
}

/**
 * The arithmetic and wording Today does on top of `rmToday`: no I/O, no React, so
 * `derive.test.ts` runs it under `node --test`.
 *
 * Nothing here invents a figure. Every sum is over amounts the API sent, every date is the
 * simulation's calendar (`YYYY-MM-DD`, read as UTC like `lib/format.ts`), and the RM clock is the
 * `asOf` the response carries, never the wall clock.
 */
import type { Handoff, RmToday, UpcomingItem, UpcomingKind } from '@dhan/contracts'
import { daysBetween, formatDate } from '../../lib/format.ts'

/* ---------------------------------------------------------------- Calendar */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function utc(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = utc(iso)
  if (!d) return iso
  d.setUTCDate(d.getUTCDate() + days)
  return isoOf(d)
}

/** "Tuesday", or "Tue" with `short`. */
export function weekday(iso: string, options: { short?: boolean } = {}): string {
  const d = utc(iso)
  const name = d ? (WEEKDAYS[d.getUTCDay()] ?? '') : ''
  return options.short ? name.slice(0, 3) : name
}

/** "1–7 Sep", or "29 Sep – 1 Oct" when the range crosses a month. */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return formatDate(from, { year: false })
  const a = formatDate(from, { year: false })
  const b = formatDate(to, { year: false })
  const [dayA, monthA] = a.split(' ')
  const [dayB, monthB] = b.split(' ')
  return monthA === monthB ? `${dayA}–${dayB} ${monthB}` : `${a} – ${b}`
}

/* ---------------------------------------------------------------- Greeting */

/** The greeting goes by the RM's wall clock; every figure under it goes by the as-of date. */
export function greeting(hour: number): string {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

/* ---------------------------------------------------------------- Figures in a sentence */

export interface Run {
  text: string
  /** A rupee amount or a percentage: drawn in full ink so the eye lands on it first. */
  figure: boolean
}

/*
 * The figures the engine writes into its sentences: ₹3,14,280 · ₹3.14L · ₹1.2Cr · ₹48k · 34.8%.
 * The minus is the true minus `formatInr` writes, or a hyphen from older copy.
 */
const FIGURE = /([−-]?₹\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:Cr|L|k)\b)?|\d+(?:\.\d+)?%)/g

/**
 * Splits a sentence into plain runs and figure runs, so the queue can set "₹14,200" in ink and
 * the words around it a step quieter. Joining the runs gives back the sentence unchanged.
 */
export function figureRuns(sentence: string): Run[] {
  const runs: Run[] = []
  let last = 0
  for (const match of sentence.matchAll(FIGURE)) {
    const at = match.index
    if (at > last) runs.push({ text: sentence.slice(last, at), figure: false })
    runs.push({ text: match[0], figure: true })
    last = at + match[0].length
  }
  if (last < sentence.length) runs.push({ text: sentence.slice(last), figure: false })
  return runs
}

/* ---------------------------------------------------------------- The header */

/** "Priyanka Arora" → "Priyanka", for copy that speaks of the customer by name. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/**
 * The line under the greeting: the date the book is at, then the one number that decides the
 * morning. Waiting customers come first because they asked; otherwise the size of the queue.
 */
export function headline(today: Pick<RmToday, 'asOf' | 'handoffs' | 'queue'>): string {
  const date = `${weekday(today.asOf)}, ${formatDate(today.asOf)}`
  const waiting = today.handoffs.filter((h) => h.status === 'open').length
  if (waiting > 0) {
    return `${date} · ${waiting} ${waiting === 1 ? 'customer is' : 'customers are'} waiting on a call`
  }
  const calls = today.queue.length
  if (calls > 0) return `${date} · ${calls} ${calls === 1 ? 'customer' : 'customers'} to call`
  return `${date} · nobody needs a call today`
}

/* ---------------------------------------------------------------- Handoffs */

/** A handoff's status after the RM acts on it, as the list should show it before the server answers. */
export function applyHandoffStatus(
  handoffs: readonly Handoff[],
  id: string,
  status: 'contacted' | 'resolved',
  note: string | null,
): Handoff[] {
  // Resolved requests leave the inbox; the API lists only open and contacted ones.
  if (status === 'resolved') return handoffs.filter((h) => h.id !== id)
  return handoffs.map((h) => (h.id === id ? { ...h, status, note: note ?? h.note } : h))
}

/* ---------------------------------------------------------------- Coming up */

/** The dated events that want a conversation, in the order a desk would raise them. */
export const EVENT_KINDS = ['deposit_maturing', 'emi_ending', 'policy_renewal'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const EVENT_LABEL: Record<EventKind, string> = {
  deposit_maturing: 'Deposits maturing',
  emi_ending: 'EMIs ending',
  policy_renewal: 'Policies renewing',
}

export interface EventGroup {
  kind: EventKind
  items: UpcomingItem[]
}

export interface SipDay {
  date: string
  items: UpcomingItem[]
  /** Rupees across the day's instalments that carry an amount. */
  amount: number
}

export interface SipWeek {
  from: string
  to: string
  days: SipDay[]
  count: number
  customers: number
  amount: number
}

export interface UpcomingGroups {
  events: EventGroup[]
  weeks: SipWeek[]
  sip: { count: number; customers: number; amount: number }
}

function byDateThenName(a: UpcomingItem, b: UpcomingItem): number {
  return a.date.localeCompare(b.date) || a.name.localeCompare(b.name)
}

function sumAmounts(items: readonly UpcomingItem[]): number {
  return items.reduce((total, item) => total + (item.amount ?? 0), 0)
}

function customerCount(items: readonly UpcomingItem[]): number {
  return new Set(items.map((i) => i.cif)).size
}

const isEvent = (kind: UpcomingKind): kind is EventKind =>
  (EVENT_KINDS as readonly string[]).includes(kind)

/**
 * Splits the next thirty days into what wants a call and what only runs.
 *
 * Maturities, EMI endings and renewals are each a conversation, so they stay one row each,
 * grouped by kind. SIP instalments are routine (Meera's book has ~50 a month), so they fold into
 * seven-day windows counted from the as-of date, each opening to its days. Windows with nothing
 * in them are left out; the last is cut at the thirtieth day so its range never claims more than
 * the API looked at.
 */
export function groupUpcoming(items: readonly UpcomingItem[], asOf: string): UpcomingGroups {
  const sorted = [...items].sort(byDateThenName)

  const events: EventGroup[] = EVENT_KINDS.map((kind) => ({
    kind,
    items: sorted.filter((i) => i.kind === kind),
  })).filter((g) => g.items.length > 0)

  const sips = sorted.filter((i) => !isEvent(i.kind))
  const horizon = addDays(asOf, 30)
  const buckets = new Map<number, UpcomingItem[]>()
  for (const item of sips) {
    const index = Math.max(0, Math.floor(daysBetween(asOf, item.date) / 7))
    buckets.set(index, [...(buckets.get(index) ?? []), item])
  }

  const weeks: SipWeek[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, inWeek]) => {
      const from = addDays(asOf, index * 7)
      const end = addDays(from, 6)
      const last = inWeek[inWeek.length - 1]?.date ?? end
      // Never past the window, and never short of an item that is in it.
      const to = end > horizon ? (last > horizon ? last : horizon) : end
      const dates = [...new Set(inWeek.map((i) => i.date))]
      return {
        from,
        to,
        days: dates.map((date) => {
          const onDay = inWeek.filter((i) => i.date === date)
          return { date, items: onDay, amount: sumAmounts(onDay) }
        }),
        count: inWeek.length,
        customers: customerCount(inWeek),
        amount: sumAmounts(inWeek),
      }
    })

  return {
    events,
    weeks,
    sip: { count: sips.length, customers: customerCount(sips), amount: sumAmounts(sips) },
  }
}

/*
 * Inside an open week the amount has its own column, so the label's leading figure would say it
 * twice: "₹15,000 SIP into Parag Parikh Flexi Cap Fund" is shown as the fund. A label in any
 * other shape is shown whole rather than guessed at.
 */
const INSTALMENT = /^[−-]?₹[\d,.]+(?:\s?(?:Cr|L|k))?\s+(?:SIP into|contribution to)\s+(.+)$/

export function fundOf(label: string): string {
  return INSTALMENT.exec(label)?.[1] ?? label
}

/** "In 10 days", "Tomorrow", "Today": how far off an upcoming date is from the RM clock. */
export function untilLabel(date: string, asOf: string): string {
  const days = daysBetween(asOf, date)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

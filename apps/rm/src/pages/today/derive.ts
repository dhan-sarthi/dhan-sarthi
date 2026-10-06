/**
 * The arithmetic and wording Today does on top of `rmToday`: no I/O, no React, so
 * `derive.test.ts` runs it under `node --test`.
 *
 * Nothing here invents a figure. Every sum is over amounts the API sent, every date is the
 * simulation's calendar (`YYYY-MM-DD`, read as UTC like `lib/format.ts`), and the RM clock is the
 * `asOf` the response carries, never the wall clock.
 */
import type {
  AdviceItem,
  Handoff,
  Kpi,
  QueueItem,
  RmToday,
  UpcomingItem,
  UpcomingKind,
} from '@dhan/contracts'
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

/* ---------------------------------------------------------------- Requests to talk */

/**
 * "Asked 6 days ago": how long a customer has waited, said on the queue row's chip so the row's
 * own line can lead with the figure that explains the call.
 */
export function askedLabel(waitingDays: number): string {
  if (waitingDays <= 0) return 'Asked today'
  if (waitingDays === 1) return 'Asked yesterday'
  return `Asked ${waitingDays} days ago`
}

/** "Asked 26 Aug · waiting 6 days", or "· contacted" once the RM has called. */
export function requestLine(request: Pick<Handoff, 'requestedOn' | 'waitingDays' | 'status'>) {
  const asked = `Asked ${formatDate(request.requestedOn, { year: false })}`
  if (request.status === 'contacted') return `${asked} · contacted`
  if (request.waitingDays <= 0) return `${asked} · today`
  return `${asked} · waiting ${request.waitingDays} ${request.waitingDays === 1 ? 'day' : 'days'}`
}

/** A request is still the RM's to deal with until it is resolved. */
const isLive = (h: Handoff): boolean => h.status === 'open' || h.status === 'contacted'

/**
 * The request behind a queue row, if the customer has one the RM has not resolved: the one the
 * row was raised by (`handoff:<id>`), else the customer's oldest live request. A row raised by a
 * signal can still carry a request the RM has already called about, and that request is dealt
 * with on that row rather than in a second list.
 */
export function requestFor(item: Pick<QueueItem, 'id' | 'cif'>, handoffs: readonly Handoff[]) {
  const own = handoffs.find((h) => `handoff:${h.id}` === item.id && isLive(h))
  if (own) return own
  const live = handoffs
    .filter((h) => h.cif === item.cif && isLive(h))
    .sort((a, b) => a.requestedOn.localeCompare(b.requestedOn) || a.id.localeCompare(b.id))
  return live[0] ?? null
}

/**
 * Requests the RM has called about but not resolved, for customers who are not in the queue: the
 * one place left to resolve them. A customer still in the queue resolves theirs on their row.
 */
export function unqueuedRequests(
  queue: readonly Pick<QueueItem, 'cif'>[],
  handoffs: readonly Handoff[],
): Handoff[] {
  const queued = new Set(queue.map((q) => q.cif))
  return handoffs.filter((h) => isLive(h) && !queued.has(h.cif))
}

/**
 * The row's one line under the name. A signal row prints the API's own sentence. A row a customer
 * raised prints the top signal's title ("Card at 34.8% — ₹3.14L outstanding"), figure first: the
 * wait it would otherwise open with is on the row's chip, and what the customer asked about is in
 * the open row.
 */
export function rowLine(
  item: Pick<QueueItem, 'source' | 'signal' | 'why'>,
  request: Pick<Handoff, 'reason'> | null,
): string {
  if (item.source === 'signal') return item.why
  return item.signal?.title ?? request?.reason ?? item.why
}

/** "Card at 34.8% — …" → "card at 34.8% — …", leaving "EMIs …" and "₹2L …" as they are. */
function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? `${text[0]?.toLowerCase() ?? ''}${text.slice(1)}` : text
}

/**
 * What the RM says first on a row. A signal row's opener is the API's, as sent.
 *
 * A row a customer raised opens with why they are owed a call, figure first: when they asked
 * Uday, then the issue he put first ("Priyanka, you asked Uday for a call on 26 Aug. He flagged
 * this first: card at 34.8% — ₹3.14L outstanding."). The API's opener for these rows only says it
 * is a call back, which tells the RM nothing about why, so it is used only once it carries a
 * figure of its own: then the API has said why, and its words win.
 */
export function openerFor(
  item: Pick<QueueItem, 'source' | 'name' | 'opener' | 'signal'>,
  request: Pick<Handoff, 'requestedOn' | 'waitingDays'> | null,
): string {
  if (item.source !== 'handoff' || request === null) return item.opener
  if (figureRuns(item.opener).some((run) => run.figure)) return item.opener
  const when =
    request.waitingDays <= 0
      ? 'today'
      : request.waitingDays === 1
        ? 'yesterday'
        : `on ${formatDate(request.requestedOn, { year: false })}`
  const asked = `${firstName(item.name)}, you asked Uday for a call ${when}.`
  if (item.signal === null) return `${asked} What would you like to go through?`
  return `${asked} He flagged this first: ${lowerFirst(item.signal.title)}.`
}

/**
 * Uday's read on the day the customer asked, as lines under the request. The reason is left out
 * when it is the row's own line word for word; when the figures have moved since (a deposit "in
 * 11 days" then is "in 7 days" now), the day's reason is kept, because it is what the customer
 * was looking at.
 */
export function udayRead(request: Pick<Handoff, 'reason' | 'context'>, line: string): string[] {
  const reason = request.reason.trim()
  return reason === '' || reason === line.trim()
    ? [...request.context]
    : [reason, ...request.context]
}

/**
 * Today after the RM acts on a request, as the page should show it before the server answers.
 * A resolved request leaves the handoffs (the API lists only open and contacted ones) and takes
 * the queue row it raised with it; a contacted one keeps its row until the refetch moves it.
 */
export function applyHandoffStatus<T extends Pick<RmToday, 'handoffs' | 'queue'>>(
  today: T,
  id: string,
  status: 'contacted' | 'resolved',
  note: string | null,
): T {
  if (status === 'resolved') {
    return {
      ...today,
      handoffs: today.handoffs.filter((h) => h.id !== id),
      queue: today.queue.filter((q) => q.id !== `handoff:${id}`),
    }
  }
  return {
    ...today,
    handoffs: today.handoffs.map((h) => (h.id === id ? { ...h, status, note: note ?? h.note } : h)),
  }
}

/* ---------------------------------------------------------------- Figures */

/*
 * The one KPI the API still names in product-team words. "Handoff" is not a word an RM says
 * aloud; the queue chip and the Book tab both say the customer asked.
 */
const KPI_LABEL: Readonly<Record<string, string>> = {
  open_handoffs: 'Asked for a call',
}

export function kpiLabel(kpi: Pick<Kpi, 'id' | 'label'>): string {
  return KPI_LABEL[kpi.id] ?? kpi.label
}

/* ---------------------------------------------------------------- Refusals */

export interface RefusalGroup {
  /** The newest refusal's id, stable across refetches. */
  id: string
  productName: string | null
  ruleId: string | null
  /** The words the customer heard, or the recorded reason where nothing was spoken. */
  words: string
  spoken: boolean
  /** Each customer once, newest first. */
  people: { cif: string; name: string }[]
  /** The oldest and newest dates in the group (equal for one refusal). */
  from: string
  to: string
}

/**
 * The latest refusals, with the same refusal said to several customers folded into one row: the
 * same product, the same rule and the same words. Rows that differ in any of the three stay
 * apart, so nothing a customer heard is hidden behind someone else's sentence.
 */
export function groupRefusals(items: readonly AdviceItem[], limit: number): RefusalGroup[] {
  const groups = new Map<string, RefusalGroup>()
  for (const r of items) {
    const words = r.spoken ?? r.recorded
    const key = `${r.productId ?? r.productName ?? ''}\u0000${r.ruleId ?? ''}\u0000${words}`
    const group = groups.get(key)
    if (group) {
      if (!group.people.some((p) => p.cif === r.cif))
        group.people.push({ cif: r.cif, name: r.name })
      if (r.at < group.from) group.from = r.at
      if (r.at > group.to) group.to = r.at
      continue
    }
    if (groups.size >= limit) continue
    groups.set(key, {
      id: r.id,
      productName: r.productName,
      ruleId: r.ruleId,
      words,
      spoken: r.spoken !== null,
      people: [{ cif: r.cif, name: r.name }],
      from: r.at,
      to: r.at,
    })
  }
  return [...groups.values()]
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

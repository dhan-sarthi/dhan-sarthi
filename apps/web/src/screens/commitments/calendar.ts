/**
 * The calendar's arithmetic: which dates a detected series lands on, and what each one means.
 *
 * Kept as plain functions with no React in sight, because this is the half of the screen that
 * can be wrong without looking wrong. A grid drawn a column out, a February with 30 cells, a
 * monthly charge on the 31st silently vanishing in the short months — every one of those renders
 * perfectly and is a lie about somebody's money. So it is a module with tests beside it rather
 * than a `useMemo` inside a component.
 *
 * ## Where the dates come from, and how sure we are
 *
 * The engine gives us a *series*, not a list of debits: `firstSeen` and `lastSeen` exactly, plus
 * a rhythm (`cadence`, `intervalDays`, `dayOfMonth`) and a count. So the grid is reconstructed by
 * walking that rhythm out from `lastSeen` — anchored there rather than on `firstSeen` so the one
 * date we know for certain is one of the dates we draw, and so a series that drifted a day or two
 * over a year drifts *away* from today rather than towards it.
 *
 * That reconstruction is honest about three things:
 *
 * - It never emits a date before `firstSeen` or after `until`. There is no evidence either side.
 * - `observed` marks the two dates that came off the ledger rather than out of the walk.
 * - The three states are the three real questions. `paid` — on or before the last charge we saw,
 *   so the money went. `late` — the rhythm says a charge was due and the ledger has not shown one
 *   yet. `due` — still to come. The reference's calendar had four colours and its own spec says
 *   nobody could tell us what they meant.
 */
import { addDays, addMonths, daysInMonth, fromYmd, ymd } from '@dhan/core'
import type { Series } from '@dhan/contracts'

/** `paid` happened, `late` should have happened, `due` is still coming. */
export type DueState = 'paid' | 'late' | 'due'

/**
 * One series reduced to what the calendar needs.
 *
 * A separate shape from `Series` on purpose: `until` is the screen's business — a customer's
 * "I have stopped this" note, or a series the engine already calls inactive — and threading UI
 * state through the domain type would put a browser-only idea inside a wire contract.
 */
export interface Schedule {
  key: string
  label: string
  amount: number
  cadence: Series['cadence']
  intervalDays: number
  dayOfMonth: number | null
  firstSeen: string
  lastSeen: string
  /** No charge is projected on or after this date. Null projects indefinitely. */
  until: string | null
  /**
   * A hole in the middle of the run: `[from, to)`.
   *
   * A pause is not a truncation, and modelling it as one would quietly delete the rest of
   * somebody's year off the calendar. Half-open at both ends for the same reason `until` is —
   * a pause that ends on the 12th charges on the 12th.
   */
  skip: { from: string; to: string } | null
}

export interface Due {
  date: string
  key: string
  label: string
  amount: number
  state: DueState
  /** Read off the ledger, not walked to. True for `firstSeen` and `lastSeen` only. */
  observed: boolean
}

export interface DayCell {
  /** Null on the padding cells that make the first row line up with the right weekday. */
  date: string | null
  day: number
  today: boolean
  dues: Due[]
  /** The state the cell is drawn in: the most urgent of the day's dues. */
  state: DueState | null
  total: number
}

/** Sunday first, which is how a wall calendar is printed in India. */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const MONTHS = [
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
] as const

export function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? ''} ${year}`
}

/** 0 = Sunday. Computed off the ISO string so no local timezone can move it a day. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay()
}

/** 'YYYY-MM' + n months, as a `{ year, month }` pair. */
export function shiftMonth(
  year: number,
  month: number,
  by: number,
): { year: number; month: number } {
  const moved = ymd(addMonths(fromYmd(year, month, 1), by))
  return { year: moved.year, month: moved.month }
}

/** How many whole months `b` is after `a`. Negative where `b` is earlier. */
export function monthsBetween(
  a: { year: number; month: number },
  b: { year: number; month: number },
): number {
  return (b.year - a.year) * 12 + (b.month - a.month)
}

/**
 * The step a cadence takes, as either whole months or whole days.
 *
 * Monthly and longer step in months so a charge on the 30th stays on the 30th instead of sliding
 * a day earlier every February; weekly and shorter step in days because that is what they are.
 * `irregular` falls back to the measured median interval, which is the only thing known about it.
 */
function stepOf(s: Schedule): { months: number } | { days: number } {
  switch (s.cadence) {
    case 'monthly':
      return { months: 1 }
    case 'quarterly':
      return { months: 3 }
    case 'annual':
      return { months: 12 }
    case 'weekly':
      return { days: 7 }
    case 'fortnightly':
      return { days: 14 }
    default:
      return { days: Math.max(1, Math.round(s.intervalDays)) }
  }
}

/**
 * Move a month-stepping date, keeping the nominal day of the month.
 *
 * The clamp is the whole reason this is not `addMonths` on the previous occurrence: a mandate on
 * the 31st becomes the 28th in February, and stepping from *that* would leave it on the 28th
 * forever. So every step is measured from the anchor, and the nominal day is reapplied each time.
 */
function monthStep(anchor: string, nominalDay: number, steps: number, months: number): string {
  const base = ymd(addMonths(anchor, steps * months))
  return fromYmd(base.year, base.month, Math.min(nominalDay, daysInMonth(base.year, base.month)))
}

/**
 * Every date this series lands on inside `[from, to]`.
 *
 * Bounded at both ends by the evidence — nothing before `firstSeen`, nothing on or after `until`
 * — and iteration-capped so a corrupt `intervalDays` of zero cannot hang the screen.
 */
export function occurrences(s: Schedule, from: string, to: string): string[] {
  const out: string[] = []
  const step = stepOf(s)
  const floor = s.firstSeen > from ? s.firstSeen : from
  const ceil = s.until !== null && s.until <= to ? s.until : to
  if (floor > ceil) return out

  const nominalDay = 'months' in step ? (s.dayOfMonth ?? Number(s.lastSeen.slice(8, 10))) : 0

  const at = (n: number): string =>
    'months' in step
      ? monthStep(s.lastSeen, nominalDay, n, step.months)
      : addDays(s.lastSeen, n * step.days)

  /* Walk out from the anchor in both directions rather than from the window's edge: the anchor
     is the one date we actually saw, so every date drawn keeps its phase relative to it. */
  for (let n = 0; n > -600; n -= 1) {
    const d = at(n)
    if (d < floor) break
    if (d <= ceil) out.push(d)
  }
  for (let n = 1; n < 600; n += 1) {
    const d = at(n)
    if (d > ceil) break
    if (d >= floor) out.push(d)
  }

  /* `until` is exclusive — a commitment stopped on the 12th does not charge on the 12th. */
  return out
    .filter((d) => s.until === null || d < s.until)
    .filter((d) => s.skip === null || d < s.skip.from || d >= s.skip.to)
    .sort()
}

function stateOf(date: string, lastSeen: string, asOf: string): DueState {
  if (date <= lastSeen) return 'paid'
  return date < asOf ? 'late' : 'due'
}

/** Every charge from every schedule that falls in the given month, oldest first. */
export function duesInMonth(
  schedules: readonly Schedule[],
  year: number,
  month: number,
  asOf: string,
): Due[] {
  const from = fromYmd(year, month, 1)
  const to = fromYmd(year, month, daysInMonth(year, month))
  const out: Due[] = []
  for (const s of schedules) {
    for (const date of occurrences(s, from, to)) {
      out.push({
        date,
        key: s.key,
        label: s.label,
        amount: s.amount,
        state: stateOf(date, s.lastSeen, asOf),
        observed: date === s.lastSeen || date === s.firstSeen,
      })
    }
  }
  return out.sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date < b.date ? -1 : 1))
}

const URGENCY: Record<DueState, number> = { late: 3, due: 2, paid: 1 }

/**
 * The month as a grid: leading blanks, the real number of days, and nothing else.
 *
 * Trailing blanks are deliberately *not* emitted. A fixed 42-cell grid keeps the card the same
 * height every month, which is a nice property and a worse one than not drawing four empty
 * squares under a month that ended on a Saturday.
 */
export function monthGrid(
  year: number,
  month: number,
  asOf: string,
  dues: readonly Due[],
): DayCell[] {
  const length = daysInMonth(year, month)
  const lead = weekdayOf(fromYmd(year, month, 1))
  const cells: DayCell[] = []

  for (let i = 0; i < lead; i += 1) {
    cells.push({ date: null, day: 0, today: false, dues: [], state: null, total: 0 })
  }

  for (let day = 1; day <= length; day += 1) {
    const date = fromYmd(year, month, day)
    const onDay = dues.filter((d) => d.date === date)
    const state =
      onDay.length === 0
        ? null
        : onDay.reduce((worst, d) => (URGENCY[d.state] > URGENCY[worst.state] ? d : worst)).state
    cells.push({
      date,
      day,
      today: date === asOf,
      dues: onDay,
      state,
      total: onDay.reduce((sum, d) => sum + d.amount, 0),
    })
  }

  return cells
}

export interface MonthTotals {
  paid: number
  late: number
  due: number
  total: number
  count: number
}

export function monthTotals(dues: readonly Due[]): MonthTotals {
  const totals: MonthTotals = { paid: 0, late: 0, due: 0, total: 0, count: dues.length }
  for (const d of dues) {
    totals[d.state] += d.amount
    totals.total += d.amount
  }
  return totals
}

/**
 * The first month worth showing, and the last.
 *
 * Backwards: no earlier than the oldest thing the ledger knows about, because a month before any
 * commitment existed is a page of nothing with no way to tell whether that is the truth or a bug.
 * Forwards: a year, which is as far as a projection off a detected rhythm deserves to be trusted.
 */
export function monthRange(
  schedules: readonly Schedule[],
  asOf: string,
): { first: { year: number; month: number }; last: { year: number; month: number } } {
  const here = ymd(asOf)
  const earliest = schedules.reduce<string | null>(
    (min, s) => (min === null || s.firstSeen < min ? s.firstSeen : min),
    null,
  )
  const start = earliest === null ? here : ymd(earliest)
  const end = shiftMonth(here.year, here.month, 12)
  return {
    first: { year: start.year, month: start.month },
    last: end,
  }
}

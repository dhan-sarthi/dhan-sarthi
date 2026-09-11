/**
 * Statement lines folded into one figure a month — the feed behind every sparkline in the app.
 *
 * The app holds two years of real transactions and renders a median in front of them. This is the
 * bridge: it takes the lines a screen has already fetched and returns a run of months. It invents
 * nothing. Two rules make that claim checkable.
 *
 * **The caller must hold the whole window.** A cursor-paged list is the wrong input for a chart —
 * twenty lines newest-first would draw one tall month and eleven empty ones, and the empty ones
 * would look like months the customer spent nothing in. So the window is explicit: ask
 * `/transactions` with `from`, `to` and the category, page until `nextCursor` is null, and hand
 * the lot to `monthlyTotals` with the same `asOf` and `months`. `covered` comes back saying how
 * many of the requested months the data actually reaches, and a component that gets fewer months
 * than it asked for should draw the ones it has rather than pad the axis with zeroes.
 *
 * **The running month is not a month.** As-of the 12th, this month holds twelve days of spending,
 * and drawn beside eleven full months it reads as a collapse. `derive.ts` drops the partial months
 * at both ends of its window for exactly this reason and every figure in the snapshot is computed
 * over complete months only; a chart that disagreed with the figure printed beside it would be
 * the chart's fault. The current month is therefore excluded by default. `includeCurrent` draws it
 * back in, flagged `partial`, for the one card that wants "so far this month" — and that card has
 * to mark it, because the point is not lost by being small, it is lost by looking finished.
 */
import type { SpendCategory, Transaction } from '@dhan/contracts'

/** One bucket: the month, what to print under it, and the figure. */
export type MonthPoint = {
  /** `2026-04`. Sorts lexically, which is why every key in this file is this shape. */
  key: string
  /** `Apr`. The axis label — three letters is all a 430px card has room for. */
  label: string
  value: number
  /** The month is still running: this figure is not comparable with the ones beside it. */
  partial: boolean
}

export type MonthSeries = {
  points: MonthPoint[]
  /** How many months the ledger actually reached, which may be fewer than were asked for. */
  covered: number
  /** Months that were asked for and had no line at all in them. */
  gaps: number
}

export interface MonthWindow {
  /** The session's as-of date. The window ends at the month before this one. */
  asOf: string
  /** How many months back to run. Twelve is a year of context on a phone-width card. */
  months: number
  /** Include the running month, flagged `partial`. Off, and it should stay off. */
  includeCurrent?: boolean | undefined
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `2026-04-12` → `2026-04`. String slicing, because ISO dates sort and `Date` brings a zone. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** `2026-04` → `Apr`. Anything unparseable keeps its key, which is ugly and visible. */
export function monthLabel(key: string): string {
  return SHORT[Number(key.slice(5, 7)) - 1] ?? key
}

/** `2026-01` shifted by -2 is `2025-11`. Arithmetic on the key; no `Date`, no timezone. */
export function shiftMonth(key: string, by: number): string {
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7)) - 1 + by
  const y = year + Math.floor(month / 12)
  const m = ((month % 12) + 12) % 12
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}`
}

/** The month keys the window covers, oldest first. */
export function windowKeys(w: MonthWindow): string[] {
  const last = w.includeCurrent === true ? monthKey(w.asOf) : shiftMonth(monthKey(w.asOf), -1)
  const n = Math.max(0, Math.floor(w.months))
  return Array.from({ length: n }, (_, i) => shiftMonth(last, i - (n - 1)))
}

function bucket(txns: readonly Transaction[], w: MonthWindow): Map<string, Transaction[]> {
  const keys = new Set(windowKeys(w))
  const out = new Map<string, Transaction[]>()
  for (const t of txns) {
    if (t.txnDate > w.asOf) continue
    const key = monthKey(t.txnDate)
    if (!keys.has(key)) continue
    const list = out.get(key)
    if (list) list.push(t)
    else out.set(key, [t])
  }
  return out
}

/**
 * What went out each month, optionally in one category.
 *
 * Debits only, and `txnAmount` is a magnitude in this ledger — the direction lives in `txnType` —
 * so a refund does not net off against a purchase in the same month. That is deliberate: a
 * spending chart answers "what left the account", and a ₹40,000 booking refunded a week later is
 * two events, not zero events.
 *
 * A month inside the window with no lines is a real zero and is drawn as one. A month outside what
 * the ledger reaches is not in the series at all — `covered` is how the caller tells the two
 * apart, and the difference is the whole reason this returns an object rather than an array.
 */
export function monthlyTotals(
  txns: readonly Transaction[],
  w: MonthWindow,
  category?: SpendCategory | undefined,
): MonthSeries {
  const keys = windowKeys(w)
  const buckets = bucket(txns, w)
  const current = monthKey(w.asOf)

  const earliest = txns.reduce<string | null>(
    (min, t) => (min === null || t.txnDate < min ? t.txnDate : min),
    null,
  )
  const reach = earliest === null ? null : monthKey(earliest)
  const live = reach === null ? [] : keys.filter((k) => k >= reach)

  let gaps = 0
  const points = live.map((key): MonthPoint => {
    const lines = buckets.get(key) ?? []
    if (lines.length === 0) gaps += 1
    const value = lines
      .filter((t) => t.txnType === 'DEBIT')
      .filter((t) => category === undefined || t.spendCategory === category)
      .reduce((sum, t) => sum + Math.abs(t.txnAmount), 0)
    return { key, label: monthLabel(key), value: Math.round(value), partial: key === current }
  })

  return { points, covered: points.length, gaps }
}

/**
 * The closing balance each month — the account itself, over time.
 *
 * The last `balanceAfterTxn` in the month, which is the same statistic `derive.ts` uses to decide
 * how many months the balance has held above one month of outflow, and `asof.ts` uses for the
 * average monthly balance. Drawing a different one beside those figures would put a chart and a
 * sentence on the same card disagreeing about the same account.
 *
 * Two carries, both because a balance is a *level* and not a flow:
 *
 * - A month with no transactions keeps the previous month's close. Nothing moved, so the balance
 *   did not move; a zero there would draw the account being emptied and refilled.
 * - Months before the first line with a balance on them are dropped rather than back-filled. The
 *   bank's own feed leaves `balanceAfterTxn` null on some rails, and inventing the opening balance
 *   of a month we have no balance for is the one thing this file may not do.
 */
export function monthlyClose(txns: readonly Transaction[], w: MonthWindow): MonthSeries {
  const keys = windowKeys(w)
  const buckets = bucket(txns, w)
  const current = monthKey(w.asOf)

  const points: MonthPoint[] = []
  let carried: number | null = null
  let gaps = 0

  for (const key of keys) {
    const lines = [...(buckets.get(key) ?? [])].sort((a, b) => (a.txnDate < b.txnDate ? -1 : 1))
    const closes = lines.map((t) => t.balanceAfterTxn).filter((b): b is number => b !== null)
    const close = closes[closes.length - 1]

    if (close === undefined) {
      if (carried === null) continue
      gaps += 1
      points.push({ key, label: monthLabel(key), value: carried, partial: key === current })
      continue
    }
    carried = close
    points.push({ key, label: monthLabel(key), value: close, partial: key === current })
  }

  return { points, covered: points.length, gaps }
}

/** The lowest balance the window ever reached — `balances.idleFloor`, drawn as a rule. */
export function lowOf(series: MonthSeries): number | null {
  if (series.points.length === 0) return null
  return Math.min(...series.points.map((p) => p.value))
}

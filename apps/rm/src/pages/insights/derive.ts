/**
 * The arithmetic the Insights page does over `GET /rm/insights`, kept apart from the components
 * so it can be read, and tested, without a browser. Every figure here is a sum, a share or a
 * difference of numbers the API sent; nothing is estimated and nothing is filled in. Where the
 * API has no figure to work from, the answer is `null` and the page says so in words.
 */

import { formatCount } from '../../lib/format.ts'

/** The last value of a series, or null when the series is empty. */
export function latest(series: readonly number[]): number | null {
  return series.length === 0 ? null : (series[series.length - 1] ?? null)
}

/** The first value of a series, or null when the series is empty. */
export function earliest(series: readonly number[]): number | null {
  return series.length === 0 ? null : (series[0] ?? null)
}

/**
 * Percentage change from the first point of the window to the last. Null where the first point
 * is zero or missing: a change from nothing has no percentage, and inventing one ("+∞%") would
 * be worse than saying nothing.
 */
export function pctChange(series: readonly number[]): number | null {
  const first = earliest(series)
  const last = latest(series)
  if (first === null || last === null || first === 0) return null
  return round1(((last - first) / Math.abs(first)) * 100)
}

/**
 * The change from the month before the latest to the latest. For monthly counts, which are sparse
 * and step up and down, last month is the comparison an RM would make; a change since the first
 * month of the window is noise.
 */
export function lastStep(series: readonly number[]): number | null {
  if (series.length < 2) return null
  const last = series[series.length - 1]
  const prev = series[series.length - 2]
  return last === undefined || prev === undefined ? null : last - prev
}

/** `part` as a share of `total`, 0–100. Zero when there is no total to divide by. */
export function sharePct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0
}

/**
 * A share as a whole percentage for a label: "53%", and "<1%" for a part that is there but
 * rounds to nothing, so a bar with a visible sliver is never labelled 0%.
 */
export function shareLabel(pct: number): string {
  if (pct > 0 && pct < 0.5) return '<1%'
  return `${Math.round(pct)}%`
}

export function sum(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0)
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * How many points of a mover's series the three-month change spans: the month-end three months
 * back and the latest one, so four points. The API measures `changePct` over exactly this window.
 */
export const MOVER_WINDOW_POINTS = 4

/**
 * The month-end a three-month change is measured from, and its value. Null when the series is
 * shorter than the window, which the API never sends for a mover, but a short series must not
 * draw a figure from nowhere.
 */
export function moverBase(series: readonly number[]): number | null {
  if (series.length < MOVER_WINDOW_POINTS) return null
  return series[series.length - MOVER_WINDOW_POINTS] ?? null
}

/** A series as chart rows aligned to the months, with a gap (null) wherever a point is missing. */
export function toRows(
  months: readonly string[],
  series: Readonly<Record<string, readonly number[]>>,
): Record<string, string | number | null>[] {
  return months.map((month, i) => {
    const row: Record<string, string | number | null> = { month }
    for (const [key, values] of Object.entries(series)) row[key] = values[i] ?? null
    return row
  })
}

/** "1 in Aug, 3 fewer than Jul": a month's count said against the one before, with no colour. */
export function stepSentence(
  values: readonly number[],
  month: string,
  prevMonth: string | null,
): string | null {
  const last = latest(values)
  if (last === null) return null
  const step = lastStep(values)
  const head = `${formatCount(last)} in ${month}`
  if (step === null || prevMonth === null) return head
  if (step === 0) return `${head}, the same as ${prevMonth}`
  return `${head}, ${formatCount(Math.abs(step))} ${step < 0 ? 'fewer' : 'more'} than ${prevMonth}`
}

/** "As at 1 Sep 2026" → "as at 1 Sep 2026": one of the API's labels in the middle of a sentence. */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

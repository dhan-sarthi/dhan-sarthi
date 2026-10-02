/**
 * Where twelve months sit along a small chart, and where a line through them goes: the geometry
 * every month chart in the kit shares (`ui/MonthChart.tsx`), so a line tile and a column tile put
 * the same month at the same x, label the same months, and print an end value on the side the
 * line leaves clear.
 *
 * Pure, no React: `months.test.ts` runs it under `node --test`.
 */

/** A month's position along the axis, 0 at the first month and 1 at the latest. */
export function monthShare(i: number, n: number): number {
  return n <= 1 ? 0.5 : i / (n - 1)
}

/**
 * Which months carry a label: every other one, counted back from the latest, so the month a tile
 * is titled with ("44 in Aug") is always named under its own point. Counting forward from the
 * first, as a chart library does, named September and left August blank.
 */
export function isLabelledMonth(i: number, n: number): boolean {
  return (n - 1 - i) % 2 === 0
}

/**
 * A y position for each value in a plot `height` tall, keeping `pad` clear at the top and the
 * bottom. The range is the values' own (a line that is not read from zero), and a flat series
 * draws a flat line through the middle.
 */
export function lineY(
  values: readonly number[],
  height: number,
  pad: number,
): (value: number) => number {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = height - pad * 2
  if (!(hi > lo) || span <= 0) return () => height / 2
  return (value) => pad + (1 - (value - lo) / (hi - lo)) * span
}

/**
 * Which side of an end point its value label goes on: the side the line does not run into. A
 * line that rises away from its first point leaves the space below that point clear; a line that
 * rises into its last point leaves the space above it clear. Level counts as rising, so a flat
 * line is labelled above.
 */
export function endLabelSide(values: readonly number[], end: 'first' | 'last'): 'above' | 'below' {
  if (values.length < 2) return 'above'
  if (end === 'first') {
    const first = values[0] ?? 0
    const next = values[1] ?? first
    return next > first ? 'below' : 'above'
  }
  const last = values[values.length - 1] ?? 0
  const prev = values[values.length - 2] ?? last
  return prev <= last ? 'above' : 'below'
}

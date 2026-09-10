/**
 * The donut.
 *
 * Measured off the source's Market Cap Distribution chart: **138px outer, 68px inner** — a hole
 * of 0.49 of the diameter, which is a fat ring, not a pie with a dot cut out — no centre label,
 * first slice starting at **3 o'clock** and running **clockwise**, square-cut arc ends, and a
 * ~2px gap on each boundary. `size` scales all of it; the ratio and the gap are held across the
 * family so the 95px donut on an `AllocationCard` is the same object drawn smaller.
 *
 * Two places the source disagrees with itself, and what this component does about them:
 *
 * - Its analytics donut starts at 3 o'clock and its rebalancing donut starts at 12. One family
 *   needs one rule; 3 o'clock wins because that is the one that was actually measured.
 * - Its small donut is a little fatter than its large one (~0.41 against 0.49). 0.49 everywhere.
 *
 * Filled paths rather than a dashed stroke. Both can draw this picture, but a filled annulus
 * sector gives exact radial edges at the gaps and an honest 100%-single-slice ring, and it is
 * what makes `fill-chart-n` the utility in play — which is the token, not a hex.
 *
 * **The donut is not the accessible copy of the data.** It is `aria-hidden` unless you give it a
 * `label`, because it always ships beside a legend that names every slice and prints every
 * figure — see `DESIGN.md`, "Legend is not optional". Two of the five ramp colours are
 * deliberately light and would not carry a slice on their own; the legend is how a chart is read,
 * and reading the same figures twice to a screen reader is not an improvement.
 */
import type { ReactNode } from 'react'
import {
  arcs,
  collapse,
  fillOf,
  gapDegrees,
  RAMP,
  ring,
  sector,
  series,
  type Slice,
} from './series.ts'

/** 68 / 138, measured. The hole is just under half the diameter. */
const INNER_RATIO = 68 / 138

export function DonutChart({
  slices,
  total,
  size = 138,
  gap = 2,
  max = RAMP,
  label,
  className = '',
}: {
  slices: readonly Slice[]
  /**
   * The whole the values are shares of. Omit it for quantities — the sum is the whole and the
   * ring closes. Pass `100` for values that are already percentages, and a series summing to 95
   * draws the missing 5% in the track grey instead of quietly restating every figure.
   */
  total?: number | undefined
  /** Outer diameter. 138 is the measured chart; `AllocationCard` draws it at 95. */
  size?: number | undefined
  /** Separation between slices, in px along the middle of the ring. */
  gap?: number | undefined
  /** Slices past this fold into "Others". Five is the ramp and there is no sixth colour. */
  max?: number | undefined
  /** Only for a donut with no legend beside it. With one, leave it off — the legend is the text. */
  label?: string | undefined
  className?: string | undefined
}): ReactNode {
  const resolved = series(collapse(slices, max), total)
  const c = size / 2
  const rOuter = size / 2
  const rInner = rOuter * INNER_RATIO
  const wedges = arcs(resolved, gapDegrees(gap, rOuter, rInner))

  /* One region covering the whole ring: an empty chart, or a single slice at 100%. */
  const whole = wedges.length === 1 && (wedges[0]?.sweep ?? 0) >= 359.99 ? wedges[0] : undefined

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className === '' ? undefined : className}
      {...(label === undefined
        ? { 'aria-hidden': true, role: 'presentation' }
        : { role: 'img', 'aria-label': label })}
    >
      {whole ? (
        <path d={ring(c, c, rOuter, rInner)} fillRule="evenodd" className={fillOf(whole.tone)} />
      ) : (
        wedges.map((a) => (
          <path
            key={a.key}
            d={sector(c, c, rOuter, rInner, a.from, a.sweep)}
            className={fillOf(a.tone)}
          />
        ))
      )}
    </svg>
  )
}

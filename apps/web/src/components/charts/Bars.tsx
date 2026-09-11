/**
 * The two bars the source draws, neither of which is the `Bar` in `ui.tsx`.
 *
 * `Bar` is single-series: one orange fill and one soft-orange pending fill in a grey track, for
 * "how much of this envelope is gone". Nothing in it takes a category. These two do.
 *
 * - `SegmentedBar` — one track split into n ramp-coloured spans. The same series as a donut, laid
 *   flat: it is a *composition*, so the shares are of one whole and a partial series leaves the
 *   track showing.
 * - `BarList` — the pattern the source actually uses for Sector Allocation, Characteristics and
 *   the credit-rating card: a stack of **independent** pill bars, one per row, label and bold
 *   figure above each. These are not parts of a whole. Each row is a magnitude against the same
 *   scale, which is why `total` defaults to 100 here and to the sum everywhere else — read that
 *   sentence twice, it is the one difference between the two components that can silently
 *   mis-draw a chart.
 *
 * The source's bar fills do not match its printed percentages — Financial prints 7.58% and draws
 * at about 37% of the track. That is a demo-data bug and it is not reproduced: a fill here is
 * always `value / total`.
 *
 * The two are built differently on purpose, and the reason is the comment above `Bar` in
 * `ui.tsx`. `SegmentedBar`'s spans are flex children with percentage widths, because adjacent
 * segments must not leave sub-pixel seams between them. `BarList`'s single fill is positioned and
 * scaled with a transform, which animates on the compositor and gets reduced-motion handling free
 * from `.ds-bar-fill`. What must never happen is both at once on the same element: a flex basis
 * *and* a `scaleX` is how every bar in this app once drew at `u²/100` of its track.
 */
import type { ReactNode } from 'react'
import { bgOf, collapse, isOthers, pct, RAMP, series, type Slice, type Tone } from './series.ts'

const named = (n: number): Tone => ((n % 4) + 1) as Tone

function width(share: number): string {
  return `${Math.round(Math.max(0, Math.min(1, share)) * 10000) / 100}%`
}

/* ---------------------------------------------------------------- SegmentedBar */

/**
 * A donut's data as a flat bar: one track, n segments, no gaps between them.
 *
 * 10px tall, which is `DESIGN.md`'s floor — at 8px the two light ramp colours lose their hue.
 * There is no separator between segments because there does not need to be: every pair in the
 * ramp is far enough apart that adjacent slices read as two, which is the property `tokens.css`
 * had checked. A series that does not fill its whole leaves the track grey, and that gap is the
 * only honest way to draw 95% of a portfolio.
 */
export function SegmentedBar({
  slices,
  total,
  max = RAMP,
  label,
  className = '',
}: {
  slices: readonly Slice[]
  /** The whole. Omit for quantities — the sum is the whole. Pass `100` for percentages. */
  total?: number | undefined
  max?: number | undefined
  /** Only for a bar with no legend beside it. */
  label?: string | undefined
  className?: string | undefined
}): ReactNode {
  const resolved = series(collapse(slices, max), total)
  return (
    <div
      className={`flex h-2.5 overflow-hidden rounded-pill bg-chart-idle ${className}`.trim()}
      {...(label === undefined
        ? { 'aria-hidden': true, role: 'presentation' }
        : { role: 'img', 'aria-label': label })}
    >
      {resolved.portions.map((p, i) =>
        p.share > 0 ? (
          <span
            key={`${i}-${p.label}`}
            className={bgOf(p.tone)}
            style={{ width: width(p.share) }}
          />
        ) : null,
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- BarList */

/**
 * A stack of independent progress bars — the source's Sector Allocation card.
 *
 * 12px tracks with pill ends, label and bold figure on the line above each, and the fill colour
 * cycling by row. The row pitch is **69px** — `02-analytics-debt-mf.md` measures label tops at
 * y 373 / 442 / 511 — which is a good deal airier than it looks like it should be on paper and
 * is most of why the source's bar cards read as charts rather than as a settings list. The first
 * build had it at 57 and the difference is visible with the two frames side by side.
 *
 * Colour here is rhythm, not identity: the rows are independent magnitudes and
 * each one names itself, so a seventh row reusing the first row's green costs nothing. Grey stays
 * reserved for "Others" wherever it appears, which is the same rule the donut runs.
 *
 * The track is `--chart-idle`, which is what the source's `#F0F4F9` maps onto — IDBI's progress
 * track already exists and a bar list is a progress track.
 */
export function BarList({
  rows,
  total = 100,
  empty = 'Nothing to show yet.',
}: {
  rows: readonly Slice[]
  /**
   * The scale every row is measured against. 100 by default, because these rows are percentages
   * of a portfolio rather than parts of each other.
   */
  total?: number | undefined
  /** Shown instead of the rows when there are none. The source never drew this state. */
  empty?: string | undefined
}): ReactNode {
  const scale = Number.isFinite(total) && total > 0 ? total : 100
  const drawable = rows.filter((r) => Number.isFinite(r.value))

  if (drawable.length === 0) {
    return <p className="m-0 py-2 text-sm text-ink-soft">{empty}</p>
  }

  let n = 0
  return (
    <div>
      {drawable.map((row, i) => {
        const value = row.value > 0 ? row.value : 0
        const share = Math.min(1, value / scale)
        const others = isOthers(row)
        const tone: Tone = others ? RAMP : named(n++)
        return (
          <div key={`${i}-${row.label}`} className="pt-5 first:pt-0">
            <div className="flex items-baseline gap-3 text-[15px] leading-snug">
              <span className="min-w-0 flex-1 truncate text-ink-mid">{row.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-ink">
                {row.display ?? pct(value / scale)}
              </span>
            </div>
            <div
              className="relative mt-4 h-3 overflow-hidden rounded-pill bg-chart-idle"
              role="presentation"
            >
              <span
                className={`ds-bar-fill absolute inset-0 ${bgOf(tone)}`}
                style={{ transform: `scaleX(${share})` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

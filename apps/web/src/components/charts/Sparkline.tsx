/**
 * A run of months, drawn.
 *
 * The app holds twenty-four months of statement lines and puts a median in front of them. A median
 * is the right *figure* — it is what a normal month costs — and it is a terrible summary, because
 * the two things a customer wants from a year of spending are both movement: is this month unusual,
 * and is the whole thing drifting. Both are one glance off a line and neither is available from a
 * number.
 *
 * **What makes this readable in one hue.** There is exactly one series, so the ramp is not being
 * asked to separate categories — it is being asked to separate three *roles*, and it does that by
 * weight and by dash rather than by colour: a pale wash for the body of the series, the heaviest
 * stroke in the ramp for the series itself, a lighter dashed hairline for the median, and a filled
 * disc on the month that just ended. Every one of those still reads with the hue removed entirely,
 * which is the test — and the dash is carried on a white halo, because a rule that crosses a
 * column has nothing but the halo to keep it visible once it does.
 *
 * **No tooltip, on purpose.** A chart that only works when you hover is not a chart on a phone.
 * The reading here is the shape, the rule it crosses, and the last point — and the figure for that
 * last point is printed beside it at full size. Nothing on this chart requires a touch.
 *
 * **The partial month.** `months.ts` leaves the running month out by default; where a caller draws
 * it in, its dot is hollow and the last segment is dashed, because eleven full months and twelve
 * days of a twelfth otherwise draw as a collapse in spending that has not happened.
 */
import type { ReactNode } from 'react'
import { inr } from '../../lib/money.ts'
import type { MonthPoint } from './months.ts'
import {
  areaPath,
  bounds,
  columnHeight,
  columns,
  linePath,
  median,
  project,
  yOf,
  type Baseline,
  type Box,
} from './plot.ts'

/**
 * A normalised viewBox, stretched by CSS.
 *
 * The alternative is a measured pixel width, and on this app that means `ResizeObserver` in a
 * component that renders inside a list of twelve. Stretching costs one thing — a diagonal drawn in
 * a stretched box would thin out — and `vector-effect="non-scaling-stroke"` is the answer to it:
 * the stroke stays 2px whatever the box does. Round things (the end disc) are HTML siblings
 * positioned in per cent, so an ellipse is not possible either.
 */
const VIEW = 100
const PAD_Y = 9

export function Sparkline({
  points,
  mark = 'line',
  height = 44,
  baseline = 'zero',
  rule,
  label,
  className = '',
}: {
  points: readonly MonthPoint[]
  /**
   * `column` for a run of monthly totals — money that went out, one bar a month. `line` for a
   * level that persists between the months: a balance, a corpus, a cover amount. Getting this
   * the wrong way round is the difference between a chart you read at a glance and one you
   * squint at; the note above `columns` in `plot.ts` has the measurement behind that.
   */
  mark?: 'line' | 'column' | undefined
  /** Drawn height in px. 44 is the row version; 64 gives a card-sized chart room to bend. */
  height?: number | undefined
  /** `zero` for a magnitude, always, unless the series' zero is not a floor. See `plot.ts`. */
  baseline?: Baseline | undefined
  /**
   * The horizontal rule the line is read against — the median, or a floor the account never went
   * below. Omit it and no rule is drawn; `null` is the same as omitting it.
   */
  rule?: number | null | undefined
  /** The whole chart as one sentence. Without it the chart is hidden from assistive tech. */
  label?: string | undefined
  className?: string | undefined
}): ReactNode {
  const values = points.map((p) => p.value)
  const box: Box = { w: VIEW, h: VIEW, padX: 0, padY: PAD_Y }
  const b = bounds(rule === undefined || rule === null ? values : [...values, rule], baseline)
  const plotted = project(values, b, box)
  const floor = VIEW - PAD_Y / 2
  const last = plotted[plotted.length - 1]
  const tail = points[points.length - 1]
  const partial = tail?.partial === true

  /* The dashed final segment for a month still in progress. Two points, drawn over the solid
     line, so the solid path does not have to know about it. */
  const runIn = plotted.length >= 2 ? plotted.slice(-2) : []

  /* Columns. The last one is a rung darker — `DESIGN.md`'s "the one bar you are meant to look
     at", which for a run of months is the month that just ended. Same hue, more weight. */
  const bars = mark === 'column' ? columns(values.length, box) : []
  const base = yOf(Math.max(0, b.min), b, box)

  return (
    <div
      className={`relative min-w-0 ${className}`.trim()}
      style={{ height }}
      {...(label === undefined
        ? { 'aria-hidden': true, role: 'presentation' }
        : { role: 'img', 'aria-label': label })}
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        {mark === 'line' && <path d={areaPath(plotted, floor)} className="fill-chart-5" />}
        {mark === 'column' &&
          bars.map((bar, i) => {
            const h = columnHeight(values[i] ?? 0, b, box)
            const point = points[i]
            return (
              <rect
                key={point?.key ?? i}
                x={bar.x}
                width={bar.w}
                y={base - h}
                height={h}
                className={
                  point?.partial === true
                    ? 'fill-chart-4'
                    : i === bars.length - 1
                      ? 'fill-chart-1'
                      : 'fill-chart-3'
                }
              />
            )
          })}
        {rule !== undefined && rule !== null && (
          /* The rule, twice: a white halo and then the dash on top of it. A pale dash on its own
             disappears against a column it crosses, and there is no second hue to reach for —
             the halo is how a mark stays legible over both the card and the series. */
          <g>
            <line
              x1={0}
              x2={VIEW}
              y1={yOf(rule, b, box)}
              y2={yOf(rule, b, box)}
              className="stroke-surface"
              strokeWidth={3.5}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={0}
              x2={VIEW}
              y1={yOf(rule, b, box)}
              y2={yOf(rule, b, box)}
              className="stroke-chart-2"
              strokeWidth={1.25}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
        {mark === 'line' && (
          <path
            d={linePath(partial ? plotted.slice(0, -1) : plotted)}
            fill="none"
            className="stroke-chart-1"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {mark === 'line' && partial && runIn.length === 2 && (
          <path
            d={linePath(runIn)}
            fill="none"
            className="stroke-chart-1"
            strokeWidth={2}
            strokeDasharray="3 3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {mark === 'line' && last && (
        /* The month that just ended, as a disc on the line. A sibling rather than an SVG circle
           so the stretched viewBox cannot turn it into an ellipse. */
        <span
          className={`absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-solid border-surface ${
            partial ? 'bg-chart-4' : 'bg-chart-1'
          }`}
          style={{ left: `${last.x}%`, top: `${last.y}%` }}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- SparkRow */

/**
 * A spending row with its own history: the label, the figure, and the twelve months behind it.
 *
 * This is the shape `Money`'s category list wants. Today each row draws a bar of the category's
 * share of the largest category, which answers a question nobody asked — the categories are
 * already sorted, so the bar restates the order — and drops the one the customer has: *is this
 * going up?*
 *
 * The months axis is two labels, first and last. Twelve labels do not fit at 430px, and a chart
 * whose x axis needs reading is not a sparkline.
 */
export function SparkRow({
  label,
  value,
  points,
  mark = 'column',
  rule,
  note,
  height = 44,
}: {
  label: string
  /** The figure, already formatted. The median, the latest month — whatever the card leads with. */
  value: string
  points: readonly MonthPoint[]
  /** `column` for money that went out — the default here, because that is what a row of Money is. */
  mark?: 'line' | 'column' | undefined
  /** The rule to draw. Pass the median of the series where the figure beside it *is* the median. */
  rule?: number | null | undefined
  /** A quieter line under the label: what the rule is, what the window is. */
  note?: string | undefined
  height?: number | undefined
}): ReactNode {
  const first = points[0]
  const last = points[points.length - 1]
  const level = rule ?? median(points.map((p) => p.value))
  const summary =
    last === undefined
      ? `${label}: no months to show yet.`
      : `${label}: ${points.length} months to ${last.label}, ${inr(last.value)} in the last one, ` +
        `against ${inr(level)} in a normal month.`

  return (
    <div className="min-w-0 py-3">
      <div className="flex items-baseline gap-3 text-[15px] leading-snug">
        <span className="min-w-0 flex-1 truncate text-ink-mid">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-ink">{value}</span>
      </div>
      {note !== undefined && <p className="m-0 mt-0.5 text-xs text-ink-soft">{note}</p>}
      {points.length > 0 && (
        <>
          <Sparkline
            points={points}
            mark={mark}
            rule={rule ?? level}
            height={height}
            label={summary}
            className="mt-2"
          />
          <div className="mt-1 flex items-baseline justify-between text-[11px] text-ink-soft">
            <span>{first?.label ?? ''}</span>
            <span>{last?.label ?? ''}</span>
          </div>
        </>
      )}
    </div>
  )
}

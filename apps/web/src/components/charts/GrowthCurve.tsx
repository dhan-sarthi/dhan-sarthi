/**
 * The projection band, as a band.
 *
 * `Plan` and `JarDetail` both render a `Projection` as one big figure and three `Leader` rows —
 * Cautious, Expected, Optimistic — which is a table of the endpoints of three curves nobody sees.
 * Everything a projection is *for* lives between those endpoints: the bend, the widening spread,
 * and the growing distance between what you put in and what it becomes. That last gap is the whole
 * argument for investing at all, and today it is a row labelled "Of which you put in".
 *
 * Three marks, told apart without a second hue:
 *
 * - the **band** between the cautious and optimistic rates, in `chart-5`, the palest rung. It is
 *   the uncertainty, and it is drawn as area rather than as two lines because two lines invite
 *   somebody to read the top one as a forecast.
 * - the **expected line**, `chart-1`, solid and the heaviest stroke on the card. The one number
 *   the screens already lead with.
 * - the **money in**, `chart-3`, dashed. Dashed because it is the one line that is not a
 *   projection: it is arithmetic on a mandate, and it should not look like the others.
 *
 * A target rule is drawn where the caller has one, as a dotted hairline across the card with its
 * own label — a goal you can see the curve cross, or fail to.
 *
 * **The disclaimer is not optional and this component does not carry it.** `projection.disclaimer`
 * has to appear wherever any of this is shown (`core/projection.ts`, and `docs/product/decisions.md`
 * §B2 behind it). It belongs to the card, next to the figures, in the copy voice of the screen —
 * not inside a chart at 11px, where a compliance line reads as a footnote to the picture rather
 * than a condition on the claim.
 */
import type { ReactNode } from 'react'
import type { Projection } from '@dhan/contracts'
import { approx } from '../../lib/money.ts'
import { growthOf, type Growth } from './growth.ts'
import { bandPath, bounds, linePath, project, yOf, type Box } from './plot.ts'

const VIEW = 100
const PAD_Y = 7

export function GrowthCurve({
  projection,
  target,
  height = 132,
  label,
}: {
  projection: Projection
  /** The goal, drawn as a rule the curve either reaches or does not. */
  target?: number | null | undefined
  height?: number | undefined
  /** The chart as one sentence. Built by `GrowthCard` when that is what is rendering it. */
  label?: string | undefined
}): ReactNode {
  const g = growthOf(projection)
  if (g.empty) return null

  const box: Box = { w: VIEW, h: VIEW, padX: 0, padY: PAD_Y }
  const scale = bounds(
    [0, g.ceiling, ...(target !== undefined && target !== null ? [target] : [])],
    'zero',
  )
  const high = project(g.high.values, scale, box)
  const low = project(g.low.values, scale, box)
  const mid = project(g.mid.values, scale, box)
  const put = project(g.contributed, scale, box)
  const end = mid[mid.length - 1]

  return (
    <div
      className="relative min-w-0"
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
        <path d={bandPath(high, low)} className="fill-chart-5" />
        {target !== undefined && target !== null && target > 0 && (
          <line
            x1={0}
            x2={VIEW}
            y1={yOf(target, scale, box)}
            y2={yOf(target, scale, box)}
            className="stroke-brand-deep"
            strokeWidth={1.5}
            strokeDasharray="1 3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={linePath(put)}
          fill="none"
          className="stroke-chart-3"
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={linePath(mid)}
          fill="none"
          className="stroke-chart-1"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {end && (
        <span
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-solid border-surface bg-chart-1"
          style={{ left: `${end.x}%`, top: `${end.y}%` }}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- Key */

type KeyKind = 'line' | 'dashed' | 'band' | 'rule'

/**
 * One row of the curve's key.
 *
 * `LegendRow`'s dot is the right swatch for a slice and the wrong one for a line: the dash *is*
 * the difference between the two lines here, and a dot throws it away. So the swatch is a 16px
 * length of the mark itself, drawn with the same weight and the same dash as the chart.
 */
function KeyRow({
  kind,
  label,
  value,
  tone,
}: {
  kind: KeyKind
  label: string
  value: string
  tone: string
}): ReactNode {
  return (
    <div className="flex items-center gap-2.5 py-[7px] text-[15px] leading-snug">
      <span className="grid size-4 shrink-0 place-items-center">
        {kind === 'band' ? (
          <span className={`block h-2.5 w-4 rounded-[3px] ${tone}`} />
        ) : (
          <span
            className={`block w-4 border-t-[2.5px] ${tone} ${
              kind === 'line' ? 'border-solid' : 'border-dashed'
            }`}
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-mid">{label}</span>
      <span className="shrink-0 font-semibold tabular-nums text-ink">{value}</span>
    </div>
  )
}

/**
 * The curve with its key and its axis — the whole block a screen drops in.
 *
 * The key doubles as the accessible copy of the chart, which is the same bargain the donut strikes
 * with its legend: three labelled figures naming the endpoints, so nothing on the picture is
 * available only to somebody who can see it.
 */
export function GrowthCard({
  projection,
  target,
  targetLabel = 'Your target',
  from = 'Today',
  to,
  height = 132,
}: {
  projection: Projection
  target?: number | null | undefined
  targetLabel?: string | undefined
  from?: string | undefined
  /** The right end of the axis — the year the horizon lands in. */
  to: string
  height?: number | undefined
}): ReactNode {
  const g = growthOf(projection)
  if (g.empty) return null

  const corpus = last(g.mid.values)
  const put = last(g.contributed)
  const band = `${approx(last(g.low.values))} – ${approx(last(g.high.values))}`

  return (
    <div className="min-w-0">
      <GrowthCurve
        projection={projection}
        target={target}
        height={height}
        label={summarise(g, to, target)}
      />
      <div className="mt-1 flex items-baseline justify-between text-[11px] text-ink-soft">
        <span>{from}</span>
        <span>{to}</span>
      </div>
      <div className="mt-2">
        <KeyRow
          kind="line"
          tone="border-chart-1"
          label={`At ${g.mid.ratePct}% a year`}
          value={approx(corpus)}
        />
        <KeyRow kind="dashed" tone="border-chart-3" label="What you put in" value={approx(put)} />
        <KeyRow
          kind="band"
          tone="bg-chart-5"
          label={`If it runs ${g.low.ratePct}% to ${g.high.ratePct}%`}
          value={band}
        />
        {target !== undefined && target !== null && target > 0 && (
          <KeyRow kind="rule" tone="border-brand-deep" label={targetLabel} value={approx(target)} />
        )}
      </div>
    </div>
  )
}

function last(values: readonly number[]): number {
  return values[values.length - 1] ?? 0
}

function summarise(g: Growth, to: string, target?: number | null | undefined): string {
  const corpus = last(g.mid.values)
  const put = last(g.contributed)
  const reach =
    target !== undefined && target !== null && target > 0
      ? corpus >= target
        ? ` That clears the ${approx(target)} target.`
        : ` That is about ${approx(target - corpus)} short of the ${approx(target)} target.`
      : ''
  return (
    `By ${to}, ${approx(put)} put in becomes about ${approx(corpus)} at ${g.mid.ratePct}% a year, ` +
    `or ${approx(last(g.low.values))} to ${approx(last(g.high.values))} across the band.${reach}`
  )
}

import type { Projection } from '@dhan/contracts'
import { futureValue } from '@dhan/core'
import { chart, web } from '@dhan/design'
import { useId, useMemo, type ReactNode } from 'react'
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { cn } from '../lib/cn.ts'
import { formatCount, formatInr, formatMonth, formatPct } from '../lib/format.ts'
import { distinctLabels, formatInrTick, formatPctTick, niceScale } from '../lib/scale.ts'
import { ChartTooltipCard } from './ChartTooltipCard.tsx'

/*
 * The chart wrappers. Every chart on the console goes through the kit: these Recharts wrappers
 * for a chart with an axis (`AreaChart`, `BandChart`, `ProjectionChart`), the hand-drawn month
 * tiles for a grid of small ones (`MonthChart.tsx`), and the HTML bars for parts and ranks
 * (`StackedBar`, `RankedBars`). So they all share the validated palette (`chart` in
 * tokens.json), the recessive grid, the dark card and the Indian short figures on the axis. One
 * y-axis per chart, always: two measures of different scale are two charts.
 *
 * The y axis is ours, not the library's: round ticks from `lib/scale.ts`, each labelled with
 * exactly the decimals it needs, so an axis never prints "₹1Cr" twice near a unit boundary.
 *
 * Colour follows the job, and every mark role is 3:1 or more on the white card: a single series
 * is brand green, a comparison series the `comparison` grey, a band's edges the `bandEdge` green.
 *
 * Each chart is one image for a screen reader and one stop at most for a keyboard: the library's
 * own keyboard layer is off (it added a nameless "application" stop that announced nothing), and
 * the figure's name carries every value the hover would show.
 */

export type ValueFormat = 'inr' | 'count' | 'pct'

export function formatValue(value: number, format: ValueFormat, short = true): string {
  if (format === 'inr') return formatInr(value, { short })
  if (format === 'pct') return formatPct(value)
  return formatCount(value)
}

/** An axis label: exact, in the figure's own unit (₹96L, ₹1.02Cr, 62.5%, 1,284). */
export function formatTick(value: number, format: ValueFormat): string {
  if (format === 'inr') return formatInrTick(value)
  if (format === 'pct') return formatPctTick(value)
  return formatCount(value)
}

interface YScale {
  ticks: number[]
  domain: [number, number]
  label: (value: number) => string
}

/**
 * The y axis for a set of plotted values: round ticks that bracket them and a label per tick,
 * never two the same. Null when there is nothing to plot, so the library's default stands.
 */
function yScaleFor(values: readonly number[], format: ValueFormat, zero: boolean): YScale | null {
  const scale = niceScale(values, { zero, integer: format !== 'pct' })
  const first = scale?.ticks[0]
  const last = scale?.ticks[scale.ticks.length - 1]
  if (!scale || first === undefined || last === undefined) return null
  const labels = distinctLabels(scale.ticks, (v) => formatTick(v, format))
  const byTick = new Map(scale.ticks.map((t, i) => [t, labels[i] ?? formatTick(t, format)]))
  return {
    ticks: scale.ticks,
    domain: [first, last],
    label: (v) => byTick.get(v) ?? formatTick(v, format),
  }
}

/** Every finite number under the given keys, for working out an axis. */
function valuesOf(data: readonly Datum[], keys: readonly string[]): number[] {
  const out: number[] = []
  for (const d of data) {
    for (const k of keys) {
      const v = d[k]
      if (typeof v === 'number' && Number.isFinite(v)) out.push(v)
    }
  }
  return out
}

/** Axis numerals: the `axis` type role, in the chart's axis ink. */
const AXIS_TICK = { fill: chart.axis, fontSize: web.type.axis.size } as const
/** Slot 1, the IDBI-led green. tokens.json always has eight slots; the fallback only satisfies the index type. */
const PRIMARY = chart.categorical[0] ?? chart.axis

function slotColor(index: number): string {
  return chart.categorical[index % chart.categorical.length] ?? PRIMARY
}
const MARGIN = { top: 8, right: 4, bottom: 0, left: 4 } as const
/** Without a y axis the first and last month labels sit on the edge; give them room. */
const MARGIN_BARE = { top: 8, right: 14, bottom: 0, left: 14 } as const

/** Month labels arrive as `YYYY-MM`; anything else is shown as given. */
function tickLabel(value: unknown): string {
  const s = String(value)
  return /^\d{4}-\d{2}$/.test(s) ? formatMonth(s, { year: false }) : s
}

/** The same x value with its year, for a sentence: "Sep 2025". */
function pointLabel(value: unknown): string {
  const s = String(value)
  return /^\d{4}-\d{2}$/.test(s) ? formatMonth(s) : s
}

/**
 * Everything a hover would show, as words: where the chart's series starts and ends and by how
 * much it changed, then every point's values. "All banks ₹4.26Cr in Sep 2025 to ₹5.35Cr in Aug
 * 2026, up 25.6%. Sep 2025: All banks ₹4.26Cr, With IDBI ₹1.2Cr; …"
 */
export function describeSeries(
  data: readonly Datum[],
  x: string,
  series: readonly SeriesDef[],
  format: ValueFormat,
): string {
  const at = (d: Datum | undefined, key: string): number | null => {
    const v = d?.[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  const primary = series.find((s) => s.role !== 'comparison') ?? series[0]
  const firstPoint = data[0]
  const lastPoint = data[data.length - 1]
  let summary = ''
  if (primary && firstPoint && lastPoint && data.length > 1) {
    const a = at(firstPoint, primary.key)
    const b = at(lastPoint, primary.key)
    if (a !== null && b !== null) {
      const change =
        a === 0
          ? ''
          : `, ${b >= a ? 'up' : 'down'} ${formatPct(Math.round((Math.abs(b - a) / Math.abs(a)) * 1000) / 10)}`
      summary = `${primary.label} ${formatValue(a, format)} in ${pointLabel(firstPoint[x])} to ${formatValue(b, format)} in ${pointLabel(lastPoint[x])}${change}. `
    }
  }
  const points = data
    .map((d) => {
      const values = series.flatMap((s) => {
        const v = at(d, s.key)
        return v === null
          ? []
          : [`${series.length > 1 ? `${s.label} ` : ''}${formatValue(v, format)}`]
      })
      return `${pointLabel(d[x])}: ${values.join(', ')}`
    })
    .join('; ')
  return `${summary}${points}`
}

/* ---------------------------------------------------------------- Tooltip */

function tooltipContent(series: readonly SeriesDef[], format: ValueFormat) {
  return function Content(props: TooltipContentProps) {
    if (!props.active || !props.payload || props.payload.length === 0) return null
    const rows = series.flatMap((s) => {
      const entry = props.payload.find((p) => p.dataKey === s.key)
      if (!entry || typeof entry.value !== 'number') return []
      return [
        { label: s.label, value: formatValue(entry.value, format, false), swatch: colorOf(s) },
      ]
    })
    return <ChartTooltipCard title={tickLabel(props.label)} rows={rows} />
  }
}

/* ---------------------------------------------------------------- Series */

export interface SeriesDef {
  key: string
  label: string
  /** `primary` is the series the chart is about; `comparison` is context, drawn in grey. */
  role?: 'primary' | 'comparison'
  /** A categorical slot (1–8), for charts that compare named series. */
  slot?: number
}

function colorOf(s: SeriesDef): string {
  if (s.slot !== undefined) return slotColor(s.slot - 1)
  return s.role === 'comparison' ? chart.comparison : PRIMARY
}

type Datum = Record<string, string | number | null>

/* ---------------------------------------------------------------- Area */

export interface AreaChartProps {
  data: readonly Datum[]
  /** The x field: a `YYYY-MM` month, usually. */
  x: string
  series: readonly SeriesDef[]
  format?: ValueFormat
  height?: number
  /** Hide the y axis in tight spaces; the tooltip still carries every value. */
  yAxis?: boolean
  /**
   * Start the y axis at zero, and shade each series down to it. Off by default for balances,
   * where zero hides the movement; then the series are lines with no fill, because an area shaded
   * to a floor that is not zero draws a 25% rise as several times that.
   */
  zeroBased?: boolean
  className?: string
  /** What the chart shows, for a screen reader; every point's values are appended to it. */
  label: string
}

export function AreaChart({
  data,
  x,
  series,
  format = 'inr',
  height = 220,
  yAxis = true,
  zeroBased = false,
  className,
  label,
}: AreaChartProps) {
  const gid = useId().replace(/:/g, '')
  const scale = useMemo(
    () =>
      yAxis
        ? yScaleFor(
            valuesOf(
              data,
              series.map((s) => s.key),
            ),
            format,
            zeroBased,
          )
        : null,
    [data, series, format, zeroBased, yAxis],
  )
  const described = useMemo(
    () => describeSeries(data, x, series, format),
    [data, x, series, format],
  )
  return (
    <figure className={cn('w-full', className)} aria-label={`${label}. ${described}`} role="img">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsAreaChart
          data={data as Datum[]}
          margin={yAxis ? MARGIN : MARGIN_BARE}
          accessibilityLayer={false}
        >
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={colorOf(s)}
                  stopOpacity={s.role === 'comparison' ? 0 : chart.areaOpacity * 1.6}
                />
                <stop offset="100%" stopColor={colorOf(s)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis
            dataKey={x}
            tickFormatter={tickLabel}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: chart.baseline }}
            interval="equidistantPreserveStart"
            minTickGap={12}
            dy={6}
          />
          <YAxis
            hide={!yAxis}
            width={56}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            {...(scale
              ? {
                  ticks: scale.ticks,
                  domain: scale.domain,
                  interval: 0,
                  tickFormatter: scale.label,
                }
              : {
                  tickFormatter: (v: number) => formatValue(v, format),
                  domain: zeroBased ? [0, 'auto'] : ['auto', 'auto'],
                })}
          />
          <RechartsTooltip
            content={tooltipContent(series, format)}
            cursor={{ stroke: chart.baseline, strokeWidth: 1 }}
            isAnimationActive={false}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={colorOf(s)}
              strokeWidth={s.role === 'comparison' ? 1.5 : 2}
              {...(s.role === 'comparison' ? { strokeDasharray: '4 3' } : {})}
              fill={zeroBased ? `url(#${gid}-${s.key})` : 'none'}
              dot={false}
              activeDot={{ r: 4, stroke: chart.tooltipText, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </figure>
  )
}

/* ---------------------------------------------------------------- Band */

/**
 * The band's edges are a lighter step of the same green, so the band reads as one shape, and
 * still 3:1 on the card (the `bandEdge` role); the comparison underneath is the `comparison` grey.
 */
const BAND_EDGE = chart.bandEdge
const BAND_COMPARISON = chart.comparison

/** The colour of each line in a band chart, for a legend drawn beside it. */
export const BAND_SWATCH = {
  low: BAND_EDGE,
  mid: PRIMARY,
  high: BAND_EDGE,
  comparison: BAND_COMPARISON,
} as const

export interface BandDatum {
  /** A number on a continuous axis: a year, possibly fractional at the horizon. */
  x: number
  low: number
  mid: number
  high: number
  /** A grey context line under the band (what was paid in). */
  comparison?: number | null
}

export interface BandChartProps {
  data: readonly BandDatum[]
  /** What each line is called in the tooltip: "Cautious", "Expected", "Optimistic", "Paid in". */
  labels: { low: string; mid: string; high: string; comparison?: string }
  format?: ValueFormat
  height?: number
  /** The x positions to label. Left out, every point is labelled. */
  xTicks?: readonly number[]
  /** How an x position reads: `2042`. Whole numbers by default. */
  formatX?: (x: number) => string
  /** The tooltip's title for a point: "2042, age 60". Defaults to `formatX`. */
  tooltipTitle?: (x: number) => ReactNode
  className?: string
  label: string
}

function bandTooltip(
  labels: BandChartProps['labels'],
  format: ValueFormat,
  title: (x: number) => ReactNode,
) {
  return function Content(props: TooltipContentProps) {
    const point = props.payload?.[0]?.payload as BandDatum | undefined
    if (!props.active || !point) return null
    const rows = [
      { label: labels.high, value: formatValue(point.high, format, false), swatch: BAND_EDGE },
      { label: labels.mid, value: formatValue(point.mid, format, false), swatch: PRIMARY },
      { label: labels.low, value: formatValue(point.low, format, false), swatch: BAND_EDGE },
    ]
    if (typeof point.comparison === 'number' && labels.comparison) {
      rows.push({
        label: labels.comparison,
        value: formatValue(point.comparison, format, false),
        swatch: BAND_COMPARISON,
      })
    }
    return <ChartTooltipCard title={title(point.x)} rows={rows} />
  }
}

/**
 * A range, never a single line: the low and high scenarios are the band's edges, the middle one
 * runs through it in brand green, and an optional comparison runs underneath in grey, so the gap
 * between them (compounding, say) is the thing the eye lands on. Zero-based, because a band is
 * read as an amount, and its axis uses the same round ticks as every other chart.
 */
export function BandChart({
  data,
  labels,
  format = 'inr',
  height = 240,
  xTicks,
  formatX = (x) => String(Math.floor(x)),
  tooltipTitle,
  className,
  label,
}: BandChartProps) {
  const points = useMemo(() => data.map((d) => ({ ...d, band: [d.low, d.high] })), [data])
  const hasComparison = data.some((d) => typeof d.comparison === 'number')
  const scale = useMemo(
    () =>
      yScaleFor(
        data.flatMap((d) => [d.low, d.mid, d.high, d.comparison ?? Number.NaN]),
        format,
        true,
      ),
    [data, format],
  )
  const first = data[0]?.x ?? 0
  const last = data[data.length - 1]?.x ?? 0

  return (
    <figure role="img" aria-label={label} className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 4 }}
          accessibilityLayer={false}
        >
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[first, last]}
            ticks={xTicks ? [...xTicks] : data.map((d) => d.x)}
            tickFormatter={formatX}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: chart.baseline }}
            dy={6}
          />
          <YAxis
            width={56}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            {...(scale
              ? {
                  ticks: scale.ticks,
                  domain: scale.domain,
                  interval: 0,
                  tickFormatter: scale.label,
                }
              : { tickFormatter: (v: number) => formatValue(v, format), domain: [0, 'auto'] })}
          />
          <RechartsTooltip
            content={bandTooltip(labels, format, tooltipTitle ?? formatX)}
            cursor={{ stroke: chart.baseline, strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Area
            dataKey="band"
            stroke="none"
            fill={PRIMARY}
            fillOpacity={chart.areaOpacity * 0.8}
            isAnimationActive={false}
            activeDot={false}
          />
          {hasComparison ? (
            <Line
              dataKey="comparison"
              stroke={BAND_COMPARISON}
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          ) : null}
          <Line
            dataKey="low"
            stroke={BAND_EDGE}
            strokeWidth={1.25}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="high"
            stroke={BAND_EDGE}
            strokeWidth={1.25}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="mid"
            stroke={PRIMARY}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: chart.tooltipText, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  )
}

/* ---------------------------------------------------------------- Projection */

export interface ScenarioRoles {
  low: Projection['scenarios'][number]
  mid: Projection['scenarios'][number]
  high: Projection['scenarios'][number]
}

/**
 * Low, middle and high by assumed rate, whatever the scenarios are called. Null when the API sent
 * fewer than two, where there is no band to draw.
 */
export function scenarioRoles(projection: Projection): ScenarioRoles | null {
  const sorted = [...projection.scenarios].sort((a, b) => a.ratePct - b.ratePct)
  const low = sorted[0]
  const high = sorted[sorted.length - 1]
  const mid = sorted[Math.floor((sorted.length - 1) / 2)]
  if (!low || !high || !mid || sorted.length < 2) return null
  return { low, mid, high }
}

/** The projection's lines, keyed as the customer file's legend reads them. */
export const PROJECTION_SWATCH = {
  low: BAND_SWATCH.low,
  mid: BAND_SWATCH.mid,
  high: BAND_SWATCH.high,
  paid: BAND_SWATCH.comparison,
} as const

/**
 * The path is drawn with core's own `futureValue`, the function the engine's `project()` uses,
 * with the projection's own inputs, so each line ends exactly on the corpus the API sent. One
 * point a year, and one on the horizon itself when it is not a whole number of years.
 */
export function projectionPath(
  projection: Projection,
  roles: ScenarioRoles,
  startYear: number,
): BandDatum[] {
  const { monthlyContribution: monthly, existingCorpus: existing, years } = projection
  const steps: number[] = []
  for (let t = 0; t < years; t += 1) steps.push(t)
  steps.push(years)
  return steps.map((t) => ({
    x: startYear + t,
    low: futureValue(monthly, t, roles.low.ratePct, existing),
    mid: futureValue(monthly, t, roles.mid.ratePct, existing),
    high: futureValue(monthly, t, roles.high.ratePct, existing),
    comparison: Math.round(monthly * Math.round(t * 12)) + existing,
  }))
}

/** A year every 1, 2 or 5, by how long the horizon is. */
function yearTicks(start: number, end: number): number[] {
  const span = end - start
  const step = span <= 6 ? 1 : span <= 12 ? 2 : 5
  const out: number[] = []
  for (let y = start; y <= end + 1e-9; y += step) out.push(Math.round(y * 100) / 100)
  return out
}

export interface ProjectionChartProps {
  projection: Projection
  roles: ScenarioRoles
  /** The as-of year: the chart's "now". */
  startYear: number
  /** The customer's age now, for the tooltip ("2042, age 60"). */
  startAge: number
  height?: number
}

/**
 * A goal projection as a band: cautious to optimistic, the expected path through it, and what
 * was paid in underneath. Always labelled an illustration where it is shown.
 */
export function ProjectionChart({
  projection,
  roles,
  startYear,
  startAge,
  height = 240,
}: ProjectionChartProps) {
  const data = useMemo(
    () => projectionPath(projection, roles, startYear),
    [projection, roles, startYear],
  )
  const end = startYear + projection.years
  const short = (v: number) => formatInr(v, { short: true })
  return (
    <BandChart
      data={data}
      labels={{
        low: roles.low.label,
        mid: roles.mid.label,
        high: roles.high.label,
        comparison: 'Paid in',
      }}
      height={height}
      xTicks={yearTicks(startYear, end)}
      tooltipTitle={(x) => `${Math.floor(x)}, age ${Math.floor(startAge + x - startYear)}`}
      label={`Projected corpus from ${startYear} to ${Math.floor(end)}: ${roles.low.label} ${short(roles.low.corpus)}, ${roles.mid.label} ${short(roles.mid.corpus)}, ${roles.high.label} ${short(roles.high.corpus)}. Illustration only.`}
    />
  )
}

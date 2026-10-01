import { chart } from '@dhan/design'
import { useId, type ReactNode } from 'react'
import {
  Area,
  AreaChart as RechartsAreaChart,
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  type PieLabelRenderProps,
  type TooltipContentProps,
} from 'recharts'
import { cn } from '../lib/cn.ts'
import { formatCount, formatInr, formatMonth, formatPct } from '../lib/format.ts'
import { DeltaPill } from './DeltaPill.tsx'

/*
 * The chart wrappers. Every chart on the console goes through one of these, so they all share
 * the validated palette (`chart` in tokens.json), the recessive grid, the dark tooltip and the
 * Indian short figures on the axis. One y-axis per chart, always: two measures of different scale
 * are two charts.
 *
 * Colour follows the job. A single series is brand green over a low-opacity fill; a comparison
 * series is neutral grey; a bar chart is grey with dark only on the bar that needs attention.
 */

export type ValueFormat = 'inr' | 'count' | 'pct'

export function formatValue(value: number, format: ValueFormat, short = true): string {
  if (format === 'inr') return formatInr(value, { short })
  if (format === 'pct') return formatPct(value)
  return formatCount(value)
}

const AXIS_TICK = { fill: chart.axis, fontSize: 11 } as const
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

/* ---------------------------------------------------------------- Tooltip */

interface TooltipRow {
  label: string
  value: string
  swatch: string
}

export function ChartTooltipCard({
  title,
  rows,
}: {
  title: ReactNode
  rows: readonly TooltipRow[]
}) {
  return (
    <div className="min-w-40 rounded-md bg-chart-tooltip px-3 py-2 text-caption text-chart-tooltip-text shadow-popover">
      <p className="mb-1.5 font-semibold">{title}</p>
      <div className="grid gap-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-5">
            <span className="inline-flex items-center gap-1.5 text-chart-tooltip-muted">
              <span
                aria-hidden
                className="h-2.5 w-0.5 rounded-full"
                style={{ background: row.swatch }}
              />
              {row.label}
            </span>
            <span className="tabular font-semibold">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

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
  return s.role === 'comparison' ? chart.neutral['400'] : PRIMARY
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
  /** Start the y axis at zero. Off by default for balances, where zero hides the movement. */
  zeroBased?: boolean
  className?: string
  /** What the chart shows, for a screen reader. */
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
  return (
    <figure className={cn('w-full', className)} aria-label={label} role="img">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsAreaChart data={data as Datum[]} margin={yAxis ? MARGIN : MARGIN_BARE}>
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
            tickFormatter={(v: number) => formatValue(v, format)}
            domain={zeroBased ? [0, 'auto'] : ['auto', 'auto']}
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
              fill={`url(#${gid}-${s.key})`}
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

/* ---------------------------------------------------------------- Bar */

export interface BarChartProps {
  data: readonly Datum[]
  x: string
  /** One series: bars are grey, and `highlight` picks the ones drawn in brand green. */
  y: string
  yLabel: string
  highlight?: (datum: Datum, index: number) => boolean
  format?: ValueFormat
  height?: number
  /** Category labels on the left and bars across, for long names (rules, signal kinds). */
  horizontal?: boolean
  className?: string
  label: string
}

export function BarChart({
  data,
  x,
  y,
  yLabel,
  highlight,
  format = 'count',
  height = 220,
  horizontal = false,
  className,
  label,
}: BarChartProps) {
  const series: SeriesDef[] = [{ key: y, label: yLabel }]
  return (
    <figure className={cn('w-full', className)} aria-label={label} role="img">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data as Datum[]}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={MARGIN}
          barCategoryGap={horizontal ? 6 : '28%'}
        >
          <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke={chart.grid} />
          {horizontal ? (
            <>
              <XAxis type="number" hide tickFormatter={(v: number) => formatValue(v, format)} />
              <YAxis
                type="category"
                dataKey={x}
                width={150}
                tick={{ ...AXIS_TICK, fill: chart.tooltip }}
                tickLine={false}
                axisLine={false}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={x}
                tickFormatter={tickLabel}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: chart.baseline }}
                dy={6}
              />
              <YAxis
                width={48}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatValue(v, format)}
                allowDecimals={false}
              />
            </>
          )}
          <RechartsTooltip
            content={tooltipContent(series, format)}
            cursor={{ fill: chart.grid }}
            isAnimationActive={false}
          />
          <Bar
            dataKey={y}
            name={yLabel}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={horizontal ? 18 : 32}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={highlight?.(d, i) ? PRIMARY : chart.neutral['300']} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </figure>
  )
}

/* ---------------------------------------------------------------- Donut */

export interface DonutSlice {
  id: string
  label: string
  value: number
}

export interface DonutProps {
  data: readonly DonutSlice[]
  /** The figure in the hole: "₹48.2Cr". */
  centerValue: ReactNode
  centerLabel: ReactNode
  format?: ValueFormat
  size?: number
  className?: string
  label: string
}

/**
 * For top-level allocation only, and always with direct labels: each slice names itself, its
 * figure and its share, so the reader never matches colours to a legend.
 */
export function Donut({
  data,
  centerValue,
  centerLabel,
  format = 'inr',
  size = 240,
  className,
  label,
}: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0)

  function renderLabel(props: PieLabelRenderProps) {
    const { cx, cy, midAngle, outerRadius, index } = props
    const slice = data[index ?? 0]
    if (!slice || total === 0) return null
    const share = (slice.value / total) * 100
    if (share < 3) return null
    const angle = (-(midAngle ?? 0) * Math.PI) / 180
    const r = Number(outerRadius) + 18
    const x = Number(cx) + r * Math.cos(angle)
    const y = Number(cy) + r * Math.sin(angle)
    const anchor = x > Number(cx) ? 'start' : 'end'
    return (
      <g>
        <text
          x={x}
          y={y - 6}
          textAnchor={anchor}
          fill={chart.tooltip}
          fontSize={12}
          fontWeight={600}
        >
          {slice.label}
        </text>
        <text x={x} y={y + 9} textAnchor={anchor} fill={chart.axis} fontSize={11}>
          {formatValue(slice.value, format)} · {formatPct(Math.round(share))}
        </text>
      </g>
    )
  }

  return (
    <figure
      className={cn('relative mx-auto', className)}
      style={{ width: size + 220, height: size }}
      role="img"
      aria-label={label}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data as DonutSlice[]}
            dataKey="value"
            nameKey="label"
            innerRadius={size * 0.3}
            outerRadius={size * 0.42}
            paddingAngle={1.5}
            stroke={chart.tooltipText}
            strokeWidth={2}
            startAngle={90}
            endAngle={-270}
            label={renderLabel}
            labelLine={{ stroke: chart.baseline }}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={d.id} fill={slotColor(i)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-title tabular text-ink">{centerValue}</span>
        <span className="text-caption text-ink-faint">{centerLabel}</span>
      </div>
    </figure>
  )
}

/* ---------------------------------------------------------------- Small multiple */

export interface SmallMultipleProps {
  title: string
  /** The latest value, drawn large beside the title. */
  value: number
  format?: ValueFormat
  /**
   * Change over the window. Left out, it is worked out from the series itself: percentage points
   * for a `pct` series, a percentage change for anything else. `null` hides the pill.
   */
  delta?: number | null
  /** For series where down is good. */
  invert?: boolean
  months: readonly string[]
  values: readonly number[]
  className?: string
}

/**
 * One tile in a grid of charts that share an x axis: titled with its current value and change,
 * one low-opacity green fill, first and last month labelled. Read together, the tiles show which
 * part of the book moved without one crowded chart.
 */
export function SmallMultiple({
  title,
  value,
  format = 'inr',
  delta,
  invert = false,
  months,
  values,
  className,
}: SmallMultipleProps) {
  const data = months.map((m, i) => ({ month: m, v: values[i] ?? null }))
  const first = values[0]
  const last = values[values.length - 1]
  const derived =
    first === undefined || last === undefined
      ? null
      : format === 'pct'
        ? last - first
        : first === 0
          ? null
          : ((last - first) / Math.abs(first)) * 100
  const change = delta === undefined ? derived : delta
  return (
    <div className={cn('rounded-lg border border-hairline bg-surface p-4', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-label text-ink-soft">{title}</p>
          <p className="mt-1 text-title tabular text-ink">{formatValue(value, format)}</p>
        </div>
        {change !== null ? (
          <DeltaPill value={change} unit={format === 'pct' ? 'pp' : 'pct'} invert={invert} />
        ) : null}
      </div>
      <AreaChart
        data={data}
        x="month"
        series={[{ key: 'v', label: title }]}
        format={format}
        height={96}
        yAxis={false}
        label={`${title} over ${months.length} months`}
      />
    </div>
  )
}

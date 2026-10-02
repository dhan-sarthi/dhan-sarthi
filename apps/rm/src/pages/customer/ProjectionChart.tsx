import type { Projection } from '@dhan/contracts'
import { futureValue } from '@dhan/core'
import { chart } from '@dhan/design'
import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { formatInr } from '../../lib/format.ts'
import { ChartTooltipCard } from '../../ui/index.ts'

/*
 * The projection as a band, never a line: the cautious and optimistic scenarios are the band's
 * edges, the expected one runs through it, and what was paid in runs underneath in grey so the
 * compounding is visible as the gap. The kit has no band chart, so this one lives with the page;
 * it takes every colour from `chart` in the design tokens, and the kit's tooltip card.
 *
 * The path is drawn with core's own `futureValue`, the function the engine's `project()` uses,
 * with the projection's own inputs. So each line ends exactly on the corpus the API sent, and
 * the figures in the legend are the API's, not recomputed here.
 */

const AXIS_TICK = { fill: chart.axis, fontSize: 11 } as const
const PRIMARY = chart.categorical[0] ?? chart.axis
const EDGE = chart.sequential['300']
const PAID = chart.neutral['400']

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

export const SWATCH = { low: EDGE, mid: PRIMARY, high: EDGE, paid: PAID }

interface Point {
  year: number
  low: number
  mid: number
  high: number
  band: [number, number]
  paid: number
}

function pathOf(projection: Projection, roles: ScenarioRoles, startYear: number): Point[] {
  const { monthlyContribution: monthly, existingCorpus: existing, years } = projection
  // One point a year, and one on the horizon itself when it is not a whole number of years.
  const steps: number[] = []
  for (let t = 0; t < years; t += 1) steps.push(t)
  steps.push(years)
  return steps.map((t) => {
    const low = futureValue(monthly, t, roles.low.ratePct, existing)
    const high = futureValue(monthly, t, roles.high.ratePct, existing)
    return {
      year: startYear + t,
      low,
      mid: futureValue(monthly, t, roles.mid.ratePct, existing),
      high,
      band: [low, high],
      paid: Math.round(monthly * Math.round(t * 12)) + existing,
    }
  })
}

function ticksFor(start: number, end: number): number[] {
  const span = end - start
  const step = span <= 6 ? 1 : span <= 12 ? 2 : 5
  const out: number[] = []
  for (let y = start; y <= end + 1e-9; y += step) out.push(Math.round(y * 100) / 100)
  return out
}

function tooltipContent(roles: ScenarioRoles, startYear: number, startAge: number) {
  return function Content(props: TooltipContentProps) {
    const point = props.payload?.[0]?.payload as Point | undefined
    if (!props.active || !point) return null
    const t = point.year - startYear
    return (
      <ChartTooltipCard
        title={`${Math.floor(point.year)}, age ${Math.floor(startAge + t)}`}
        rows={[
          { label: roles.high.label, value: formatInr(point.high), swatch: SWATCH.high },
          { label: roles.mid.label, value: formatInr(point.mid), swatch: SWATCH.mid },
          { label: roles.low.label, value: formatInr(point.low), swatch: SWATCH.low },
          { label: 'Paid in', value: formatInr(point.paid), swatch: SWATCH.paid },
        ]}
      />
    )
  }
}

export function ProjectionChart({
  projection,
  roles,
  startYear,
  startAge,
  height = 240,
}: {
  projection: Projection
  roles: ScenarioRoles
  /** The as-of year: the chart's "now". */
  startYear: number
  /** The customer's age now, for the tooltip ("2042, age 60"). */
  startAge: number
  height?: number
}) {
  const data = useMemo(() => pathOf(projection, roles, startYear), [projection, roles, startYear])
  const end = startYear + projection.years

  return (
    <figure
      role="img"
      aria-label={`Projected corpus from ${startYear} to ${Math.floor(end)}: ${roles.low.label} ${formatInr(roles.low.corpus, { short: true })}, ${roles.mid.label} ${formatInr(roles.mid.corpus, { short: true })}, ${roles.high.label} ${formatInr(roles.high.corpus, { short: true })}. Illustration only.`}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis
            dataKey="year"
            type="number"
            domain={[startYear, end]}
            ticks={ticksFor(startYear, end)}
            tickFormatter={(v: number) => String(Math.floor(v))}
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
            tickFormatter={(v: number) => formatInr(v, { short: true })}
            domain={[0, 'auto']}
          />
          <RechartsTooltip
            content={tooltipContent(roles, startYear, startAge)}
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
          <Line
            dataKey="paid"
            stroke={PAID}
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="low"
            stroke={EDGE}
            strokeWidth={1.25}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="high"
            stroke={EDGE}
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

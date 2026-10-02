import type { RmInsights } from '@dhan/contracts'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatMonth, formatPct } from '../../lib/format.ts'
import { AreaChart, Card, DeltaPill, Money, SectionLabel, type SeriesDef } from '../../ui/index.ts'
import { earliest, lastStep, latest, pctChange, sharePct, sum, toRows } from './derive.ts'
import { MonthColumns } from './MonthColumns.tsx'

/*
 * The book over twelve months as small multiples: six tiles on one surface, each titled with its
 * latest figure and its change, all drawn against the same twelve months so the eye can run down
 * a column and see which part of the book moved. Money tiles measure their change from the first
 * month of the window; count tiles from the month before, because a sparse count compared with a
 * year ago says nothing. Two measures of different scale are never put on one axis; money in and
 * money out share a tile because they are the same measure.
 *
 * A series the API sends empty (activity and refusals, until there is something to count) gets a
 * sentence in place of its chart. A flat line at zero would claim the console looked and found
 * nothing; an empty array means there was nothing to look at.
 */

const CHART_HEIGHT = 112

interface Tile {
  id: string
  title: string
  /** The latest figure, already formatted; null draws the empty tile. */
  figure: ReactNode | null
  /** A few words after the figure: "invested in Aug", "net in Aug". */
  unit?: string
  delta?: ReactNode
  /** One line of context under the figure, figure first. */
  context?: ReactNode
  chart?: ReactNode
  empty?: { title: string; body: string }
}

export function TrendBand({ insights }: { insights: RmInsights }) {
  const { months, series } = insights
  const first = months[0]
  const last = months[months.length - 1]
  const tiles = buildTiles(insights)

  return (
    // Clipped to its radius so the hairline grid inside meets the rounded corners cleanly.
    <Card padded={false} className="overflow-hidden" aria-labelledby="insights-trends">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline-soft px-5 py-4">
        <SectionLabel id="insights-trends">Twelve months</SectionLabel>
        {first && last ? (
          <p className="text-caption text-ink-faint">
            {formatMonth(first)} to {formatMonth(last)} · {months.length} month-ends
          </p>
        ) : null}
      </header>
      {months.length === 0 || series.bookBalance.length === 0 ? (
        <p className="px-5 py-10 text-center text-label font-normal text-ink-soft">
          There are no month-end balances to chart yet. The first month-end after customers join the
          book starts the series.
        </p>
      ) : (
        // A 1px gap over a hairline ground draws the dividers, so the grid can reflow from three
        // columns to two to one without a border rule per breakpoint.
        <div className="grid grid-cols-1 gap-px bg-hairline-soft md:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <TileView key={tile.id} tile={tile} />
          ))}
        </div>
      )}
    </Card>
  )
}

function TileView({ tile }: { tile: Tile }) {
  return (
    <section
      aria-labelledby={`trend-${tile.id}`}
      className="flex min-w-0 flex-col bg-surface px-5 pt-4 pb-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`trend-${tile.id}`} className="text-label text-ink-soft">
            {tile.title}
          </h3>
          <p className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap">
            {tile.figure === null ? (
              <span className="text-title text-ink-hint">
                <span aria-hidden>—</span>
                <span className="sr-only">No figure yet</span>
              </span>
            ) : (
              <span className="text-title text-ink">{tile.figure}</span>
            )}
            {tile.unit && tile.figure !== null ? (
              <span className="text-caption text-ink-faint">{tile.unit}</span>
            ) : null}
          </p>
        </div>
        {tile.delta ? <div className="shrink-0 pt-0.5">{tile.delta}</div> : null}
      </div>
      {/* A fixed line height, so a tile whose context carries a legend keeps its axis level
          with its neighbours'. */}
      <div className="mt-1 h-4 truncate text-caption leading-4 font-normal text-ink-faint">
        {tile.context}
      </div>
      <div className="mt-3" style={{ minHeight: CHART_HEIGHT }}>
        {tile.chart ?? (tile.empty ? <EmptyChart {...tile.empty} /> : null)}
      </div>
    </section>
  )
}

/** Sits where the chart would, at the chart's height, so the grid keeps its rows. */
function EmptyChart({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="flex flex-col justify-center rounded-md bg-canvas-top px-4 py-3"
      style={{ height: CHART_HEIGHT }}
    >
      <p className="text-label text-ink">{title}</p>
      <p className="mt-0.5 text-caption font-normal text-ink-soft">{body}</p>
    </div>
  )
}

/* ---------------------------------------------------------------- The six tiles */

function buildTiles(insights: RmInsights): Tile[] {
  const { months, series } = insights
  const firstMonth = months[0] ? formatMonth(months[0]) : null
  const lastMonthShort = months[months.length - 1]
    ? formatMonth(months[months.length - 1] ?? '', { year: false })
    : null
  const prevMonthShort = months[months.length - 2]
    ? formatMonth(months[months.length - 2] ?? '', { year: false })
    : null

  function chart(
    data: Record<string, readonly number[]>,
    defs: readonly SeriesDef[],
    label: string,
  ): ReactNode {
    return (
      <AreaChart
        data={toRows(months, data)}
        x="month"
        series={defs}
        format="inr"
        height={CHART_HEIGHT}
        yAxis={false}
        label={label}
      />
    )
  }

  /**
   * Monthly counts are columns, not an area: a month with one refusal and the next with none is
   * two separate facts, and a smoothed curve between them would draw refusals that never
   * happened. The latest month, the one the tile is titled with, is the column in green.
   */
  function columns(values: readonly number[], seriesLabel: string, label: string): ReactNode {
    return (
      <MonthColumns
        months={months}
        values={values}
        seriesLabel={seriesLabel}
        height={CHART_HEIGHT}
        label={label}
      />
    )
  }

  /** A count's change on the month before, said in words beside the pill. */
  function stepPill(values: readonly number[]): ReactNode {
    const step = lastStep(values)
    if (step === null || !prevMonthShort) return null
    if (step === 0) {
      return <span className="text-caption text-ink-faint">Same as {prevMonthShort}</span>
    }
    return (
      <span className="inline-flex items-center gap-1.5">
        <DeltaPill value={step} unit="count" tone="neutral" />
        <span className="text-caption text-ink-faint">vs {prevMonthShort}</span>
      </span>
    )
  }

  function pctPill(values: readonly number[]): ReactNode {
    const change = pctChange(values)
    return change === null ? null : <DeltaPill value={change} />
  }

  /* Balances, all banks */
  const total = latest(series.bookBalance)
  const totalFrom = earliest(series.bookBalance)

  /* Balances with IDBI, and the wallet share they make of all balances */
  const idbi = latest(series.withIdbi)
  // Whole percentages: a wallet share to one decimal reads as more precise than it is useful.
  const shareNow =
    idbi !== null && total !== null && total > 0 ? Math.round(sharePct(idbi, total)) : null
  const idbiFrom = earliest(series.withIdbi)
  const shareThen =
    idbiFrom !== null && totalFrom !== null && totalFrom > 0
      ? Math.round(sharePct(idbiFrom, totalFrom))
      : null

  /* Money in and out, for the latest month */
  const inflow = latest(series.inflow)
  const outflow = latest(series.outflow)
  const net = inflow !== null && outflow !== null ? inflow - outflow : null

  /* SIP book */
  const sip = latest(series.sipBook)
  const sipFrom = earliest(series.sipBook)

  /* Activity and refusals: counts, compared with the month before by `stepPill` */
  const activity = latest(series.activity)
  const refusals = latest(series.refusals)
  const refusalsTotal = sum(series.refusals)

  return [
    {
      id: 'balances',
      title: 'Balances, all banks',
      figure: total === null ? null : <Money value={total} short />,
      delta: pctPill(series.bookBalance),
      context:
        totalFrom !== null && firstMonth ? (
          <>
            From <Money value={totalFrom} short /> at the end of {firstMonth}
          </>
        ) : null,
      chart:
        total === null
          ? undefined
          : chart(
              { v: series.bookBalance },
              [{ key: 'v', label: 'All banks' }],
              'Month-end balances across every bank, twelve months',
            ),
      empty: { title: 'No balances yet', body: 'Month-end balances chart here.' },
    },
    {
      id: 'with-idbi',
      title: 'Balances with IDBI',
      figure: idbi === null ? null : <Money value={idbi} short />,
      delta: pctPill(series.withIdbi),
      context:
        shareNow !== null ? (
          <>
            {formatPct(shareNow)} of all balances
            {shareThen !== null && shareThen !== shareNow ? `, from ${formatPct(shareThen)}` : null}
          </>
        ) : null,
      chart:
        idbi === null
          ? undefined
          : chart(
              { v: series.withIdbi },
              [{ key: 'v', label: 'With IDBI' }],
              'Month-end balances held with IDBI, twelve months',
            ),
      empty: { title: 'No IDBI balances yet', body: 'Month-end balances with IDBI chart here.' },
    },
    {
      id: 'flows',
      title: 'Money in vs out',
      figure: net === null ? null : <Money value={net} short signed />,
      ...(lastMonthShort ? { unit: `net in ${lastMonthShort}` } : {}),
      context:
        inflow !== null && outflow !== null ? (
          <span className="inline-flex items-center gap-3">
            <LegendKey kind="solid" label="In">
              <Money value={inflow} short />
            </LegendKey>
            <LegendKey kind="dashed" label="Out">
              <Money value={outflow} short />
            </LegendKey>
          </span>
        ) : null,
      chart:
        net === null
          ? undefined
          : chart(
              { inflow: series.inflow, outflow: series.outflow },
              [
                { key: 'inflow', label: 'Money in' },
                { key: 'outflow', label: 'Money out', role: 'comparison' },
              ],
              'Money in against money out across the book by month, transfers between a customer’s own accounts left out',
            ),
      empty: { title: 'No statements yet', body: 'Money in and out by month charts here.' },
    },
    {
      id: 'sip',
      title: 'SIP book',
      figure: sip === null ? null : <Money value={sip} short />,
      // What the statements show invested in the month, not the sum of mandates: a month with a
      // paused or new SIP shows here as it happened.
      ...(lastMonthShort ? { unit: `invested in ${lastMonthShort}` } : {}),
      delta: pctPill(series.sipBook),
      context:
        sipFrom !== null && firstMonth ? (
          <>
            From <Money value={sipFrom} short /> in {firstMonth}, per statements
          </>
        ) : null,
      chart:
        sip === null
          ? undefined
          : chart(
              { v: series.sipBook },
              [{ key: 'v', label: 'SIP book' }],
              'Money invested through SIPs each month across the book, as the statements show it',
            ),
      empty: {
        title: 'No SIPs running',
        body: 'Money invested through SIPs each month charts here.',
      },
    },
    {
      id: 'activity',
      title: 'Activity',
      figure: activity === null ? null : formatCount(activity),
      ...(lastMonthShort ? { unit: `in ${lastMonthShort}` } : {}),
      delta: stepPill(series.activity),
      context: series.activity.length === 0 ? null : 'Decisions, questions, calls and notes',
      chart:
        activity === null
          ? undefined
          : columns(
              series.activity,
              'Activity',
              'Decisions, product questions, Uday calls and desk notes across the book, by month',
            ),
      empty: {
        title: 'No activity recorded',
        body: 'Decisions, questions, calls and notes are counted here by month.',
      },
    },
    {
      id: 'refusals',
      title: 'Refusals',
      figure: refusals === null ? null : formatCount(refusals),
      ...(lastMonthShort ? { unit: `in ${lastMonthShort}` } : {}),
      delta: stepPill(series.refusals),
      context:
        series.refusals.length === 0
          ? null
          : `${formatCount(refusalsTotal)} turned down in ${months.length} months`,
      chart:
        refusals === null
          ? undefined
          : columns(
              series.refusals,
              'Refusals',
              'Products Uday turned down across the book, by month',
            ),
      empty: {
        title: 'No refusals recorded',
        body: 'Each product Uday turns down is counted here by month.',
      },
    },
  ]
}

/** A legend entry drawn as the mark it names: a solid line for money in, dashed for out. */
function LegendKey({
  kind,
  label,
  children,
}: {
  kind: 'solid' | 'dashed'
  label: string
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn(
          'inline-block w-3',
          kind === 'solid'
            ? 'h-0.5 rounded-full bg-chart-1'
            : 'border-t-[1.5px] border-dashed border-chart-neutral-400',
        )}
      />
      <span className="text-ink-soft">{label}</span>
      <span className="text-ink">{children}</span>
    </span>
  )
}

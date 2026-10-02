import type { RmInsights } from '@dhan/contracts'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatMonth, formatPct } from '../../lib/format.ts'
import { Card, DeltaPill, Money, SectionLabel } from '../../ui/index.ts'
import { lastStep, latest, lowerFirst, pctChange, stepSentence, sum } from './derive.ts'
import { MonthColumns } from './MonthColumns.tsx'
import { MonthLines, type MonthLine } from './MonthLines.tsx'

/*
 * The book over twelve months as small multiples: six tiles on one surface, all drawn against
 * the same twelve months so the eye can run down a column and see which part of the book moved.
 *
 * Two dates, kept apart the way the rest of the console keeps them. A tile's headline is the
 * book *as at* the as-of date, the same figure Book and Today print; its chart is the twelve
 * month-ends (or, for flows and counts, the twelve months) behind it, and a change pill is read
 * off the chart. As at 1 Sep is payday, so the headline sits a salary above the chart's last
 * point; each carries its own label, in the API's words, so the two never pass for one figure.
 *
 * Two measures of different scale are never put on one axis; money in and money out share a
 * tile because they are the same measure.
 *
 * A series the API sends empty (activity and refusals, until there is something to count) gets a
 * sentence in place of its chart. A flat line at zero would claim the console looked and found
 * nothing; an empty array means there was nothing to look at.
 */

const CHART_HEIGHT = 124

interface Tile {
  id: string
  title: string
  /** The headline figure, already formatted; null draws the empty tile. */
  figure: ReactNode | null
  /** A few words after the figure: "net in Aug", "refused in 12 months". */
  unit?: string
  /** A change read off the chart, top right. */
  delta?: ReactNode
  /** One line of context under the figure: its date, or the month the chart ends on. */
  context?: ReactNode
  chart?: ReactNode
  /** What the chart draws, in the API's words, under the month axis. */
  caption?: string
  empty?: { title: string; body: string }
}

export function TrendBand({ insights }: { insights: RmInsights }) {
  const { months, series, basis } = insights
  const tiles = buildTiles(insights)

  return (
    // Clipped to its radius so the hairline grid inside meets the rounded corners cleanly.
    <Card padded={false} className="overflow-hidden" aria-labelledby="insights-trends">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline-soft px-5 py-4">
        <SectionLabel id="insights-trends">Twelve months</SectionLabel>
        <p className="text-caption text-ink-faint">
          {formatMonth(basis.seriesFrom)} to {formatMonth(basis.seriesTo)} · headlines{' '}
          {lowerFirst(basis.asOfLabel)}
        </p>
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
      {/* A fixed line height, so a tile whose context carries a legend keeps its chart level
          with its neighbours'. */}
      <div className="mt-1 h-4 truncate text-caption leading-4 font-normal text-ink-faint">
        {tile.context}
      </div>
      <div className="mt-2" style={{ minHeight: CHART_HEIGHT }}>
        {tile.chart ?? (tile.empty ? <EmptyChart {...tile.empty} /> : null)}
      </div>
      {tile.caption && tile.chart ? (
        <p className="mt-1 truncate text-micro leading-4 font-normal tracking-normal text-ink-faint">
          {tile.caption}
        </p>
      ) : null}
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
  const { months, series, asAt, basis, seriesLabels } = insights
  const firstMonth = months[0] ? formatMonth(months[0]) : null
  const lastMonthShort = months[months.length - 1]
    ? formatMonth(months[months.length - 1] ?? '', { year: false })
    : null
  const prevMonthShort = months[months.length - 2]
    ? formatMonth(months[months.length - 2] ?? '', { year: false })
    : null

  function lines(
    defs: readonly MonthLine[],
    label: string,
    options: { endLabels?: boolean; monthEnd?: boolean } = {},
  ): ReactNode {
    return (
      <MonthLines
        months={months}
        lines={defs}
        height={CHART_HEIGHT}
        label={label}
        endLabels={options.endLabels ?? false}
        monthEnd={options.monthEnd ?? false}
      />
    )
  }

  /**
   * Monthly counts are columns, not a line: a month with one refusal and the next with none is
   * two separate facts, and a line between them would draw refusals that never happened.
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

  /**
   * The change across a balance chart, first month-end to last. The pill sits beside an as-at
   * headline, so its hover and its spoken name say which two points it compares.
   */
  function chartChange(values: readonly number[]): ReactNode {
    const change = pctChange(values)
    if (change === null || !firstMonth || !lastMonthShort) return null
    const span = `${firstMonth} month-end to ${lastMonthShort} month-end`
    return (
      <span title={`Change from the ${span}`} className="inline-flex">
        <DeltaPill value={change} />
        <span className="sr-only">, {span}</span>
      </span>
    )
  }

  /** A count's change on the month before, as a neutral pill and the month it is against. */
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

  /* Money in and out, for the latest month */
  const inflow = latest(series.inflow)
  const outflow = latest(series.outflow)
  const net = inflow !== null && outflow !== null ? inflow - outflow : null

  /* Activity and refusals: counts */
  const activity = latest(series.activity)
  const activityTotal = sum(series.activity)
  const refusals = latest(series.refusals)
  const refusalsTotal = sum(series.refusals)

  const hasBalances = series.bookBalance.length > 0
  const hasIdbi = series.withIdbi.length > 0
  const sipDebits = series.sipDebits

  return [
    {
      id: 'balances',
      title: 'Balances, all banks',
      figure: <Money value={asAt.balances} short />,
      delta: chartChange(series.bookBalance),
      context: basis.asOfLabel,
      chart: hasBalances
        ? lines(
            [{ key: 'v', label: 'All banks', values: series.bookBalance }],
            seriesLabels.bookBalance,
            { endLabels: true, monthEnd: true },
          )
        : undefined,
      caption: seriesLabels.bookBalance,
      empty: { title: 'No balances yet', body: 'Month-end balances chart here.' },
    },
    {
      id: 'with-idbi',
      title: 'Balances with IDBI',
      figure: <Money value={asAt.withIdbi} short />,
      delta: chartChange(series.withIdbi),
      context: (
        <>
          {basis.asOfLabel}
          {asAt.walletSharePct !== null ? (
            <>
              {' '}
              · <span className="text-ink-soft">{formatPct(asAt.walletSharePct)}</span> of all
              balances
            </>
          ) : null}
        </>
      ),
      chart: hasIdbi
        ? lines(
            [{ key: 'v', label: 'With IDBI', values: series.withIdbi }],
            seriesLabels.withIdbi,
            { endLabels: true, monthEnd: true },
          )
        : undefined,
      caption: seriesLabels.withIdbi,
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
          : lines(
              [
                { key: 'inflow', label: 'Money in', values: series.inflow },
                {
                  key: 'outflow',
                  label: 'Money out',
                  values: series.outflow,
                  role: 'comparison',
                },
              ],
              `${seriesLabels.inflow}, against ${lowerFirst(seriesLabels.outflow)}`,
            ),
      // The API labels the two series apart; the tile draws them together.
      caption: 'Money in and out during each month, per statements',
      empty: { title: 'No statements yet', body: 'Money in and out by month charts here.' },
    },
    {
      id: 'sip',
      // The SIP book is what Book and Today call it: registered SIPs a month, as at today. The
      // chart under it is a different measure, what the statements show debited each month,
      // and its caption says so.
      title: 'Monthly SIP book',
      figure: <Money value={asAt.sipMonthly} short />,
      unit: 'registered SIPs',
      context: (
        <>
          {basis.asOfLabel} ·{' '}
          <span className="text-ink-soft">{formatCount(asAt.sipCustomers)}</span> customer
          {asAt.sipCustomers === 1 ? '' : 's'}
        </>
      ),
      chart:
        sipDebits.length === 0
          ? undefined
          : lines([{ key: 'v', label: 'SIP debits', values: sipDebits }], seriesLabels.sipDebits, {
              endLabels: true,
            }),
      caption: seriesLabels.sipDebits,
      empty: {
        title: 'No SIP debits yet',
        body: 'What the statements show invested through SIPs charts here, month by month.',
      },
    },
    {
      id: 'activity',
      title: 'Activity',
      figure: activity === null ? null : formatCount(activity),
      ...(lastMonthShort ? { unit: `in ${lastMonthShort}` } : {}),
      delta: stepPill(series.activity),
      context:
        series.activity.length === 0
          ? null
          : `${formatCount(activityTotal)} in ${months.length} months`,
      chart:
        activity === null ? undefined : columns(series.activity, 'Activity', seriesLabels.activity),
      caption: seriesLabels.activity,
      empty: {
        title: 'No activity recorded',
        body: 'Decisions, questions, calls and notes are counted here by month.',
      },
    },
    {
      id: 'refusals',
      // The twelve months are the proof: every product Uday would not sell. The latest month is
      // context, said in words with no colour, because a month with fewer refusals is neither
      // good news nor bad.
      title: 'Refusals',
      figure: series.refusals.length === 0 ? null : formatCount(refusalsTotal),
      unit: `refused in ${months.length} months`,
      context:
        refusals === null || !lastMonthShort
          ? null
          : stepSentence(series.refusals, lastMonthShort, prevMonthShort),
      chart:
        refusals === null ? undefined : columns(series.refusals, 'Refusals', seriesLabels.refusals),
      caption: seriesLabels.refusals,
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

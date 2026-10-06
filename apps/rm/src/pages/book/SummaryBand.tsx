import type { BookRow, RmBook } from '@dhan/contracts'
import { bookBalanceSeries } from '@dhan/core'
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { useId, useMemo, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatMonth, formatPct } from '../../lib/format.ts'
import { Button, Card, DeltaPill, Money, SEGMENT, StackedBar, Stat } from '../../ui/index.ts'
import { LazyAreaChart, preloadAreaChart } from './LazyAreaChart.tsx'
import { segmentBreakdown } from './rows.ts'
import { SeriesKey } from './SeriesKey.tsx'

/**
 * The band over the table, in two parts.
 *
 * The strip is the whole book in four figures, as at the as-of date: what it is worth, what sits
 * with IDBI, the monthly SIP book (registered SIPs), and who has asked for a call. It never
 * changes with the tab, so the numbers match Today's. It measures its own width: four across when
 * there is room, two by two in a narrow column, and each figure's quiet note gives way before the
 * figure is ever cut.
 *
 * The detail under it is the view: the balances of the rows on screen at each month-end, and how
 * they divide by segment. It follows the tab and the search, and the RM can fold it away; on a
 * laptop screen it starts folded, so the list is what fills the window.
 */
export function SummaryBand({
  book,
  view,
  viewLabel,
  expanded,
  onToggle,
  onShowAsked,
}: {
  book: RmBook
  /** The rows on screen: the tab and the search applied. */
  view: readonly BookRow[]
  /** "At risk, 29 customers": what `view` is, in words. */
  viewLabel: string
  expanded: boolean
  onToggle: () => void
  onShowAsked: () => void
}) {
  const detailId = useId()
  const { totals, basis } = book
  const sipCustomers = useMemo(() => book.rows.filter((r) => r.sipMonthly > 0).length, [book.rows])

  return (
    <Card padded={false} className="@container">
      <div className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2.5">
        <div className="grid min-w-0 flex-[1_1_18rem] grid-cols-2 gap-x-6 gap-y-2 @lg:grid-cols-4">
          <Figure
            label="Book value"
            value={totals.relationshipValue}
            unit="inr"
            note={basis.asOfLabel}
            title={`Everything we can see for ${formatCount(totals.customers)} ${totals.customers === 1 ? 'customer' : 'customers'}, at any bank. ${basis.asOfLabel}.`}
          />
          <Figure
            label="With IDBI"
            value={totals.withIdbi}
            unit="inr"
            note={
              totals.walletSharePct === null
                ? 'No balances to compare'
                : `${formatPct(totals.walletSharePct)} of balances`
            }
            title={`Balances held with IDBI. ${basis.asOfLabel}.`}
          />
          <Figure
            label={
              <>
                <span className="@3xl:hidden">SIP book</span>
                <span className="hidden @3xl:inline">Monthly SIP book</span>
              </>
            }
            name="Monthly SIP book"
            value={totals.sipMonthly}
            unit="inr"
            note="registered SIPs"
            title={`The SIPs registered on the book's holdings, a month: ${formatCount(sipCustomers)} ${sipCustomers === 1 ? 'customer' : 'customers'}. ${basis.asOfLabel}.`}
          />
          <Figure
            label="Asked for you"
            value={totals.openHandoffs}
            unit="count"
            note={
              totals.openHandoffs === 0 ? (
                'Nobody is waiting'
              ) : (
                <button
                  type="button"
                  onClick={onShowAsked}
                  className="group inline-flex items-center gap-0.5 rounded-xs text-brand transition-colors hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Show in the list
                  <ArrowRight
                    aria-hidden
                    className="size-3 transition-transform duration-feedback group-hover:translate-x-0.5"
                  />
                </button>
              )
            }
            title="Customers who tapped Talk to your relationship manager and are waiting on a call."
          />
        </div>
        <div className="ml-auto flex shrink-0 items-center">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggle}
            onPointerEnter={preloadAreaChart}
            onFocus={preloadAreaChart}
            aria-expanded={expanded}
            aria-controls={detailId}
            className="relative pointer-coarse:hit-target"
          >
            {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            {expanded ? 'Hide chart' : 'Show chart'}
          </Button>
        </div>
      </div>

      {expanded ? (
        <div
          id={detailId}
          className="grid grid-cols-1 border-t border-hairline-soft @2xl:grid-cols-[1.35fr_1fr]"
        >
          <ViewBalances view={view} viewLabel={viewLabel} seriesLabel={basis.seriesLabel} />
          <BySegment view={view} viewLabel={viewLabel} />
        </div>
      ) : null}
    </Card>
  )
}

/**
 * One figure of the strip, drawn by the kit's compact `Stat`: its label over the value, with a
 * quiet note beside the value that only shows where the strip has room for it.
 */
function Figure({
  label,
  name,
  value,
  unit,
  note,
  title,
}: {
  label: ReactNode
  /** The figure's name for a screen reader, where `label` changes with the room. */
  name?: string
  value: number
  unit: 'inr' | 'count'
  note: ReactNode
  title: string
}) {
  return (
    <section
      aria-label={name ?? (typeof label === 'string' ? label : undefined)}
      title={title}
      className="min-w-0"
    >
      <Stat
        size="sm"
        label={label}
        value={value}
        unit={unit}
        // Only where all four fit with their notes (a 1280 laptop and up): in a narrower strip
        // the note gives way entirely, so the figure is never cut to make room for it.
        deltaLabel={<span className="hidden @min-[60rem]:inline">{note}</span>}
      />
    </section>
  )
}

function ViewBalances({
  view,
  viewLabel,
  seriesLabel,
}: {
  view: readonly BookRow[]
  viewLabel: string
  seriesLabel: string
}) {
  const series = useMemo(() => bookBalanceSeries(view), [view])
  const first = series[0]
  const last = series[series.length - 1]
  const change =
    first && last && first.total > 0 ? ((last.total - first.total) / first.total) * 100 : null
  // IDBI's line only where it differs from the total; otherwise the two sit on top of each other.
  const showIdbi = series.some((p) => p.withIdbi !== p.total)

  return (
    <section
      aria-label="Balances at month-end, this view"
      className="flex min-w-0 flex-col px-5 pt-4 pb-3"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="truncate text-label text-ink-soft">Balances at month-end</p>
        {showIdbi ? <SeriesKey /> : null}
      </div>
      {last && first ? (
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex items-baseline gap-1.5">
            <Money value={last.total} short className="text-title text-ink" />
            <span className="text-label-plain text-ink-faint">
              at the end of {formatMonth(last.month, { year: false })}
            </span>
          </p>
          {change !== null ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-caption-plain text-ink-faint">
              <DeltaPill value={Math.round(change * 10) / 10} />
              since {formatMonth(first.month)}
            </span>
          ) : null}
        </div>
      ) : null}
      {series.length > 1 && first && last ? (
        <>
          <LazyAreaChart
            className="mt-2"
            data={series.map((p) => ({ month: p.month, total: p.total, withIdbi: p.withIdbi }))}
            x="month"
            series={[
              { key: 'total', label: 'All banks' },
              ...(showIdbi
                ? [{ key: 'withIdbi', label: 'With IDBI', role: 'comparison' as const }]
                : []),
            ]}
            height={84}
            yAxis={false}
            label={`Balances for ${viewLabel} at each month-end, ${formatMonth(first.month)} to ${formatMonth(last.month)}`}
          />
          <p className="mt-1 text-caption-plain text-ink-faint">{seriesLabel}</p>
        </>
      ) : (
        <p className="mt-4 text-label-plain text-ink-faint">
          {view.length === 0
            ? 'No customers in this view.'
            : 'Not enough month-ends yet to draw a year of balances.'}
        </p>
      )}
    </section>
  )
}

/** How the view divides by segment, by relationship value: one bar, three rows under it. */
function BySegment({ view, viewLabel }: { view: readonly BookRow[]; viewLabel: string }) {
  const slices = useMemo(() => segmentBreakdown(view), [view])
  const total = slices.reduce((s, x) => s + x.relationshipValue, 0)

  return (
    <section
      aria-label="By segment, this view"
      className="flex min-w-0 flex-col border-t border-hairline-soft px-5 pt-4 pb-3 @2xl:border-t-0 @2xl:border-l"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-label text-ink-soft">By segment</p>
        <p className="truncate text-caption-plain text-ink-faint">{viewLabel}</p>
      </div>
      <StackedBar
        className="mt-3"
        label={`Relationship value by segment, ${viewLabel}: ${slices
          .map((s) => `${SEGMENT[s.segment].label} ${formatPct(Math.round(s.sharePct))}`)
          .join(', ')}`}
        parts={slices.map((s) => ({
          id: s.segment,
          value: s.relationshipValue,
          fill: SEGMENT[s.segment].fill,
        }))}
      />
      <ul className="mt-3 grid gap-2">
        {slices.map((s) => (
          <li
            key={s.segment}
            className="grid grid-cols-[auto_1fr_auto_3rem] items-baseline gap-x-2 text-label"
          >
            <span
              aria-hidden
              className={cn('size-2 translate-y-[-1px] rounded-xs', SEGMENT[s.segment].fill)}
            />
            <span className="min-w-0 truncate text-ink">
              {SEGMENT[s.segment].label}{' '}
              <span className="font-normal text-ink-faint tabular">
                · {formatCount(s.customers)}
              </span>
            </span>
            <Money value={s.relationshipValue} short className="text-ink" />
            <span className="text-right font-normal text-ink-faint tabular">
              {total > 0 ? formatPct(Math.round(s.sharePct)) : '—'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

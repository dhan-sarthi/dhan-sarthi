import type { BookRow, RmBook, Segment } from '@dhan/contracts'
import { bookBalanceSeries } from '@dhan/core'
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { useId, useMemo, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatMonth, formatPct } from '../../lib/format.ts'
import { AreaChart, Button, Card, DeltaPill, Money, SEGMENT } from '../../ui/index.ts'
import { segmentBreakdown } from './rows.ts'
import { SeriesKey } from './SeriesKey.tsx'

/** The segment bar's fills: one sequential family, deepest for Priority, like the row tints. */
const SEGMENT_FILL: Readonly<Record<Segment, string>> = {
  priority: 'bg-chart-seq-550',
  affluent: 'bg-chart-seq-350',
  mass: 'bg-chart-seq-150',
}

/**
 * The band over the table, in two parts.
 *
 * The strip is the whole book in four figures, as at the as-of date, in 64px: what it is worth,
 * what sits with IDBI, the monthly SIP book (registered SIPs), and who has asked for a call. It
 * never changes with the tab, so the numbers match Today's.
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
      <div className="flex min-h-16 items-center gap-x-6 gap-y-2 px-5 py-2.5">
        <div className="grid min-w-0 flex-1 grid-cols-4 gap-x-6">
          <Figure
            label="Book value"
            value={<Money value={totals.relationshipValue} short />}
            note={basis.asOfLabel}
            title={`Everything we can see for ${formatCount(totals.customers)} ${totals.customers === 1 ? 'customer' : 'customers'}, at any bank. ${basis.asOfLabel}.`}
          />
          <Figure
            label="With IDBI"
            value={<Money value={totals.withIdbi} short />}
            note={
              totals.walletSharePct === null
                ? 'No balances to compare'
                : `${formatPct(totals.walletSharePct)} of balances`
            }
            title={`Balances held with IDBI. ${basis.asOfLabel}.`}
          />
          <Figure
            label="Monthly SIP book"
            shortLabel="SIP book"
            value={<Money value={totals.sipMonthly} short />}
            note="registered SIPs"
            title={`The SIPs registered on the book's holdings, a month: ${formatCount(sipCustomers)} ${sipCustomers === 1 ? 'customer' : 'customers'}. ${basis.asOfLabel}.`}
          />
          <Figure
            label="Asked for you"
            value={<span className="tabular">{formatCount(totals.openHandoffs)}</span>}
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
                    className="size-3 transition-transform duration-150 group-hover:translate-x-0.5"
                  />
                </button>
              )
            }
            title="Customers who tapped Talk to your relationship manager and are waiting on a call."
          />
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={detailId}
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

/** One figure of the strip: its label over the value, with a quiet note beside the value. */
function Figure({
  label,
  shortLabel,
  value,
  note,
  title,
}: {
  label: string
  /** What the label shrinks to when the strip is narrow ("SIP book"). */
  shortLabel?: string
  value: ReactNode
  note: ReactNode
  title: string
}) {
  return (
    <section aria-label={label} title={title} className="min-w-0">
      <p className="truncate text-caption text-ink-soft">
        {shortLabel ? (
          <>
            <span className="@3xl:hidden">{shortLabel}</span>
            <span className="hidden @3xl:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </p>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-heading text-ink">{value}</span>
        {/* The note gives way first when the strip is narrow (beside the rail, on a laptop). */}
        <span className="hidden min-w-0 truncate text-caption font-normal text-ink-faint @3xl:inline">
          {note}
        </span>
      </div>
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
        <div className="mt-1 flex items-baseline justify-between gap-4">
          <p className="flex items-baseline gap-1.5">
            <Money value={last.total} short className="text-title text-ink" />
            <span className="text-label font-normal text-ink-faint">
              at the end of {formatMonth(last.month, { year: false })}
            </span>
          </p>
          {change !== null ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-caption font-normal text-ink-faint">
              <DeltaPill value={Math.round(change * 10) / 10} />
              since {formatMonth(first.month)}
            </span>
          ) : null}
        </div>
      ) : null}
      {series.length > 1 && first && last ? (
        <>
          <AreaChart
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
          <p className="mt-1 text-caption font-normal text-ink-hint">{seriesLabel}</p>
        </>
      ) : (
        <p className="mt-4 text-label font-normal text-ink-faint">
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
        <p className="truncate text-caption font-normal text-ink-hint">{viewLabel}</p>
      </div>
      <div
        aria-hidden
        className="mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-ground-deep"
      >
        {total > 0
          ? slices.map((s) =>
              s.sharePct > 0 ? (
                <span
                  key={s.segment}
                  className={cn(
                    'h-full transition-[width] duration-300 ease-out',
                    SEGMENT_FILL[s.segment],
                  )}
                  style={{ width: `${s.sharePct}%` }}
                />
              ) : null,
            )
          : null}
      </div>
      <ul className="mt-3 grid gap-2">
        {slices.map((s) => (
          <li
            key={s.segment}
            className="grid grid-cols-[auto_1fr_auto_3rem] items-baseline gap-x-2 text-label"
          >
            <span
              aria-hidden
              className={cn('size-2 translate-y-[-1px] rounded-xs', SEGMENT_FILL[s.segment])}
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

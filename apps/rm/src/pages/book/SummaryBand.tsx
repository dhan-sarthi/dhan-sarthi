import type { RmBook } from '@dhan/contracts'
import { allocationTotals, bookBalanceSeries, bookTotals } from '@dhan/core'
import { ArrowRight } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatMonth, formatPct } from '../../lib/format.ts'
import { AllocationBar, AreaChart, Card, DeltaPill, Money } from '../../ui/index.ts'
import { SeriesKey } from './SeriesKey.tsx'

/**
 * The band over the table: the whole book in three answers. What it is worth (the one big
 * figure, with its mix), how its balances moved over the year, and what sits with IDBI, in SIPs
 * and waiting on a call. It always shows the whole book, whatever tab or search is set below;
 * the table's footer is where the slice on screen adds up.
 */
export function SummaryBand({
  book,
  onShowHandoffs,
}: {
  book: RmBook
  onShowHandoffs: () => void
}) {
  const derived = useMemo(() => {
    const rows = book.rows
    return {
      // Wallet share divides by balances, not by relationship value: holdings are not a
      // deposit any bank can hold, so the core's own total is the honest denominator.
      walletSharePct: bookTotals(rows).walletSharePct,
      allocation: allocationTotals(rows),
      series: bookBalanceSeries(rows),
      sipCustomers: rows.filter((r) => r.sipMonthly > 0).length,
    }
  }, [book.rows])

  const { totals } = book
  const series = derived.series
  const first = series[0]
  const last = series[series.length - 1]
  const yearChange =
    first && last && first.total > 0 ? ((last.total - first.total) / first.total) * 100 : null
  // Draw IDBI's share as a second line only where it differs from the total; on a book held
  // entirely with IDBI the two would sit on top of each other and read as one thick line.
  const showIdbi = series.some((p) => p.withIdbi !== p.total)

  return (
    <Card padded={false} className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr_0.95fr]">
      <section aria-label="Book value" className="flex min-w-0 flex-col p-5">
        <p className="text-label text-ink-soft">Book value</p>
        <Money value={totals.relationshipValue} short className="mt-1.5 text-figure text-ink" />
        <p className="mt-1 text-label font-normal text-ink-faint">
          Everything we can see for {formatCount(totals.customers)}{' '}
          {totals.customers === 1 ? 'customer' : 'customers'}, at any bank
        </p>
        <AllocationBar
          allocation={derived.allocation}
          legend
          size="regular"
          className="mt-auto pt-4"
        />
      </section>

      <section
        aria-label="Balances over twelve months"
        className="flex min-w-0 flex-col border-t border-hairline-soft p-5 lg:border-t-0 lg:border-l"
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-label text-ink-soft">Balances at month-end</p>
          {showIdbi ? <SeriesKey /> : null}
        </div>
        {last ? (
          <div className="mt-1.5 flex items-baseline justify-between gap-4">
            <p className="flex items-baseline gap-1.5">
              <Money value={last.total} short className="text-title text-ink" />
              <span className="text-label font-normal text-ink-faint">
                in {formatMonth(last.month, { year: false })}
              </span>
            </p>
            {yearChange !== null && first ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 text-caption font-normal text-ink-faint">
                <DeltaPill value={Math.round(yearChange * 10) / 10} />
                since {formatMonth(first.month)}
              </span>
            ) : null}
          </div>
        ) : null}
        {series.length > 1 ? (
          <AreaChart
            className="mt-auto pt-2"
            data={series.map((p) => ({ month: p.month, total: p.total, withIdbi: p.withIdbi }))}
            x="month"
            series={[
              { key: 'total', label: 'All banks' },
              ...(showIdbi
                ? [{ key: 'withIdbi', label: 'With IDBI', role: 'comparison' as const }]
                : []),
            ]}
            height={96}
            yAxis={false}
            label={`Balances across the book at each month-end, ${formatMonth(first?.month ?? '')} to ${formatMonth(last?.month ?? '')}`}
          />
        ) : (
          <p className="mt-6 text-label font-normal text-ink-faint">
            Not enough month-ends yet to draw a year of balances.
          </p>
        )}
      </section>

      <section
        aria-label="IDBI, SIPs and handoffs"
        className="flex min-w-0 flex-col border-t border-hairline-soft lg:border-t-0 lg:border-l"
      >
        <BandRow
          label="With IDBI"
          value={<Money value={totals.withIdbi} short />}
          note={
            derived.walletSharePct === null
              ? 'No balances to compare'
              : `${formatPct(Math.round(derived.walletSharePct))} of all balances`
          }
        />
        <BandRow
          label="Monthly SIP book"
          value={<Money value={totals.sipMonthly} short />}
          note={
            derived.sipCustomers === 0
              ? 'No SIP running in the book'
              : `${formatCount(derived.sipCustomers)} with a SIP running`
          }
        />
        <BandRow
          label="Open handoffs"
          value={<span className="tabular">{formatCount(totals.openHandoffs)}</span>}
          note={
            totals.openHandoffs === 0 ? (
              'Nobody is waiting on a call'
            ) : (
              <>
                Waiting on a call ·{' '}
                <button
                  type="button"
                  onClick={onShowHandoffs}
                  className="group inline-flex items-center gap-0.5 rounded-xs text-brand transition-colors hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-focus"
                >
                  Show in the list
                  <ArrowRight
                    aria-hidden
                    className="size-3 transition-transform duration-150 group-hover:translate-x-0.5"
                  />
                </button>
              </>
            )
          }
          last
        />
      </section>
    </Card>
  )
}

function BandRow({
  label,
  value,
  note,
  last = false,
}: {
  label: string
  value: ReactNode
  note: ReactNode
  last?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-1 items-center justify-between gap-4 px-5 py-3',
        !last && 'border-b border-hairline-soft',
      )}
    >
      <div className="min-w-0">
        <p className="text-label text-ink-soft">{label}</p>
        <div className="mt-0.5 truncate text-caption font-normal text-ink-faint">{note}</div>
      </div>
      <div className="shrink-0 text-title text-ink">{value}</div>
    </div>
  )
}

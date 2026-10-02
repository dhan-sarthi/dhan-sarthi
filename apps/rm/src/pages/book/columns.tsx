import type { BookRow } from '@dhan/contracts'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { formatAgo, formatCount, formatDate, formatPct } from '../../lib/format.ts'
import {
  AllocationBar,
  Avatar,
  HealthDot,
  Money,
  SEVERITY,
  SegmentBadge,
  Sparkline,
  StrengthBadge,
} from '../../ui/index.ts'
import { COLUMN_WIDTH } from './fit.ts'
import { HEALTH_RANK, STRENGTH_RANK, compareSignals, type SliceTotals } from './rows.ts'
import { SeverityMark } from './SeverityMark.tsx'

const col = createColumnHelper<BookRow>()

/** A fall this steep over three months turns the row's sparkline red: worth seeing at a glance. */
const STEEP_FALL_PCT = -15

export interface ColumnOptions {
  asOf: string
  totals: SliceTotals
  /** The signal column is shown; when it is not, the customer column takes the slack instead. */
  signal: boolean
}

function balanceLabel(row: BookRow): string {
  const change = row.balanceChange3mPct
  if (change === null) return 'Balances over 12 months'
  const way = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  return `Balances over 12 months; ${way} ${formatPct(Math.abs(change))} in the last 3`
}

/**
 * The book table's columns. Every column id is a `SortKey` or a `BookColumnId`, so the fit
 * logic, the Sort menu and the header clicks all name the same thing.
 */
export function bookColumns({
  asOf,
  totals,
  signal,
}: ColumnOptions): // TanStack's column type is invariant in its value type; the kit's table takes `any` for
// the same reason, and each column below is still checked where it is defined.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
ColumnDef<BookRow, any>[] {
  // With the signal column hidden the customer column has no fixed width and takes the slack,
  // so the names get the room rather than a gap opening at the end of the row.
  const width = (id: keyof typeof COLUMN_WIDTH): number => COLUMN_WIDTH[id]

  return [
    col.accessor('name', {
      id: 'name',
      header: 'Customer',
      meta: signal ? { width: width('name') } : {},
      cell: ({ row: { original: r } }) => (
        // `data-cif` lets the page find the row a keyboard user has moved focus to, so the
        // preview can follow the arrow keys without the table knowing about it.
        <div data-cif={r.cif} className="flex min-w-0 items-center gap-2.5">
          <Avatar name={r.name} initials={r.initials} size="sm" />
          <div className="min-w-0">
            <div className="truncate text-label text-ink">{r.name}</div>
            {/* The request rides on the second line: the name is what the RM reads first,
                and a chip beside it would cut a long name down to its first syllable. */}
            <div className="truncate text-caption font-normal text-ink-faint">
              {r.openHandoff ? (
                <span className="font-medium text-streak-ink">Asked for you · </span>
              ) : null}
              {r.age} · {r.city}
            </div>
          </div>
        </div>
      ),
      footer: () => (
        <span className="text-ink">
          {formatCount(totals.customers)} {totals.customers === 1 ? 'customer' : 'customers'}
        </span>
      ),
    }),

    col.accessor('segment', {
      id: 'segment',
      header: 'Segment',
      enableSorting: false,
      meta: { width: width('segment') },
      cell: (c) => <SegmentBadge segment={c.getValue()} />,
    }),

    col.accessor('relationshipValue', {
      id: 'value',
      header: 'Relationship value',
      sortDescFirst: true,
      meta: { width: width('value'), align: 'right' },
      cell: ({ row: { original: r } }) => {
        const fall = r.balanceChange3mPct !== null && r.balanceChange3mPct <= STEEP_FALL_PCT
        const share = r.walletSharePct
        return (
          <div className="flex items-center justify-end gap-3">
            <Sparkline
              values={r.balanceSeries.map((p) => p.total)}
              width={52}
              height={20}
              tone={fall ? 'danger' : 'neutral'}
              endDot={false}
              label={balanceLabel(r)}
            />
            <div className="min-w-[4.25rem] text-right">
              <Money value={r.relationshipValue} short className="text-label text-ink" />
              {/* Only where some of it sits at another bank: the exception is the news. */}
              {share !== null && share < 99.5 ? (
                <div className="text-caption font-normal whitespace-nowrap text-ink-faint">
                  {formatPct(Math.round(share))} IDBI
                </div>
              ) : null}
            </div>
          </div>
        )
      },
      footer: () => (
        <Money value={totals.relationshipValue} short className="font-semibold text-ink" />
      ),
    }),

    col.display({
      id: 'allocation',
      header: 'Allocation',
      meta: { width: width('allocation') },
      cell: ({ row: { original: r } }) => <AllocationBar allocation={r.allocation} />,
      footer: () => <AllocationBar allocation={totals.allocation} />,
    }),

    col.accessor((r) => HEALTH_RANK[r.goal.health], {
      id: 'goal',
      header: 'Goal',
      sortDescFirst: true,
      meta: { width: width('goal') },
      cell: ({ row: { original: r } }) => (
        <div className="min-w-0">
          <HealthDot health={r.goal.health} />
          <div className="truncate pl-3.5 text-caption font-normal text-ink-faint">
            {r.goal.label}
          </div>
        </div>
      ),
      footer: () => `${formatCount(totals.onTrack)} on track`,
    }),

    col.accessor('topSignal', {
      id: 'signal',
      header: 'Top signal',
      sortDescFirst: true,
      sortingFn: (a, b) => compareSignals(a.original.topSignal, b.original.topSignal),
      cell: ({ row: { original: r } }) => {
        const top = r.topSignal
        if (!top) {
          return <span className="text-label font-normal text-ink-hint">Nothing to act on</span>
        }
        const more = r.signalCount - 1
        // Two lines, like every other cell in the row: the title gets the column's full width,
        // and the severity keeps its word without a chip eating a third of the room.
        return (
          <div className="min-w-0">
            <p title={top.title} className="truncate text-label font-normal text-ink">
              {top.title}
            </p>
            <p className="flex items-center gap-1.5 text-caption font-normal text-ink-faint">
              <SeverityMark severity={top.severity} size="xs" />
              <span className="truncate">
                {SEVERITY[top.severity].label}
                {more > 0 ? ` · ${more} more` : ''}
              </span>
            </p>
          </div>
        )
      },
      footer: () =>
        totals.actNow === 0 ? (
          'None to act on now'
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <SeverityMark severity="urgent" size="xs" />
            {formatCount(totals.actNow)} {SEVERITY.urgent.label.toLowerCase()}
          </span>
        ),
    }),

    col.accessor((r) => STRENGTH_RANK[r.strength.level], {
      id: 'strength',
      header: 'Strength',
      meta: { width: width('strength') },
      cell: ({ row: { original: r } }) => <StrengthBadge strength={r.strength} />,
      footer: () => `${formatCount(totals.lowStrength)} low`,
    }),

    // An empty string sorts below every date, so "most recent first" puts never-active last and
    // the reverse puts them first: the customers nobody has heard from are the ones to find.
    col.accessor((r) => r.lastActivityAt ?? '', {
      id: 'activity',
      header: 'Last active',
      sortDescFirst: true,
      sortingFn: 'basic',
      meta: { width: width('activity') },
      cell: ({ row: { original: r } }) =>
        r.lastActivityAt ? (
          <span title={formatDate(r.lastActivityAt)} className="text-label font-normal text-ink">
            {formatAgo(r.lastActivityAt, asOf)}
          </span>
        ) : (
          <span className="text-label font-normal text-ink-hint">No activity</span>
        ),
      footer: () => (
        <span title="Customers with any activity in the 30 days to the as-of date">
          {formatCount(totals.activeIn30Days)} in 30 days
        </span>
      ),
    }),

    // Sort-only: the sparkline draws it, the Sort menu orders by it.
    col.accessor((r) => r.balanceChange3mPct ?? undefined, {
      id: 'change',
      header: '3-month change',
      sortUndefined: 'last',
    }),
  ]
}

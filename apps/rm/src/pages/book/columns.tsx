import type { BookRow, Segment } from '@dhan/contracts'
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { MessageCircle } from 'lucide-react'
import { cn } from '../../lib/cn.ts'
import {
  formatCount,
  formatDate,
  formatInrProse,
  formatLastActive,
  formatMonth,
  formatPct,
} from '../../lib/format.ts'
import {
  AllocationBar,
  Avatar,
  HEALTH,
  HealthDot,
  Money,
  SEVERITY,
  SegmentBadge,
  SeverityMark,
  Sparkline,
  StrengthBadge,
} from '../../ui/index.ts'
import type { ColumnFit } from './fit.ts'
import {
  ASKED_FOR_YOU,
  HEALTH_RANK,
  STRENGTH_RANK,
  compareSignals,
  goalRowLabel,
  splitSignalTitle,
  type SliceTotals,
} from './rows.ts'

const col = createColumnHelper<BookRow>()

/** A fall this steep over three months turns the row's balances line red: worth seeing at a glance. */
const STEEP_FALL_PCT = -15

export interface ColumnOptions {
  asOf: string
  totals: SliceTotals
  fit: Pick<ColumnFit, 'signal' | 'widths' | 'slim'>
  /** "12 month-ends, Sep 2025 to Aug 2026": what every sparkline draws. */
  seriesLabel: string
  /** "As at 1 Sep 2026": what the figures are as at. */
  asOfLabel: string
  /** Mark the rows whose customer asked for a call. */
  askedChip: boolean
}

function balanceLabel(row: BookRow, seriesLabel: string): string {
  const change = row.balanceChange3mPct
  if (change === null) return `Balances, ${seriesLabel}`
  const way = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  return `Balances, ${seriesLabel}; ${way} ${formatPct(Math.abs(change))} over the last three`
}

/** The goal in one sentence, for the cell's tooltip: "Retirement, ₹11.1Cr by Sep 2042". */
function goalSentence(goal: BookRow['goal']): string {
  return `${goal.label}, ${formatInrProse(goal.targetAmount)} by ${formatMonth(goal.targetDate)} · ${HEALTH[goal.health].label}`
}

/**
 * The book table's columns. Every column id is a `SortKey` or a `BookColumnId`, so the fit
 * logic, the Sort menu and the header clicks all name the same thing.
 */
export function bookColumns({
  asOf,
  totals,
  fit,
  seriesLabel,
  asOfLabel,
  askedChip,
}: ColumnOptions): // TanStack's column type is invariant in its value type; the kit's table takes `any` for
// the same reason, and each column below is still checked where it is defined.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
ColumnDef<BookRow, any>[] {
  const { signal, widths, slim } = fit

  return [
    col.accessor('name', {
      id: 'name',
      header: 'Customer',
      // With the signal column hidden the customer column has no fixed width and takes the
      // slack, so the names get the room rather than a gap opening at the end of the row.
      meta: signal ? { width: widths.name } : {},
      cell: ({ row: { original: r } }) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={r.name} initials={r.initials} size="sm" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-label text-ink">{r.name}</span>
              {/* The request rides in the signal cell; with that column stepped aside, a mark
                  beside the name keeps it from vanishing. */}
              {r.openHandoff && askedChip && !signal ? (
                <span
                  role="img"
                  aria-label={ASKED_FOR_YOU}
                  title={ASKED_FOR_YOU}
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-xs bg-streak-soft text-streak-ink [&_svg]:size-2.5"
                >
                  <MessageCircle aria-hidden strokeWidth={2.5} />
                </span>
              ) : null}
            </div>
            <div className="truncate text-caption-plain text-ink-faint">
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
      meta: { width: widths.segment },
      cell: (c) => {
        const segment: Segment = c.getValue()
        return <SegmentBadge segment={segment} variant="quiet" />
      },
    }),

    col.accessor('relationshipValue', {
      id: 'value',
      header: slim ? 'Value' : 'Relationship value',
      sortDescFirst: true,
      meta: { width: widths.value, align: 'right' },
      // What sits with IDBI, in rupees, under everything the customer holds at any bank: the same
      // words as the rail and the band. A share would need its base said beside it ("82% of
      // balances"), and the base is not the figure above it, so the row gives the rupees.
      // Each line is a flex row packed to the end, so a line too long for the slim column grows
      // into the cell's left padding rather than out past the right edge.
      cell: ({ row: { original: r } }) => (
        <div className="grid">
          <span className="flex justify-end">
            <Money value={r.relationshipValue} short className="text-label text-ink" />
          </span>
          <span className="flex justify-end text-caption-plain whitespace-nowrap text-ink-faint">
            <span>
              <Money value={r.withIdbi} short className="text-ink-soft" /> with IDBI
            </span>
          </span>
        </div>
      ),
      footer: () => (
        <span title={asOfLabel}>
          <Money value={totals.relationshipValue} short className="font-semibold text-ink" />
        </span>
      ),
    }),

    // Balances at every bank over the twelve month-ends, under a header of its own: beside the
    // relationship value the line read as that figure's trend, and it is a different measure.
    col.display({
      id: 'balances',
      header: () => <span title={`Balances at every bank, ${seriesLabel}`}>Balances</span>,
      meta: { width: widths.balances },
      cell: ({ row: { original: r } }) => {
        const fall = r.balanceChange3mPct !== null && r.balanceChange3mPct <= STEEP_FALL_PCT
        return (
          <Sparkline
            values={r.balanceSeries.map((p) => p.total)}
            width={48}
            height={20}
            tone={fall ? 'danger' : 'neutral'}
            endDot={false}
            label={balanceLabel(r, seriesLabel)}
          />
        )
      },
    }),

    col.display({
      id: 'allocation',
      header: 'Allocation',
      meta: { width: widths.allocation },
      cell: ({ row: { original: r } }) => <AllocationBar allocation={r.allocation} />,
      footer: () => <AllocationBar allocation={totals.allocation} />,
    }),

    // Goal health is a dot and a word in ink: the dot's colour and shape carry the health, and
    // red text stays for the one thing that is red, a signal marked Act now.
    col.accessor((r) => HEALTH_RANK[r.goal.health], {
      id: 'goal',
      header: 'Goal',
      sortDescFirst: true,
      meta: { width: widths.goal },
      cell: ({ row: { original: r } }) => (
        <div className="min-w-0" title={goalSentence(r.goal)}>
          <HealthDot health={r.goal.health} className="text-ink" />
          {slim ? null : (
            <div className="truncate text-caption-plain text-ink-faint">{goalRowLabel(r.goal)}</div>
          )}
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
        const asked = r.openHandoff && askedChip ? <AskedChip /> : null
        if (!top) {
          return (
            <div className="min-w-0">
              <p className="text-label-plain text-ink-faint">Nothing to act on</p>
              {asked ? <p className="mt-0.5 flex">{asked}</p> : null}
            </div>
          )
        }
        const more = r.signalCount - 1
        const { head, tail } = splitSignalTitle(top.title)
        const urgent = top.severity === 'urgent'
        // Two lines, like every other cell in the row: what happened on the first, at the
        // column's full width; the severity, the rest of the title and the count on the second.
        // Nothing is cut mid-sentence on purpose: the title is split where it already breaks.
        return (
          <div className="min-w-0" title={top.title}>
            <p className="truncate text-label-plain text-ink">{head}</p>
            <p className="flex min-w-0 items-center gap-1.5 text-caption-plain text-ink-faint">
              {asked}
              <SeverityMark severity={top.severity} size="xs" />
              <span className="truncate">
                <span className={cn(urgent && 'font-medium text-danger')}>
                  {SEVERITY[top.severity].label}
                </span>
                {tail ? ` · ${tail}` : ''}
                {more > 0 ? ` · ${formatCount(more)} more` : ''}
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
      meta: { width: widths.strength },
      cell: ({ row: { original: r } }) => <StrengthBadge strength={r.strength} />,
    }),

    // An empty string sorts below every date, so "most recent first" puts never-active last and
    // the reverse puts them first: the customers nobody has heard from are the ones to find.
    col.accessor((r) => r.lastActivityAt ?? '', {
      id: 'activity',
      header: 'Last active',
      sortDescFirst: true,
      sortingFn: 'basic',
      meta: { width: widths.activity },
      cell: ({ row: { original: r } }) =>
        r.lastActivityAt ? (
          <span title={formatDate(r.lastActivityAt)} className="text-label-plain text-ink">
            {formatLastActive(r.lastActivityAt, asOf)}
          </span>
        ) : (
          <span className="text-label-plain text-ink-faint">No activity</span>
        ),
    }),

    // Sort-only: the balances line draws it, the Sort menu orders by it.
    col.accessor((r) => r.balanceChange3mPct ?? undefined, {
      id: 'change',
      header: '3-month change',
      sortUndefined: 'last',
    }),
  ]
}

/** The customer asked for a call from the app: the same words as Today's list and the rail. */
export function AskedChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-4 shrink-0 items-center gap-1 rounded-xs bg-streak-soft px-1 text-caption leading-none font-medium whitespace-nowrap text-streak-ink [&_svg]:size-2.5',
        className,
      )}
    >
      <MessageCircle aria-hidden strokeWidth={2.5} />
      {ASKED_FOR_YOU}
    </span>
  )
}

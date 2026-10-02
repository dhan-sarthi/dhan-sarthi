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
import { SeverityMark } from './SeverityMark.tsx'

const col = createColumnHelper<BookRow>()

/** A fall this steep over three months turns the row's sparkline red: worth seeing at a glance. */
const STEEP_FALL_PCT = -15

/**
 * The segment as one family of tints, deepest for Priority. A segment is context, not the action,
 * so it never carries the heaviest mark on the row; the word is the same in every tint.
 */
export const SEGMENT_TINT: Readonly<Record<Segment, string>> = {
  priority: 'bg-brand-soft text-ink',
  affluent: 'bg-brand-wash text-ink-soft',
  mass: 'bg-transparent text-ink-faint ring-1 ring-hairline ring-inset',
}

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
            <div className="truncate text-caption font-normal text-ink-faint">
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
        return <SegmentBadge segment={segment} className={SEGMENT_TINT[segment]} />
      },
    }),

    col.accessor('relationshipValue', {
      id: 'value',
      header: slim ? 'Value' : 'Relationship value',
      sortDescFirst: true,
      meta: { width: widths.value, align: 'right' },
      cell: ({ row: { original: r } }) => {
        const fall = r.balanceChange3mPct !== null && r.balanceChange3mPct <= STEEP_FALL_PCT
        const share = r.walletSharePct
        return (
          <div className="flex items-center justify-end gap-2.5">
            {/* Beside the rail the rail draws the balances, so the row keeps only the figure. */}
            {slim ? null : (
              <Sparkline
                values={r.balanceSeries.map((p) => p.total)}
                width={48}
                height={20}
                tone={fall ? 'danger' : 'neutral'}
                endDot={false}
                label={balanceLabel(r, seriesLabel)}
              />
            )}
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
        <span title={asOfLabel}>
          <Money value={totals.relationshipValue} short className="font-semibold text-ink" />
        </span>
      ),
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
            <div className="truncate text-caption font-normal text-ink-faint">
              {goalRowLabel(r.goal)}
            </div>
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
              <p className="text-label font-normal text-ink-hint">Nothing to act on</p>
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
            <p className="truncate text-label font-normal text-ink">{head}</p>
            <p className="flex min-w-0 items-center gap-1.5 text-caption font-normal text-ink-faint">
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
          <span title={formatDate(r.lastActivityAt)} className="text-label font-normal text-ink">
            {formatLastActive(r.lastActivityAt, asOf)}
          </span>
        ) : (
          <span className="text-label font-normal text-ink-hint">No activity</span>
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

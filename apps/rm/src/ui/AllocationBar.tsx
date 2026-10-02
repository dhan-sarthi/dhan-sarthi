import type { Allocation } from '@dhan/contracts'
import { cn } from '../lib/cn.ts'
import { formatInr, formatPct } from '../lib/format.ts'
import { useBadgeTabIndex } from './interactive-row.tsx'
import { Tooltip } from './Tooltip.tsx'

/**
 * Fixed order and fixed colours, so equity is the same green in every row of the book. The `cash`
 * class is every bank balance, fixed deposits included, so it is named for what it holds: a
 * banker reads "cash" as idle money.
 */
export const ALLOCATION_PARTS = [
  { key: 'equity', label: 'Equity', fill: 'bg-chart-equity' },
  { key: 'fixed', label: 'Fixed income', fill: 'bg-chart-fixed' },
  { key: 'cash', label: 'Deposits & cash', fill: 'bg-chart-cash' },
] as const satisfies readonly { key: keyof Allocation; label: string; fill: string }[]

export interface AllocationBarProps {
  allocation: Allocation
  /** Draw the three-part legend with percentages under the bar. */
  legend?: boolean
  /** `thin` for a table cell, `regular` for a rail or a card. */
  size?: 'thin' | 'regular'
  className?: string
}

function shares(
  allocation: Allocation,
): { key: keyof Allocation; label: string; fill: string; value: number; pct: number }[] {
  const total = allocation.cash + allocation.equity + allocation.fixed
  return ALLOCATION_PARTS.map((p) => ({
    ...p,
    value: allocation[p.key],
    pct: total > 0 ? (allocation[p.key] / total) * 100 : 0,
  }))
}

/**
 * Cash, equity and fixed income as one thin stacked bar: enough to spot a customer sitting in
 * cash without opening the file. Segments are separated by a 2px gap of the surface, so two
 * neighbours never merge; the tooltip and the legend carry the figures.
 */
export function AllocationBar({
  allocation,
  legend = false,
  size = 'thin',
  className,
}: AllocationBarProps) {
  const parts = shares(allocation)
  const total = parts.reduce((s, p) => s + p.value, 0)
  const summary = parts.map((p) => `${p.label} ${formatPct(Math.round(p.pct))}`).join(', ')
  const badgeTab = useBadgeTabIndex()

  const bar = (
    <div
      role="img"
      aria-label={total > 0 ? summary : 'No balances or holdings'}
      tabIndex={legend ? undefined : badgeTab}
      className={cn(
        'flex w-full gap-[2px] overflow-hidden rounded-full focus-visible:outline-2 focus-visible:outline-focus',
        size === 'thin' ? 'h-1.5' : 'h-2.5',
        total === 0 && 'bg-ground-deep',
      )}
    >
      {parts
        .filter((p) => p.pct > 0)
        .map((p) => (
          <span
            key={p.key}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', p.fill)}
            style={{ flexGrow: p.pct, flexBasis: 0, minWidth: 3 }}
          />
        ))}
    </div>
  )

  return (
    <div className={cn('grid gap-2', className)}>
      {legend ? (
        bar
      ) : (
        <Tooltip
          content={
            <div className="grid gap-1">
              {parts.map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn('size-2 rounded-full', p.fill)} aria-hidden />
                    {p.label}
                  </span>
                  <span className="tabular">
                    {formatInr(p.value, { short: true })} · {formatPct(Math.round(p.pct))}
                  </span>
                </div>
              ))}
            </div>
          }
        >
          {bar}
        </Tooltip>
      )}
      {legend ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-soft">
          {parts.map((p) => (
            <li key={p.key} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', p.fill)} aria-hidden />
              {p.label}
              <span className="tabular text-ink">{formatPct(Math.round(p.pct))}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

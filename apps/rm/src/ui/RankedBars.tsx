import { ListFilter, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, type To } from 'react-router'
import { cn } from '../lib/cn.ts'
import { formatCount } from '../lib/format.ts'
import { Tooltip } from './Tooltip.tsx'

export interface RankedBarRow {
  id: string
  label: ReactNode
  count: number
  /** The bar's fill: brand by default, a severity's (`SEVERITY.urgent.fill`) where it means one. */
  fill?: string
  /** The row opens a filtered view on another page. */
  to?: To
  /** The row's name for a screen reader when it is a link. */
  linkLabel?: string
  /** One hover or focus away: the rule's own sentence, the share of the whole. */
  tooltip?: ReactNode
}

export interface RankedBarsProps {
  rows: readonly RankedBarRow[]
  /** The longest bar's count. Left out, the largest count among the rows. */
  max?: number
  /** What the list is, for a screen reader. */
  label: string
  /** The widest a label may take before it wraps; size it so the longest label does not. */
  labelWidth?: string
  /**
   * The rows are a filter: each is a toggle (`aria-pressed`), the chosen one keeps its fill and the
   * rest go to the context grey, and the row's end mark becomes the ✕ that clears it.
   */
  filter?: { selected: string | null; onSelect: (id: string | null) => void }
  id?: string
  className?: string
}

/**
 * Counts by kind as a ranked list of thin bars, one measure and one row anatomy wherever it
 * appears (signals by kind on Insights, refusals by rule on the advice record): the label, a bar on
 * a track, the count printed rather than hidden in a hover, and, for a filter, the mark at the
 * end. Bars are HTML rather than a chart library's: the label wraps instead of being cut at an
 * axis width, and each row is a real link or button. The longest bar sets the scale, and every bar
 * keeps 3px so a count of one is still seen.
 */
export function RankedBars({
  rows,
  max,
  label,
  labelWidth = '11rem',
  filter,
  id,
  className,
}: RankedBarsProps) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.count))
  const columns = {
    gridTemplateColumns: `minmax(7rem,${labelWidth}) minmax(0,1fr) 2.25rem${filter ? ' 1rem' : ''}`,
  }
  const row = 'grid w-full items-center gap-x-3 rounded-md px-2 py-1.5 text-left'
  const interactive = cn(
    'transition-colors duration-feedback hover:bg-row-hover',
    'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
  )

  return (
    <ul className={cn('-mx-2 grid gap-0.5', className)} aria-label={label} id={id}>
      {rows.map((r) => {
        const active = filter?.selected === r.id
        const dimmed = filter !== undefined && filter.selected !== null && !active
        const body = (
          <>
            <span className={cn('text-label', dimmed ? 'text-ink-faint' : 'text-ink')}>
              {r.label}
            </span>
            <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-ground-deep">
              <span
                className={cn(
                  'block h-full rounded-full transition-colors duration-state',
                  dimmed ? 'bg-chart-context-bar' : (r.fill ?? 'bg-brand'),
                )}
                style={{ width: `max(${Math.min(100, (r.count / top) * 100)}%, 3px)` }}
              />
            </span>
            <span
              className={cn(
                'text-right text-label tabular',
                dimmed ? 'text-ink-faint' : 'text-ink',
              )}
            >
              {formatCount(r.count)}
            </span>
            {filter ? (
              <span
                aria-hidden
                className={cn(
                  'inline-flex justify-end transition-opacity duration-feedback [&_svg]:size-3.5',
                  active
                    ? 'text-brand-deep opacity-100'
                    : 'text-ink-faint opacity-0 group-hover/bar:opacity-100 group-focus-visible/bar:opacity-100',
                )}
              >
                {active ? <X /> : <ListFilter />}
              </span>
            ) : null}
          </>
        )

        const control = filter ? (
          <button
            type="button"
            aria-pressed={active}
            onClick={() => filter.onSelect(active ? null : r.id)}
            className={cn(
              row,
              interactive,
              'group/bar cursor-pointer',
              active && 'bg-brand-wash ring-1 ring-selected-edge ring-inset hover:bg-brand-wash',
            )}
            style={columns}
          >
            {body}
          </button>
        ) : r.to !== undefined ? (
          <Link to={r.to} aria-label={r.linkLabel} className={cn(row, interactive)} style={columns}>
            {body}
          </Link>
        ) : (
          <div className={row} style={columns}>
            {body}
          </div>
        )

        return (
          <li key={r.id}>
            {r.tooltip && (filter || r.to !== undefined) ? (
              <Tooltip side="left" content={r.tooltip}>
                {control}
              </Tooltip>
            ) : (
              control
            )}
          </li>
        )
      })}
    </ul>
  )
}

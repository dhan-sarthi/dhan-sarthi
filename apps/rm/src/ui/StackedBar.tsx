import type { ComponentProps } from 'react'
import { cn } from '../lib/cn.ts'

export interface StackedPart {
  id: string
  value: number
  /** The part's fill class: `bg-chart-equity`, `SEGMENT.priority.fill`. */
  fill: string
}

export interface StackedBarProps extends Omit<ComponentProps<'div'>, 'children'> {
  parts: readonly StackedPart[]
  /** The whole bar in words, for a screen reader: "Equity 42%, Fixed income 18%, …". */
  label: string
  /** `thin` for a table cell, `regular` for a rail or a card. */
  size?: 'thin' | 'regular'
}

/**
 * Part to whole in one bar: allocation in a book row, segments by customers and by value. Every
 * part keeps at least 3px, so a small share never vanishes, and the parts are separated by a 2px
 * gap of the surface under the bar, so two neighbours never merge. An empty whole draws the track.
 * The figures live beside the bar (a legend, a tooltip), never only in it.
 */
export function StackedBar({
  parts,
  label,
  size = 'regular',
  className,
  ...props
}: StackedBarProps) {
  const shown = parts.filter((p) => p.value > 0)
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'flex w-full gap-[2px] overflow-hidden rounded-full focus-visible:outline-2 focus-visible:outline-focus',
        size === 'thin' ? 'h-1.5' : 'h-2.5',
        shown.length === 0 && 'bg-ground-deep',
        className,
      )}
      {...props}
    >
      {shown.map((p) => (
        <span
          key={p.id}
          className={cn('h-full first:rounded-l-full last:rounded-r-full', p.fill)}
          style={{ flexGrow: p.value, flexBasis: 0, minWidth: 3 }}
        />
      ))}
    </div>
  )
}

import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * A page's title block. The title states the thing ("Book"); the subtitle leads with the number
 * ("46 customers · ₹12.4Cr we can see"). Actions sit on the right, the primary one last.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  leading,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  leading?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0">
          <h1 className="text-display text-ink">{title}</h1>
          {subtitle ? <div className="mt-1 text-body text-ink-soft">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export interface Property {
  label: ReactNode
  value: ReactNode
}

/**
 * Typed attributes down a rail: label left, value right, a hairline between groups rather than
 * between every row. "Risk profile — Balanced".
 */
export function PropertyList({
  items,
  className,
  layout = 'rows',
  labelWidth = 'regular',
}: {
  items: readonly Property[]
  className?: string
  /** `rows` for a narrow rail, `grid` for a wide card (two columns of pairs). */
  layout?: 'rows' | 'grid'
  /** `narrow` for a rail under ~320px, so a value like "Married · 2 dependents" keeps one line. */
  labelWidth?: 'regular' | 'narrow'
}) {
  return (
    <dl
      className={cn(
        layout === 'grid' ? 'grid grid-cols-2 gap-x-8 gap-y-3' : 'grid gap-2.5',
        className,
      )}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className={cn(
            'grid items-baseline gap-3 text-label',
            labelWidth === 'narrow'
              ? 'grid-cols-[6.75rem_minmax(0,1fr)]'
              : 'grid-cols-[8.5rem_minmax(0,1fr)]',
          )}
        >
          <dt className="text-label-plain text-ink-faint">{item.label}</dt>
          <dd className="min-w-0 text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { Card, CardHeader, LoadingRegion, Skeleton, SkeletonText } from '../../ui/index.ts'

/*
 * Small pieces the customer file's tabs share. Page-local on purpose: each is a layout habit of
 * this one page (a middle dot between facts, a share-of-a-whole meter), not a kit primitive.
 */

/** The middle dot between facts on one line: "30 · Pune · Balanced". Silent to a screen reader. */
export function Dot() {
  return (
    <span aria-hidden className="text-ink-hint select-none">
      ·
    </span>
  )
}

/**
 * One share of a whole, as a thin bar: life cover against the need, IDBI against every bank.
 * The figure beside it is the number; the bar is only its proportion, so it never stands alone.
 */
export function Meter({
  value,
  max,
  tone = 'brand',
  label,
  className,
}: {
  value: number
  max: number
  tone?: 'brand' | 'danger' | 'streak'
  /** What the bar shows, for a screen reader: "26% of balances with IDBI". */
  label: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ground-deep', className)}
    >
      <div
        className={cn(
          'h-full rounded-full',
          tone === 'brand' && 'bg-brand',
          tone === 'danger' && 'bg-danger',
          tone === 'streak' && 'bg-streak',
        )}
        // A sliver stays visible so "almost none" never reads as "none at all".
        style={{ width: `${pct > 0 ? Math.max(pct, 1.5) : 0}%` }}
      />
    </div>
  )
}

/** A small figure with its label above it, for the fact rows inside a card. */
export function Fact({
  label,
  children,
  hint,
  className,
}: {
  label: ReactNode
  children: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-caption text-ink-faint">{label}</dt>
      <dd className="mt-1 text-heading text-ink tabular">{children}</dd>
      {hint ? <dd className="mt-0.5 text-caption-plain text-ink-soft">{hint}</dd> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Skeletons */

/** A card-shaped placeholder with a title bar and lines, in the tab's own layout. */
export function CardSkeleton({
  lines = 4,
  rows,
  className,
}: {
  lines?: number
  /** Draw list rows (icon, two lines, a figure) instead of a paragraph. */
  rows?: number
  className?: string
}) {
  return (
    <Card className={className}>
      <Skeleton className="mb-5 h-3 w-28" />
      {rows !== undefined ? (
        <div className="grid gap-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : (
        <SkeletonText lines={lines} />
      )}
    </Card>
  )
}

/**
 * A tab's column of cards. The single track is `minmax(0, 1fr)`, not `auto`: an auto track grows
 * to the widest nowrap text inside it (a long fund name, a desk line), and the card would push
 * out of its column instead of truncating.
 */
export const TAB_STACK = 'grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6'

export function TabLoading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <LoadingRegion label={label} className={TAB_STACK}>
      {children}
    </LoadingRegion>
  )
}

/** A card whose header is the kit's, so every block on the file opens the same way. */
export function Block({
  title,
  count,
  actions,
  children,
  className,
  footer,
}: {
  title: ReactNode
  count?: number
  actions?: ReactNode
  children: ReactNode
  className?: string
  footer?: ReactNode
}) {
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        {...(count !== undefined ? { count } : {})}
        {...(actions ? { actions } : {})}
      />
      {children}
      {footer}
    </Card>
  )
}

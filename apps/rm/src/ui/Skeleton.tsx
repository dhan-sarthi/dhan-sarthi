import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

/**
 * The shape of the content before it arrives. A page loads into skeletons of its real layout,
 * never a spinner in the middle of nothing.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div aria-hidden className={cn('skeleton-shimmer rounded-sm', className)} {...props} />
}

/** A few lines of text, the last one shorter, as a paragraph looks. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('grid gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  )
}

/** A KPI tile's skeleton: label, figure, delta, at the sizes `<Stat>` draws them. */
export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('grid gap-3', className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-20" />
    </div>
  )
}

/** Announces loading once for assistive tech; the skeletons themselves are silent. */
export function LoadingRegion({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

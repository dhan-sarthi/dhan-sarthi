import type { ReactNode } from 'react'
import { Card, LoadingRegion, Skeleton, SkeletonStat, SkeletonText } from '../ui/index.ts'

/*
 * Skeletons in the shape of each page's real layout, used while a page is still being built and,
 * later, while its data loads. Shared so every page loads into the same quiet grey.
 */

export function KpiStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <SkeletonStat />
        </Card>
      ))}
    </div>
  )
}

export function ListCardSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <Card className={className}>
      <Skeleton className="mb-5 h-3 w-28" />
      <div className="grid gap-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </Card>
  )
}

export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <Card padded={false}>
      <div className="flex h-9 items-center gap-6 border-b border-hairline px-4">
        {[28, 14, 18, 16, 14, 20].map((w, i) => (
          <Skeleton key={i} className="h-2.5" style={{ width: `${w}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex h-row items-center gap-6 border-b border-hairline-soft px-4 last:border-0"
        >
          <div className="flex w-[28%] items-center gap-2.5">
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <Skeleton className="h-3 flex-1" />
          </div>
          {[14, 18, 16, 14, 20].map((w, j) => (
            <Skeleton key={j} className="h-3" style={{ width: `${w}%` }} />
          ))}
        </div>
      ))}
    </Card>
  )
}

export function ChartGridSkeleton({ tiles = 6 }: { tiles?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: tiles }, (_, i) => (
        <Card key={i}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-28" />
          <Skeleton className="mt-5 h-24 w-full" />
        </Card>
      ))}
    </div>
  )
}

export function ProseCardSkeleton() {
  return (
    <Card>
      <Skeleton className="mb-4 h-3 w-32" />
      <SkeletonText lines={4} />
    </Card>
  )
}

export function PageLoading({ label, children }: { label: string; children: ReactNode }) {
  return <LoadingRegion label={label}>{children}</LoadingRegion>
}

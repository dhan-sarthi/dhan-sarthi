import type { ReactNode } from 'react'
import { Card, LoadingRegion, Skeleton } from '../ui/index.ts'

/*
 * Loading shapes shared by more than one page's skeleton (`shell/RouteFallbacks.tsx`), so every
 * page loads into the same quiet grey. A shape only one page draws lives with that page.
 */

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

export function PageLoading({ label, children }: { label: string; children: ReactNode }) {
  return <LoadingRegion label={label}>{children}</LoadingRegion>
}

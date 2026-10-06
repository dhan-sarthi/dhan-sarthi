import { Card, Skeleton, SkeletonStat } from '../../ui/index.ts'
import { PageLoading } from '../placeholder.tsx'
import { KPI_GRID, kpiCellClass } from './KpiStrip.tsx'
import { TodayGrid } from './TodayGrid.tsx'

/** Today before it arrives: the same band, queue and side cards, in quiet grey. */
export function TodaySkeleton() {
  return (
    <PageLoading label="Loading today">
      <div className="grid grid-cols-1 gap-6">
        <Card padded={false} className="@container">
          <div className={KPI_GRID}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={kpiCellClass(i)}>
                <SkeletonStat />
              </div>
            ))}
          </div>
        </Card>
        <TodayGrid
          queue={
            <Card padded={false}>
              <div className="flex min-h-14 items-center gap-2 px-5 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-6 rounded-full" />
              </div>
              {Array.from({ length: 7 }, (_, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3.5 border-t border-hairline-soft px-5 py-3.5"
                >
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="grid flex-1 grid-cols-1 gap-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="ml-auto h-5 w-28" />
                    </div>
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                </div>
              ))}
            </Card>
          }
          upcoming={<SideCardSkeleton rows={5} />}
          refused={<SideCardSkeleton rows={3} />}
        />
      </div>
    </PageLoading>
  )
}

function SideCardSkeleton({ rows }: { rows: number }) {
  return (
    <Card>
      <Skeleton className="mb-5 h-3 w-28" />
      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="grid flex-1 grid-cols-1 gap-2">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

import { PageHeader, Skeleton } from '../../ui/index.ts'
import { ChartGridSkeleton, PageLoading } from '../placeholder.tsx'

export function Insights() {
  return (
    <>
      <PageHeader title="Insights" subtitle={<Skeleton className="mt-1 h-4 w-64" />} />
      <PageLoading label="Loading insights">
        <ChartGridSkeleton />
      </PageLoading>
    </>
  )
}

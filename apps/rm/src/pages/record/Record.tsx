import { PageHeader, Skeleton } from '../../ui/index.ts'
import { KpiStripSkeleton, PageLoading, TableSkeleton } from '../placeholder.tsx'

export function Record() {
  return (
    <>
      <PageHeader title="Mis-sales prevented" subtitle={<Skeleton className="mt-1 h-4 w-72" />} />
      <PageLoading label="Loading the advice record">
        <div className="grid gap-6">
          <KpiStripSkeleton count={3} />
          <TableSkeleton rows={8} />
        </div>
      </PageLoading>
    </>
  )
}

import { PageHeader, Skeleton } from '../../ui/index.ts'
import { PageLoading, TableSkeleton } from '../placeholder.tsx'

export function Access() {
  return (
    <>
      <PageHeader title="Access log" subtitle={<Skeleton className="mt-1 h-4 w-60" />} />
      <PageLoading label="Loading the access log">
        <TableSkeleton rows={10} />
      </PageLoading>
    </>
  )
}

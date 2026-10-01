import { PageHeader, Skeleton } from '../ui/index.ts'
import { PageLoading, TableSkeleton } from './placeholder.tsx'

export function Book() {
  return (
    <>
      <PageHeader title="Book" subtitle={<Skeleton className="mt-1 h-4 w-56" />} />
      <PageLoading label="Loading your book">
        <div className="grid gap-4">
          <Skeleton className="h-14 w-full rounded-lg" />
          <TableSkeleton rows={12} />
        </div>
      </PageLoading>
    </>
  )
}

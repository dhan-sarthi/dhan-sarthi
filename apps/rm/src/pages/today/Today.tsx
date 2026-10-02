import { useMe } from '../../api/queries.ts'
import { useSession } from '../../api/session.ts'
import { formatDate } from '../../lib/format.ts'
import { PageHeader, Skeleton } from '../../ui/index.ts'
import { KpiStripSkeleton, ListCardSkeleton, PageLoading } from '../placeholder.tsx'

/** The greeting goes by the wall clock; every figure under it goes by the as-of date. */
function greeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export function Today() {
  const session = useSession()
  const me = useMe()
  const first = session?.rm.name.split(' ')[0] ?? ''
  return (
    <>
      <PageHeader
        title={`${greeting()}, ${first}`}
        subtitle={
          me.data ? (
            `Your book as of ${formatDate(me.data.asOf)}`
          ) : (
            <Skeleton className="mt-1 h-4 w-40" />
          )
        }
      />
      <PageLoading label="Loading today">
        <div className="grid gap-6">
          <KpiStripSkeleton />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <ListCardSkeleton rows={8} />
            <div className="grid content-start gap-6">
              <ListCardSkeleton rows={3} />
              <ListCardSkeleton rows={3} />
              <ListCardSkeleton rows={4} />
            </div>
          </div>
        </div>
      </PageLoading>
    </>
  )
}

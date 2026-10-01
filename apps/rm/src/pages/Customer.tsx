import { Outlet, useParams } from 'react-router'
import { Card, LinkTabs, Skeleton } from '../ui/index.ts'
import { ListCardSkeleton, PageLoading, ProseCardSkeleton } from './placeholder.tsx'

/**
 * A customer's file. The tabs are addresses (`/customers/:cif/journey`), so a view can be
 * bookmarked or sent to a colleague, and the browser's back button walks the tabs.
 */
export function Customer() {
  const { cif = '' } = useParams()
  const base = `/customers/${encodeURIComponent(cif)}`
  return (
    <>
      <header className="mb-6 flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="grid gap-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3.5 w-80" />
        </div>
      </header>
      <PageLoading label="Loading the customer">
        <div className="mb-6 grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Card key={i} className="py-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2.5 h-5 w-24" />
            </Card>
          ))}
        </div>
      </PageLoading>
      <LinkTabs
        label="Customer file"
        className="mb-6"
        tabs={[
          { to: base, label: 'Overview', end: true },
          { to: `${base}/journey`, label: 'Journey' },
          { to: `${base}/money`, label: 'Money' },
          { to: `${base}/goals`, label: 'Goals & plan' },
          { to: `${base}/record`, label: 'Advice record' },
        ]}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Outlet />
        <div className="grid content-start gap-6">
          <ListCardSkeleton rows={4} />
        </div>
      </div>
    </>
  )
}

/** Each tab's body until its builder replaces it. */
export function CustomerTabPlaceholder() {
  return (
    <div className="grid content-start gap-6">
      <ProseCardSkeleton />
      <ListCardSkeleton rows={5} />
    </div>
  )
}

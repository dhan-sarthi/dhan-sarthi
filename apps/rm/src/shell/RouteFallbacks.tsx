import { useParams } from 'react-router'
import { useSession } from '../api/session.ts'
import { CardSkeleton, TabLoading } from '../pages/customer/parts.tsx'
import { InsightsSkeleton } from '../pages/insights/InsightsSkeleton.tsx'
import { PageLoading, TableSkeleton } from '../pages/placeholder.tsx'
import { firstName, greeting } from '../pages/today/derive.ts'
import { TodaySkeleton } from '../pages/today/TodaySkeleton.tsx'
import { Card, LinkTabs, LoadingRegion, PageHeader, Skeleton, SkeletonStat } from '../ui/index.ts'

/*
 * What each page shows while its chunk is on the way (`pages.ts`): the page's own loading state,
 * so the skeleton the RM sees first is the one the page then keeps until its data lands, and
 * nothing jumps when the code arrives. Never a spinner.
 *
 * Where a page keeps its skeleton in a module of its own (Today, Insights, the customer tabs,
 * the shared shapes in placeholder.tsx) it is imported from there. Where the skeleton lives
 * inside the page file itself (Book, the advice record, the customer header), importing it would
 * pull the whole page into the first chunk, so the same shape is drawn here from the same parts.
 */

export function TodayFallback() {
  const session = useSession()
  const name = session ? firstName(session.rm.name) : ''
  const hello = greeting(new Date().getHours())
  return (
    <>
      <PageHeader
        title={name ? `${hello}, ${name}` : hello}
        subtitle={<Skeleton className="mt-1 h-4 w-72" />}
      />
      <TodaySkeleton />
    </>
  )
}

/** Book's own loading state (`BookLoading` in Book.tsx): band, tabs, toolbar, table. */
export function BookFallback() {
  return (
    <>
      <PageHeader title="Book" subtitle={<Skeleton className="mt-1 h-4 w-64" />} />
      <PageLoading label="Loading your book">
        <div className="grid gap-5">
          <Card padded={false} className="grid h-[13.5rem] grid-cols-[1fr_1.3fr_0.95fr]">
            <div className="flex flex-col gap-3 p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-10 w-36" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="mt-auto h-2.5 w-full rounded-full" />
            </div>
            <div className="grid content-start gap-3 border-l border-hairline-soft p-5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="mt-2 h-24 w-full" />
            </div>
            <div className="grid content-start gap-5 border-l border-hairline-soft p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="grid gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-2.5 w-36" />
                  </div>
                  <Skeleton className="h-5 w-14" />
                </div>
              ))}
            </div>
          </Card>
          <Skeleton className="h-[3.25rem] w-full rounded-lg" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-control w-96 rounded-md" />
            <Skeleton className="ml-auto h-control w-80 rounded-md" />
          </div>
          <TableSkeleton rows={10} />
        </div>
      </PageLoading>
    </>
  )
}

/**
 * The customer file before its code arrives: the header and highlights in grey (the shape of
 * `HeaderSkeleton` in CustomerHeader.tsx), the real tab strip, a tab's cards and the profile rail.
 */
export function CustomerFallback() {
  const { cif = '' } = useParams()
  const base = `/customers/${encodeURIComponent(cif)}`
  return (
    <>
      <LoadingRegion label="Loading the customer">
        <header className="mb-6 flex items-start justify-between gap-8">
          <div className="flex items-start gap-4">
            <Skeleton className="size-16 rounded-full" />
            <div className="grid gap-2.5 pt-1">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-4 w-96" />
              <Skeleton className="h-3.5 w-80" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-control w-28 rounded-md" />
            <Skeleton className="h-control w-28 rounded-md" />
          </div>
        </header>
        <Card padded={false} className="mb-6">
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.35fr)_minmax(0,1fr)] divide-x divide-hairline-soft">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="grid gap-2 px-5 py-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        </Card>
      </LoadingRegion>
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
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18.75rem] min-[87.5rem]:grid-cols-[minmax(0,1fr)_20rem]">
        <CustomerTabFallback />
        <Card aria-hidden>
          <Skeleton className="mb-5 h-3 w-16" />
          <div className="grid gap-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="grid grid-cols-[7rem_1fr] gap-3">
                <Skeleton className="h-3" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

/** One customer tab before its code arrives: the cards every tab opens with. */
export function CustomerTabFallback() {
  return (
    <TabLoading label="Loading the tab">
      <CardSkeleton lines={5} />
      <CardSkeleton rows={4} />
      <CardSkeleton rows={3} />
    </TabLoading>
  )
}

export function InsightsFallback() {
  return (
    <>
      <PageHeader title="Insights" subtitle={<Skeleton className="mt-1 h-4 w-80" />} />
      <PageLoading label="Loading insights">
        <InsightsSkeleton />
      </PageLoading>
    </>
  )
}

/** The advice record's own loading state (`RecordSkeleton` in Record.tsx), its ledger as a table. */
export function RecordFallback() {
  return (
    <>
      <PageHeader title="Mis-sales prevented" subtitle={<Skeleton className="mt-1 h-4 w-96" />} />
      <PageLoading label="Loading the advice record">
        <Card padded={false} className="mb-8">
          <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
            <div className="grid content-start gap-6 p-6">
              <SkeletonStat />
              <div className="grid gap-2 border-t border-hairline-soft pt-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
            <div className="grid content-start gap-3.5 border-l border-hairline-soft p-6">
              <Skeleton className="mb-2 h-3 w-16" />
              {[92, 92, 78, 64, 40, 40, 40].map((w, i) => (
                <div key={i} className="grid grid-cols-[11rem_minmax(0,1fr)_2rem] gap-4">
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-2 self-center" style={{ width: `${w}%` }} />
                  <Skeleton className="h-3 w-5 justify-self-end" />
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Skeleton className="mb-3 h-6 w-40" />
        <TableSkeleton rows={6} />
      </PageLoading>
    </>
  )
}

/** The access log's own loading state, exactly. */
export function AccessFallback() {
  return (
    <>
      <PageHeader title="Access log" subtitle={<Skeleton className="mt-1 h-4 w-[34rem]" />} />
      <PageLoading label="Loading the access log">
        <div className="grid gap-4">
          <Skeleton className="h-[3.25rem] w-full rounded-lg" />
          <TableSkeleton rows={10} />
        </div>
      </PageLoading>
    </>
  )
}

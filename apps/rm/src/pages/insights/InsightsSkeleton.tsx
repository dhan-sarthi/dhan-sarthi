import { Card, Skeleton } from '../../ui/index.ts'

/*
 * The page's own layout in grey: the twelve-month band, the movers list, the composition band
 * and the two ranked cards, at the heights the real content takes, so nothing jumps when the
 * figures arrive.
 */
export function InsightsSkeleton() {
  return (
    <div className="grid gap-6">
      <Card padded={false} className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-hairline-soft px-5 py-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-44" />
        </div>
        <div className="grid grid-cols-1 gap-px bg-hairline-soft md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-surface px-5 pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div className="grid gap-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <Skeleton className="h-5 w-14" />
              </div>
              <Skeleton className="mt-2 h-3 w-40" />
              <Skeleton className="mt-3 h-[112px] w-full rounded-md" />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Skeleton className="mb-5 h-3 w-24" />
        <div className="grid">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(11rem,1fr)_minmax(7rem,1.25fr)_6.5rem_9rem_1rem] items-center gap-x-5 border-b border-hairline-soft px-2 py-3 last:border-0"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
              <Skeleton className="h-6 w-full" />
              <Skeleton className="ml-auto h-5 w-16" />
              <Skeleton className="ml-auto h-4 w-20" />
              <span />
            </div>
          ))}
        </div>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="grid grid-cols-1 gap-px bg-hairline-soft md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className={i === 2 ? 'bg-surface p-5 md:col-span-2 xl:col-span-1' : 'bg-surface p-5'}
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-4 h-8 w-28" />
              <Skeleton className="mt-2 h-3 w-48" />
              <div className="mt-5 grid gap-4">
                {Array.from({ length: 3 }, (_, j) => (
                  <div key={j} className="grid gap-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {[7, 5].map((span) => (
          <Card key={span} className={span === 7 ? 'xl:col-span-7' : 'xl:col-span-5'}>
            <Skeleton className="mb-5 h-3 w-28" />
            <div className="grid gap-3">
              {Array.from({ length: span === 7 ? 8 : 4 }, (_, j) => (
                <div key={j} className="grid grid-cols-[9rem_minmax(0,1fr)_2rem] gap-3">
                  <Skeleton className="h-3" />
                  <Skeleton className="h-1.5 self-center rounded-full" />
                  <Skeleton className="h-3" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

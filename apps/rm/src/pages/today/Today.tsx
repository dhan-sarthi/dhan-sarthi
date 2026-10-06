import { useToday } from '../../api/queries.ts'
import { useSession } from '../../api/session.ts'
import { Card, ErrorState, PageHeader, Skeleton } from '../../ui/index.ts'
import { CallQueue } from './CallQueue.tsx'
import { ComingUp } from './ComingUp.tsx'
import { firstName, greeting, headline } from './derive.ts'
import { KpiStrip } from './KpiStrip.tsx'
import { Refused } from './Refused.tsx'
import { TodayGrid } from './TodayGrid.tsx'
import { TodaySkeleton } from './TodaySkeleton.tsx'

/**
 * Today: the RM's morning. Greeting and the date the book is at; four figures; then who to call
 * and why, with the first call already open. Everything on the page but one figure is one read
 * (`rmToday`), so it loads, fails and retries as one; the refusal count is the Record's own read,
 * and the Refused card shows its rows without it if that read fails.
 */
export function Today() {
  const session = useSession()
  const today = useToday()
  const name = session ? firstName(session.rm.name) : ''

  return (
    <>
      <PageHeader
        title={
          name ? `${greeting(new Date().getHours())}, ${name}` : greeting(new Date().getHours())
        }
        subtitle={
          today.data ? (
            headline(today.data)
          ) : today.isPending ? (
            <Skeleton className="mt-1 h-4 w-72" />
          ) : null
        }
      />

      {today.data ? (
        <div className="grid grid-cols-1 gap-6">
          <KpiStrip kpis={today.data.kpis} />
          <TodayGrid
            queue={
              <CallQueue
                queue={today.data.queue}
                handoffs={today.data.handoffs}
                asOf={today.data.asOf}
              />
            }
            upcoming={<ComingUp upcoming={today.data.upcoming} asOf={today.data.asOf} />}
            refused={<Refused refusals={today.data.refusals} />}
          />
        </div>
      ) : today.isPending ? (
        <TodaySkeleton />
      ) : (
        <Card>
          <ErrorState
            size="page"
            title="Today did not load"
            error={today.error}
            onRetry={() => void today.refetch()}
            retrying={today.isFetching}
          />
        </Card>
      )}
    </>
  )
}

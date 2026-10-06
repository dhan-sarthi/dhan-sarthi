import type { RmInsights } from '@dhan/contracts'
import { Users } from 'lucide-react'
import * as m from 'motion/react-m'
import { useInsights } from '../../api/queries.ts'
import { formatCount } from '../../lib/format.ts'
import { settle } from '../../lib/motion.ts'
import { Card, EmptyState, ErrorState, Money, PageHeader, Skeleton } from '../../ui/index.ts'
import { PageLoading } from '../placeholder.tsx'
import { Composition } from './Composition.tsx'
import { InsightsSkeleton } from './InsightsSkeleton.tsx'
import { lowerFirst } from './derive.ts'
import { RefusalsByRule, SignalsByKind } from './Ranked.tsx'
import { TopMovers } from './TopMovers.tsx'
import { TrendBand } from './TrendBand.tsx'

/**
 * Insights: the RM's book reviewed as a whole. It reads top to bottom as the questions come:
 * how the book moved over twelve months, who moved it, what it is made of, and what the engine
 * is flagging and refusing across it.
 *
 * The window is the API's twelve month-ends and nothing else, so there is no period picker: a
 * control that changed nothing would be a lie the RM finds on the second click.
 */
export function Insights() {
  const query = useInsights()

  if (query.isPending) {
    return (
      <>
        <PageHeader title="Insights" subtitle={<Skeleton className="mt-1 h-4 w-80" />} />
        <PageLoading label="Loading insights">
          <InsightsSkeleton />
        </PageLoading>
      </>
    )
  }

  if (query.isError) {
    return (
      <>
        <PageHeader title="Insights" />
        <Card>
          <ErrorState
            size="page"
            title="Insights did not load"
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        </Card>
      </>
    )
  }

  return <InsightsView insights={query.data} />
}

function InsightsView({ insights }: { insights: RmInsights }) {
  // The same as-at sums Book's totals and Today's KPIs print, so the three pages agree.
  const { customers, relationshipValue } = insights.asAt

  if (customers === 0) {
    return (
      <>
        <PageHeader title="Insights" />
        <Card>
          <EmptyState
            size="page"
            titleAs="h2"
            icon={<Users />}
            title="No customers in your book yet"
            body="Once customers are assigned to you, their balances, plans and signals are charted here over twelve months."
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle={
          <>
            <span className="text-ink tabular">{formatCount(customers)}</span> customers ·{' '}
            <Money value={relationshipValue} short className="text-ink" /> we can see across every
            bank, {lowerFirst(insights.basis.asOfLabel)}
          </>
        }
      />
      {/* One column named `minmax(0, 1fr)`: an implicit `auto` track grows to its widest
          unbreakable row, which pushed the twelve-month card past the page on a tablet. The
          two ranked cards sit side by side once the page is about 900px wide, measured against
          the page rather than the window. */}
      <m.div {...settle} className="@container grid grid-cols-1 gap-6">
        <TrendBand insights={insights} />
        <TopMovers insights={insights} />
        <Composition insights={insights} />
        <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-12">
          <div className="min-w-0 @4xl:col-span-7">
            <SignalsByKind insights={insights} />
          </div>
          <div className="min-w-0 @4xl:col-span-5">
            <RefusalsByRule insights={insights} />
          </div>
        </div>
      </m.div>
    </>
  )
}

import type { JourneyEvent } from '@dhan/contracts'
import { Route } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useCustomer, useJourney } from '../../api/queries.ts'
import { cn } from '../../lib/cn.ts'
import { formatCount } from '../../lib/format.ts'
import {
  Button,
  Card,
  EVENT_ICON,
  EmptyState,
  ErrorState,
  LoadingRegion,
  Skeleton,
  TimelineMonth,
} from '../../ui/index.ts'
import { Composer } from './journey/Composer.tsx'
import { EventRow } from './journey/EventRow.tsx'
import { FILTERS, byMonth, countBy, matches, monthHeading, type FilterId } from './journey/group.ts'

/**
 * The customer's journey: every plan version, decision, check Uday ran, request for a person,
 * call, note and money event, newest first and grouped by month, after Attio's activity feed.
 *
 * The note box sits at the top because that is where the RM's own entry will land. A plan
 * version is one line until it is opened; the newest is open from the start, because "what did
 * the plan just do" is the question the tab is most often opened to answer.
 */
export function CustomerJourney() {
  const { cif = '' } = useParams()
  const journey = useJourney(cif)
  // The layout's cached read of the file, for the first name and the RM clock. Never a new open.
  const file = useCustomer(cif)
  const name = file.data?.profile.name.trim().split(/\s+/)[0] ?? 'this customer'
  const asOf = file.data?.asOf ?? null

  const [filter, setFilter] = useState<FilterId>('all')
  const [fresh, setFresh] = useState<string | null>(null)
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set())
  const [announce, setAnnounce] = useState('')

  const events = useMemo(() => journey.data?.events ?? [], [journey.data])
  const counts = useMemo(() => countBy(events), [events])
  const months = useMemo(() => byMonth(events.filter((e) => matches(filter, e))), [events, filter])
  // The newest plan version starts open; every other starts closed. A toggle flips from there.
  const newestPlan = useMemo(() => events.find((e) => e.kind === 'plan')?.id ?? null, [events])
  const isOpen = (id: string) => (id === newestPlan) !== toggled.has(id)

  function toggle(id: string) {
    setToggled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function added(event: JourneyEvent) {
    setFresh(event.id)
    // The RM must see what they just wrote, whatever the filter was.
    if (!matches(filter, event)) setFilter('all')
    setAnnounce(`${event.kind === 'call' ? 'Call logged' : 'Note added'} on ${name}’s journey.`)
  }

  if (journey.isError) {
    return (
      <Card>
        <ErrorState
          title={`${name === 'this customer' ? 'This customer’s' : `${name}’s`} journey did not load`}
          error={journey.error}
          onRetry={() => void journey.refetch()}
          retrying={journey.isFetching}
        />
      </Card>
    )
  }

  if (!journey.data) return <JourneySkeleton />

  // Joining the bank is history, not activity: a journey with only that line is still empty.
  const hasActivity = events.some((e) => e.kind !== 'joined')
  const visibleFilters = FILTERS.filter((f) => counts[f.id] > 0)
  const activeLabel = FILTERS.find((f) => f.id === filter)?.label.toLowerCase()

  return (
    <Card padded={false}>
      <div className="border-b border-hairline-soft p-5">
        <Composer cif={cif} name={name} asOf={asOf} onAdded={added} />
        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>

      {hasActivity ? (
        <div
          role="group"
          aria-label="Show events of one kind"
          className="flex flex-wrap items-center gap-1.5 border-b border-hairline-soft px-5 py-3"
        >
          <FilterChip
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            label="All"
            count={counts.all}
          />
          {visibleFilters.map((f) => (
            <FilterChip
              key={f.id}
              active={filter === f.id}
              onClick={() => setFilter(filter === f.id ? 'all' : f.id)}
              label={f.label}
              count={counts[f.id]}
              icon={f.kinds[0] ? EVENT_ICON[f.kinds[0]] : undefined}
            />
          ))}
        </div>
      ) : null}

      <div className="px-5 pt-2 pb-1">
        {!hasActivity ? (
          <EmptyState
            icon={<Route />}
            title={`Nothing on ${name}’s journey yet`}
            body="Plan versions, decisions, Uday’s checks, calls and notes appear here as they happen. Add a note above to start it."
            className="py-10 text-pretty"
          />
        ) : months.length === 0 ? (
          <EmptyState
            title={`No ${activeLabel ?? 'events'} on ${name}’s journey`}
            body="Nothing of this kind has happened yet. Every other event is under All."
            action={
              <Button size="sm" onClick={() => setFilter('all')}>
                Show everything
              </Button>
            }
            className="py-10 text-pretty"
          />
        ) : null}
        {months.map((group) => (
          <TimelineMonth
            key={group.month}
            label={monthHeading(group.month)}
            count={group.events.length}
          >
            {group.events.map((event, i) => (
              <EventRow
                key={event.id}
                event={event}
                cif={cif}
                last={i === group.events.length - 1}
                expanded={isOpen(event.id)}
                onToggle={() => toggle(event.id)}
                fresh={event.id === fresh}
              />
            ))}
          </TimelineMonth>
        ))}
      </div>
    </Card>
  )
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  icon: Icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  icon?: (typeof EVENT_ICON)[keyof typeof EVENT_ICON] | undefined
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-control-sm items-center gap-1.5 rounded-sm border px-2.5 text-caption transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
        active
          ? 'border-brand/30 bg-brand-wash text-ink'
          : 'border-hairline bg-surface text-ink-soft hover:border-ink-hint/40 hover:text-ink',
      )}
    >
      {Icon ? <Icon aria-hidden className="size-3.5" /> : null}
      {label}
      <span className={cn('tabular', active ? 'text-brand-deep' : 'text-ink-hint')}>
        {formatCount(count)}
      </span>
    </button>
  )
}

function JourneySkeleton() {
  return (
    <LoadingRegion label="Loading the journey">
      <Card padded={false}>
        <div className="flex items-center gap-3 border-b border-hairline-soft p-5">
          <Skeleton className="size-7 rounded-full" />
          <Skeleton className="h-control flex-1 rounded-md" />
        </div>
        <div className="flex gap-1.5 border-b border-hairline-soft px-5 py-3">
          {[12, 24, 20, 22, 22, 24].map((w, i) => (
            <Skeleton key={i} className="h-control-sm rounded-sm" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <div className="grid gap-5 px-5 pt-4 pb-6">
          <Skeleton className="h-3.5 w-32" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="grid flex-1 gap-2 pt-1">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
                {i % 2 === 0 ? <Skeleton className="h-3 w-3/5" /> : null}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </LoadingRegion>
  )
}

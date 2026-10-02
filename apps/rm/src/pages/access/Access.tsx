import type { AccessAction, AccessEntry } from '@dhan/contracts'
import { createColumnHelper } from '@tanstack/react-table'
import { ScrollText, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAccessLog } from '../../api/queries.ts'
import { formatCount } from '../../lib/format.ts'
import {
  Avatar,
  Button,
  Card,
  Chip,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  PageHeader,
  SegmentTabs,
  Skeleton,
  type SegmentTab,
} from '../../ui/index.ts'
import { PageLoading, TableSkeleton } from '../placeholder.tsx'
import { ACTIONS, ACTION_WORDS, dayLabel, detailWords, fullInstant, timeLabel } from './actions.ts'

/** The route returns the newest entries up to this many; the page says so when it is full. */
const LOG_LIMIT = 200

type Tab = 'all' | AccessAction

const isAction = (v: string | null): v is AccessAction =>
  v !== null && (ACTIONS as readonly string[]).includes(v)

const col = createColumnHelper<AccessEntry>()

/**
 * Every customer file this RM opened, every masked field revealed, every check, brief, note and
 * request update, with the purpose given at the time. It exists because data-protection law
 * (the DPDP Act) asks that each look at a customer's data be accounted for, and an RM who can
 * read their own log is an RM who knows it is kept.
 *
 * Times here are real instants, unlike the rest of the console, which runs on the book's
 * simulated clock. The action filter lives in the address (`?action=revealed`).
 */
export function Access() {
  const log = useAccessLog()
  const [search, setSearch] = useSearchParams()
  const raw = search.get('action')
  const tab: Tab = isAction(raw) ? raw : 'all'
  const [query, setQuery] = useState('')

  const entries = useMemo(() => log.data?.entries ?? [], [log.data])

  const tabs = useMemo<SegmentTab<Tab>[]>(() => {
    const counts = new Map<AccessAction, number>()
    for (const e of entries) counts.set(e.action, (counts.get(e.action) ?? 0) + 1)
    return [
      { id: 'all', label: 'All', count: entries.length },
      ...ACTIONS.map((a) => ({ id: a, label: ACTION_WORDS[a].tab, count: counts.get(a) ?? 0 })),
    ]
  }, [entries])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter(
      (e) =>
        (tab === 'all' || e.action === tab) &&
        (q === '' ||
          e.name.toLowerCase().includes(q) ||
          e.cif.toLowerCase().includes(q) ||
          e.purpose.toLowerCase().includes(q) ||
          (e.detail ?? '').toLowerCase().includes(q)),
    )
  }, [entries, tab, query])

  const customers = useMemo(() => new Set(entries.map((e) => e.cif)).size, [entries])

  function setTab(next: Tab) {
    setSearch(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next === 'all') params.delete('action')
        else params.set('action', next)
        return params
      },
      { replace: true },
    )
  }

  const why =
    'Under the DPDP Act every look at a customer’s data is recorded: each file you open, field you unmask and check you run is written here with the reason you gave.'

  if (log.isError) {
    return (
      <>
        <PageHeader title="Access log" subtitle={why} />
        <Card>
          <ErrorState
            size="page"
            title="The access log did not load"
            error={log.error}
            onRetry={() => void log.refetch()}
            retrying={log.isFetching}
          />
        </Card>
      </>
    )
  }

  if (!log.data) {
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

  const subtitle =
    entries.length === 0 ? (
      why
    ) : (
      <>
        <span className="text-ink">
          <span className="tabular">{formatCount(entries.length)}</span>{' '}
          {entries.length === 1 ? 'entry' : 'entries'} across{' '}
          <span className="tabular">{formatCount(customers)}</span>{' '}
          {customers === 1 ? 'customer' : 'customers'}, newest first.
        </span>{' '}
        {why}
      </>
    )

  return (
    <>
      <PageHeader title="Access log" subtitle={<p className="max-w-[90ch]">{subtitle}</p>} />

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            size="page"
            icon={<ScrollText />}
            title="Nothing logged yet"
            body="Open a customer’s file and the visit is written here with the reason you gave. So is every reveal, product check, brief and note."
            className="text-pretty"
            action={
              <Button asChild variant="primary">
                <Link to="/book">Open your book</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          <SegmentTabs label="Show one kind of entry" tabs={tabs} value={tab} onChange={setTab} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input
              type="text"
              role="searchbox"
              aria-label="Filter the log by customer, CIF or purpose"
              placeholder="Filter by customer, CIF or purpose"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query !== '') {
                  e.preventDefault()
                  setQuery('')
                }
              }}
              className="w-full max-w-sm"
              leading={<Search aria-hidden />}
              trailing={
                query !== '' ? (
                  <IconButton
                    label="Clear the filter"
                    icon={<X aria-hidden />}
                    size="sm"
                    tooltip={false}
                    onClick={() => setQuery('')}
                  />
                ) : null
              }
            />
            <p className="text-caption font-normal text-ink-faint">
              {shown.length !== entries.length ? (
                <>
                  <span className="tabular">{formatCount(shown.length)}</span> of{' '}
                  <span className="tabular">{formatCount(entries.length)}</span> ·{' '}
                </>
              ) : null}
              Times are real, in your time zone; the rest of the console runs on the book’s clock.
            </p>
          </div>

          <DataTable
            data={shown}
            columns={columns}
            getRowId={(e) => e.id}
            caption="Your access log, newest first"
            initialSorting={[{ id: 'at', desc: true }]}
            empty={
              <EmptyState
                title={
                  query.trim() !== ''
                    ? 'No entries match the filter'
                    : `No ${tab === 'all' ? 'entries' : ACTION_WORDS[tab].tab.toLowerCase()} in the log`
                }
                body={
                  query.trim() !== ''
                    ? 'Nothing for this customer or purpose under this tab.'
                    : 'You have not done this for any customer yet. Every other entry is under All.'
                }
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      setTab('all')
                    }}
                  >
                    Show every entry
                  </Button>
                }
              />
            }
          />

          {entries.length >= LOG_LIMIT ? (
            <p className="text-caption font-normal text-ink-faint">
              Showing your latest <span className="tabular">{formatCount(LOG_LIMIT)}</span> entries.
              Older ones are kept; the console shows the most recent.
            </p>
          ) : null}
        </div>
      )}
    </>
  )
}

const columns = [
  col.accessor('at', {
    id: 'at',
    header: 'When',
    meta: { width: 168 },
    sortingFn: (a, b) =>
      a.original.at < b.original.at ? -1 : a.original.at > b.original.at ? 1 : 0,
    cell: ({ row: { original: e } }) => (
      <time dateTime={e.at} title={fullInstant(e.at)} className="block min-w-0">
        <span className="block truncate text-label text-ink tabular">{timeLabel(e.at)}</span>
        <span className="block truncate text-caption font-normal text-ink-faint">
          {dayLabel(e.at)}
        </span>
      </time>
    ),
  }),
  col.accessor('name', {
    id: 'name',
    header: 'Customer',
    meta: { width: 240 },
    cell: ({ row: { original: e } }) => (
      <Link
        to={`/customers/${encodeURIComponent(e.cif)}`}
        className="group/name -mx-1 flex min-w-0 items-center gap-2.5 rounded-sm px-1 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Avatar name={e.name} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-label text-ink underline-offset-3 group-hover/name:underline">
            {e.name}
          </span>
          <span className="block truncate text-caption font-normal text-ink-faint tabular">
            {e.cif}
          </span>
        </span>
      </Link>
    ),
  }),
  col.accessor('action', {
    id: 'action',
    header: 'Action',
    meta: { width: 204 },
    cell: ({ row: { original: e } }) => {
      const { sentence, icon: Icon } = ACTION_WORDS[e.action]
      // A reveal unmasks personal data: the one action drawn to be noticed on a scan.
      return e.action === 'revealed' ? (
        <Chip tone="streak" size="md" icon={<Icon aria-hidden />}>
          {sentence}
        </Chip>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-2 text-label text-ink">
          <Icon aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
          <span className="truncate">{sentence}</span>
        </span>
      )
    },
  }),
  col.accessor('purpose', {
    id: 'purpose',
    header: 'Purpose given',
    enableSorting: false,
    cell: ({ row: { original: e } }) => (
      // The purpose is the reason the law asks for, so it wraps to a second line rather than
      // being cut; anything longer still has its full text on hover.
      <span className="line-clamp-2 text-label font-normal text-ink" title={e.purpose}>
        {e.purpose}
      </span>
    ),
  }),
  col.accessor('detail', {
    id: 'detail',
    header: 'Detail',
    enableSorting: false,
    meta: { width: 176 },
    cell: ({ row: { original: e } }) =>
      e.detail ? (
        <span
          className="block truncate text-label font-normal text-ink-soft"
          title={detailWords(e.detail)}
        >
          {detailWords(e.detail)}
        </span>
      ) : (
        <span className="text-label text-ink-hint" aria-label="No detail">
          —
        </span>
      ),
  }),
]

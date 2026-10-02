import type { AccessAction } from '@dhan/contracts'
import { createColumnHelper } from '@tanstack/react-table'
import { ChevronDown, Lock, ScrollText, Search, X } from 'lucide-react'
import { createContext, useContext, useMemo, useState } from 'react'
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
import { cn } from '../../lib/cn.ts'
import { PageLoading, TableSkeleton } from '../placeholder.tsx'
import {
  ACTIONS,
  ACTION_WORDS,
  dayLabel,
  detailWords,
  foldRuns,
  fullInstant,
  isDefaultPurpose,
  spanLabel,
  timeLabel,
  type LogRow,
} from './actions.ts'

/** The route returns the newest entries up to this many; the page says so when it is full. */
const LOG_LIMIT = 200

type Tab = 'all' | AccessAction

const isAction = (v: string | null): v is AccessAction =>
  v !== null && (ACTIONS as readonly string[]).includes(v)

const col = createColumnHelper<LogRow>()

/** Which folded runs are open. The columns are module-level, so the page hands this down. */
const RunsContext = createContext<{ open: ReadonlySet<string>; toggle: (id: string) => void }>({
  open: new Set(),
  toggle: () => undefined,
})

/**
 * Every customer file this RM opened, every masked field revealed, every check, brief, note and
 * request update, with its purpose, and every attempt on a file outside the book that was
 * refused. It exists because data-protection law (the DPDP Act) asks that each look at a
 * customer's data be accounted for, and an RM who can read their own log is an RM who knows it
 * is kept.
 *
 * The console does not yet ask for a purpose when a file is opened, so an open carries the API's
 * default, and the log marks it as one rather than calling it a reason the RM gave. The same
 * thing done to the same file in a row (a reload, a tab hop) is one row with a count, opened to
 * list each instant: every entry is still there.
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
  const [openRuns, setOpenRuns] = useState<ReadonlySet<string>>(() => new Set())
  const runs = useMemo(
    () => ({
      open: openRuns,
      toggle: (id: string) =>
        setOpenRuns((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }),
    }),
    [openRuns],
  )

  const entries = useMemo(() => log.data?.entries ?? [], [log.data])

  // Only the kinds the log holds get a tab: six tabs at 0 were noise at the page's one choice.
  // A kind the address asks for stays, so a link to an empty kind still says it is empty.
  const tabs = useMemo<SegmentTab<Tab>[]>(() => {
    const counts = new Map<AccessAction, number>()
    for (const e of entries) counts.set(e.action, (counts.get(e.action) ?? 0) + 1)
    return [
      { id: 'all', label: 'All', count: entries.length },
      ...ACTIONS.filter((a) => (counts.get(a) ?? 0) > 0 || a === tab).map((a) => ({
        id: a,
        label: ACTION_WORDS[a].tab,
        count: counts.get(a) ?? 0,
      })),
    ]
  }, [entries, tab])

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
  const rows = useMemo(() => foldRuns(shown), [shown])

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
    'Under the DPDP Act every look at a customer’s data is recorded: each file you open, field you unmask and check you run is written here with its purpose, and so is every attempt on a file outside your book.'

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
            body="Open a customer’s file and the visit is written here with its purpose. So is every reveal, product check, brief and note."
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
          {/* The kit's strip shares its width out evenly, which put each count far from its label;
              here the tabs hug their words, so the count reads as part of the tab. */}
          <SegmentTabs
            label="Show one kind of entry"
            tabs={tabs}
            value={tab}
            onChange={setTab}
            className="w-fit max-w-full [&>button]:flex-none [&>button]:justify-start [&>button]:gap-2.5"
          />
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

          <RunsContext value={runs}>
            <DataTable
              data={rows}
              columns={columns}
              getRowId={(r) => r.id}
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
          </RunsContext>

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
  col.accessor((r) => r.entry.at, {
    id: 'at',
    header: 'When',
    meta: { width: 184 },
    sortingFn: (a, b) =>
      a.original.entry.at < b.original.entry.at
        ? -1
        : a.original.entry.at > b.original.entry.at
          ? 1
          : 0,
    cell: ({ row: { original: r } }) => <WhenCell row={r} />,
  }),
  col.accessor((r) => r.entry.name, {
    id: 'name',
    header: 'Customer',
    meta: { width: 212 },
    cell: ({ row: { original: r } }) => <CustomerCell row={r} />,
  }),
  col.accessor((r) => r.entry.action, {
    id: 'action',
    header: 'Action',
    meta: { width: 196 },
    cell: ({ row: { original: r } }) => <ActionCell row={r} />,
  }),
  col.accessor((r) => r.entry.purpose, {
    id: 'purpose',
    // "Purpose", not "Purpose given": an open carries the default the console sends.
    header: 'Purpose',
    enableSorting: false,
    cell: ({ row: { original: r } }) => {
      const e = r.entry
      // The purpose is the reason the law asks for, so it wraps to a second line rather than
      // being cut; anything longer still has its full text on hover.
      return (
        <span className="line-clamp-2 text-label font-normal text-ink" title={e.purpose}>
          {e.purpose}
          {isDefaultPurpose(e) ? (
            <span
              className="text-ink-faint"
              title="The console sends this purpose when it opens a file; none was asked for."
            >
              {' '}
              (default)
            </span>
          ) : null}
        </span>
      )
    },
  }),
  col.accessor((r) => r.entry.detail, {
    id: 'detail',
    header: 'Detail',
    enableSorting: false,
    meta: { width: 140 },
    cell: ({ row: { original: r } }) =>
      r.entry.detail ? (
        <span
          className="block truncate text-label font-normal text-ink-soft"
          title={detailWords(r.entry.detail)}
        >
          {detailWords(r.entry.detail)}
        </span>
      ) : (
        <span className="text-label text-ink-hint" aria-label="No detail">
          —
        </span>
      ),
  }),
]

/** One instant, or a run's span with its instants a click away. */
function WhenCell({ row }: { row: LogRow }) {
  const { open, toggle } = useContext(RunsContext)
  const e = row.entry
  if (row.entries.length === 1) {
    return (
      <time dateTime={e.at} title={fullInstant(e.at)} className="block min-w-0">
        <span className="block truncate text-label text-ink tabular">{timeLabel(e.at)}</span>
        <span className="block truncate text-caption font-normal text-ink-faint">
          {dayLabel(e.at)}
        </span>
      </time>
    )
  }
  const expanded = open.has(row.id)
  const listId = `run-${row.id}`
  return (
    <div className="min-w-0">
      <span className="block truncate text-label text-ink tabular">{spanLabel(row.entries)}</span>
      <span className="block truncate text-caption font-normal text-ink-faint">
        {dayLabel(e.at)}
      </span>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => toggle(row.id)}
        className="mt-1 -ml-0.5 inline-flex items-center gap-1 rounded-sm text-caption text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <ChevronDown
          aria-hidden
          className={cn('size-3.5 transition-transform duration-200', !expanded && '-rotate-90')}
        />
        {expanded ? 'Hide the times' : `Show all ${row.entries.length} times`}
      </button>
      {expanded ? (
        <ol id={listId} className="mt-1 grid gap-0.5 border-l border-hairline pl-2.5">
          {row.entries.map((entry) => (
            <li key={entry.id}>
              <time
                dateTime={entry.at}
                title={fullInstant(entry.at)}
                className="text-caption font-normal text-ink-soft tabular"
              >
                {timeLabel(entry.at)}
              </time>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

function CustomerCell({ row }: { row: LogRow }) {
  const e = row.entry
  // A refused attempt names the customer only by CIF: the log does not hand over the name the
  // refusal withheld, and there is no file to link to.
  if (e.action === 'denied') {
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-ink-faint [&_svg]:size-3.5"
        >
          <Lock />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-label text-ink tabular">{e.cif}</span>
          <span className="block truncate text-caption font-normal text-ink-faint">
            Not in your book
          </span>
        </span>
      </span>
    )
  }
  return (
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
  )
}

function ActionCell({ row }: { row: LogRow }) {
  const e = row.entry
  const { sentence, icon: Icon } = ACTION_WORDS[e.action]
  const times =
    row.entries.length > 1 ? (
      <span className="shrink-0 text-label font-normal text-ink-faint tabular">
        <span aria-hidden>×</span>
        <span className="sr-only">, </span>
        {row.entries.length}
        <span className="sr-only"> times</span>
      </span>
    ) : null
  // A refused attempt and a reveal are the two entries a reviewer scans for, so each is a chip:
  // the refusal in danger (someone tried a file they may not see), the reveal in the warm tone.
  if (e.action === 'denied' || e.action === 'revealed') {
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        <Chip
          tone={e.action === 'denied' ? 'danger' : 'streak'}
          size="md"
          icon={<Icon aria-hidden />}
        >
          {sentence}
        </Chip>
        {times}
      </span>
    )
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-label text-ink">
      <Icon aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
      <span className="truncate">{sentence}</span>
      {times}
    </span>
  )
}

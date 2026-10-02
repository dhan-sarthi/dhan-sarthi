import type { BookRow, BookTab, RmBook } from '@dhan/contracts'
import type { OnChangeFn, SortingState } from '@tanstack/react-table'
import { Inbox, SearchX, Users } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'
import { useBook } from '../../api/queries.ts'
import { formatCount } from '../../lib/format.ts'
import {
  Button,
  Card,
  DataTable,
  Disclaimer,
  EmptyState,
  ErrorState,
  PageHeader,
  SEGMENT,
  SEVERITY,
  SegmentTabs,
  Skeleton,
  SplitView,
} from '../../ui/index.ts'
import { PageLoading, TableSkeleton } from '../placeholder.tsx'
import { bookColumns } from './columns.tsx'
import { fitColumns, useWidth } from './fit.ts'
import { useBookParams } from './params.ts'
import { Preview } from './Preview.tsx'
import {
  IN_TAB,
  defaultDir,
  hiddenFromTab,
  isSortKey,
  matchesQuery,
  sliceTotals,
  type SortDir,
  type SortKey,
} from './rows.ts'
import { SummaryBand } from './SummaryBand.tsx'
import { Toolbar } from './Toolbar.tsx'

/**
 * Book: every customer in the RM's book, in one dense, quiet table.
 *
 * The page is a summary band (the whole book), segment tabs with their counts, search and sort,
 * then the table, whose footer adds up whatever slice is on screen. A row opens a preview rail
 * beside the list rather than over it, so the RM can walk the book with the arrow keys and keep
 * their place. Every piece of that state is in the address (see `params.ts`).
 */
export function Book() {
  const book = useBook()

  if (book.data) return <BookView book={book.data} />
  if (book.isError) {
    return (
      <>
        <PageHeader title="Book" />
        <Card>
          <ErrorState
            size="page"
            title="The book did not load"
            error={book.error}
            onRetry={() => void book.refetch()}
            retrying={book.isFetching}
          />
        </Card>
      </>
    )
  }
  return <BookLoading />
}

function BookLoading() {
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

function BookView({ book }: { book: RmBook }) {
  const [params, setParams] = useBookParams()
  const navigate = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)

  const tabCounts = useMemo(
    () => new Map(book.segments.map((s) => [s.id, s.count] as const)),
    [book.segments],
  )
  const inTab = useMemo(() => book.rows.filter(IN_TAB[params.tab]), [book.rows, params.tab])
  const visible = useMemo(
    () => inTab.filter((row) => matchesQuery(row, params.q)),
    [inTab, params.q],
  )
  const selected = useMemo(
    () => (params.cif ? (book.rows.find((r) => r.cif === params.cif) ?? null) : null),
    [book.rows, params.cif],
  )
  const totals = useMemo(() => sliceTotals(visible, book.asOf), [visible, book.asOf])

  // The table's own width, less its two hairline borders, decides which columns it can hold.
  const width = useWidth(listRef, 1140) - 2
  const fit = fitColumns(width, selected !== null)
  const columns = useMemo(
    () => bookColumns({ asOf: book.asOf, totals, signal: fit.signal }),
    [book.asOf, totals, fit.signal],
  )

  const sorting: SortingState = [{ id: params.sort, desc: params.dir === 'desc' }]
  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const first = next[0]
    // TanStack's third click clears the sort; the book always has an order, so a third click
    // flips back instead of dropping to the server's order without saying so.
    if (!first) {
      setParams({ sort: params.sort, dir: params.dir === 'desc' ? 'asc' : 'desc' })
      return
    }
    if (isSortKey(first.id)) setParams({ sort: first.id, dir: first.desc ? 'desc' : 'asc' })
  }

  // A reload or Back from a file lands on the customer it left, not at the top of the book.
  const scrolledTo = useRef(false)
  useEffect(() => {
    if (scrolledTo.current || !params.cif) return
    scrolledTo.current = true
    const row = listRef.current
      ?.querySelector(`[data-cif="${CSS.escape(params.cif)}"]`)
      ?.closest('tr')
    if (!row) return
    // Only when it is out of sight, and then to the middle: the table's header sticks under the
    // top bar and its footer to the bottom of the window, so "nearest" can park the row
    // underneath either one.
    const { top, bottom } = row.getBoundingClientRect()
    if (top < 140 || bottom > window.innerHeight - 56) row.scrollIntoView({ block: 'center' })
  }, [params.cif])

  const select = (cif: string | null) => setParams({ cif })

  /** With the preview open, it follows keyboard focus down the list. */
  function onListFocus(event: FocusEvent<HTMLDivElement>) {
    if (!selected || !(event.target instanceof HTMLTableRowElement)) return
    const cif = event.target.querySelector<HTMLElement>('[data-cif]')?.dataset['cif']
    if (cif && cif !== selected.cif) select(cif)
  }

  /** Enter opens the preview; Enter on the row already previewed opens the profile. Esc closes. */
  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && selected) {
      event.preventDefault()
      select(null)
      return
    }
    if (event.key !== 'Enter' || !selected) return
    if (!(event.target instanceof HTMLTableRowElement)) return
    const cif = event.target.querySelector<HTMLElement>('[data-cif]')?.dataset['cif']
    if (cif === selected.cif) {
      event.preventDefault()
      event.stopPropagation()
      void navigate(`/customers/${encodeURIComponent(cif)}`)
    }
  }

  const tabLabel = book.segments.find((s) => s.id === params.tab)?.label ?? 'All'
  const hidden =
    params.tab === 'idle_cash'
      ? hiddenFromTab(tabCounts.get('idle_cash') ?? 0, book.rows, 'idle_cash')
      : 0
  const actNow = book.rows.filter((r) => r.topSignal?.severity === 'urgent').length

  if (book.rows.length === 0) {
    return (
      <>
        <PageHeader title="Book" subtitle="No customers yet" />
        <Card>
          <EmptyState
            size="page"
            icon={<Users />}
            title="Your book is empty"
            body="When customers are assigned to you, they appear here with their balances, goals and signals."
          />
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Book"
        subtitle={
          <>
            <span className="text-ink tabular">{formatCount(book.totals.customers)}</span>{' '}
            {book.totals.customers === 1 ? 'customer' : 'customers'}
            {actNow > 0 ? (
              <>
                {' · '}
                <span className="text-ink tabular">{formatCount(actNow)}</span> with a signal marked{' '}
                {SEVERITY.urgent.label}
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5">
        <SummaryBand book={book} onShowHandoffs={() => setParams({ tab: 'asked_for_rm' })} />

        <div className="grid gap-3">
          <SegmentTabs
            label="Book segments"
            tabs={book.segments}
            value={params.tab}
            onChange={(tab) => setParams({ tab })}
          />
          <Toolbar
            query={params.q}
            onQuery={(q) => setParams({ q })}
            sort={params.sort}
            dir={params.dir}
            onSort={(sort: SortKey, dir?: SortDir) =>
              setParams({ sort, dir: dir ?? defaultDir(sort) })
            }
            shown={visible.length}
            of={inTab.length}
          />
          {hidden > 0 ? (
            <Disclaimer>
              {formatCount(inTab.length)} with idle cash as their top signal. {formatCount(hidden)}{' '}
              more have idle cash behind a bigger signal; their files list it.
            </Disclaimer>
          ) : null}
        </div>

        <SplitView
          open={selected !== null}
          rail={
            selected ? (
              <Preview row={selected} asOf={book.asOf} onClose={() => select(null)} />
            ) : null
          }
        >
          <div ref={listRef} onFocus={onListFocus} onKeyDownCapture={onListKeyDown}>
            <DataTable
              caption={`Customers in your book, ${tabLabel}`}
              data={visible}
              columns={columns}
              getRowId={(r: BookRow) => r.cif}
              sorting={sorting}
              onSortingChange={onSortingChange}
              columnVisibility={fit.visibility}
              onRowClick={(r: BookRow) => select(r.cif)}
              selectedId={selected?.cif ?? null}
              stickyTop={56}
              empty={
                <NoRows
                  tab={params.tab}
                  tabLabel={tabLabel}
                  hidden={hidden}
                  query={params.q}
                  onClearSearch={() => setParams({ q: '' })}
                  onAllTab={() => setParams({ tab: 'all' })}
                />
              }
            />
          </div>
        </SplitView>
      </div>
    </>
  )
}

/** What an empty table means: a search that matched nothing, or a slice of the book with no one in it. */
function NoRows({
  tab,
  tabLabel,
  hidden,
  query,
  onClearSearch,
  onAllTab,
}: {
  tab: BookTab
  tabLabel: string
  /** Customers the tab counts that the rows cannot show (idle cash behind a bigger signal). */
  hidden: number
  query: string
  onClearSearch: () => void
  onAllTab: () => void
}) {
  if (query.trim() !== '') {
    return (
      <EmptyState
        icon={<SearchX />}
        title={`No customers match ‘${query.trim()}’`}
        body={
          tab === 'all'
            ? 'Search looks at names, CIFs and cities.'
            : `Nobody in ${tabLabel} matches. Search looks at names, CIFs and cities.`
        }
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={onClearSearch}>
              Clear search
            </Button>
            {tab !== 'all' ? (
              <Button size="sm" variant="ghost" onClick={onAllTab}>
                Search all customers
              </Button>
            ) : null}
          </div>
        }
      />
    )
  }
  const copy: Record<BookTab, { title: string; body: ReactNode }> = {
    all: { title: 'No customers', body: 'Customers assigned to you appear here.' },
    priority: {
      title: 'No Priority customers in this book',
      body: `${SEGMENT.priority.rule}. Customers move between segments as their relationship value changes.`,
    },
    affluent: {
      title: 'No Affluent customers in this book',
      body: `${SEGMENT.affluent.rule}. Customers move between segments as their relationship value changes.`,
    },
    mass: {
      title: 'No Mass customers in this book',
      body: `${SEGMENT.mass.rule}. Customers move between segments as their relationship value changes.`,
    },
    at_risk: {
      title: 'Every goal is on track',
      body: 'A customer whose plan has a shortfall, an urgent signal or no route to the goal shows up here.',
    },
    idle_cash:
      hidden > 0
        ? {
            title: 'Nobody has idle cash as their top signal',
            body: `${formatCount(hidden)} ${hidden === 1 ? 'customer has' : 'customers have'} idle cash behind a bigger signal; their files list it.`,
          }
        : {
            title: 'Nobody is sitting on idle cash',
            body: 'A customer who keeps more in savings than they need, month after month, shows up here.',
          },
    asked_for_rm: {
      title: 'Nobody has asked for you',
      body: 'When a customer taps Talk to your relationship manager in the app, they show up here.',
    },
  }
  return <EmptyState icon={<Inbox />} title={copy[tab].title} body={copy[tab].body} />
}

import type { BookRow, BookTab, RmBook } from '@dhan/contracts'
import type { OnChangeFn, SortingState } from '@tanstack/react-table'
import { Inbox, SearchX, Users } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
  EmptyState,
  ErrorState,
  PageHeader,
  SEGMENT,
  SEVERITY,
  Skeleton,
  SplitView,
} from '../../ui/index.ts'
import { PageLoading, TableSkeleton } from '../placeholder.tsx'
import { BookTabs } from './BookTabs.tsx'
import { bookColumns } from './columns.tsx'
import { fitColumns, useMedia, useWidth } from './fit.ts'
import { useBookParams } from './params.ts'
import { Preview } from './Preview.tsx'
import {
  ASKED_FOR_YOU,
  IN_TAB,
  defaultDir,
  isSortKey,
  matchesQuery,
  sliceTotals,
  tabLabel,
  type SortDir,
  type SortKey,
} from './rows.ts'
import { SummaryBand } from './SummaryBand.tsx'
import { Toolbar } from './Toolbar.tsx'

/**
 * The band's chart starts unfolded only on a screen with room for it and a page of rows under
 * it; on a laptop (1280 or 1366 wide, or 900 tall) the page opens on the list.
 */
const ROOMY = '(min-width: 1440px) and (min-height: 960px)'

/**
 * Below 1440 wide the book's rail is narrower than the kit's 440px, so that on a 1280 or 1366
 * laptop the list beside it still holds the customer, the value and the top signal, and the tabs
 * over it fit on one line.
 */
const LAPTOP = '(max-width: 1439px)'
const LAPTOP_RAIL = { '--spacing-rail': '380px' } as CSSProperties

const CHART_PREF_KEY = 'dhan.rm.book.chart.v1'

/**
 * Book: every customer in the RM's book, in one dense, quiet table.
 *
 * The page is a strip of the whole book's figures (with a chart of the view the RM can unfold),
 * the tabs with their counts, search and sort, then the table, whose footer adds up whatever
 * slice is on screen. A row opens a preview rail beside everything under the title, so the RM
 * can walk the book with the arrow keys and keep their place. Every piece of that state but the
 * chart's fold is in the address (see `params.ts`).
 */
export function Book() {
  const book = useBook()
  const chart = useChartFold()

  if (book.data) return <BookView book={book.data} chart={chart} />
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
  return <BookLoading expanded={chart.expanded} />
}

/**
 * Whether the band's chart is unfolded: the RM's own choice once they have made one (kept in
 * this browser only), and until then open on a roomy screen and folded on a laptop.
 */
function useChartFold(): { expanded: boolean; toggle: () => void } {
  const roomy = useMedia(ROOMY)
  const [choice, setChoice] = useState<boolean | null>(() => {
    try {
      const saved = window.localStorage.getItem(CHART_PREF_KEY)
      return saved === 'open' ? true : saved === 'closed' ? false : null
    } catch {
      return null
    }
  })
  const expanded = choice ?? roomy
  const toggle = useCallback(() => {
    const next = !expanded
    setChoice(next)
    try {
      window.localStorage.setItem(CHART_PREF_KEY, next ? 'open' : 'closed')
    } catch {
      // Private windows and blocked storage: the fold still works for this visit.
    }
  }, [expanded])
  return { expanded, toggle }
}

function BookLoading({ expanded }: { expanded: boolean }) {
  return (
    <>
      <PageHeader title="Book" subtitle={<Skeleton className="mt-1 h-4 w-64" />} />
      <PageLoading label="Loading your book">
        <div className="grid gap-4">
          <Card padded={false}>
            <div className="flex h-16 items-center gap-6 px-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="grid flex-1 gap-1.5">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
              <Skeleton className="h-control-sm w-24 rounded-sm" />
            </div>
            {expanded ? (
              <div className="grid h-48 grid-cols-[1.35fr_1fr] border-t border-hairline-soft">
                <div className="grid content-start gap-3 p-5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="mt-2 h-20 w-full" />
                </div>
                <div className="grid content-start gap-3 border-l border-hairline-soft p-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-full rounded-full" />
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-3 w-full" />
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
          <div className="grid gap-3">
            <Skeleton className="h-11 w-full max-w-2xl rounded-lg" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-control w-96 rounded-md" />
              <Skeleton className="ml-auto h-control w-80 rounded-md" />
            </div>
          </div>
          <TableSkeleton rows={10} />
        </div>
      </PageLoading>
    </>
  )
}

function BookView({
  book,
  chart,
}: {
  book: RmBook
  chart: { expanded: boolean; toggle: () => void }
}) {
  const [params, setParams] = useBookParams()
  const navigate = useNavigate()
  const laptop = useMedia(LAPTOP)
  const listRef = useRef<HTMLDivElement>(null)
  // What was typed into a call note, per customer, so walking away from a row keeps the draft.
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({})
  // The customer whose log-a-call form is open; moving the preview to someone else closes it.
  const [loggingCif, setLoggingCif] = useState<string | null>(null)

  const tabs = useMemo(
    () => book.segments.map((s) => ({ ...s, label: tabLabel(s.id, s.label) })),
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
  const totals = useMemo(() => sliceTotals(visible), [visible])

  // The table's own width, less its two hairline borders, decides which columns it can hold.
  const width = useWidth(listRef, 1140) - 2
  const fit = fitColumns(width, selected !== null)
  const columns = useMemo(
    () =>
      bookColumns({
        asOf: book.asOf,
        totals,
        fit,
        seriesLabel: book.basis.seriesLabel,
        asOfLabel: book.basis.asOfLabel,
        // On the Asked tab every row has asked: the chip would say nothing and cost the room.
        askedChip: params.tab !== 'asked_for_rm',
      }),
    // `fit` is rebuilt every render; its three parts are what the columns read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book.asOf, book.basis, totals, fit.signal, fit.slim, params.tab],
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
    const row = listRef.current?.querySelector(`tr[data-row-id="${CSS.escape(params.cif)}"]`)
    if (!row) return
    // Only when it is out of sight, and then to the middle: the table's header sticks under the
    // top bar and its footer to the bottom of the window, so "nearest" can park the row
    // underneath either one.
    const { top, bottom } = row.getBoundingClientRect()
    if (top < 140 || bottom > window.innerHeight - 56) row.scrollIntoView({ block: 'center' })
  }, [params.cif])

  const select = (cif: string | null) => setParams({ cif })

  /** Enter or a click opens the preview; Enter on the row already previewed opens the file. */
  function onRowClick(row: BookRow, event: { type: string }) {
    if (event.type === 'keydown' && selected?.cif === row.cif) {
      void navigate(`/customers/${encodeURIComponent(row.cif)}`)
      return
    }
    select(row.cif)
  }

  /** With the preview open, it follows keyboard focus down the list. */
  function onRowFocus(row: BookRow) {
    if (selected && row.cif !== selected.cif) select(row.cif)
  }

  /** Esc on the list closes the preview; inside the rail, the rail handles its own Esc. */
  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && selected) {
      event.preventDefault()
      select(null)
    }
  }

  const currentTab = tabs.find((s) => s.id === params.tab)?.label ?? 'All'
  const query = params.q.trim()
  const viewLabel = `${params.tab === 'all' ? 'the whole book' : currentTab}${
    query ? `, matching ‘${query}’` : ''
  } · ${formatCount(visible.length)} ${visible.length === 1 ? 'customer' : 'customers'}`
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

      {/* The rail sits beside everything under the title, so it opens at the top of the page,
          beside the band, rather than half way down beside the first rows. */}
      <div style={laptop ? LAPTOP_RAIL : undefined}>
        <SplitView
          open={selected !== null}
          rail={
            selected ? (
              <Preview
                row={selected}
                basis={book.basis}
                onClose={() => select(null)}
                logging={loggingCif === selected.cif}
                onLogging={(open) => setLoggingCif(open ? selected.cif : null)}
                draft={drafts[selected.cif] ?? ''}
                onDraft={(text) => setDrafts((all) => ({ ...all, [selected.cif]: text }))}
                compact={laptop}
              />
            ) : null
          }
        >
          <div className="grid gap-4">
            <SummaryBand
              book={book}
              view={visible}
              viewLabel={viewLabel}
              expanded={chart.expanded}
              onToggle={chart.toggle}
              onShowAsked={() => setParams({ tab: 'asked_for_rm', q: '' })}
            />

            <div className="grid gap-3">
              <BookTabs
                label="Book segments and work"
                tabs={tabs}
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
            </div>

            <div ref={listRef} onKeyDown={onListKeyDown}>
              <DataTable
                caption={`Customers in your book, ${currentTab}`}
                data={visible}
                columns={columns}
                getRowId={(r: BookRow) => r.cif}
                sorting={sorting}
                onSortingChange={onSortingChange}
                columnVisibility={fit.visibility}
                onRowClick={onRowClick}
                onRowFocus={onRowFocus}
                selectedId={selected?.cif ?? null}
                stickyTop={56}
                empty={
                  <NoRows
                    tab={params.tab}
                    tabLabel={currentTab}
                    query={params.q}
                    onClearSearch={() => setParams({ q: '' })}
                    onAllTab={() => setParams({ tab: 'all' })}
                  />
                }
              />
            </div>
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
  query,
  onClearSearch,
  onAllTab,
}: {
  tab: BookTab
  tabLabel: string
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
    idle_cash: {
      title: 'Nobody is sitting on idle cash',
      body: 'A customer who keeps more in savings than they need, month after month, shows up here.',
    },
    asked_for_rm: {
      title: `Nobody has ${ASKED_FOR_YOU.toLowerCase()}`,
      body: 'When a customer taps Talk to your relationship manager in the app, they show up here.',
    },
  }
  return <EmptyState icon={<Inbox />} title={copy[tab].title} body={copy[tab].body} />
}

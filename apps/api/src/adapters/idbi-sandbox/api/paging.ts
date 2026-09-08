/**
 * The two ways IDBI says "there is more", and the guard the sandbox proved we need.
 *
 * 393 pages by row cursor: the next request repeats the window and carries a
 * `paginationDetails` block copied off the *last row received* — `lastTxnId`, `lastTxnSrlNo`,
 * `lastPstdDate`, `lastTxnDate`, `lastBalance` — and `hasMoreData` is `"Y"` while more is
 * waiting. 595 pages the ordinary way, by `pageDetails.currentPageNumber` against
 * `totalPages`. Nothing pages by `page`/`page_size`/`total_pages`.
 *
 * The guard: in this sandbox `paginationDetails` is ignored outright. A request carrying the
 * spec's second-page cursor and a request carrying no cursor at all came back byte-identical,
 * and `hasMoreData` was `"N"` both times, so the protocol has never actually run here. That
 * cuts both ways — we cannot confirm the cursor works, and an environment that answers `"Y"`
 * while ignoring the cursor would hand us the same page forever. So the loop trusts the cursor
 * over the flag: if a page does not move the cursor on, or repeats a row we already hold, it
 * stops and says why. `hasMoreData` alone is never enough to justify another round trip.
 */

/** 393's cursor, in the field names the request body uses. */
export interface RowCursor {
  lastTxnId: string
  lastTxnSrlNo: string
  lastPstdDate: string
  lastTxnDate: string
  lastBalance: { amountValue: string; currencyCode: string }
}

/** Why a pager stopped. Anything but `complete` belongs in the log and the mapping report. */
export type PagingStop = 'complete' | 'cursor-stalled' | 'row-repeated' | 'max-pages'

export interface PagedRows<TRow> {
  rows: TRow[]
  pages: number
  stop: PagingStop
}

/** A runaway pager is a bug, not a big statement. Twenty-four months of daily rows is under 40 pages. */
const MAX_PAGES = 60

export interface RowCursorPagerOptions<TRow> {
  /** One request. `cursor` is null for the first page. */
  fetchPage: (cursor: RowCursor | null) => Promise<{ rows: readonly TRow[]; hasMore: boolean }>
  /** The cursor a page's last row implies, or null when the row cannot produce one. */
  cursorOf: (row: TRow) => RowCursor | null
  /** A stable identity per row, so a repeat is detectable. 393 has `txnId` plus `txnSrlNo`. */
  identityOf: (row: TRow) => string
  maxPages?: number | undefined
}

function sameCursor(a: RowCursor | null, b: RowCursor | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.lastTxnId === b.lastTxnId &&
    a.lastTxnSrlNo === b.lastTxnSrlNo &&
    a.lastPstdDate === b.lastPstdDate &&
    a.lastTxnDate === b.lastTxnDate &&
    a.lastBalance.amountValue === b.lastBalance.amountValue
  )
}

/**
 * Every row of a row-cursor statement.
 *
 * Rows arrive in the order the bank sent them and are not re-sorted here; ordering a statement
 * is a mapping decision, and `pstdDate` against `txnDate` is the only within-day signal there
 * is.
 */
export async function pageByRowCursor<TRow>(
  options: RowCursorPagerOptions<TRow>,
): Promise<PagedRows<TRow>> {
  const maxPages = options.maxPages ?? MAX_PAGES
  const rows: TRow[] = []
  const seen = new Set<string>()
  let cursor: RowCursor | null = null
  let pages = 0

  for (;;) {
    const page = await options.fetchPage(cursor)
    pages += 1

    let repeated = false
    for (const row of page.rows) {
      const id = options.identityOf(row)
      if (seen.has(id)) {
        repeated = true
        continue
      }
      seen.add(id)
      rows.push(row)
    }

    if (repeated) return { rows, pages, stop: 'row-repeated' }
    if (!page.hasMore || page.rows.length === 0) return { rows, pages, stop: 'complete' }

    const last = page.rows[page.rows.length - 1]
    const next = last === undefined ? null : options.cursorOf(last)
    // The bank says there is more but has not given us a way to ask for it, or has given us
    // the same way twice. Either way another request would repeat this page.
    if (next === null || sameCursor(next, cursor)) {
      return { rows, pages, stop: 'cursor-stalled' }
    }
    if (pages >= maxPages) return { rows, pages, stop: 'max-pages' }
    cursor = next
  }
}

export interface PageDetailsPagerOptions<TRow> {
  fetchPage: (page: number) => Promise<{
    rows: readonly TRow[]
    currentPage: number
    totalPages: number
  }>
  identityOf: (row: TRow) => string
  maxPages?: number | undefined
}

/**
 * Every row of a `pageDetails` statement — 595's shape, and the one place in the catalogue
 * where a page number is the right question to ask.
 *
 * The same distrust applies for the same reason: a page that does not advance
 * `currentPageNumber`, or that repeats rows, ends the loop rather than being asked again.
 */
export async function pageByPageDetails<TRow>(
  options: PageDetailsPagerOptions<TRow>,
): Promise<PagedRows<TRow>> {
  const maxPages = options.maxPages ?? MAX_PAGES
  const rows: TRow[] = []
  const seen = new Set<string>()
  let want = 1
  let pages = 0

  for (;;) {
    const page = await options.fetchPage(want)
    pages += 1

    let repeated = false
    for (const row of page.rows) {
      const id = options.identityOf(row)
      if (seen.has(id)) {
        repeated = true
        continue
      }
      seen.add(id)
      rows.push(row)
    }

    if (repeated) return { rows, pages, stop: 'row-repeated' }
    if (page.currentPage >= page.totalPages) return { rows, pages, stop: 'complete' }
    if (page.currentPage < want) return { rows, pages, stop: 'cursor-stalled' }
    if (pages >= maxPages) return { rows, pages, stop: 'max-pages' }
    want = page.currentPage + 1
  }
}

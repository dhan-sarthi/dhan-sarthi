import { web } from '@dhan/design'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type Row as TableRowModel,
  type RowData,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { cn } from '../lib/cn.ts'
import { columnHeaderClass } from './columnHeader.ts'
import { InteractiveRow } from './interactive-row.tsx'
import { Skeleton } from './Skeleton.tsx'

declare module '@tanstack/react-table' {
  // Generic parameters must match TanStack's declaration exactly, used or not.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Figures align right so their digits line up; everything else aligns left. */
    align?: 'left' | 'right' | 'center'
    /** A fixed width (px or any CSS length). Unset columns share what is left. */
    width?: number | string
    /** Extra classes on every body cell of the column. */
    cellClassName?: string
  }
}

/** How keyboard focus reached a row, for a page that lets a preview follow it. */
export type RowFocusCause = 'arrow' | 'tab' | 'pointer'

export interface DataTableProps<Row> {
  data: readonly Row[]
  // TanStack's own column type is invariant in its value parameter, so a table of mixed
  // columns can only be typed this loosely; each column is still checked where it is defined.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<Row, any>[]
  getRowId: (row: Row) => string
  /** What the table is, for a screen reader: "Customers in your book". */
  caption: string
  /** Controlled sorting. Leave both unset and the table keeps its own. */
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  initialSorting?: SortingState
  /**
   * Column ids to show or hide (`{ signal: false }`). Controlled by the page: a list that opens a
   * side rail hides its widest columns so the rest keep room to read.
   */
  columnVisibility?: VisibilityState
  /**
   * A click, Enter or Space on a row. The event says which: a page that opens a preview on the
   * first press and the file on the second can tell a keypress from a click.
   */
  onRowClick?: (row: Row, event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  /**
   * Focus landed on a row, and how: `arrow` (the arrow keys, Home or End walked to it), `tab`
   * (Tab came into the table) or `pointer` (a click). A preview that follows the keyboard down
   * the list should follow `arrow` only, so Tab from the chosen row goes on into the preview of
   * that same customer. Focus moving to a control inside the row does not count. Rows take focus
   * only when they are clickable.
   */
  onRowFocus?: (row: Row, cause: RowFocusCause) => void
  selectedId?: string | null
  loading?: boolean
  /** Shown in place of the body when there are no rows (and not loading). */
  empty?: ReactNode
  density?: 'regular' | 'dense'
  /**
   * `page`: the page scrolls, the header sticks under the top bar and the footer to the bottom of
   * the window; a table too wide for its card scrolls sideways inside it instead of the page.
   * `{ maxHeight }`: the table scrolls inside its own box.
   */
  scroll?: 'page' | { maxHeight: number | string }
  /** Distance from the top of the window the header sticks at, in page scroll. */
  stickyTop?: number
  /**
   * `fixed` (the default): columns take their `meta.width` and share the rest, and a cell's
   * content is clipped to its column, so a long signal can never push the table wider than its
   * container (or under a side rail). `auto` sizes columns to their content.
   */
  layout?: 'fixed' | 'auto'
  className?: string
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

function widthStyle(width: number | string | undefined): CSSProperties | undefined {
  if (width === undefined) return undefined
  return { width: typeof width === 'number' ? `${width}px` : width }
}

/**
 * The dense, quiet table every list on the console is drawn with (TanStack Table v8 underneath).
 *
 * Sortable headers announce their order (`aria-sort`), tint the sorted column, and take a click
 * anywhere in the header cell. A clickable table is one Tab stop (a roving tabindex): Tab lands on
 * the selected row, or the one last focused, the arrow keys (and Home, End) move between rows,
 * Enter opens one, and Tab again leaves the table. A clickable row is one stop however many
 * badges it holds (see `interactive-row.tsx`). Every body row carries `data-row-id`, its
 * `getRowId`, so a page can find the row an event came from without marking up its cells. Column
 * footers render as a sticky aggregate row (count, Σ value), and loading draws skeleton rows of
 * the same height, so the table never jumps when the data arrives.
 *
 * Rows are memoised: moving the selection down the list redraws the two rows it changed, not
 * every row and every badge in them.
 */
export function DataTable<Row>({
  data,
  columns,
  getRowId,
  caption,
  sorting: controlledSorting,
  onSortingChange,
  initialSorting = [],
  columnVisibility = {},
  onRowClick,
  onRowFocus,
  selectedId = null,
  loading = false,
  empty,
  density = 'regular',
  scroll = 'page',
  stickyTop = web.size.topbar,
  layout = 'fixed',
  className,
}: DataTableProps<Row>) {
  const [ownSorting, setOwnSorting] = useState<SortingState>(initialSorting)
  const sorting = controlledSorting ?? ownSorting

  // TanStack's hook returns a fresh table object every render by design, which the compiler-era
  // rule reports as unmemoisable. That is the library's contract, not a bug here: the table is
  // only read during this render, and the memoised rows below are handed its rows, never it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data as Row[],
    columns,
    getRowId: (row) => getRowId(row),
    state: { sorting, columnVisibility },
    onSortingChange: onSortingChange ?? setOwnSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows
  const visibleColumns = table.getVisibleLeafColumns()
  const visibleKey = visibleColumns.map((c) => c.id).join(',')
  const hasFooter = visibleColumns.some((c) => c.columnDef.footer !== undefined)
  const inPage = scroll === 'page'
  const rowHeight = density === 'dense' ? 'h-row-dense' : 'h-row'
  const clickable = onRowClick !== undefined

  /* ------------------------------------------------ Roving tabindex */

  // The one row Tab lands on: the row last focused, which a new selection from outside (a
  // click, the address) moves to the selected row.
  const [activeId, setActiveId] = useState<string | null>(selectedId)
  const [seenSelected, setSeenSelected] = useState(selectedId)
  if (selectedId !== seenSelected) {
    setSeenSelected(selectedId)
    if (selectedId !== null) setActiveId(selectedId)
  }
  const tabbableId =
    activeId !== null && rows.some((r) => r.id === activeId)
      ? activeId
      : selectedId !== null && rows.some((r) => r.id === selectedId)
        ? selectedId
        : (rows[0]?.id ?? null)

  // The page's handlers change every render; the rows are handed stable ones that read the
  // latest, so a memoised row is not redrawn for a new function that does the same thing.
  const latest = useRef({ onRowClick, onRowFocus })
  useLayoutEffect(() => {
    latest.current = { onRowClick, onRowFocus }
  })
  // Set just before the table moves focus itself, so the row's focus handler can say why.
  const moving = useRef(false)
  const pressed = useRef(false)

  const handleClick = useCallback((row: Row, event: MouseEvent<HTMLElement>) => {
    latest.current.onRowClick?.(row, event)
  }, [])

  const handleFocus = useCallback(
    (row: Row, id: string, event: FocusEvent<HTMLTableRowElement>) => {
      if (event.target !== event.currentTarget) return
      const cause: RowFocusCause = moving.current ? 'arrow' : pressed.current ? 'pointer' : 'tab'
      moving.current = false
      pressed.current = false
      setActiveId(id)
      latest.current.onRowFocus?.(row, cause)
    },
    [],
  )

  const handlePointerDown = useCallback(() => {
    pressed.current = true
  }, [])

  const handleKeyDown = useCallback((row: Row, event: KeyboardEvent<HTMLTableRowElement>) => {
    // Only the row's own keys: Enter on a button inside a row belongs to the button.
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      latest.current.onRowClick?.(row, event)
      return
    }
    const here = event.currentTarget
    const body = here.parentElement
    const target =
      event.key === 'ArrowDown'
        ? here.nextElementSibling
        : event.key === 'ArrowUp'
          ? here.previousElementSibling
          : event.key === 'Home'
            ? body?.firstElementChild
            : event.key === 'End'
              ? body?.lastElementChild
              : undefined
    if (target === undefined) return
    event.preventDefault()
    if (target instanceof HTMLElement && target !== here) {
      moving.current = true
      target.focus()
    }
  }, [])

  /* ------------------------------------------------ Overflow */

  // In page scroll the table's header sticks to the window, which a scrolling box would break,
  // so the box scrolls sideways only once the table is wider than its card (fixed-width columns
  // on a tablet, say), and then the header sits at the top of the table.
  const box = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    if (!inPage) return
    const outer = box.current
    const inner = tableRef.current
    if (!outer || !inner) return
    const measure = () => setOverflowing(inner.scrollWidth > outer.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(outer)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [inPage])
  const stickToWindow = inPage && !overflowing
  const stickyHead: CSSProperties | undefined = stickToWindow ? { top: stickyTop } : undefined

  return (
    <div
      ref={box}
      className={cn(
        'rounded-lg border border-hairline bg-surface',
        (!inPage || overflowing) && 'overflow-auto',
        className,
      )}
      style={inPage ? undefined : { maxHeight: scroll.maxHeight }}
    >
      <table
        ref={tableRef}
        className={cn(
          'w-full border-separate border-spacing-0 text-body',
          layout === 'fixed' && 'table-fixed',
        )}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header, i) => {
                const meta = header.column.columnDef.meta
                const sortable = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                const align = meta?.align ?? 'left'
                const first = i === 0
                const last = i === group.headers.length - 1
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                    }
                    style={{ ...widthStyle(meta?.width), ...stickyHead }}
                    className={cn(
                      columnHeaderClass,
                      'sticky top-0 z-10 truncate',
                      sorted ? 'bg-brand-wash text-ink' : 'bg-surface',
                      first && 'rounded-tl-lg pl-4',
                      last && 'rounded-tr-lg pr-4',
                      ALIGN[align],
                    )}
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          // The whole header cell is the button's hit area, so a sort is one tap
                          // anywhere in it, not on a 16px line of text.
                          'group inline-flex items-center gap-1 rounded-xs transition-colors after:absolute after:inset-0 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus',
                          align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? (
                          <ArrowUp className="size-3 text-brand" aria-hidden />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="size-3 text-brand" aria-hidden />
                        ) : (
                          <ChevronsUpDown
                            className="size-3 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60"
                            aria-hidden
                          />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {loading ? (
            Array.from({ length: 8 }, (_, r) => (
              <tr key={`skeleton-${r}`} className={rowHeight} aria-hidden>
                {visibleColumns.map((column, c) => (
                  <td
                    key={c}
                    className={cn(
                      'border-b border-hairline-soft px-3',
                      c === 0 && 'pl-4',
                      c === visibleColumns.length - 1 && 'pr-4',
                    )}
                  >
                    <Skeleton
                      className={cn(
                        'h-3',
                        c === 0 ? 'w-40' : 'w-16',
                        column.columnDef.meta?.align === 'right' && 'ml-auto',
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={visibleColumns.length} className="px-4 py-12">
                {empty}
              </td>
            </tr>
          ) : (
            <RowScope interactive={clickable}>
              {rows.map((row) => (
                <BodyRow<Row>
                  key={row.id}
                  row={row}
                  columns={columns}
                  visibleKey={visibleKey}
                  selected={row.id === selectedId}
                  tabbable={row.id === tabbableId}
                  clickable={clickable}
                  rowHeight={rowHeight}
                  layout={layout}
                  onClick={handleClick}
                  onFocus={handleFocus}
                  onKeyDown={handleKeyDown}
                  onPointerDown={handlePointerDown}
                />
              ))}
            </RowScope>
          )}
        </tbody>

        {hasFooter && !loading && rows.length > 0 ? (
          <tfoot>
            {table.getFooterGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header, i) => {
                  const align = header.column.columnDef.meta?.align ?? 'left'
                  return (
                    <td
                      key={header.id}
                      className={cn(
                        'sticky bottom-0 h-10 border-t border-hairline bg-canvas-top px-3 text-label whitespace-nowrap text-ink-soft',
                        i === 0 && 'rounded-bl-lg pl-4',
                        i === group.headers.length - 1 && 'rounded-br-lg pr-4',
                        ALIGN[align],
                        align === 'right' && 'tabular',
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.footer, header.getContext())}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

interface BodyRowProps<Row> {
  row: TableRowModel<Row>
  /** Not read: a new column set (or a column shown or hidden) must redraw the row. */
  columns: unknown
  visibleKey: string
  selected: boolean
  tabbable: boolean
  clickable: boolean
  rowHeight: string
  layout: 'fixed' | 'auto'
  onClick: (row: Row, event: MouseEvent<HTMLElement>) => void
  onFocus: (row: Row, id: string, event: FocusEvent<HTMLTableRowElement>) => void
  onKeyDown: (row: Row, event: KeyboardEvent<HTMLTableRowElement>) => void
  onPointerDown: () => void
}

function BodyRowImpl<Row>({
  row,
  selected,
  tabbable,
  clickable,
  rowHeight,
  layout,
  onClick,
  onFocus,
  onKeyDown,
  onPointerDown,
}: BodyRowProps<Row>) {
  return (
    <tr
      data-row-id={row.id}
      data-selected={selected || undefined}
      aria-current={selected || undefined}
      tabIndex={clickable ? (tabbable ? 0 : -1) : undefined}
      onClick={clickable ? (e) => onClick(row.original, e) : undefined}
      onKeyDown={clickable ? (e) => onKeyDown(row.original, e) : undefined}
      onFocus={clickable ? (e) => onFocus(row.original, row.id, e) : undefined}
      onPointerDown={clickable ? onPointerDown : undefined}
      className={cn(
        rowHeight,
        'group/row transition-colors duration-tap',
        clickable &&
          'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
        selected ? 'bg-row-selected' : clickable && 'hover:bg-row-hover',
      )}
    >
      {row.getVisibleCells().map((cell, i, cells) => {
        const meta = cell.column.columnDef.meta
        return (
          <td
            key={cell.id}
            className={cn(
              'border-b border-hairline-soft px-3 align-middle',
              layout === 'fixed' && 'overflow-hidden',
              i === 0 && 'pl-4',
              i === cells.length - 1 && 'pr-4',
              ALIGN[meta?.align ?? 'left'],
              meta?.align === 'right' && 'tabular',
              meta?.cellClassName,
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        )
      })}
    </tr>
  )
}

// Pure, so the table library stays in the chunks of the pages that draw a table.
const BodyRow = /* @__PURE__ */ memo(BodyRowImpl) as typeof BodyRowImpl

/** Clickable rows are one Tab stop each, so the badges inside them give theirs up. */
function RowScope({ interactive, children }: { interactive: boolean; children: ReactNode }) {
  return interactive ? <InteractiveRow>{children}</InteractiveRow> : <>{children}</>
}

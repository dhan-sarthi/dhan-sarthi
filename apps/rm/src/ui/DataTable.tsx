import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
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
  onRowClick?: (row: Row) => void
  selectedId?: string | null
  loading?: boolean
  /** Shown in place of the body when there are no rows (and not loading). */
  empty?: ReactNode
  density?: 'regular' | 'dense'
  /**
   * `page`: the page scrolls, the header sticks under the top bar and the footer to the bottom of
   * the window. `{ maxHeight }`: the table scrolls inside its own box.
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
 * Sortable headers announce their order (`aria-sort`) and tint the sorted column. Rows are
 * keyboard reachable when they open something: Tab lands on a row, the arrows move between rows,
 * Enter opens it. Column footers render as a sticky aggregate row (count, Σ value), and loading
 * draws skeleton rows of the same height, so the table never jumps when the data arrives.
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
  selectedId = null,
  loading = false,
  empty,
  density = 'regular',
  scroll = 'page',
  stickyTop = 56,
  layout = 'fixed',
  className,
}: DataTableProps<Row>) {
  const [ownSorting, setOwnSorting] = useState<SortingState>(initialSorting)
  const sorting = controlledSorting ?? ownSorting

  // TanStack's hook returns a fresh table object every render by design, which the compiler-era
  // rule reports as unmemoisable. That is the library's contract, not a bug here: the table is
  // only read during this render and never passed to a memoised child.
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
  const hasFooter = visibleColumns.some((c) => c.columnDef.footer !== undefined)
  const inPage = scroll === 'page'
  const rowHeight = density === 'dense' ? 'h-row-dense' : 'h-row'
  const stickyHead: CSSProperties | undefined = inPage ? { top: stickyTop } : undefined

  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, row: Row) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onRowClick?.(row)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const sibling =
        event.key === 'ArrowDown'
          ? event.currentTarget.nextElementSibling
          : event.currentTarget.previousElementSibling
      if (sibling instanceof HTMLElement) sibling.focus()
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-hairline bg-surface',
        !inPage && 'overflow-auto',
        className,
      )}
      style={inPage ? undefined : { maxHeight: scroll.maxHeight }}
    >
      <table
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
                      'sticky top-0 z-10 h-9 truncate border-b border-hairline px-3 text-caption font-medium whitespace-nowrap text-ink-faint',
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
                          'group inline-flex items-center gap-1 rounded-xs transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus',
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
            rows.map((row) => {
              const selected = row.id === selectedId
              const clickable = onRowClick !== undefined
              return (
                <tr
                  key={row.id}
                  data-selected={selected || undefined}
                  aria-current={selected || undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onRowClick(row.original) : undefined}
                  onKeyDown={clickable ? (e) => onRowKeyDown(e, row.original) : undefined}
                  className={cn(
                    rowHeight,
                    'group/row transition-colors duration-100',
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
            })
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

/** The usual first cell: avatar, a name, and a quiet line under it ("34 · Pune"). */
export function CellStack({
  leading,
  title,
  subtitle,
  className,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {leading}
      <div className="min-w-0">
        <div className="truncate text-label text-ink">{title}</div>
        {subtitle ? (
          <div className="truncate text-caption font-normal text-ink-faint">{subtitle}</div>
        ) : null}
      </div>
    </div>
  )
}

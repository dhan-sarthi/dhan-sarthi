import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { formatCount } from '../../lib/format.ts'
import { IconButton, Input, Kbd, Select } from '../../ui/index.ts'
import { SORTS, isSortKey, type SortDir, type SortKey } from './rows.ts'

/**
 * Search on the left, sort on the right, with how many rows the two leave between them. `/`
 * jumps to the search from anywhere on the page, as in most tools an RM already uses; Esc in
 * the box clears it, and a second Esc leaves it.
 */
export function Toolbar({
  query,
  onQuery,
  sort,
  dir,
  onSort,
  shown,
  of,
}: {
  query: string
  onQuery: (q: string) => void
  sort: SortKey
  dir: SortDir
  onSort: (sort: SortKey, dir?: SortDir) => void
  shown: number
  of: number
}) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
        return
      }
      event.preventDefault()
      input.current?.focus()
      input.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = shown !== of

  // The toolbar measures its own width, not the window's: beside the preview rail it has less
  // room, and the count and the "Sort by" words give way before the controls do. Where even the
  // two controls do not fit side by side (a phone), the sort drops under the search.
  return (
    <div className="@container">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Input
          ref={input}
          type="text"
          role="searchbox"
          aria-label="Search the book by name, CIF or city"
          placeholder="Search by name, CIF or city"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            // Handled here, so an open preview does not also close on the same key.
            e.stopPropagation()
            if (query !== '') onQuery('')
            else e.currentTarget.blur()
          }}
          className="min-w-0 flex-[1_1_14rem] @3xl:max-w-sm"
          leading={<Search aria-hidden />}
          trailing={
            query !== '' ? (
              <IconButton
                label="Clear search"
                icon={<X aria-hidden />}
                size="sm"
                tooltip={false}
                onClick={() => {
                  onQuery('')
                  input.current?.focus()
                }}
              />
            ) : (
              <Kbd aria-hidden className="mr-1">
                /
              </Kbd>
            )
          }
        />
        <p
          className="sr-only text-label-plain whitespace-nowrap text-ink-faint tabular @2xl:not-sr-only"
          aria-live="polite"
        >
          {filtered ? (
            <>
              <span className="text-ink">{formatCount(shown)}</span> of {formatCount(of)}
            </>
          ) : (
            `${formatCount(of)} ${of === 1 ? 'customer' : 'customers'}`
          )}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <label
            htmlFor="book-sort"
            className="sr-only mr-1 text-label-plain whitespace-nowrap text-ink-faint @3xl:not-sr-only"
          >
            Sort by
          </label>
          <Select
            id="book-sort"
            value={sort}
            onChange={(e) => {
              if (isSortKey(e.target.value)) onSort(e.target.value)
            }}
            className="w-52 @3xl:w-72"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          <IconButton
            variant="secondary"
            label={
              dir === 'desc' ? 'Descending: switch to ascending' : 'Ascending: switch to descending'
            }
            icon={
              dir === 'desc' ? (
                <ArrowDownWideNarrow aria-hidden />
              ) : (
                <ArrowUpNarrowWide aria-hidden />
              )
            }
            onClick={() => onSort(sort, dir === 'desc' ? 'asc' : 'desc')}
          />
        </div>
      </div>
    </div>
  )
}

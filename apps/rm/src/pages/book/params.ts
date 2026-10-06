import type { BookTab } from '@dhan/contracts'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import {
  DEFAULT_SORT,
  defaultDir,
  isBookTab,
  isSortKey,
  type SortDir,
  type SortKey,
} from './rows.ts'

/**
 * The Book page's state lives in the address, so a filtered, sorted view with a customer open in
 * the preview survives a reload, comes back on Back from their file, and can be pasted to a
 * colleague. Defaults are left out, so the plain book is plain `/book`.
 *
 *   tab   one of `BookTab` ("idle_cash"); Today can link straight to a slice of the book
 *   q     the search text
 *   sort  a `SortKey`; `dir` is asc or desc, written only when it differs from the key's usual
 *   cif   the customer open in the preview rail
 */
export interface BookParams {
  tab: BookTab
  q: string
  sort: SortKey
  dir: SortDir
  cif: string | null
}

export function useBookParams(): [BookParams, (patch: Partial<BookParams>) => void] {
  const [search, setSearch] = useSearchParams()

  const params = useMemo<BookParams>(() => {
    const tab = search.get('tab')
    const sort = search.get('sort')
    const key = isSortKey(sort) ? sort : DEFAULT_SORT.key
    const dir = search.get('dir')
    return {
      tab: isBookTab(tab) ? tab : 'all',
      q: search.get('q') ?? '',
      sort: key,
      dir: dir === 'asc' || dir === 'desc' ? dir : defaultDir(key),
      cif: search.get('cif') || null,
    }
  }, [search])

  const update = useCallback(
    (patch: Partial<BookParams>) => {
      // `replace`, not push: typing a search or walking the list with the arrow keys would
      // otherwise bury the page under one history entry per keystroke.
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev)
          const write = (name: string, value: string | null, fallback: string | null) => {
            if (value === null || value === '' || value === fallback) next.delete(name)
            else next.set(name, value)
          }
          if ('tab' in patch) write('tab', patch.tab ?? null, 'all')
          if ('q' in patch) write('q', patch.q ?? null, '')
          if ('cif' in patch) write('cif', patch.cif ?? null, null)
          if ('sort' in patch || 'dir' in patch) {
            const key = patch.sort ?? (isSortKey(prev.get('sort')) ? prev.get('sort') : null)
            const sortKey: SortKey = isSortKey(key) ? key : DEFAULT_SORT.key
            const dir = patch.dir ?? defaultDir(sortKey)
            write('sort', sortKey, DEFAULT_SORT.key)
            write('dir', dir, defaultDir(sortKey))
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearch],
  )

  return [params, update]
}

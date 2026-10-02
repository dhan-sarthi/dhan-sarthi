import type { BookRow } from '@dhan/contracts'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBook } from '../api/queries.ts'
import { useSession } from '../api/session.ts'
import { formatInr } from '../lib/format.ts'
import { matchPage, rankBy, rankCustomers, type CustomerMatch } from '../lib/search.ts'
import {
  Avatar,
  CommandPalette,
  SEGMENT,
  useCommandShortcut,
  type CommandGroupDef,
  type CommandItemDef,
} from '../ui/index.ts'
import { NAV } from './nav.ts'
import { useRecentCustomers } from './recent.ts'

/** More than this and the list stops being an answer and starts being the book again. */
const MAX_CUSTOMERS = 8

/** What the palette's result count calls each group's rows: "3 customers, 1 page". */
const CUSTOMER = { one: 'customer', many: 'customers' }
const PAGE = { one: 'page', many: 'pages' }

/**
 * Cmd-K over the book and the pages. Customers are found by name, CIF or city and ranked by how
 * well they match (`lib/search.ts`): the person typed comes first, and a name that merely shares
 * some letters is not listed. Before anything is typed it offers the customers opened most
 * recently. Each row says segment and city, so two people with one name are told apart.
 */
export function useSearch() {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen((v) => !v), [])
  useCommandShortcut(toggle)
  return { open, setOpen }
}

export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const book = useBook()
  const session = useSession()
  const recent = useRecentCustomers(session?.rm.rmId ?? null)
  const [query, setQuery] = useState('')
  // Every open starts from an empty box and the recent list, however the palette was closed
  // (Esc, a pick, or Cmd-K again). Adjusted during render rather than in an effect, so the
  // stale query never paints.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setQuery('')
  }

  const groups = useMemo<CommandGroupDef[]>(() => {
    const rows = book.data?.rows ?? []
    const toItem = (row: BookRow, match: CustomerMatch | null): CommandItemDef => ({
      id: row.cif,
      label: row.name,
      highlight: match?.highlight ?? null,
      // A CIF match shows the CIF, so the RM can see it was the number that matched.
      hint: [
        SEGMENT[row.segment].label,
        row.city,
        match?.field === 'cif' ? row.cif : formatInr(row.relationshipValue, { short: true }),
      ].join(' · '),
      icon: <Avatar name={row.name} initials={row.initials} size="sm" />,
      onSelect: () => void navigate(`/customers/${encodeURIComponent(row.cif)}`),
    })

    const typed = query.trim() !== ''
    const pages = (typed ? rankBy(NAV, (item) => matchPage(query, item)) : NAV).map(
      (item): CommandItemDef => ({
        id: `page:${item.to}`,
        label: item.label,
        hint: item.hint,
        icon: <item.icon aria-hidden />,
        onSelect: () => void navigate(item.to),
      }),
    )

    if (!typed) {
      const byCif = new Map(rows.map((r) => [r.cif, r] as const))
      const recentRows = recent.flatMap((cif) => {
        const row = byCif.get(cif)
        return row ? [row] : []
      })
      return [
        { heading: 'Recent', noun: CUSTOMER, items: recentRows.map((row) => toItem(row, null)) },
        { heading: 'Go to', noun: PAGE, items: pages },
      ]
    }

    const customers = rankCustomers(query, rows, MAX_CUSTOMERS)
    return [
      {
        heading: 'Customers',
        noun: CUSTOMER,
        items: customers.map(({ row, match }) => toItem(row, match)),
      },
      { heading: 'Go to', noun: PAGE, items: pages },
    ]
  }, [book.data, navigate, query, recent])

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      groups={groups}
      loading={book.isPending}
      query={query}
      onQueryChange={setQuery}
      emptyText={`No customer or page matches ‘${query.trim()}’. Search looks at names, CIFs and cities.`}
    />
  )
}

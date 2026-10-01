import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useBook } from '../api/queries.ts'
import { formatInr } from '../lib/format.ts'
import {
  Avatar,
  CommandPalette,
  SEGMENT,
  useCommandShortcut,
  type CommandGroupDef,
} from '../ui/index.ts'
import { NAV } from './nav.ts'

/**
 * Cmd-K over the book and the pages. Customers are searchable by name, CIF and city; the hint
 * gives the segment and the relationship value so two people with one name are told apart.
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

  const groups = useMemo<CommandGroupDef[]>(() => {
    const customers = (book.data?.rows ?? []).map((row) => ({
      id: row.cif,
      label: row.name,
      hint: `${SEGMENT[row.segment].label} · ${row.city} · ${formatInr(row.relationshipValue, { short: true })}`,
      keywords: [row.cif, row.city, row.segment],
      icon: <Avatar name={row.name} initials={row.initials} size="sm" />,
      onSelect: () => navigate(`/customers/${encodeURIComponent(row.cif)}`),
    }))
    const pages = NAV.map((item) => ({
      id: `page:${item.to}`,
      label: item.label,
      hint: item.hint,
      icon: <item.icon aria-hidden />,
      onSelect: () => navigate(item.to),
    }))
    return [
      { heading: 'Customers', items: customers },
      { heading: 'Go to', items: pages },
    ]
  }, [book.data, navigate])

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      groups={groups}
      loading={book.isPending}
    />
  )
}

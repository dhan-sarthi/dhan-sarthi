/**
 * What the Book page does to the rows it is given: which tab a row belongs to, whether it
 * matches the search, how each column sorts, and what the footer adds up.
 *
 * Pure and React-free, so `rows.test.ts` runs it under `node --test`. Nothing here invents a
 * quantity: tabs follow the contract's definition of `BookTab`, and the sums are the core's own
 * (`bookTotals`, `allocationTotals`), so a footer figure always reconciles with the rows above it.
 */
import type {
  BookRow,
  BookTab,
  GoalHealth,
  Signal,
  SignalSeverity,
  Strength,
} from '@dhan/contracts'
import { allocationTotals, bookTotals } from '@dhan/core'
import { daysBetween } from '../../lib/format.ts'

/* ---------------------------------------------------------------- Tabs */

export const BOOK_TABS: readonly BookTab[] = [
  'all',
  'priority',
  'affluent',
  'mass',
  'at_risk',
  'idle_cash',
  'asked_for_rm',
]

export function isBookTab(value: string | null): value is BookTab {
  return value !== null && (BOOK_TABS as readonly string[]).includes(value)
}

/**
 * Which rows each tab shows, from what a row carries. Every tab but one is exact. The server
 * counts a customer under Idle cash when *any* of their signals is idle cash, but a row only
 * carries its top signal, so the console can only see idle cash where it is the top one.
 * `hiddenFromTab` says how many the list therefore cannot show, and the page says so out loud
 * rather than letting the tab's count and the list disagree in silence.
 */
export const IN_TAB: Readonly<Record<BookTab, (row: BookRow) => boolean>> = {
  all: () => true,
  priority: (row) => row.segment === 'priority',
  affluent: (row) => row.segment === 'affluent',
  mass: (row) => row.segment === 'mass',
  at_risk: (row) => row.goal.health !== 'on_track',
  idle_cash: (row) => row.topSignal?.kind === 'idle_cash',
  asked_for_rm: (row) => row.openHandoff,
}

/** Customers the server counts in a tab that the rows cannot show. Zero for every exact tab. */
export function hiddenFromTab(serverCount: number, rows: readonly BookRow[], tab: BookTab): number {
  return Math.max(0, serverCount - rows.filter(IN_TAB[tab]).length)
}

/* ---------------------------------------------------------------- Search */

/**
 * Name, CIF or city, case-insensitive. Every word of the query has to match somewhere, so
 * "pune karan" narrows to one person instead of widening to everyone in Pune.
 */
export function matchesQuery(row: BookRow, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = `${row.name} ${row.cif} ${row.city}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/* ---------------------------------------------------------------- Sorting */

export type SortKey = 'value' | 'name' | 'goal' | 'signal' | 'strength' | 'activity' | 'change'
export type SortDir = 'asc' | 'desc'

/**
 * The orders a desk asks for by name, each with the direction it is usually wanted in. Column
 * ids in the table are these keys, so a header click and the Sort menu are the same state.
 */
export const SORTS: readonly { key: SortKey; label: string; dir: SortDir }[] = [
  { key: 'value', label: 'Relationship value', dir: 'desc' },
  { key: 'signal', label: 'Top signal, most pressing first', dir: 'desc' },
  { key: 'goal', label: 'Goal health, worst first', dir: 'desc' },
  { key: 'change', label: 'Balances, biggest 3-month fall first', dir: 'asc' },
  { key: 'strength', label: 'Strength, weakest first', dir: 'asc' },
  { key: 'activity', label: 'Last activity, most recent first', dir: 'desc' },
  { key: 'name', label: 'Name, A to Z', dir: 'asc' },
]

export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: 'value', dir: 'desc' }

export function isSortKey(value: string | null): value is SortKey {
  return value !== null && SORTS.some((s) => s.key === value)
}

export function defaultDir(key: SortKey): SortDir {
  return SORTS.find((s) => s.key === key)?.dir ?? 'desc'
}

const SEVERITY_RANK: Readonly<Record<SignalSeverity, number>> = {
  urgent: 3,
  important: 2,
  opportunity: 1,
}

/** Worse is higher, so a descending sort puts the goals in trouble on top. */
export const HEALTH_RANK: Readonly<Record<GoalHealth, number>> = {
  on_track: 0,
  at_risk: 1,
  off_track: 2,
}

export const STRENGTH_RANK: Readonly<Record<Strength['level'], number>> = {
  low: 0,
  medium: 1,
  high: 2,
}

/**
 * Ascending order of pressure: no signal, then by severity, then the bigger rupee figure, then
 * the nearer deadline. A descending sort reads as the engine's own ranking, most pressing first.
 */
export function compareSignals(a: Signal | null, b: Signal | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  if (bySeverity !== 0) return bySeverity
  const byFigure = (a.figure ?? 0) - (b.figure ?? 0)
  if (byFigure !== 0) return byFigure
  // A deadline makes a signal more pressing, and a nearer one more so.
  const da = a.deadlineDays ?? Number.POSITIVE_INFINITY
  const db = b.deadlineDays ?? Number.POSITIVE_INFINITY
  return da === db ? 0 : da < db ? 1 : -1
}

/* ---------------------------------------------------------------- Footer */

export interface SliceTotals {
  customers: number
  relationshipValue: number
  allocation: ReturnType<typeof allocationTotals>
  onTrack: number
  actNow: number
  lowStrength: number
  /** Customers with any activity on record in the 30 days up to the as-of date. */
  activeIn30Days: number
}

/** The footer row: what the rows on screen add up to, never the whole book's figure. */
export function sliceTotals(rows: readonly BookRow[], asOf: string): SliceTotals {
  const totals = bookTotals(rows)
  return {
    customers: totals.customers,
    relationshipValue: totals.relationshipValue,
    allocation: allocationTotals(rows),
    onTrack: rows.filter((r) => r.goal.health === 'on_track').length,
    actNow: rows.filter((r) => r.topSignal?.severity === 'urgent').length,
    lowStrength: rows.filter((r) => r.strength.level === 'low').length,
    activeIn30Days: rows.filter((r) => {
      if (r.lastActivityAt === null) return false
      const days = daysBetween(r.lastActivityAt, asOf)
      return days >= 0 && days <= 30
    }).length,
  }
}

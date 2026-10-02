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
  GoalKind,
  Segment,
  Signal,
  SignalSeverity,
  Strength,
} from '@dhan/contracts'
import { allocationTotals, bookTotals } from '@dhan/core'

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
 * Which rows each tab shows, from what a row carries, by the contract's definition of `BookTab`.
 * Idle cash reads `signalKinds`, every kind the customer has and not only the top one, which is
 * exactly what the server counts: the tab's number and the rows under it agree by construction.
 */
export const IN_TAB: Readonly<Record<BookTab, (row: BookRow) => boolean>> = {
  all: () => true,
  priority: (row) => row.segment === 'priority',
  affluent: (row) => row.segment === 'affluent',
  mass: (row) => row.segment === 'mass',
  at_risk: (row) => row.goal.health !== 'on_track',
  idle_cash: (row) => row.signalKinds.includes('idle_cash'),
  asked_for_rm: (row) => row.openHandoff,
}

/**
 * The tabs in two groups: who the customer is (their segment) and what there is to do (the
 * work). The strip draws a divider between them, so two kinds of filter never read as one set.
 */
export const SEGMENT_TABS: readonly BookTab[] = ['all', 'priority', 'affluent', 'mass']
export const WORK_TABS: readonly BookTab[] = ['at_risk', 'idle_cash', 'asked_for_rm']

/**
 * The console's one name for a customer who tapped Talk to your relationship manager: Today's
 * KPI, the row chip, the rail's banner and the journey's filter all say it. The server sends the
 * same words for the tab; the page names it here as well, so the tab cannot drift from the rest.
 */
export const ASKED_FOR_YOU = 'Asked for you'

export function tabLabel(id: BookTab, serverLabel: string): string {
  return id === 'asked_for_rm' ? ASKED_FOR_YOU : serverLabel
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
}

/** The footer row: what the rows on screen add up to, never the whole book's figure. */
export function sliceTotals(rows: readonly BookRow[]): SliceTotals {
  const totals = bookTotals(rows)
  return {
    customers: totals.customers,
    relationshipValue: totals.relationshipValue,
    allocation: allocationTotals(rows),
    onTrack: rows.filter((r) => r.goal.health === 'on_track').length,
    actNow: rows.filter((r) => r.topSignal?.severity === 'urgent').length,
  }
}

/* ---------------------------------------------------------------- Row forms */

/**
 * A signal title split for a two-line table cell: the head is what happened, the tail the
 * qualifier that rides on the second line beside the severity. "₹4.2Cr short on life cover — 2
 * dependents" becomes "₹4.2Cr short on life cover" and "2 dependents"; "₹30,500 a month in EMIs,
 * a repayment missed" becomes "₹30,500 a month in EMIs" and "a repayment missed". A title with
 * neither break is all head. Nothing is reworded: the two parts are the title, cut once, and the
 * full sentence stays in the cell's tooltip and in the preview rail.
 */
export function splitSignalTitle(title: string): { head: string; tail: string | null } {
  // The first dash or comma that is followed by a space: "₹30,500" keeps its comma.
  const match = /\s—\s|,\s/.exec(title)
  if (!match || match.index === 0) return { head: title, tail: null }
  const head = title.slice(0, match.index).trim()
  const tail = title.slice(match.index + match[0].length).trim()
  return tail === '' ? { head: title, tail: null } : { head, tail }
}

/** "Retirement · 2042": the goal by a short name and the year it is due, for a narrow cell. */
const GOAL_SHORT: Readonly<Record<GoalKind, string | null>> = {
  retirement: 'Retirement',
  emergency_fund: 'Emergency',
  debt_payoff: 'Clear debt',
  protection: 'Cover',
  // A wealth target is whatever the customer called it ("Home", "Daughter's college").
  wealth_target: null,
}

export function goalRowLabel(goal: BookRow['goal']): string {
  const name = GOAL_SHORT[goal.kind] ?? goal.label
  const year = goal.targetDate.slice(0, 4)
  return `${name} · ${year}`
}

/* ---------------------------------------------------------------- By segment */

export interface SegmentSlice {
  segment: Segment
  customers: number
  relationshipValue: number
  /** Share of the slice's relationship value, 0 to 100; 0 for an empty slice. */
  sharePct: number
}

const SEGMENT_ORDER: readonly Segment[] = ['priority', 'affluent', 'mass']

/**
 * How the rows on screen divide by segment, by relationship value: the bar over the table, which
 * follows the tab and the search. Every segment is listed, empty ones at zero, so the bar keeps
 * its order as the view changes.
 */
export function segmentBreakdown(rows: readonly BookRow[]): SegmentSlice[] {
  const total = rows.reduce((s, r) => s + r.relationshipValue, 0)
  return SEGMENT_ORDER.map((segment) => {
    const mine = rows.filter((r) => r.segment === segment)
    const value = mine.reduce((s, r) => s + r.relationshipValue, 0)
    return {
      segment,
      customers: mine.length,
      relationshipValue: value,
      sharePct: total > 0 ? (value / total) * 100 : 0,
    }
  })
}

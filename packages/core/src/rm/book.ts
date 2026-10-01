/**
 * The book as a whole: totals for the table footer, the Today KPIs, and the Insights page's
 * small multiples.
 *
 * Every function here is a sum, a count or a ratio over per-customer figures the other modules
 * already defined. None of them introduces a quantity of its own, so a book figure can always
 * be reconciled by adding up the rows on screen.
 */
import { ruleBook } from '../suitability.ts'
import type { GoalHealth } from './health.ts'
import type { Segment } from './segment.ts'
import { isBalanceAccount, walletSharePct } from './segment.ts'
import type { BalancePoint } from './series.ts'
import type { SignalKind } from './signals.ts'
import { SIGNAL_LABELS } from './signals.ts'
import { cmp, round1 } from './util.ts'

export interface Allocation {
  cash: number
  equity: number
  fixed: number
}

/** The per-customer figures the book sums. A `BookRow` satisfies it. */
export interface BookFigures {
  relationshipValue: number
  withIdbi: number
  netWorth: number
  sipMonthly: number
  monthlySurplus: number
  /** `cash` is every balance at any bank, which is what wallet share divides by. */
  allocation: Allocation
}

export interface BookTotals {
  customers: number
  relationshipValue: number
  withIdbi: number
  balances: number
  /** With IDBI over all balances across the book; null for a book with no balances. */
  walletSharePct: number | null
  netWorth: number
  sipMonthly: number
  monthlySurplus: number
}

export function bookTotals(rows: readonly BookFigures[]): BookTotals {
  const sum = (pick: (r: BookFigures) => number): number => rows.reduce((s, r) => s + pick(r), 0)
  const balances = sum((r) => r.allocation.cash)
  const idbi = sum((r) => r.withIdbi)
  return {
    customers: rows.length,
    relationshipValue: sum((r) => r.relationshipValue),
    withIdbi: idbi,
    balances,
    walletSharePct: walletSharePct(idbi, balances),
    netWorth: sum((r) => r.netWorth),
    sipMonthly: sum((r) => r.sipMonthly),
    monthlySurplus: sum((r) => r.monthlySurplus),
  }
}

/** Every customer's balance history summed month by month, oldest first. */
export function bookBalanceSeries(
  rows: readonly { balanceSeries: readonly BalancePoint[] }[],
): BalancePoint[] {
  const byMonth = new Map<string, BalancePoint>()
  for (const row of rows) {
    for (const p of row.balanceSeries) {
      const seen = byMonth.get(p.month) ?? { month: p.month, total: 0, withIdbi: 0 }
      byMonth.set(p.month, {
        month: p.month,
        total: seen.total + p.total,
        withIdbi: seen.withIdbi + p.withIdbi,
      })
    }
  }
  return [...byMonth.values()].sort((a, b) => cmp(a.month, b.month))
}

/** Cash, equity and fixed income across the book, in rupees. */
export function allocationTotals(rows: readonly { allocation: Allocation }[]): Allocation {
  return rows.reduce(
    (s, r) => ({
      cash: s.cash + r.allocation.cash,
      equity: s.equity + r.allocation.equity,
      fixed: s.fixed + r.allocation.fixed,
    }),
    { cash: 0, equity: 0, fixed: 0 },
  )
}

export interface SegmentSlice {
  segment: Segment
  customers: number
  relationshipValue: number
}

const SEGMENTS: readonly Segment[] = ['priority', 'affluent', 'mass']

/** All three segments, empty ones included, so a chart never loses a bar. */
export function segmentBreakdown(
  rows: readonly { segment: Segment; relationshipValue: number }[],
): SegmentSlice[] {
  return SEGMENTS.map((segment) => {
    const inSegment = rows.filter((r) => r.segment === segment)
    return {
      segment,
      customers: inSegment.length,
      relationshipValue: inSegment.reduce((s, r) => s + r.relationshipValue, 0),
    }
  })
}

export interface ProductSlice {
  product: string
  value: number
}

const BALANCE_PRODUCT: Readonly<Record<string, string>> = {
  Savings: 'Savings',
  Current: 'Current accounts',
  FD: 'Fixed deposits',
  RD: 'Recurring deposits',
}

const HOLDING_PRODUCT: Readonly<Record<string, string>> = {
  MUTUAL_FUND: 'Mutual funds',
  EQUITY: 'Direct equity',
  FD: 'Fixed deposits',
  RD: 'Recurring deposits',
  NPS: 'NPS',
  PPF: 'PPF',
  EPF: 'EPF',
}

/**
 * Assets by product, largest first: balances by account type, holdings by holding type.
 *
 * Policies are left out for the reason `netWorth` leaves them out: cover is not an asset, and a
 * ULIP's sum assured on this chart would be the confusion the product exists to undo.
 */
export function allocationByProduct(
  accounts: readonly { accountType: string; currentBalance: number }[],
  holdings: readonly { holdingType: string; currentValue: number }[],
): ProductSlice[] {
  const totals = new Map<string, number>()
  const add = (label: string, value: number): void => {
    totals.set(label, (totals.get(label) ?? 0) + value)
  }
  for (const a of accounts) {
    const label = BALANCE_PRODUCT[a.accountType]
    if (label !== undefined && isBalanceAccount(a)) add(label, a.currentBalance)
  }
  for (const h of holdings) {
    const label = HOLDING_PRODUCT[h.holdingType]
    if (label !== undefined) add(label, h.currentValue)
  }
  return [...totals]
    .map(([product, value]) => ({ product, value }))
    .sort((a, b) => b.value - a.value || cmp(a.product, b.product))
}

export interface GoalHealthCounts {
  on_track: number
  at_risk: number
  off_track: number
  /** On track over all customers, to one decimal; null for an empty book. */
  onTrackPct: number | null
}

export function goalHealthCounts(healths: readonly GoalHealth[]): GoalHealthCounts {
  const count = (h: GoalHealth): number => healths.filter((x) => x === h).length
  const onTrack = count('on_track')
  return {
    on_track: onTrack,
    at_risk: count('at_risk'),
    off_track: count('off_track'),
    onTrackPct: healths.length === 0 ? null : round1((onTrack / healths.length) * 100),
  }
}

export interface KindCount {
  kind: SignalKind
  label: string
  count: number
}

const KIND_ORDER = Object.keys(SIGNAL_LABELS) as SignalKind[]

/**
 * Signals across the book by kind, most common first. Kinds that never occur are left out:
 * an empty bar for "missed repayment" says nothing a reader needs.
 */
export function signalsByKind(signals: readonly { kind: SignalKind }[]): KindCount[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    label: SIGNAL_LABELS[kind],
    count: signals.filter((s) => s.kind === kind).length,
  }))
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
}

/* ------------------------------------------------------------------ *
 * Refusals
 * ------------------------------------------------------------------ */

/**
 * A short name for each rule, for a chart axis and a filter chip. The rule book's own
 * description is the full sentence and stays the authority; this is its label.
 */
export const RULE_LABELS: Readonly<Record<string, string>> = {
  HIGH_INTEREST_DEBT: 'Expensive debt first',
  MISSED_REPAYMENT: 'Missed repayment',
  EMERGENCY_BUFFER: 'Emergency buffer too thin',
  RISK_CEILING: 'Above risk profile',
  VOLATILITY_VS_HORIZON: 'Too volatile for the goal',
  AFFORDABILITY: 'More than can be afforded',
  HORIZON_VS_LOCKIN: 'Lock-in longer than the goal',
  TAX_BENEFIT_UNAVAILABLE: 'No tax benefit to claim',
  BUNDLED_PROTECTION: 'Cover bundled with investment',
}

export function ruleLabel(ruleId: string): string {
  return RULE_LABELS[ruleId] ?? ruleId
}

export interface RuleCount {
  ruleId: string
  label: string
  count: number
}

const RULE_ORDER = ruleBook.map((r) => r.id)

/**
 * Mis-sales prevented: advice records with verdict `BLOCKED`, counted by the rule that refused.
 *
 * Only `BLOCKED`. An `UNKNOWN_PRODUCT` row is a product off the shelf, not a sale the rules
 * stopped, and counting it would inflate the one number the judges are asked to trust.
 */
export function refusalsByRule(
  advice: readonly { verdict: string; ruleId: string | null }[],
): RuleCount[] {
  const counts = new Map<string, number>()
  for (const a of advice) {
    if (a.verdict !== 'BLOCKED' || a.ruleId === null) continue
    counts.set(a.ruleId, (counts.get(a.ruleId) ?? 0) + 1)
  }
  const rank = (id: string): number => {
    const i = RULE_ORDER.indexOf(id)
    return i === -1 ? RULE_ORDER.length : i
  }
  return [...counts]
    .map(([ruleId, count]) => ({ ruleId, label: ruleLabel(ruleId), count }))
    .sort((a, b) => b.count - a.count || rank(a.ruleId) - rank(b.ruleId) || cmp(a.ruleId, b.ruleId))
}

export function misSalesPrevented(advice: readonly { verdict: string }[]): number {
  return advice.filter((a) => a.verdict === 'BLOCKED').length
}

/* ------------------------------------------------------------------ *
 * Today's KPIs
 * ------------------------------------------------------------------ */

export interface Kpi {
  id: string
  label: string
  value: number
  unit: 'inr' | 'count' | 'pct'
  delta: number | null
  deltaLabel: string | null
  series: number[] | null
}

export interface TodayKpiInput {
  rows: readonly (BookFigures & {
    balanceSeries: readonly BalancePoint[]
    goal: { health: GoalHealth }
  })[]
  /** Waiting days of every open handoff in the book. */
  openHandoffWaits: readonly number[]
}

/**
 * The four figures across the top of Today: book value, the SIP book, goals on track and open
 * handoffs.
 *
 * Book value's change is the month's change in **balances**, not in book value: holdings are
 * flat before the anchor, so a book-value delta would be a balance delta wearing a bigger
 * label. The label says which it is. The SIP book has no history for the same reason, so it has
 * no delta rather than a zero one.
 */
export function todayKpis(input: TodayKpiInput): Kpi[] {
  const totals = bookTotals(input.rows)
  const series = bookBalanceSeries(input.rows)
  const last = series[series.length - 1]
  const prev = series[series.length - 2]
  const goals = goalHealthCounts(input.rows.map((r) => r.goal.health))
  const withSip = input.rows.filter((r) => r.sipMonthly > 0).length
  const oldest = input.openHandoffWaits.reduce((m, d) => Math.max(m, d), 0)

  return [
    {
      id: 'book_value',
      label: 'Book value',
      value: totals.relationshipValue,
      unit: 'inr',
      delta: last !== undefined && prev !== undefined ? last.total - prev.total : null,
      deltaLabel: last !== undefined && prev !== undefined ? 'in balances this month' : null,
      series: series.length > 0 ? series.map((p) => p.total) : null,
    },
    {
      id: 'sip_book',
      label: 'Monthly SIP book',
      value: totals.sipMonthly,
      unit: 'inr',
      delta: null,
      deltaLabel: `${withSip} of ${totals.customers} customers investing monthly`,
      series: null,
    },
    {
      id: 'goals_on_track',
      label: 'Goals on track',
      value: goals.onTrackPct ?? 0,
      unit: 'pct',
      delta: null,
      deltaLabel: `${goals.on_track} of ${totals.customers} customers`,
      series: null,
    },
    {
      id: 'open_handoffs',
      label: 'Open handoffs',
      value: input.openHandoffWaits.length,
      unit: 'count',
      delta: null,
      deltaLabel:
        input.openHandoffWaits.length === 0
          ? null
          : `oldest waiting ${oldest} ${oldest === 1 ? 'day' : 'days'}`,
      series: null,
    },
  ]
}

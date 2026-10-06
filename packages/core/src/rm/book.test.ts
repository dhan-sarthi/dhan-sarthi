/**
 * Book aggregates: every one a sum, count or ratio over rows, checked against the rows.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ruleBook } from '../suitability.ts'
import {
  RULE_LABELS,
  allocationByProduct,
  allocationTotals,
  bookBalanceSeries,
  bookTotals,
  goalHealthCounts,
  misSalesPrevented,
  refusalsByRule,
  ruleLabel,
  segmentBreakdown,
  signalsByKind,
  todayKpis,
} from './book.ts'
import type { GoalHealth } from './health.ts'
import type { Segment } from './segment.ts'

function row(
  relationshipValue: number,
  cash: number,
  withIdbi: number,
  segment: Segment,
  health: GoalHealth,
  sipMonthly = 0,
) {
  return {
    relationshipValue,
    withIdbi,
    netWorth: relationshipValue - 1_00_000,
    sipMonthly,
    monthlySurplus: 20_000,
    allocation: { cash, equity: relationshipValue - cash, fixed: 0 },
    segment,
    goal: { health },
    balanceSeries: [
      { month: '2026-07', total: cash - 20_000, withIdbi: withIdbi - 10_000 },
      { month: '2026-08', total: cash - 10_000, withIdbi: withIdbi - 5_000 },
      { month: '2026-09', total: cash, withIdbi },
    ],
  }
}

const rows = [
  row(60_00_000, 20_00_000, 15_00_000, 'priority', 'on_track', 25_000),
  row(12_00_000, 4_00_000, 1_00_000, 'affluent', 'at_risk', 5_000),
  row(3_00_000, 3_00_000, 3_00_000, 'mass', 'on_track'),
  row(2_00_000, 1_00_000, 0, 'mass', 'off_track'),
]

describe('bookTotals', () => {
  it('sums the rows, and takes wallet share over the book’s balances', () => {
    assert.deepEqual(bookTotals(rows), {
      customers: 4,
      relationshipValue: 77_00_000,
      withIdbi: 19_00_000,
      balances: 28_00_000,
      walletSharePct: 67.9,
      netWorth: 73_00_000,
      sipMonthly: 30_000,
      monthlySurplus: 80_000,
    })
  })

  it('is zero, with an unknown wallet share, for an empty book', () => {
    const t = bookTotals([])
    assert.equal(t.customers, 0)
    assert.equal(t.relationshipValue, 0)
    assert.equal(t.walletSharePct, null)
  })
})

describe('bookBalanceSeries', () => {
  it('adds the customers’ histories month by month, oldest first', () => {
    assert.deepEqual(bookBalanceSeries(rows), [
      { month: '2026-07', total: 27_20_000, withIdbi: 18_60_000 },
      { month: '2026-08', total: 27_60_000, withIdbi: 18_80_000 },
      { month: '2026-09', total: 28_00_000, withIdbi: 19_00_000 },
    ])
  })

  it('keeps a month only one customer has, and is empty for an empty book', () => {
    const series = bookBalanceSeries([
      { balanceSeries: [{ month: '2026-09', total: 10, withIdbi: 5 }] },
      { balanceSeries: [{ month: '2026-08', total: 7, withIdbi: 7 }] },
    ])
    assert.deepEqual(
      series.map((p) => p.month),
      ['2026-08', '2026-09'],
    )
    assert.deepEqual(bookBalanceSeries([]), [])
  })
})

describe('allocation and segments', () => {
  it('sums allocation in rupees', () => {
    assert.deepEqual(allocationTotals(rows), { cash: 28_00_000, equity: 49_00_000, fixed: 0 })
  })

  it('lists every segment, empty ones included', () => {
    assert.deepEqual(segmentBreakdown(rows.slice(2)), [
      { segment: 'priority', customers: 0, relationshipValue: 0 },
      { segment: 'affluent', customers: 0, relationshipValue: 0 },
      { segment: 'mass', customers: 2, relationshipValue: 5_00_000 },
    ])
  })

  it('splits assets by product and leaves cover out', () => {
    const slices = allocationByProduct(
      [
        { accountType: 'Savings', currentBalance: 3_00_000 },
        { accountType: 'Savings', currentBalance: 1_00_000 },
        { accountType: 'FD', currentBalance: 2_00_000 },
        { accountType: 'PPF', currentBalance: 9_99_999 },
      ],
      [
        { holdingType: 'MUTUAL_FUND', currentValue: 5_00_000 },
        { holdingType: 'FD', currentValue: 50_000 },
        { holdingType: 'PPF', currentValue: 1_18_260 },
        { holdingType: 'INSURANCE', currentValue: 3_20_000 },
      ],
    )
    assert.deepEqual(slices, [
      { product: 'Mutual funds', value: 5_00_000 },
      { product: 'Savings', value: 4_00_000 },
      { product: 'Fixed deposits', value: 2_50_000 },
      { product: 'PPF', value: 1_18_260 },
    ])
  })
})

describe('goalHealthCounts', () => {
  it('counts each state and the share on track', () => {
    assert.deepEqual(goalHealthCounts(rows.map((r) => r.goal.health)), {
      on_track: 2,
      at_risk: 1,
      off_track: 1,
      onTrackPct: 50,
    })
  })

  it('has no percentage for an empty book', () => {
    assert.equal(goalHealthCounts([]).onTrackPct, null)
  })
})

describe('signalsByKind', () => {
  it('counts signals by kind, most common first, with the desk’s label', () => {
    assert.deepEqual(
      signalsByKind([
        { kind: 'idle_cash' },
        { kind: 'expensive_debt' },
        { kind: 'idle_cash' },
        { kind: 'protection_gap' },
      ]),
      [
        { kind: 'idle_cash', label: 'Idle cash', count: 2 },
        { kind: 'expensive_debt', label: 'Expensive card debt', count: 1 },
        { kind: 'protection_gap', label: 'Protection gap', count: 1 },
      ],
    )
    assert.deepEqual(signalsByKind([]), [])
  })
})

describe('refusals', () => {
  const advice = [
    { verdict: 'BLOCKED', ruleId: 'BUNDLED_PROTECTION' },
    { verdict: 'BLOCKED', ruleId: 'HIGH_INTEREST_DEBT' },
    { verdict: 'BLOCKED', ruleId: 'BUNDLED_PROTECTION' },
    { verdict: 'BLOCKED', ruleId: 'RISK_CEILING' },
    { verdict: 'PASS', ruleId: null },
    { verdict: 'UNKNOWN_PRODUCT', ruleId: 'UNKNOWN_PRODUCT' },
  ]

  it('counts BLOCKED records by rule, and nothing else', () => {
    assert.deepEqual(refusalsByRule(advice), [
      { ruleId: 'BUNDLED_PROTECTION', label: 'Cover bundled with investment', count: 2 },
      { ruleId: 'HIGH_INTEREST_DEBT', label: 'Expensive debt first', count: 1 },
      { ruleId: 'RISK_CEILING', label: 'Above risk profile', count: 1 },
    ])
    assert.equal(misSalesPrevented(advice), 4)
    assert.equal(misSalesPrevented([]), 0)
  })

  it('has a label for every rule in the rule book, and falls back to the id otherwise', () => {
    for (const rule of ruleBook) assert.ok(RULE_LABELS[rule.id], rule.id)
    assert.equal(ruleLabel('SOMETHING_NEW'), 'SOMETHING_NEW')
  })
})

describe('todayKpis', () => {
  it('reports the four figures across the top of Today', () => {
    const kpis = todayKpis({ rows, openHandoffWaits: [3, 9, 1] })
    assert.deepEqual(
      kpis.map((k) => [k.id, k.value, k.unit, k.outOf, k.delta, k.deltaLabel]),
      [
        // The last point is September's close here, so the change is September's, and the
        // label says it is month-end to month-end rather than the as-at value beside it.
        ['book_value', 77_00_000, 'inr', null, 40_000, 'in month-end balances over September'],
        ['sip_book', 30_000, 'inr', null, null, 'registered SIPs · 2 of 4 customers'],
        // A count out of the book, never a percentage of it.
        ['goals_on_track', 2, 'count', 4, null, 'of 4 customers'],
        ['open_handoffs', 3, 'count', null, null, 'oldest waiting 9 days'],
      ],
    )
    assert.deepEqual(kpis[0]?.series, [27_20_000, 27_60_000, 28_00_000])
    assert.deepEqual(
      kpis.map((k) => k.seriesLabel),
      ['Month-end balances, Jul 2026 to Sep 2026', null, null, null],
    )
  })

  it('stays honest on an empty book', () => {
    const kpis = todayKpis({ rows: [], openHandoffWaits: [] })
    assert.deepEqual(
      kpis.map((k) => [k.id, k.value, k.delta, k.deltaLabel, k.series]),
      [
        ['book_value', 0, null, null, null],
        ['sip_book', 0, null, 'registered SIPs · 0 of 0 customers', null],
        ['goals_on_track', 0, null, 'of 0 customers', null],
        ['open_handoffs', 0, null, null, null],
      ],
    )
  })
})

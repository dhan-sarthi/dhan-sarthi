import type { BookRow, Signal } from '@dhan/contracts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitColumns } from './fit.ts'
import { IN_TAB, compareSignals, hiddenFromTab, matchesQuery, sliceTotals } from './rows.ts'

/* A book row built from literals: only the fields a test names differ from a quiet default. */
function row(overrides: Partial<BookRow> = {}): BookRow {
  return {
    cif: 'IDBI0000000001',
    name: 'Asha Verma',
    initials: 'AV',
    age: 40,
    gender: 'Female',
    city: 'Pune',
    employmentType: 'Salaried',
    riskProfile: 'Balanced',
    segment: 'mass',
    relationshipValue: 5_00_000,
    withIdbi: 2_00_000,
    walletSharePct: 100,
    netWorth: 4_00_000,
    monthlyIncome: 80_000,
    monthlySurplus: 12_000,
    sipMonthly: 0,
    allocation: { cash: 2_00_000, equity: 2_00_000, fixed: 1_00_000 },
    balanceSeries: [],
    balanceChange3mPct: null,
    goal: {
      kind: 'retirement',
      label: 'Retirement',
      targetAmount: 1_00_00_000,
      targetDate: '2046-09-01',
      health: 'on_track',
    },
    topSignal: null,
    signalCount: 0,
    strength: { level: 'medium', reason: 'Active 6 days ago' },
    attrition: { flagged: false, reasons: [] },
    lastActivityAt: null,
    openHandoff: false,
    refusals: 0,
    products: { idbi: [], gaps: [] },
    ...overrides,
  }
}

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    kind: 'idle_cash',
    severity: 'opportunity',
    title: '₹2L idle in savings for 6 months',
    detail: '',
    figure: 2_00_000,
    deadlineDays: null,
    evidence: [],
    ...overrides,
  }
}

test('tabs follow the contract: at risk is anything but on track', () => {
  assert.equal(IN_TAB.at_risk(row()), false)
  assert.equal(IN_TAB.at_risk(row({ goal: { ...row().goal, health: 'at_risk' } })), true)
  assert.equal(IN_TAB.at_risk(row({ goal: { ...row().goal, health: 'off_track' } })), true)
  assert.equal(IN_TAB.asked_for_rm(row({ openHandoff: true })), true)
  assert.equal(IN_TAB.priority(row({ segment: 'priority' })), true)
})

test('idle cash shows only top signals, and says how many it cannot show', () => {
  const rows = [
    row({ topSignal: signal() }),
    row({ topSignal: signal({ kind: 'protection_gap', severity: 'important' }) }),
  ]
  assert.equal(rows.filter(IN_TAB.idle_cash).length, 1)
  // The server counted both: one has idle cash behind a bigger signal.
  assert.equal(hiddenFromTab(2, rows, 'idle_cash'), 1)
  assert.equal(hiddenFromTab(1, rows, 'idle_cash'), 0)
  assert.equal(hiddenFromTab(0, rows, 'all'), 0)
})

test('search matches name, CIF and city, every word somewhere', () => {
  const r = row({ name: 'Karan Deshpande', city: 'Pune', cif: 'IDBI0004471902' })
  assert.equal(matchesQuery(r, ''), true)
  assert.equal(matchesQuery(r, '  '), true)
  assert.equal(matchesQuery(r, 'karan'), true)
  assert.equal(matchesQuery(r, 'PUNE karan'), true)
  assert.equal(matchesQuery(r, '4471902'), true)
  assert.equal(matchesQuery(r, 'karan mumbai'), false)
})

test('signals rank by severity, then rupee figure, then the nearer deadline', () => {
  const urgent = signal({ severity: 'urgent', figure: 10_000 })
  const big = signal({ severity: 'important', figure: 4_00_00_000 })
  const small = signal({ severity: 'important', figure: 1_00_000 })
  const soon = signal({ severity: 'important', figure: 1_00_000, deadlineDays: 7 })
  assert.ok(compareSignals(urgent, big) > 0)
  assert.ok(compareSignals(big, small) > 0)
  assert.ok(compareSignals(soon, small) > 0)
  assert.ok(compareSignals(null, small) < 0)
  assert.equal(compareSignals(null, null), 0)
})

test('the footer adds up the rows on screen with the core sums', () => {
  const rows = [
    row({ relationshipValue: 10_00_000, lastActivityAt: '2026-08-30' }),
    row({
      relationshipValue: 5_00_000,
      topSignal: signal({ severity: 'urgent' }),
      strength: { level: 'low', reason: '' },
      lastActivityAt: '2026-06-01',
    }),
  ]
  const t = sliceTotals(rows, '2026-09-01')
  assert.equal(t.customers, 2)
  assert.equal(t.relationshipValue, 15_00_000)
  assert.equal(t.actNow, 1)
  assert.equal(t.lowStrength, 1)
  assert.equal(t.onTrack, 2)
  assert.equal(t.activeIn30Days, 1)
  assert.deepEqual(t.allocation, { cash: 4_00_000, equity: 4_00_000, fixed: 2_00_000 })
})

test('columns step aside in order as the table narrows, and the rail keeps the scan columns', () => {
  // 1440 wide: everything fits.
  assert.deepEqual(fitColumns(1142, false).visibility, { change: false })
  // 1280 wide: strength goes first.
  assert.equal(fitColumns(982, false).visibility['strength'], false)
  assert.equal(fitColumns(982, false).signal, true)
  // With the rail open the signal goes first; the rail shows it in full.
  const rail = fitColumns(682, true)
  assert.equal(rail.signal, false)
  assert.equal(rail.visibility['goal'], undefined)
  assert.equal(rail.visibility['value'], undefined)
})

import type { BookRow, Signal } from '@dhan/contracts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COLUMN_WIDTH, SIGNAL_MIN, fitColumns } from './fit.ts'
import {
  IN_TAB,
  compareSignals,
  goalRowLabel,
  matchesQuery,
  segmentBreakdown,
  sliceTotals,
  splitSignalTitle,
  tabLabel,
} from './rows.ts'

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
      amountBasis: 'today',
      targetDate: '2046-09-01',
      health: 'on_track',
    },
    topSignal: null,
    signalCount: 0,
    signals: [],
    signalKinds: [],
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

test('idle cash lists every customer with idle cash, not only where it ranks first', () => {
  const idle = signal()
  const cover = signal({ kind: 'protection_gap', severity: 'important' })
  const rows = [
    row({ topSignal: idle, signals: [idle], signalKinds: ['idle_cash'], signalCount: 1 }),
    // Idle cash behind a bigger signal: the server counts this customer, and so does the tab.
    row({
      topSignal: cover,
      signals: [cover, idle],
      signalKinds: ['protection_gap', 'idle_cash'],
      signalCount: 2,
    }),
    row({ topSignal: cover, signals: [cover], signalKinds: ['protection_gap'], signalCount: 1 }),
  ]
  assert.equal(rows.filter(IN_TAB.idle_cash).length, 2)
})

test('the request tab says what Today says', () => {
  assert.equal(tabLabel('asked_for_rm', 'Asked for RM'), 'Asked for you')
  assert.equal(tabLabel('at_risk', 'At risk'), 'At risk')
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
    row({ relationshipValue: 10_00_000 }),
    row({
      relationshipValue: 5_00_000,
      topSignal: signal({ severity: 'urgent' }),
      goal: { ...row().goal, health: 'off_track' },
    }),
  ]
  const t = sliceTotals(rows)
  assert.equal(t.customers, 2)
  assert.equal(t.relationshipValue, 15_00_000)
  assert.equal(t.actNow, 1)
  assert.equal(t.onTrack, 1)
  assert.deepEqual(t.allocation, { cash: 4_00_000, equity: 4_00_000, fixed: 2_00_000 })
})

test('a signal title splits where it already breaks, and never inside a figure', () => {
  assert.deepEqual(splitSignalTitle('₹4.2Cr short on life cover — 2 dependents'), {
    head: '₹4.2Cr short on life cover',
    tail: '2 dependents',
  })
  assert.deepEqual(splitSignalTitle('₹1.81Cr short on life cover — 2 dependents, no policy'), {
    head: '₹1.81Cr short on life cover',
    tail: '2 dependents, no policy',
  })
  // "₹30,500" has a comma with no space after it: the break is the one that has a space.
  assert.deepEqual(splitSignalTitle('₹30,500 a month in EMIs, a repayment missed'), {
    head: '₹30,500 a month in EMIs',
    tail: 'a repayment missed',
  })
  assert.deepEqual(splitSignalTitle('₹22L deposit matures in 27 days'), {
    head: '₹22L deposit matures in 27 days',
    tail: null,
  })
})

test('the goal cell names the goal shortly with its year', () => {
  assert.equal(goalRowLabel(row().goal), 'Retirement · 2046')
  assert.equal(
    goalRowLabel({ ...row().goal, kind: 'debt_payoff', label: 'Clear expensive debt' }),
    'Clear debt · 2046',
  )
  assert.equal(
    goalRowLabel({ ...row().goal, kind: 'emergency_fund', label: 'Emergency fund' }),
    'Emergency · 2046',
  )
  assert.equal(goalRowLabel({ ...row().goal, kind: 'wealth_target', label: 'Home' }), 'Home · 2046')
})

test('the segment bar divides the view by relationship value, every segment listed', () => {
  const slices = segmentBreakdown([
    row({ segment: 'priority', relationshipValue: 75_00_000 }),
    row({ segment: 'mass', relationshipValue: 25_00_000 }),
  ])
  assert.deepEqual(
    slices.map((s) => [s.segment, s.customers, s.sharePct]),
    [
      ['priority', 1, 75],
      ['affluent', 0, 0],
      ['mass', 1, 25],
    ],
  )
  assert.ok(segmentBreakdown([]).every((s) => s.sharePct === 0))
})

test('columns step aside in order as the table narrows, and the rail keeps the signal', () => {
  const all = Object.values(COLUMN_WIDTH).reduce((s, w) => s + w, 0) + SIGNAL_MIN
  // 1440 wide (1142 for the table): everything fits.
  assert.ok(all <= 1142)
  assert.deepEqual(fitColumns(1142, false).visibility, { change: false })
  // 1280 wide (982): strength goes first, then the allocation; last active stays.
  const laptop = fitColumns(982, false)
  assert.equal(laptop.visibility['strength'], false)
  assert.equal(laptop.visibility['allocation'], false)
  assert.equal(laptop.visibility['activity'], undefined)
  assert.equal(laptop.signal, true)
  // Beside the rail on a 1280 laptop (about 560 for the list): who, how much, and why to call.
  const rail = fitColumns(560, true)
  assert.equal(rail.signal, true)
  assert.equal(rail.slim, true)
  assert.equal(rail.visibility['value'], undefined)
  assert.equal(rail.visibility['goal'], false)
  // With a Windows scrollbar taking 17px of that, the signal still holds.
  assert.equal(fitColumns(543, true).signal, true)
  // Beside the rail at 1440 (about 720): the goal comes back.
  assert.equal(fitColumns(722, true).visibility['goal'], undefined)
})

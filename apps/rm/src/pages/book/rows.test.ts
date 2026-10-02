import type { BookRow, Signal } from '@dhan/contracts'
import { SIGNAL_LABELS, voiceInsight, type InsightLike } from '@dhan/core'
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

/*
 * The titles the split reads are written by `@dhan/core`'s `voiceInsight`, the same code the API
 * runs, so these feed it the engine's own sentences and split what comes back, rather than split
 * strings copied from a screen. If the API rewords a title (a colon where the dash was, the
 * qualifier first), the expected title below fails here, before a row quietly shows a whole
 * sentence on its first line, or half of one. The contracts carry no head and tail of their own
 * yet; until they do, this pins the wording the split depends on.
 */
function insight(over: Partial<InsightLike> & Pick<InsightLike, 'kind' | 'headline'>): InsightLike {
  return { severity: 'important', detail: '', monthlyValue: 0, evidence: [], ...over }
}

function titleOf(i: InsightLike): string {
  const voiced = voiceInsight(i)
  assert.ok(voiced, `${i.kind} is voiced`)
  return voiced.signal.title
}

test("the split matches every title the API writes today, in the API's own words", () => {
  const cases: [InsightLike, string, string, string | null][] = [
    [
      insight({
        kind: 'protection_gap',
        headline: '2 people depend on your income and there is no life cover in force.',
        evidence: [
          '2 people depend on you',
          '₹0 of cover today',
          '₹1,20,00,000 needed — ten times your income',
        ],
      }),
      '₹1.2Cr short on life cover — 2 dependents, no policy',
      '₹1.2Cr short on life cover',
      '2 dependents, no policy',
    ],
    [
      insight({
        kind: 'protection_gap',
        headline: 'Your life cover is about ₹80 lakh short of what your dependents would need.',
        evidence: [
          '2 people depend on you',
          '₹50,00,000 of cover today',
          '₹1,30,00,000 needed — ten times your income',
        ],
      }),
      '₹80L short on life cover — 2 dependents',
      '₹80L short on life cover',
      '2 dependents',
    ],
    [
      insight({
        kind: 'missed_repayment',
        severity: 'urgent',
        headline: 'You have a missed loan repayment on record.',
        evidence: ['₹24,200 a month in EMIs'],
      }),
      '₹24,200 a month in EMIs, a repayment missed',
      '₹24,200 a month in EMIs',
      'a repayment missed',
    ],
    [
      insight({
        kind: 'missed_repayment',
        severity: 'urgent',
        headline: 'You have a missed loan repayment on record.',
      }),
      'A loan repayment missed',
      'A loan repayment missed',
      null,
    ],
    [
      insight({
        kind: 'expensive_debt',
        severity: 'urgent',
        headline: '₹1,86,240 at 34.8% costs you ₹5,401 a month.',
        evidence: ['₹1,86,240 outstanding at 34.8% a year', '₹5,401 a month in interest'],
      }),
      'Card at 34.8% — ₹1.86L outstanding',
      'Card at 34.8%',
      '₹1.86L outstanding',
    ],
    [
      insight({
        kind: 'buffer_thin',
        headline: 'Your savings cover about 1.4 months of your outgoings.',
        evidence: [
          '₹40,000 you can reach today',
          '₹28,000 goes out every month',
          "₹1,20,000 short of 6 months' cover",
        ],
      }),
      '1.4 months of savings — ₹1.2L short of 6 months',
      '1.4 months of savings',
      '₹1.2L short of 6 months',
    ],
    [
      insight({
        kind: 'deposit_maturing',
        headline: 'Your ₹2,00,000 deposit matures on 11 September, 10 days away.',
        deadlineDays: 10,
        evidence: ['₹2,00,000 deposit, matures 2026-09-11', 'Currently earning 7.1%'],
      }),
      '₹2L deposit matures in 10 days',
      '₹2L deposit matures in 10 days',
      null,
    ],
    [
      insight({
        kind: 'emi_ending',
        headline: 'Your personal loan ends in 3 months. That frees ₹3,150 a month.',
      }),
      '₹3,150 a month frees up in 3 months',
      '₹3,150 a month frees up in 3 months',
      null,
    ],
    [
      insight({
        kind: 'idle_cash',
        severity: 'opportunity',
        headline: '₹3,20,000 has sat untouched in savings for 7 months.',
      }),
      '₹3.2L idle in savings for 7 months',
      '₹3.2L idle in savings for 7 months',
      null,
    ],
    [
      insight({
        kind: 'price_increase',
        severity: 'opportunity',
        headline: 'Netflix went from ₹649 to ₹799 in March 2026.',
        detail: '₹1,800 a year extra that you never agreed to.',
      }),
      '₹1,800 a year more for Netflix',
      '₹1,800 a year more for Netflix',
      null,
    ],
    [
      insight({
        kind: 'category_drift',
        severity: 'opportunity',
        headline: 'Dining is up 32% in three months.',
        monthlyValue: 3_000,
        evidence: ['Last three months: ₹12,000 a month', 'The three before that: ₹9,000 a month'],
      }),
      '₹3,000 a month more on dining — up 32%',
      '₹3,000 a month more on dining',
      'up 32%',
    ],
    [
      insight({
        kind: 'habit_cost',
        severity: 'opportunity',
        headline: 'Swiggy, 12 times a month. ₹43,200 a year.',
        detail: 'Usually ₹300 at a time. Small enough that it never feels like much.',
      }),
      '₹43,200 a year on Swiggy — 12 times a month',
      '₹43,200 a year on Swiggy',
      '12 times a month',
    ],
  ]
  for (const [input, title, head, tail] of cases) {
    assert.equal(titleOf(input), title, `the API's ${input.kind} title`)
    assert.deepEqual(splitSignalTitle(title), { head, tail }, title)
  }
})

test('a title the engine could not voice splits into its kind and its figure', () => {
  // A headline that no longer matches its template: core falls back to "<kind> — <figure>".
  const fallback = titleOf(
    insight({ kind: 'idle_cash', severity: 'opportunity', headline: '₹3,20,000 is idle.' }),
  )
  assert.equal(fallback, `${SIGNAL_LABELS.idle_cash} — ₹3.2L`)
  assert.deepEqual(splitSignalTitle(fallback), { head: SIGNAL_LABELS.idle_cash, tail: '₹3.2L' })
  // A title with no break at all, or one that opens on its break, is all head.
  assert.deepEqual(splitSignalTitle('Subscriptions'), { head: 'Subscriptions', tail: null })
  assert.deepEqual(splitSignalTitle(', no policy'), { head: ', no policy', tail: null })
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
  // 1600 wide (1302 for the table): everything fits, the balances line included.
  assert.ok(all <= 1302)
  assert.deepEqual(fitColumns(1302, false).visibility, { change: false })
  // 1440 wide (1142): everything but the balances line, which the rail draws in full.
  assert.deepEqual(fitColumns(1142, false).visibility, { change: false, balances: false })
  // 1280 wide (982): then strength, then the allocation; last active stays.
  const laptop = fitColumns(982, false)
  assert.equal(laptop.visibility['balances'], false)
  assert.equal(laptop.visibility['strength'], false)
  assert.equal(laptop.visibility['allocation'], false)
  assert.equal(laptop.visibility['activity'], undefined)
  assert.equal(laptop.signal, true)
  // A phone (356): who and how much; the row opens the rest.
  const phone = fitColumns(356, false)
  assert.equal(phone.signal, false)
  assert.equal(phone.visibility['value'], undefined)
  // Beside the rail on a 1280 laptop (about 560 for the list): who, how much, and why to call.
  const rail = fitColumns(560, true)
  assert.equal(rail.signal, true)
  assert.equal(rail.slim, true)
  assert.equal(rail.visibility['value'], undefined)
  assert.equal(rail.visibility['goal'], false)
  assert.equal(rail.visibility['balances'], false)
  // With a Windows scrollbar taking 17px of that, the signal still holds.
  assert.equal(fitColumns(543, true).signal, true)
  // Beside the rail at 1440 (about 720): the goal comes back, the balances line does not.
  assert.equal(fitColumns(722, true).visibility['goal'], undefined)
  assert.equal(fitColumns(1302, true).visibility['balances'], false)
})

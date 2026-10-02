import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AdviceItem, Handoff, QueueItem, Signal, UpcomingItem } from '@dhan/contracts'
import {
  addDays,
  applyHandoffStatus,
  askedLabel,
  figureRuns,
  fundOf,
  firstName,
  greeting,
  groupRefusals,
  groupUpcoming,
  headline,
  kpiLabel,
  openerFor,
  rangeLabel,
  requestFor,
  requestLine,
  rowLine,
  udayRead,
  unqueuedRequests,
  untilLabel,
  weekday,
} from './derive.ts'

/* Hand-written literals: shapes only, no customer from the fixtures. */

const item = (over: Partial<UpcomingItem> & Pick<UpcomingItem, 'date' | 'kind'>): UpcomingItem => ({
  cif: 'IDBI0000000001',
  name: 'A Customer',
  label: 'a thing',
  amount: 1000,
  ...over,
})

const handoff = (over: Partial<Handoff> & Pick<Handoff, 'id'>): Handoff => ({
  cif: 'IDBI0000000001',
  name: 'A Customer',
  requestedOn: '2026-08-28',
  waitingDays: 4,
  status: 'open',
  reason: 'a reason',
  context: [],
  note: null,
  ...over,
})

const signal = (over: Partial<Signal> = {}): Signal => ({
  kind: 'expensive_debt',
  severity: 'urgent',
  title: 'Card at 34.8% — ₹3.14L outstanding',
  detail: '₹9,114 a month in interest.',
  figure: 314280,
  deadlineDays: null,
  evidence: [],
  ...over,
})

const queued = (over: Partial<QueueItem> & Pick<QueueItem, 'id' | 'cif'>): QueueItem => ({
  name: 'Asha Rao',
  initials: 'AR',
  segment: 'mass',
  source: 'signal',
  signal: signal(),
  why: '₹3.14L on a card at 34.8% costs ₹9,114 a month in interest.',
  opener: '₹9,114 a month is going on card interest. Shall we plan to clear it?',
  ...over,
})

const refusal = (
  over: Partial<AdviceItem> & Pick<AdviceItem, 'id' | 'at' | 'cif'>,
): AdviceItem => ({
  name: 'A Customer',
  productId: 'P1',
  productName: 'A Fund',
  amount: 1000,
  source: 'text',
  verdict: 'BLOCKED',
  ruleId: 'RULE_A',
  rulesPassed: [],
  spoken: 'Not this one.',
  recorded: 'Blocked: rule A.',
  hash: 'a'.repeat(64),
  prevHash: 'b'.repeat(64),
  ...over,
})

test('calendar helpers read dates as UTC calendar days', () => {
  assert.equal(addDays('2026-09-01', 30), '2026-10-01')
  assert.equal(addDays('2026-02-27', 2), '2026-03-01')
  assert.equal(weekday('2026-09-01'), 'Tuesday')
  assert.equal(weekday('2026-09-05', { short: true }), 'Sat')
  assert.equal(rangeLabel('2026-09-01', '2026-09-07'), '1–7 Sep')
  assert.equal(rangeLabel('2026-09-29', '2026-10-01'), '29 Sep – 1 Oct')
  assert.equal(rangeLabel('2026-09-05', '2026-09-05'), '5 Sep')
})

test('the greeting turns at noon and five', () => {
  assert.equal(greeting(8), 'Good morning')
  assert.equal(greeting(12), 'Good afternoon')
  assert.equal(greeting(17), 'Good evening')
})

test('figure runs pick out rupees and percentages and join back to the sentence', () => {
  const sentence = 'Waiting 6 days; top issue: card at 34.8% — ₹3.14L outstanding, ₹9,114 a month.'
  const runs = figureRuns(sentence)
  assert.deepEqual(
    runs.filter((r) => r.figure).map((r) => r.text),
    ['34.8%', '₹3.14L', '₹9,114'],
  )
  assert.equal(runs.map((r) => r.text).join(''), sentence)
  assert.deepEqual(
    figureRuns('₹1.26Cr short; −₹1,200 back')
      .filter((r) => r.figure)
      .map((r) => r.text),
    ['₹1.26Cr', '−₹1,200'],
  )
  assert.deepEqual(figureRuns('No figure here'), [{ text: 'No figure here', figure: false }])
})

test('the headline leads with who is waiting, then the queue, then says nobody', () => {
  const asOf = '2026-09-01'
  assert.equal(
    headline({ asOf, handoffs: [handoff({ id: 'a' }), handoff({ id: 'b' })], queue: [] }),
    'Tuesday, 1 Sep 2026 · 2 customers are waiting on a call',
  )
  assert.equal(
    headline({ asOf, handoffs: [handoff({ id: 'a', status: 'contacted' })], queue: [] }),
    'Tuesday, 1 Sep 2026 · nobody needs a call today',
  )
  assert.equal(firstName('  Priya   Nair '), 'Priya')
})

test('a contacted request keeps its row; a resolved one leaves with the row it raised', () => {
  const today = {
    handoffs: [handoff({ id: 'a' }), handoff({ id: 'b', cif: 'IDBI0000000002' })],
    queue: [
      queued({ id: 'handoff:a', cif: 'IDBI0000000001', source: 'handoff' }),
      queued({ id: 'handoff:b', cif: 'IDBI0000000002', source: 'handoff' }),
    ],
  }
  const contacted = applyHandoffStatus(today, 'a', 'contacted', 'Spoke at 10')
  assert.equal(contacted.handoffs[0]?.status, 'contacted')
  assert.equal(contacted.handoffs[0]?.note, 'Spoke at 10')
  assert.equal(contacted.queue.length, 2)
  const resolved = applyHandoffStatus(today, 'b', 'resolved', null)
  assert.deepEqual(
    resolved.handoffs.map((h) => h.id),
    ['a'],
  )
  assert.deepEqual(
    resolved.queue.map((q) => q.id),
    ['handoff:a'],
  )
})

test('the wait moves to the chip, and the request line says when they asked', () => {
  assert.equal(askedLabel(0), 'Asked today')
  assert.equal(askedLabel(1), 'Asked yesterday')
  assert.equal(askedLabel(6), 'Asked 6 days ago')
  assert.equal(
    requestLine({ requestedOn: '2026-08-26', waitingDays: 6, status: 'open' }),
    'Asked 26 Aug · waiting 6 days',
  )
  assert.equal(
    requestLine({ requestedOn: '2026-08-31', waitingDays: 1, status: 'open' }),
    'Asked 31 Aug · waiting 1 day',
  )
  assert.equal(
    requestLine({ requestedOn: '2026-08-26', waitingDays: 6, status: 'contacted' }),
    'Asked 26 Aug · contacted',
  )
})

test('a row finds its own request first, else the customer’s oldest live one', () => {
  const own = handoff({ id: 'own', requestedOn: '2026-08-30' })
  const older = handoff({ id: 'older', requestedOn: '2026-08-20', status: 'contacted' })
  const done = handoff({ id: 'done', requestedOn: '2026-08-01', status: 'resolved' })
  const list = [done, own, older]
  assert.equal(requestFor({ id: 'handoff:own', cif: own.cif }, list)?.id, 'own')
  assert.equal(requestFor({ id: 'signal:x:idle_cash', cif: own.cif }, list)?.id, 'older')
  assert.equal(requestFor({ id: 'signal:y:idle_cash', cif: 'IDBI0000000009' }, list), null)
})

test('requests whose customer left the queue are listed once, below it', () => {
  const list = [
    handoff({ id: 'a', cif: 'IDBI0000000001', status: 'contacted' }),
    handoff({ id: 'b', cif: 'IDBI0000000002', status: 'contacted' }),
    handoff({ id: 'c', cif: 'IDBI0000000003', status: 'resolved' }),
  ]
  assert.deepEqual(
    unqueuedRequests([{ cif: 'IDBI0000000001' }], list).map((h) => h.id),
    ['b'],
  )
})

test('a row a customer raised leads with the figure, not the wait', () => {
  const raised = queued({
    id: 'handoff:a',
    cif: 'IDBI0000000001',
    source: 'handoff',
    why: 'Waiting 6 days for a call, asked through Uday; top issue: card at 34.8% — ₹3.14L outstanding.',
  })
  assert.equal(rowLine(raised, handoff({ id: 'a' })), 'Card at 34.8% — ₹3.14L outstanding')
  assert.equal(
    rowLine({ ...raised, signal: null }, handoff({ id: 'a', reason: 'Wants to talk' })),
    'Wants to talk',
  )
  const plain = queued({ id: 'signal:x:expensive_debt', cif: 'IDBI0000000001' })
  assert.equal(rowLine(plain, null), plain.why)
})

test('the opener for a request says when they asked and what Uday flagged first', () => {
  const raised = queued({
    id: 'handoff:a',
    cif: 'IDBI0000000001',
    name: 'Priyanka Arora',
    source: 'handoff',
    opener: 'Priyanka, calling back on the request made through Uday.',
  })
  const asked = handoff({ id: 'a', requestedOn: '2026-08-26', waitingDays: 6 })
  assert.equal(
    openerFor(raised, asked),
    'Priyanka, you asked Uday for a call on 26 Aug. He flagged this first: card at 34.8% — ₹3.14L outstanding.',
  )
  assert.equal(
    openerFor(
      { ...raised, signal: signal({ title: '₹46,500 a month in EMIs, a repayment missed' }) },
      { ...asked, waitingDays: 1 },
    ),
    'Priyanka, you asked Uday for a call yesterday. He flagged this first: ₹46,500 a month in EMIs, a repayment missed.',
  )
  assert.equal(
    openerFor({ ...raised, signal: null }, { ...asked, waitingDays: 0 }),
    'Priyanka, you asked Uday for a call today. What would you like to go through?',
  )
  // Once the API's own opener says why, with a figure, it is used as sent.
  const voiced = { ...raised, opener: 'Priyanka, you asked about the ₹3.14L card. Shall we?' }
  assert.equal(openerFor(voiced, asked), voiced.opener)
  // A signal row's opener is never rewritten.
  const plain = queued({ id: 'signal:x:expensive_debt', cif: 'IDBI0000000001' })
  assert.equal(openerFor(plain, asked), plain.opener)
})

test('Uday’s read keeps the day’s reason only when it differs from the row’s line', () => {
  const request = { reason: 'FD matures in 11 days', context: ['Thin buffer'] }
  assert.deepEqual(udayRead(request, 'FD matures in 11 days'), ['Thin buffer'])
  assert.deepEqual(udayRead(request, 'FD matures in 7 days'), [
    'FD matures in 11 days',
    'Thin buffer',
  ])
})

test('the request KPI is named the way the RM says it', () => {
  assert.equal(kpiLabel({ id: 'open_handoffs', label: 'Open handoffs' }), 'Asked for a call')
  assert.equal(kpiLabel({ id: 'book_value', label: 'Book value' }), 'Book value')
})

test('the same refusal said to several customers is one row; anything different stays apart', () => {
  const items = [
    refusal({ id: '1', at: '2026-08-01', cif: 'C1', name: 'Asha' }),
    refusal({
      id: '2',
      at: '2026-07-01',
      cif: 'C2',
      name: 'Tanvi',
      productName: 'Other Fund',
      productId: 'P2',
    }),
    refusal({ id: '3', at: '2026-07-01', cif: 'C3', name: 'Ananya' }),
    refusal({ id: '4', at: '2026-06-01', cif: 'C1', name: 'Asha' }),
    refusal({ id: '5', at: '2026-06-01', cif: 'C4', name: 'Ravi', spoken: 'Different words.' }),
    refusal({ id: '6', at: '2026-05-01', cif: 'C5', name: 'Late', ruleId: 'RULE_B' }),
  ]
  const groups = groupRefusals(items, 3)
  assert.deepEqual(
    groups.map((g) => [g.id, g.people.map((p) => p.name), g.from, g.to]),
    [
      ['1', ['Asha', 'Ananya'], '2026-06-01', '2026-08-01'],
      ['2', ['Tanvi'], '2026-07-01', '2026-07-01'],
      ['5', ['Ravi'], '2026-06-01', '2026-06-01'],
    ],
  )
  assert.equal(groups[0]?.spoken, true)
  const unspoken = groupRefusals(
    [refusal({ id: '9', at: '2026-08-01', cif: 'C9', spoken: null })],
    3,
  )
  assert.deepEqual(
    unspoken.map((g) => [g.words, g.spoken]),
    [['Blocked: rule A.', false]],
  )
})

test('upcoming events stay one row each, grouped by kind in desk order', () => {
  const groups = groupUpcoming(
    [
      item({ kind: 'emi_ending', date: '2026-09-20', name: 'B' }),
      item({ kind: 'deposit_maturing', date: '2026-09-28', name: 'C' }),
      item({ kind: 'deposit_maturing', date: '2026-09-11', name: 'A' }),
    ],
    '2026-09-01',
  )
  assert.deepEqual(
    groups.events.map((g) => [g.kind, g.items.map((i) => i.name)]),
    [
      ['deposit_maturing', ['A', 'C']],
      ['emi_ending', ['B']],
    ],
  )
  assert.equal(groups.weeks.length, 0)
  assert.equal(groups.sip.count, 0)
})

test('SIP dates fold into seven-day windows from the as-of date, empty windows left out', () => {
  const groups = groupUpcoming(
    [
      item({ kind: 'sip_date', date: '2026-09-05', cif: 'X', amount: 15000 }),
      item({ kind: 'sip_date', date: '2026-09-05', cif: 'Y', amount: 20000 }),
      item({ kind: 'sip_date', date: '2026-09-07', cif: 'X', amount: 8000 }),
      item({ kind: 'sip_date', date: '2026-09-08', cif: 'Z', amount: null }),
      item({ kind: 'sip_date', date: '2026-09-30', cif: 'Z', amount: 1000 }),
    ],
    '2026-09-01',
  )
  assert.deepEqual(
    groups.weeks.map((w) => [w.from, w.to, w.count, w.customers, w.amount, w.days.length]),
    [
      ['2026-09-01', '2026-09-07', 3, 2, 43000, 2],
      ['2026-09-08', '2026-09-14', 1, 1, 0, 1],
      // The fifth window runs 29 Sep – 5 Oct; it stops at the thirtieth day.
      ['2026-09-29', '2026-10-01', 1, 1, 1000, 1],
    ],
  )
  assert.deepEqual(groups.sip, { count: 5, customers: 3, amount: 44000 })
})

test('how far off a date is, from the RM clock', () => {
  assert.equal(untilLabel('2026-09-01', '2026-09-01'), 'Today')
  assert.equal(untilLabel('2026-09-02', '2026-09-01'), 'Tomorrow')
  assert.equal(untilLabel('2026-09-11', '2026-09-01'), 'In 10 days')
})

test('an instalment label gives up its leading amount; any other label is kept whole', () => {
  assert.equal(
    fundOf('₹15,000 SIP into Parag Parikh Flexi Cap Fund'),
    'Parag Parikh Flexi Cap Fund',
  )
  assert.equal(
    fundOf('₹5,000 contribution to Public Provident Fund, opened 2019'),
    'Public Provident Fund, opened 2019',
  )
  assert.equal(fundOf('₹2,00,000 FD matures'), '₹2,00,000 FD matures')
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Handoff, UpcomingItem } from '@dhan/contracts'
import {
  addDays,
  applyHandoffStatus,
  figureRuns,
  fundOf,
  firstName,
  greeting,
  groupUpcoming,
  headline,
  rangeLabel,
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

test('a contacted handoff keeps its place; a resolved one leaves the list', () => {
  const list = [handoff({ id: 'a' }), handoff({ id: 'b' })]
  const contacted = applyHandoffStatus(list, 'a', 'contacted', 'Spoke at 10')
  assert.equal(contacted[0]?.status, 'contacted')
  assert.equal(contacted[0]?.note, 'Spoke at 10')
  assert.equal(contacted.length, 2)
  assert.deepEqual(
    applyHandoffStatus(list, 'b', 'resolved', null).map((h) => h.id),
    ['a'],
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

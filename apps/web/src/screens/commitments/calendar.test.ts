/**
 * The calendar's arithmetic, checked against a wall calendar.
 *
 * Every case here is one of the reference build's defects written as an assertion. Its grid ran
 * 1–28 in reading order with no weekday alignment and no 29th, 30th or 31st — which renders
 * beautifully and is wrong about every date on the screen — so alignment, month length, the leap
 * day and the day-31 clamp are the first four tests, and none of them is hypothetical.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  duesInMonth,
  monthGrid,
  monthLabel,
  monthRange,
  monthTotals,
  monthsBetween,
  occurrences,
  shiftMonth,
  weekdayOf,
} from './calendar.ts'
import type { Schedule } from './calendar.ts'

const monthly = (over: Partial<Schedule> = {}): Schedule => ({
  key: 'NACH/RENT',
  label: 'Rent',
  amount: 24_000,
  cadence: 'monthly',
  intervalDays: 30,
  dayOfMonth: 5,
  firstSeen: '2025-01-05',
  lastSeen: '2026-09-05',
  until: null,
  skip: null,
  ...over,
})

test('the first row is padded so day 1 sits under its real weekday', () => {
  // 1 September 2026 is a Tuesday: two blanks, then the 1st in column three.
  const cells = monthGrid(2026, 9, '2026-09-11', [])
  assert.equal(weekdayOf('2026-09-01'), 2)
  assert.deepEqual(
    cells.slice(0, 7).map((c) => c.day),
    [0, 0, 1, 2, 3, 4, 5],
  )
  assert.equal(cells[0]?.date, null)
  assert.equal(cells[2]?.date, '2026-09-01')
})

test('a month that starts on a Sunday gets no leading blanks', () => {
  // 1 February 2026 is a Sunday.
  const cells = monthGrid(2026, 2, '2026-02-10', [])
  assert.equal(cells[0]?.date, '2026-02-01')
})

test('months are their real length, including the leap day', () => {
  const days = (y: number, m: number): number =>
    monthGrid(y, m, '2026-01-01', []).filter((c) => c.date !== null).length
  assert.equal(days(2026, 2), 28)
  assert.equal(days(2028, 2), 29)
  assert.equal(days(2026, 4), 30)
  assert.equal(days(2026, 1), 31)
  // The defect this replaces: the reference drew 28 cells for every month of the year.
  assert.notEqual(days(2026, 1), 28)
})

test('a 31-day month starting on a Saturday needs six rows', () => {
  // 1 August 2026 is a Saturday: 6 leading blanks + 31 days = 37 cells, so six rows.
  const cells = monthGrid(2026, 8, '2026-08-01', [])
  assert.equal(cells.length, 37)
  assert.equal(Math.ceil(cells.length / 7), 6)
})

test('a mandate on the 31st clamps into the short months and comes back out', () => {
  const s = monthly({ dayOfMonth: 31, firstSeen: '2025-12-31', lastSeen: '2026-08-31' })
  assert.deepEqual(occurrences(s, '2026-01-01', '2026-01-31'), ['2026-01-31'])
  assert.deepEqual(occurrences(s, '2026-02-01', '2026-02-28'), ['2026-02-28'])
  assert.deepEqual(occurrences(s, '2026-04-01', '2026-04-30'), ['2026-04-30'])
  // Back to the 31st rather than stuck on the 28th: each step is measured from the anchor.
  assert.deepEqual(occurrences(s, '2026-05-01', '2026-05-31'), ['2026-05-31'])
})

test('nothing is drawn before the first charge we saw', () => {
  const s = monthly({ firstSeen: '2026-03-05' })
  assert.deepEqual(occurrences(s, '2026-01-01', '2026-01-31'), [])
  assert.deepEqual(occurrences(s, '2026-03-01', '2026-03-31'), ['2026-03-05'])
})

test('`until` cuts the series off, and the cut date itself does not charge', () => {
  const s = monthly({ until: '2026-07-05' })
  assert.deepEqual(occurrences(s, '2026-06-01', '2026-06-30'), ['2026-06-05'])
  assert.deepEqual(occurrences(s, '2026-07-01', '2026-07-31'), [])
})

test('a pause is a hole, not a truncation — the charges come back afterwards', () => {
  const s = monthly({ skip: { from: '2026-10-01', to: '2026-12-01' } })
  assert.deepEqual(occurrences(s, '2026-09-01', '2026-09-30'), ['2026-09-05'])
  assert.deepEqual(occurrences(s, '2026-10-01', '2026-11-30'), [])
  assert.deepEqual(occurrences(s, '2026-12-01', '2026-12-31'), ['2026-12-05'])
})

test('weekly and quarterly step in their own units', () => {
  const weekly = monthly({
    cadence: 'weekly',
    intervalDays: 7,
    dayOfMonth: null,
    firstSeen: '2026-08-01',
    lastSeen: '2026-09-04',
  })
  assert.deepEqual(occurrences(weekly, '2026-09-01', '2026-09-30'), [
    '2026-09-04',
    '2026-09-11',
    '2026-09-18',
    '2026-09-25',
  ])

  const quarterly = monthly({
    cadence: 'quarterly',
    intervalDays: 91,
    dayOfMonth: 20,
    firstSeen: '2025-03-20',
    lastSeen: '2026-06-20',
  })
  assert.deepEqual(occurrences(quarterly, '2026-09-01', '2026-09-30'), ['2026-09-20'])
  assert.deepEqual(occurrences(quarterly, '2026-10-01', '2026-10-31'), [])
})

test('an irregular series falls back to its measured interval', () => {
  const s = monthly({
    cadence: 'irregular',
    intervalDays: 45,
    dayOfMonth: null,
    firstSeen: '2026-01-01',
    lastSeen: '2026-09-01',
  })
  assert.deepEqual(occurrences(s, '2026-10-01', '2026-10-31'), ['2026-10-16'])
})

test('paid, late and due are the three real questions', () => {
  const s = monthly({ dayOfMonth: 5, firstSeen: '2026-01-05', lastSeen: '2026-08-05' })
  const late = monthly({
    key: 'NACH/GYM',
    label: 'Gym',
    amount: 1_500,
    dayOfMonth: 2,
    firstSeen: '2026-01-02',
    lastSeen: '2026-08-02',
  })

  const dues = duesInMonth([s, late], 2026, 9, '2026-09-11')
  const byKey = new Map(dues.map((d) => [d.key, d]))

  // Due on the 2nd, last seen in August, and today is the 11th: the charge has not landed.
  assert.equal(byKey.get('NACH/GYM')?.state, 'late')
  // Due on the 5th, same story — both are late; the state is about the ledger, not the calendar.
  assert.equal(byKey.get('NACH/RENT')?.state, 'late')

  const nextMonth = duesInMonth([s], 2026, 10, '2026-09-11')
  assert.equal(nextMonth[0]?.state, 'due')

  const lastMonth = duesInMonth([s], 2026, 8, '2026-09-11')
  assert.equal(lastMonth[0]?.state, 'paid')
  assert.equal(lastMonth[0]?.observed, true, 'the anchor date is the one we actually saw')
})

test('a cell takes the most urgent state on it, and sums the day', () => {
  const a = monthly({ key: 'A', label: 'A', amount: 1_000, dayOfMonth: 5, lastSeen: '2026-09-05' })
  const b = monthly({
    key: 'B',
    label: 'B',
    amount: 2_000,
    dayOfMonth: 5,
    firstSeen: '2025-02-05',
    lastSeen: '2026-08-05',
  })
  const dues = duesInMonth([a, b], 2026, 9, '2026-09-11')
  const cells = monthGrid(2026, 9, '2026-09-11', dues)
  const fifth = cells.find((c) => c.date === '2026-09-05')

  assert.equal(fifth?.dues.length, 2)
  assert.equal(fifth?.total, 3_000)
  // A is paid on the 5th, B is late on the 5th. Late wins the cell.
  assert.equal(fifth?.state, 'late')
  assert.equal(cells.find((c) => c.date === '2026-09-11')?.today, true)
  assert.equal(cells.find((c) => c.date === '2026-09-04')?.state, null)
})

test('the month total splits into what has gone and what has not', () => {
  const dues = duesInMonth(
    [
      monthly({ key: 'A', label: 'A', amount: 1_000, dayOfMonth: 3, lastSeen: '2026-09-03' }),
      monthly({
        key: 'B',
        label: 'B',
        amount: 2_000,
        dayOfMonth: 20,
        firstSeen: '2025-02-20',
        lastSeen: '2026-08-20',
      }),
    ],
    2026,
    9,
    '2026-09-11',
  )
  const t = monthTotals(dues)
  assert.equal(t.count, 2)
  assert.equal(t.paid, 1_000)
  assert.equal(t.due, 2_000)
  assert.equal(t.late, 0)
  assert.equal(t.total, 3_000)
})

test('month navigation crosses the year boundary in both directions', () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 })
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 })
  assert.equal(monthsBetween({ year: 2026, month: 1 }, { year: 2027, month: 3 }), 14)
  assert.equal(monthsBetween({ year: 2026, month: 5 }, { year: 2026, month: 2 }), -3)
  assert.equal(monthLabel(2026, 9), 'September 2026')
})

test('the navigable range starts at the oldest commitment and runs a year out', () => {
  const range = monthRange([monthly({ firstSeen: '2025-04-05' })], '2026-09-11')
  assert.deepEqual(range.first, { year: 2025, month: 4 })
  assert.deepEqual(range.last, { year: 2027, month: 9 })

  // Nothing detected: the range collapses onto the current month rather than going unbounded.
  assert.deepEqual(monthRange([], '2026-09-11').first, { year: 2026, month: 9 })
})

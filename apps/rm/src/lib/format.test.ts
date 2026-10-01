import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  daysBetween,
  formatAgo,
  formatDate,
  formatDuration,
  formatIn,
  formatInr,
  formatMonth,
  formatPct,
  initialsOf,
  shortNumber,
  splitInr,
  stableIndex,
} from './format.ts'

test('rupees use Indian grouping and a true minus sign', () => {
  assert.equal(formatInr(482448), '₹4,82,448')
  assert.equal(formatInr(12345678), '₹1,23,45,678')
  assert.equal(formatInr(-1200), '−₹1,200')
  assert.equal(formatInr(310000, { signed: true }), '+₹3,10,000')
  assert.equal(formatInr(0, { signed: true }), '₹0')
  assert.equal(formatInr(482448.41, { paise: true }), '₹4,82,448.41')
})

test('the short form picks its unit after rounding', () => {
  assert.equal(formatInr(482448, { short: true }), '₹4.8L')
  assert.equal(formatInr(12000000, { short: true }), '₹1.2Cr')
  assert.equal(formatInr(4820000, { short: true }), '₹48.2L')
  assert.equal(shortNumber(9996000), '1Cr')
  assert.equal(shortNumber(99960), '1L')
  assert.equal(shortNumber(48000), '48k')
  assert.equal(shortNumber(4500), '4.5k')
  assert.equal(shortNumber(950), '950')
  assert.equal(shortNumber(100000), '1L')
  assert.equal(shortNumber(1240000000), '124Cr')
  assert.equal(formatInr(-186000, { short: true }), '−₹1.9L')
})

test('paise split never rounds into the rupees', () => {
  assert.deepEqual(splitInr(6.41), { sign: '', rupees: '6', paise: '41' })
  assert.deepEqual(splitInr(-1200.05), { sign: '−', rupees: '1,200', paise: '05' })
  assert.deepEqual(splitInr(99.999), { sign: '', rupees: '100', paise: '00' })
})

test('percentages keep one decimal only when there is one', () => {
  assert.equal(formatPct(62), '62%')
  assert.equal(formatPct(34.8), '34.8%')
  assert.equal(formatPct(100), '100%')
  assert.equal(formatPct(-4.25), '−4.3%')
  assert.equal(formatPct(1.5, { signed: true }), '+1.5%')
})

test('dates are calendar dates, whatever the browser time zone', () => {
  assert.equal(formatDate('2026-09-01'), '1 Sep 2026')
  assert.equal(formatDate('2026-09-01T23:30:00.000Z', { year: false }), '1 Sep')
  assert.equal(formatMonth('2026-03'), 'Mar 2026')
  assert.equal(formatMonth('2026-03', { year: false }), 'Mar')
  assert.equal(daysBetween('2026-08-26', '2026-09-01'), 6)
})

test('relative time is measured against the as-of date', () => {
  assert.equal(formatAgo('2026-09-01', '2026-09-01'), 'Today')
  assert.equal(formatAgo('2026-08-31', '2026-09-01'), 'Yesterday')
  assert.equal(formatAgo('2026-08-26', '2026-09-01'), '6 days ago')
  assert.equal(formatAgo('2026-08-01', '2026-09-01'), '4 weeks ago')
  assert.equal(formatAgo('2026-03-01', '2026-09-01'), '6 months ago')
  assert.equal(formatIn('2026-09-13', '2026-09-01'), 'In 12 days')
  assert.equal(formatIn('2026-09-02', '2026-09-01'), 'Tomorrow')
  assert.equal(formatDuration(1), '1 day')
})

test('initials and tint index are stable', () => {
  assert.equal(initialsOf('Karan Mehta'), 'KM')
  assert.equal(initialsOf('  priya  '), 'P')
  assert.equal(initialsOf('Sunil Kumar Rao'), 'SR')
  assert.equal(stableIndex('Meera Joshi', 6), stableIndex('Meera Joshi', 6))
  for (const name of ['a', 'bb', 'Arjun Menon', 'Neha']) {
    const i = stableIndex(name, 6)
    assert.ok(i >= 0 && i < 6)
  }
})

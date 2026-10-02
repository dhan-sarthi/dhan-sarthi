import assert from 'node:assert/strict'
import { test } from 'node:test'
import { relationshipStrength } from '@dhan/core'
import { SHORT_INR_CASES } from './format.cases.ts'
import {
  daysBetween,
  formatDate,
  formatDuration,
  formatIn,
  formatInr,
  formatInrProse,
  formatLastActive,
  formatMonth,
  formatPct,
  initialsOf,
  prefersShort,
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
  assert.equal(formatInr(482448, { short: true }), '₹4.82L')
  assert.equal(formatInr(12000000, { short: true }), '₹1.2Cr')
  assert.equal(formatInr(4820000, { short: true }), '₹48.2L')
  assert.equal(shortNumber(9996000), '1Cr')
  assert.equal(shortNumber(99960), '1L')
  assert.equal(shortNumber(99500), '1L')
  assert.equal(shortNumber(48000), '48k')
  assert.equal(shortNumber(4500), '4.5k')
  assert.equal(shortNumber(950), '950')
  assert.equal(shortNumber(100000), '1L')
  assert.equal(shortNumber(1240000000), '124Cr')
  assert.equal(formatInr(-186000, { short: true }), '−₹1.86L')
})

test('every short figure on the console matches the shared table', () => {
  for (const [value, text] of SHORT_INR_CASES) {
    assert.equal(formatInr(value, { short: true }), text, `${value}`)
  }
})

test('prose prints the same short figure from a lakh up, and the full one below', () => {
  for (const [value, text] of SHORT_INR_CASES) {
    if (Math.abs(value) >= 100_000) assert.equal(formatInrProse(value), text, `${value}`)
  }
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

test('last active is whole days to the as-of date, as the strength reason says it', () => {
  assert.equal(formatLastActive('2026-09-01', '2026-09-01'), 'Today')
  assert.equal(formatLastActive('2026-08-31', '2026-09-01'), 'Yesterday')
  assert.equal(formatLastActive('2026-08-26', '2026-09-01'), '6 days ago')
  // The walk's mismatch: the header said "Active 31 days ago", the highlight "4 weeks ago".
  assert.equal(formatLastActive('2026-08-01', '2026-09-01'), '31 days ago')
  assert.equal(formatLastActive('2026-03-01', '2026-09-01'), '184 days ago')
  // A real instant reads as its UTC calendar date, as the API's `daysSince` does.
  assert.equal(formatLastActive('2026-08-31T23:30:00.000Z', '2026-09-01'), 'Yesterday')
  // After the as-of date (a reviewer's clock moved on): today, never "in 3 days".
  assert.equal(formatLastActive('2026-09-04', '2026-09-01'), 'Today')
})

test('last active agrees word for word with the strength reason the API writes', () => {
  const asOf = '2026-09-01'
  for (const at of ['2026-09-01', '2026-08-31', '2026-08-01', '2025-12-15', '2026-09-03']) {
    const { reason } = relationshipStrength({
      lastActivityAt: at,
      idbiProducts: 1,
      walletSharePct: null,
      asOf,
    })
    const clause = reason.split(' · ')[0]
    const ours = formatLastActive(at, asOf)
    assert.equal(clause, `Active ${ours.charAt(0).toLowerCase()}${ours.slice(1)}`)
  }
})

test('maturities and deadlines count forward from the as-of date', () => {
  assert.equal(formatIn('2026-09-13', '2026-09-01'), 'In 12 days')
  assert.equal(formatIn('2026-09-02', '2026-09-01'), 'Tomorrow')
  assert.equal(formatDuration(1), '1 day')
  assert.equal(formatDuration(28), '4 weeks')
})

test('prose shortens a figure from one lakh up', () => {
  assert.equal(formatInrProse(22501), '₹22,501')
  assert.equal(formatInrProse(99999), '₹99,999')
  assert.equal(formatInrProse(100000), '₹1L')
  assert.equal(formatInrProse(22770000), '₹2.28Cr')
  assert.equal(formatInrProse(-186240), '−₹1.86L')
  assert.equal(formatInrProse(4500, { signed: true }), '+₹4,500')
  assert.equal(prefersShort(-100000), true)
  assert.equal(prefersShort(99999), false)
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

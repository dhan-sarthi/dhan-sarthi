/**
 * Rupees, at the boundaries.
 *
 * The short form is the one worth pinning: it is what every headline figure on the app is
 * printed with, the thresholds are powers of ten a rounding can walk across, and a wrong
 * suffix is a figure out by a factor of a hundred on a card about someone's money.
 *
 * The date tests pass in any zone, but the bug they guard only shows west of Greenwich, where
 * a date-only string read as UTC lands on the day before. One process has one zone, so the
 * manual check is the same suite under another one:
 *   TZ=America/Los_Angeles pnpm --filter @dhan/mobile test
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  rupees,
  rupeesShort,
  splitAmount,
  shortDate,
  fullDate,
  monthYear,
  parseDay,
} from './money.ts'

describe('rupeesShort', () => {
  it('names the magnitude India names it by', () => {
    assert.equal(rupeesShort(482_448), '₹4.82L')
    assert.equal(rupeesShort(10_200_000), '₹1.02Cr')
    assert.equal(rupeesShort(4_500), '₹4.5k')
    assert.equal(rupeesShort(940), '₹940')
  })

  it('crosses each threshold at the threshold, not near it', () => {
    assert.equal(rupeesShort(999), '₹999')
    assert.equal(rupeesShort(1_000), '₹1k')
    assert.equal(rupeesShort(99_999), '₹100k')
    assert.equal(rupeesShort(100_000), '₹1L')
    assert.equal(rupeesShort(9_999_999), '₹100L')
    assert.equal(rupeesShort(10_000_000), '₹1Cr')
  })

  it('rounds up to the next whole unit without losing the unit', () => {
    // 9,99,999 is a hair under ten lakh. It must read as ten lakh, never as one.
    assert.equal(rupeesShort(999_999), '₹10L')
    assert.equal(rupeesShort(99_999_999), '₹10Cr')
  })

  it('drops trailing zeros but keeps the figures that matter', () => {
    assert.equal(rupeesShort(500_000), '₹5L')
    assert.equal(rupeesShort(450_000), '₹4.5L')
    assert.equal(rupeesShort(1_150_000), '₹11.5L')
  })

  it('carries the sign, and is symmetric about zero', () => {
    assert.equal(rupeesShort(-482_448), '-₹4.82L')
    assert.equal(rupeesShort(0), '₹0')
    assert.equal(rupeesShort(-0), '₹0')
    assert.equal(rupeesShort(-0.4), '₹0')
  })

  it('rounds to the rupee before it picks the unit', () => {
    // Printed as a thousand, so it is called a thousand — never "₹1000".
    assert.equal(rupeesShort(999.5), '₹1k')
    assert.equal(rupeesShort(999.4), '₹999')
    // A hair under a lakh that rounds to one is a lakh, not "₹100k".
    assert.equal(rupeesShort(99_999.6), '₹1L')
  })
})

describe('rupees', () => {
  it('groups 2,2,3 the way India writes it, to the whole rupee', () => {
    assert.equal(rupees(482_447.85), '₹4,82,448')
    assert.equal(rupees(10_200_000), '₹1,02,00,000')
  })
})

describe('splitAmount', () => {
  it('splits the paise off so they can sit smaller', () => {
    assert.deepEqual(splitAmount(282_447.85), { whole: '₹2,82,447', paise: '.85' })
  })

  it('leaves the paise off entirely when there are none', () => {
    assert.deepEqual(splitAmount(282_447), { whole: '₹2,82,447', paise: '' })
  })

  it('pads a single paisa rather than printing a tenth', () => {
    assert.deepEqual(splitAmount(100.05), { whole: '₹100', paise: '.05' })
  })

  it('carries a rounding into the rupees instead of printing ".100"', () => {
    assert.deepEqual(splitAmount(99.999), { whole: '₹100', paise: '' })
  })

  it('keeps the sign on an overdrawn balance', () => {
    assert.deepEqual(splitAmount(-100.5), { whole: '-₹100', paise: '.50' })
  })

  it('drops the sign from a figure that rounds to nothing', () => {
    assert.deepEqual(splitAmount(-0.001), { whole: '₹0', paise: '' })
  })
})

describe('dates', () => {
  it('shows the year when it is not the year being looked at, and hides it when it is', () => {
    assert.ok(shortDate('2027-09-11', '2026-09-20').includes('2027'))
    assert.equal(shortDate('2026-09-11', '2026-09-20').includes('2026'), false)
  })

  it('always shows the year where the year carries the meaning', () => {
    assert.ok(fullDate('2029-09-11').includes('2029'))
  })

  it('names a month and its year, and no day', () => {
    const printed = monthYear('2027-08-01')
    assert.ok(printed.includes('Aug'))
    assert.ok(printed.includes('2027'))
    assert.equal(/\b1\b/.test(printed), false)
  })
})

describe('dates across zones', () => {
  it('reads a date-only string as that day on this phone, not as UTC midnight', () => {
    const d = parseDay('2026-09-11')
    assert.equal(d.getFullYear(), 2026)
    assert.equal(d.getMonth(), 8)
    assert.equal(d.getDate(), 11)
  })

  it('parses a full timestamp as it stands', () => {
    assert.equal(parseDay('2026-09-11T10:30:00Z').getTime(), Date.UTC(2026, 8, 11, 10, 30))
  })

  it('prints the day it was given', () => {
    assert.ok(shortDate('2026-09-11').includes('11'))
    // New Year's Day is where a day's slip also changes the year.
    assert.ok(fullDate('2027-01-01').includes('2027'))
    assert.equal(shortDate('2027-01-01', '2026-12-31').includes('2027'), true)
  })
})

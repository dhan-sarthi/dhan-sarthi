/**
 * The console's rupee and date formatting, pinned to the mobile app's behaviour it was ported
 * from, including the two rounding edges that file's comments record.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  dateLabel,
  firstName,
  initials,
  monthLabel,
  monthName,
  plural,
  rupees,
  rupeesShort,
  rupeesTitle,
  shortDate,
} from './format.ts'

describe('rupees', () => {
  it('groups the Indian way', () => {
    assert.equal(rupees(482_448), '₹4,82,448')
    assert.equal(rupees(1_02_00_000), '₹1,02,00,000')
  })

  it('rounds to the rupee and never prints a negative zero', () => {
    assert.equal(rupees(4_82_447.85), '₹4,82,448')
    assert.equal(rupees(-0.4), '₹0')
    assert.equal(rupees(-1_500), '-₹1,500')
  })
})

describe('rupeesShort', () => {
  it('uses lakh and crore, two decimals under ten and one above', () => {
    assert.equal(rupeesShort(482_448), '₹4.82L')
    assert.equal(rupeesShort(1_86_240), '₹1.86L')
    assert.equal(rupeesShort(1_20_00_000), '₹1.2Cr')
    assert.equal(rupeesShort(12_000), '₹12k')
    assert.equal(rupeesShort(45_00_000), '₹45L')
    assert.equal(rupeesShort(450), '₹450')
  })

  it('picks the unit after rounding, so ₹999.50 is a thousand and ₹99,999.60 a lakh', () => {
    assert.equal(rupeesShort(999.5), '₹1k')
    assert.equal(rupeesShort(99_999.6), '₹1L')
  })

  it('keeps the sign, and drops it on a figure that rounds to nothing', () => {
    assert.equal(rupeesShort(-1_86_240), '-₹1.86L')
    assert.equal(rupeesShort(-0.2), '₹0')
  })
})

describe('rupeesTitle', () => {
  it('is short from a lakh up and exact below', () => {
    assert.equal(rupeesTitle(1_86_240), '₹1.86L')
    assert.equal(rupeesTitle(5_401), '₹5,401')
  })
})

describe('names and dates', () => {
  it('takes initials from the first and last word', () => {
    assert.equal(initials('Karan Mehta'), 'KM')
    assert.equal(initials('  Meera R Joshi '), 'MJ')
    assert.equal(initials('Sunil'), 'S')
    assert.equal(initials(''), '')
    assert.equal(firstName('Priya Nair'), 'Priya')
  })

  it('prints a day and month, and the year only when it differs', () => {
    assert.equal(shortDate('2026-09-11'), '11 Sep')
    assert.equal(shortDate('2026-09-11', '2026-09-01'), '11 Sep')
    assert.equal(shortDate('2027-01-05', '2026-09-01'), '5 Jan 2027')
    assert.equal(monthLabel('2026-09'), 'Sep 2026')
    assert.equal(monthLabel('2025-10-31'), 'Oct 2025')
    assert.equal(monthName('2026-08'), 'August')
    assert.equal(monthName('2025-12-31'), 'December')
    assert.equal(dateLabel('2026-09-01'), '1 Sep 2026')
    assert.equal(dateLabel('2026-08-31'), '31 Aug 2026')
  })

  it('pluralises a count', () => {
    assert.equal(plural(1, 'month'), '1 month')
    assert.equal(plural(3, 'month'), '3 months')
    assert.equal(plural(1.4, 'month'), '1.4 months')
  })
})

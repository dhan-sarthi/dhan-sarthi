/**
 * Evidence lines, put into the customer's words.
 *
 * The one that matters is the range: the engine's windows are half-open, so a line that printed
 * its second date as it stands claimed a day the answer never counted. Month names come from
 * the platform's ICU ("Sep" or "Sept"), so these compare against `shortDate` rather than
 * against a spelling.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dayBefore, evidenceLine } from './evidence.ts'
import { shortDate } from './money.ts'

const AS_OF = '2026-09-22'

describe('dayBefore', () => {
  it('steps back across a month, a year and a leap day', () => {
    assert.equal(dayBefore('2026-09-01'), '2026-08-31')
    assert.equal(dayBefore('2026-01-01'), '2025-12-31')
    assert.equal(dayBefore('2028-03-01'), '2028-02-29')
    assert.equal(dayBefore('2026-09-22'), '2026-09-21')
  })
})

describe('evidenceLine', () => {
  it('ends a window on the last day it counted, not the day after', () => {
    const line = evidenceLine('Looked at 2026-08-01 to 2026-09-01', AS_OF)
    assert.equal(
      line,
      `Looked at ${shortDate('2026-08-01', AS_OF)} to ${shortDate('2026-08-31', AS_OF)}`,
    )
    assert.equal(line.includes(shortDate('2026-09-01', AS_OF)), false)
  })

  it('keeps the year on a window that ends in another year', () => {
    const line = evidenceLine('Looked at 2025-12-01 to 2026-01-01', '2026-01-15')
    assert.equal(
      line,
      `Looked at ${shortDate('2025-12-01', '2026-01-15')} to ${shortDate('2025-12-31', '2026-01-15')}`,
    )
    assert.ok(line.endsWith('2025'))
  })

  it('names the one day of a window that covers a single day or none', () => {
    assert.equal(
      evidenceLine('Looked at 2026-09-01 to 2026-09-02', AS_OF),
      `Looked at ${shortDate('2026-09-01', AS_OF)}`,
    )
    assert.equal(
      evidenceLine('Looked at 2026-09-01 to 2026-09-01', AS_OF),
      `Looked at ${shortDate('2026-09-01', AS_OF)}`,
    )
  })

  it('leaves a lone date as the day it names', () => {
    assert.equal(
      evidenceLine('Next salary 2026-09-30', AS_OF),
      `Next salary ${shortDate('2026-09-30', AS_OF)}`,
    )
  })

  it('turns a series id into a source, after the figure or before a bare date', () => {
    assert.equal(
      evidenceLine('₹1,92,000 a month coming in (salary-series)', AS_OF),
      '₹1,92,000 a month coming in · Salary',
    )
    assert.equal(
      evidenceLine('2026-08-01 (monthly-credits)', AS_OF),
      `Monthly credits · ${shortDate('2026-08-01', AS_OF)}`,
    )
  })

  it('never touches a line with nothing to translate', () => {
    assert.equal(evidenceLine('₹30,500 a month in EMIs', AS_OF), '₹30,500 a month in EMIs')
  })
})

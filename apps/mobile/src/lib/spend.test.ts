import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { monthlyByCategory } from './spend.ts'

describe('monthlyByCategory', () => {
  it('divides a running total down to a month', () => {
    // The figure the comment on this rule names: ₹93,234 of Shopping over 24 months.
    const { perMonth } = monthlyByCategory([['Shopping', 93_234]], 24)
    assert.deepEqual(perMonth, [['Shopping', 3_884.75]])
  })

  it('floors the divisor at one month, so a fresh account passes its totals through', () => {
    const { months, perMonth } = monthlyByCategory([['Eating out', 4_100]], 0)
    assert.equal(months, 1)
    assert.deepEqual(perMonth, [['Eating out', 4_100]])
  })

  it('floors a negative history too', () => {
    assert.equal(monthlyByCategory([], -3).months, 1)
  })

  it('answers 1 rather than -Infinity for an empty ledger', () => {
    const { perMonth, largest } = monthlyByCategory([], 12)
    assert.deepEqual(perMonth, [])
    assert.equal(largest, 1)
  })

  it('preserves order, because the snapshot already sorted it descending', () => {
    const { perMonth, largest } = monthlyByCategory(
      [
        ['Shopping', 24_000],
        ['Eating out', 12_000],
        ['Travel', 6_000],
      ],
      12,
    )
    assert.deepEqual(
      perMonth.map(([name]) => name),
      ['Shopping', 'Eating out', 'Travel'],
    )
    assert.equal(largest, 2_000)
  })
})

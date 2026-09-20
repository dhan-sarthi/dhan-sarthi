import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { holdingsTotals } from './holdings.ts'

describe('holdingsTotals', () => {
  it('is all zeros for an empty portfolio', () => {
    assert.deepEqual(holdingsTotals([]), { invested: 0, value: 0, gain: 0 })
  })

  it('sums both columns across holdings', () => {
    const totals = holdingsTotals([
      { investedAmount: 120_000, currentValue: 148_500 },
      { investedAmount: 60_000, currentValue: 61_200 },
    ])
    assert.deepEqual(totals, { invested: 180_000, value: 209_700, gain: 29_700 })
  })

  it('reports a loss as a negative gain rather than clamping it', () => {
    assert.equal(holdingsTotals([{ investedAmount: 50_000, currentValue: 41_300 }]).gain, -8_700)
  })

  it('carries paise without drifting', () => {
    const { gain } = holdingsTotals([
      { investedAmount: 1_000.1, currentValue: 1_200.35 },
      { investedAmount: 2_000.2, currentValue: 2_100.05 },
    ])
    assert.ok(Math.abs(gain - 300.1) < 0.01, `gain was ${gain}`)
  })
})

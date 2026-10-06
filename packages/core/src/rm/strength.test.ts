/**
 * Relationship strength and the attrition watch: each level and each reason, with the boundary
 * on either side of every threshold the spec names.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BalancePoint } from './series.ts'
import { attritionWatch, relationshipStrength } from './strength.ts'

const AS_OF = '2026-09-01'

describe('relationshipStrength', () => {
  it('reads the spec’s own example as High, with the reason spelled out', () => {
    const s = relationshipStrength({
      lastActivityAt: '2026-08-26',
      idbiProducts: 3,
      walletSharePct: 62,
      asOf: AS_OF,
    })
    assert.deepEqual(s, {
      level: 'high',
      reason: 'Active 6 days ago · 3 IDBI products · 62% of balances with IDBI',
    })
  })

  it('is Medium with one leg short, and says which', () => {
    const s = relationshipStrength({
      lastActivityAt: '2026-08-30',
      idbiProducts: 1,
      walletSharePct: 45,
      asOf: AS_OF,
    })
    assert.equal(s.level, 'medium')
    assert.equal(s.reason, 'Active 2 days ago · 1 IDBI product · 45% of balances with IDBI')
  })

  it('is Low for a lapsed customer with little at IDBI', () => {
    const s = relationshipStrength({
      lastActivityAt: '2026-04-01',
      idbiProducts: 1,
      walletSharePct: 18,
      asOf: AS_OF,
    })
    assert.equal(s.level, 'low')
    assert.equal(s.reason, 'Active 153 days ago · 1 IDBI product · 18% of balances with IDBI')
  })

  it('says so plainly when there is no activity and no balance on record', () => {
    const s = relationshipStrength({
      lastActivityAt: null,
      idbiProducts: 0,
      walletSharePct: null,
      asOf: AS_OF,
    })
    assert.equal(s.level, 'low')
    assert.equal(s.reason, 'No activity on record · 0 IDBI products · No balances on record')
  })

  it('reads a real instant later than the RM clock as today', () => {
    const s = relationshipStrength({
      lastActivityAt: '2026-10-02T09:15:00.000Z',
      idbiProducts: 2,
      walletSharePct: 30,
      asOf: AS_OF,
    })
    assert.match(s.reason, /^Active today/)
    assert.equal(s.level, 'medium')
  })
})

const series = (withIdbi: readonly number[]): BalancePoint[] =>
  withIdbi.map((v, i) => ({ month: `2026-0${i + 5}`, total: v * 2, withIdbi: v }))

describe('attritionWatch', () => {
  const calm = {
    balanceSeries: series([1_00_000, 1_00_000, 1_00_000, 1_00_000]),
    walletSharePct: 55,
    lastActivityAt: '2026-08-20',
    sipPaused: false,
    asOf: AS_OF,
  }

  it('flags nothing, with an empty list, for a steady customer', () => {
    assert.deepEqual(attritionWatch(calm), { flagged: false, reasons: [] })
  })

  it('flags IDBI balances down more than 15% over three months, and not exactly 15%', () => {
    const down = attritionWatch({
      ...calm,
      balanceSeries: series([1_00_000, 95_000, 90_000, 80_000]),
    })
    assert.deepEqual(down.reasons, ['IDBI month-end balances down 20% in 3 months'])
    const edge = attritionWatch({
      ...calm,
      balanceSeries: series([1_00_000, 95_000, 90_000, 85_000]),
    })
    assert.equal(edge.flagged, false)
  })

  it('says nothing about balances over a series too short to look back three months', () => {
    assert.equal(attritionWatch({ ...calm, balanceSeries: [] }).flagged, false)
    assert.equal(
      attritionWatch({ ...calm, balanceSeries: series([1_00_000, 10_000]) }).flagged,
      false,
    )
  })

  it('flags a wallet share under 30%, but not an unknown one', () => {
    assert.deepEqual(attritionWatch({ ...calm, walletSharePct: 24 }).reasons, [
      'Only 24% of balances with IDBI',
    ])
    assert.equal(attritionWatch({ ...calm, walletSharePct: 30 }).flagged, false)
    assert.equal(attritionWatch({ ...calm, walletSharePct: null }).flagged, false)
  })

  it('flags more than 60 days without activity, and none on record', () => {
    assert.deepEqual(attritionWatch({ ...calm, lastActivityAt: '2026-06-01' }).reasons, [
      'No activity in 92 days',
    ])
    assert.equal(attritionWatch({ ...calm, lastActivityAt: '2026-07-03' }).flagged, false)
    assert.deepEqual(attritionWatch({ ...calm, lastActivityAt: null }).reasons, [
      'No activity on record',
    ])
  })

  it('flags a paused SIP, and lists every reason that applies', () => {
    const all = attritionWatch({
      balanceSeries: series([1_00_000, 70_000, 60_000, 50_000]),
      walletSharePct: 12,
      lastActivityAt: null,
      sipPaused: true,
      asOf: AS_OF,
    })
    assert.equal(all.flagged, true)
    assert.deepEqual(all.reasons, [
      'IDBI month-end balances down 50% in 3 months',
      'Only 12% of balances with IDBI',
      'No activity on record',
      'A SIP is paused',
    ])
  })
})

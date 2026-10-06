/**
 * Product gaps, one need at a time, over a real customer's snapshot with one fact changed.
 *
 * The base is Rohan's own derivation at the anchor with his debts and missed repayment cleared
 * and a comfortable buffer, so that each case below turns exactly one need on or off and every
 * other rule stays out of the way. The last cases are the point of the module: a need whose
 * product the rules refuse is not listed, because the console must never suggest what the app
 * would block.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { derive, findInsights } from '@dhan/core'
import type { Snapshot } from '@dhan/core'
import { PERSONAS, PRODUCT_SHELF, generateCustomerFile } from '@dhan/fixtures'
import { productGaps } from '../../src/application/rm/product-gaps.ts'
import type { GapFacts } from '../../src/application/rm/product-gaps.ts'
import { ANCHOR } from '../helpers/app.ts'

const rohan = PERSONAS.find((p) => p.slug === 'rohan')
assert.ok(rohan)
const BASE: Snapshot = derive(
  generateCustomerFile(rohan, { anchor: ANCHOR, asOf: ANCHOR, months: 24 }),
  ANCHOR,
)

/** Rohan with nothing standing in the rules' way, then the change the case is about. */
function facts(change: (s: Snapshot) => void, extra: Partial<GapFacts> = {}): GapFacts {
  const snapshot = structuredClone(BASE)
  snapshot.customer.riskProfile = 'Growth'
  snapshot.customer.age = 32
  snapshot.debt = {
    ...snapshot.debt,
    total: 0,
    hasHighInterest: false,
    highInterestTotal: 0,
    highestRate: 0,
    missedRepayment: false,
    monthlyOutgo: 0,
    endingSoon: null,
  }
  snapshot.buffer = { ...snapshot.buffer, monthsCovered: 8, shortfall: 0 }
  snapshot.surplus = { ...snapshot.surplus, monthly: 30_000, deployable: 25_000 }
  snapshot.holdings = { ...snapshot.holdings, sipMonthly: 5_000 }
  snapshot.protection = {
    dependents: 0,
    lifeCoverInForce: 0,
    healthCoverInForce: 500_000,
    lifeCoverNeeded: 0,
    gap: 0,
  }
  change(snapshot)
  return {
    snapshot,
    insights: [],
    holdings: [],
    policies: [],
    shelf: PRODUCT_SHELF,
    horizonYears: 28,
    ...extra,
  }
}

const needs = (f: GapFacts): string[] => productGaps(f).map((g) => g.need)

describe('product gaps', () => {
  it('lists nothing for a customer with every need met', () => {
    assert.deepEqual(needs(facts(() => {})), [])
  })

  it('names term cover where someone depends on the income and cover is short', () => {
    const f = facts((s) => {
      s.protection = {
        ...s.protection,
        dependents: 2,
        lifeCoverNeeded: 1_80_00_000,
        gap: 1_80_00_000,
      }
    })
    const [gap] = productGaps(f)
    assert.equal(gap?.need, 'life_cover')
    assert.equal(gap?.productId, 'LIC_TERM_201')
    assert.match(gap?.why ?? '', /₹1.8Cr short on life cover, with 2 dependents\./)
  })

  it('names no life cover where nobody depends on the income', () => {
    assert.deepEqual(needs(facts((s) => (s.protection = { ...s.protection, gap: 50_00_000 }))), [])
  })

  it('names health cover only where none is in force', () => {
    const f = facts((s) => (s.protection = { ...s.protection, healthCoverInForce: 0 }))
    assert.deepEqual(needs(f), ['health_cover'])
    assert.equal(productGaps(f)[0]?.productId, 'NIVA_HEALTH_202')
  })

  it('names an index fund for money left over with no SIP running', () => {
    const f = facts((s) => (s.holdings = { ...s.holdings, sipMonthly: 0 }))
    const [gap] = productGaps(f)
    assert.equal(gap?.need, 'monthly_investing')
    assert.equal(gap?.productId, 'MF_INDEX_103')
    assert.match(gap?.why ?? '', /₹25,000 a month left over and no SIP running\./)
  })

  it('falls back to the recurring deposit where the rules refuse the fund', () => {
    // A Conservative customer is above the fund's riskometer; the deposit is within it.
    const f = facts((s) => {
      s.holdings = { ...s.holdings, sipMonthly: 0 }
      s.customer.riskProfile = 'Conservative'
    })
    assert.equal(productGaps(f)[0]?.productId, 'IDBI_SSP_002')
  })

  it('names a sweep-in only where the engine found idle cash and nothing sweeps it', () => {
    const idle = facts((s) => (s.balances = { ...s.balances, idleFloor: 2_00_000 }), {
      insights: [{ kind: 'idle_cash' }],
    })
    assert.deepEqual(needs(idle), ['sweep_in'])
    assert.equal(productGaps(idle)[0]?.productId, 'IDBI_SWEEP_001')
    assert.deepEqual(needs({ ...idle, holdings: [{ name: 'IDBI Sweep-in Fixed Deposit' }] }), [])
    assert.deepEqual(needs({ ...idle, insights: [] }), [])
  })

  it('lists nothing the rules would refuse: a missed repayment keeps investing off the list', () => {
    const f = facts((s) => {
      s.holdings = { ...s.holdings, sipMonthly: 0 }
      s.debt = { ...s.debt, missedRepayment: true }
      s.protection = { ...s.protection, dependents: 1, lifeCoverNeeded: 60_00_000, gap: 60_00_000 }
    })
    // Protection still passes MISSED_REPAYMENT; every investment is held back by it.
    assert.deepEqual(needs(f), ['life_cover'])
  })

  it('agrees with the engine on a real customer: Rohan as derived', () => {
    const gaps = productGaps({
      snapshot: BASE,
      insights: findInsights(BASE),
      holdings: [],
      policies: [],
      shelf: PRODUCT_SHELF,
      horizonYears: Math.max(5, 60 - BASE.customer.age),
    })
    for (const g of gaps) {
      assert.ok(
        PRODUCT_SHELF.some((p) => p.productId === g.productId),
        g.productId,
      )
      assert.doesNotMatch(g.why, /\byou\b/i)
    }
  })
})

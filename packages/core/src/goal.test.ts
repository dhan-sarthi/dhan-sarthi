/**
 * The goal the app proposes when the customer has not named one.
 *
 * The rungs are a ladder — whatever is most broken — so the tests below walk it from the top
 * and check each rung both when it fires and when the one above it takes precedence. The
 * sizing basis has its own block: it is the fallback chain that stopped a six-month emergency
 * fund from being proposed with a target of ₹0.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { suggestGoal } from './goal.ts'
import { snapshot } from './snapshot.testkit.ts'

const ASOF = '2026-09-01'

describe('suggestGoal: the ladder', () => {
  it('proposes clearing the expensive debt first, sized at that balance alone', () => {
    const indebted = snapshot({
      debt: {
        total: 814_000,
        hasHighInterest: true,
        highInterestTotal: 186_000,
        highestRate: 34.8,
      },
      buffer: { monthsCovered: 0, shortfall: 180_000 },
    })
    const g = suggestGoal(indebted, ASOF, null)

    assert.equal(g.kind, 'debt_payoff')
    assert.equal(g.id, 'goal-debt')
    // The card, not the card plus a 9.4% car loan. Pricing 8.14 lakh at the card's rate is
    // what made the route report itself infeasible.
    assert.equal(g.targetAmount, 186_000)
    assert.equal(g.targetDate, '2029-09-01')
    assert.equal(g.createdAt, ASOF)
  })

  it('proposes an emergency fund on a thin buffer, at six months of outflow', () => {
    const thin = snapshot({ buffer: { monthsCovered: 1, targetMonths: 6, shortfall: 300_000 } })
    const g = suggestGoal(thin, ASOF, null)

    assert.equal(g.kind, 'emergency_fund')
    // commitments 40,000 + discretionary 20,000, six times over.
    assert.equal(g.targetAmount, 360_000)
    assert.equal(g.targetDate, '2028-09-01')
  })

  it('treats an unreadable buffer like a thin one, not like a funded one', () => {
    // Null means the outflow could not be read, which is not proof of a buffer.
    const unknown = snapshot({ buffer: { monthsCovered: null, shortfall: 0 } })
    assert.equal(suggestGoal(unknown, ASOF, null).kind, 'emergency_fund')
  })

  it('takes the buffer rung at 2.99 months and the retirement rung at 3', () => {
    assert.equal(
      suggestGoal(snapshot({ buffer: { monthsCovered: 2.99 } }), ASOF, null).kind,
      'emergency_fund',
    )
    assert.equal(
      suggestGoal(snapshot({ buffer: { monthsCovered: 3 } }), ASOF, null).kind,
      'retirement',
    )
  })

  it('falls through to retirement, stated in today’s money and rounded', () => {
    const g = suggestGoal(snapshot(), ASOF, null)

    assert.equal(g.kind, 'retirement')
    // 60,000 a month * 12 * 25 = 1.8 crore, already a multiple of 5 lakh.
    assert.equal(g.targetAmount, 18_000_000)
    // Age 35, so 25 years to 60.
    assert.equal(g.targetDate, '2051-09-01')
  })

  it('rounds the retirement target to the nearest ₹5 lakh', () => {
    const odd = snapshot({ commitments: { total: 41_234 }, discretionary: { monthly: 20_111 } })
    const g = suggestGoal(odd, ASOF, null)
    assert.equal(g.targetAmount % 500_000, 0)
  })

  it('gives anyone past 55 at least five years to get there', () => {
    const older = snapshot({ customer: { age: 62 } })
    assert.equal(suggestGoal(older, ASOF, null).targetDate, '2031-09-01')
  })

  it('debt outranks a thin buffer, which outranks retirement', () => {
    const everything = snapshot({
      debt: {
        total: 186_000,
        hasHighInterest: true,
        highInterestTotal: 186_000,
        highestRate: 34.8,
      },
      buffer: { monthsCovered: 0, shortfall: 360_000 },
    })
    assert.equal(suggestGoal(everything, ASOF, null).kind, 'debt_payoff')
  })
})

describe('suggestGoal: sizing when the statement is unreadable', () => {
  // IDBI's own feed routinely shows no recognisable salary and no recognisable outgoings.
  // Without the fallback chain both remaining rungs multiply zero, and a six-month emergency
  // fund is proposed with a target of ₹0 to a customer with three loans.
  const blank = {
    commitments: { total: 0, rent: 0, emis: 0, bills: 0, obligations: 0, subscriptions: 0 },
    discretionary: { monthly: 0 },
    buffer: { monthsCovered: 0, shortfall: 0 },
  }

  it('prefers the observed outflow, because a ledger beats a declaration', () => {
    const readable = snapshot({
      income: { monthly: 200_000 },
      customer: { declaredMonthlyIncome: 500_000 },
      buffer: { monthsCovered: 0, shortfall: 0 },
    })
    // 60,000 outflow * 6, not 200,000 and not 500,000.
    assert.equal(suggestGoal(readable, ASOF, null).targetAmount, 360_000)
  })

  it('falls back to observed income where no outflow can be read', () => {
    const g = suggestGoal(snapshot({ ...blank, income: { monthly: 95_000 } }), ASOF, null)
    assert.equal(g.targetAmount, 570_000)
  })

  it('falls back to the declared income where neither can be read', () => {
    const g = suggestGoal(
      snapshot({ ...blank, income: { monthly: 0 }, customer: { declaredMonthlyIncome: 80_000 } }),
      ASOF,
      null,
    )
    assert.equal(g.targetAmount, 480_000)
    assert.notEqual(g.targetAmount, 0)
  })
})

describe('suggestGoal: the customer’s own amount', () => {
  it('replaces the proposed amount on every rung', () => {
    const rungs = [
      snapshot({ debt: { hasHighInterest: true, highInterestTotal: 186_000, highestRate: 34.8 } }),
      snapshot({ buffer: { monthsCovered: 0 } }),
      snapshot(),
    ]
    for (const s of rungs) assert.equal(suggestGoal(s, ASOF, 1_500_000).targetAmount, 1_500_000)
  })

  it('leaves the kind, the purpose and the date alone', () => {
    const proposed = suggestGoal(snapshot(), ASOF, null)
    const overridden = suggestGoal(snapshot(), ASOF, 1_500_000)

    assert.equal(overridden.kind, proposed.kind)
    assert.equal(overridden.purpose, proposed.purpose)
    assert.equal(overridden.targetDate, proposed.targetDate)
  })

  it('records the basis only beside an override', () => {
    assert.equal(suggestGoal(snapshot(), ASOF, 1_500_000, 'at_horizon').amountBasis, 'at_horizon')
    assert.equal(suggestGoal(snapshot(), ASOF, 1_500_000, 'today').amountBasis, 'today')
    // A basis with no override would claim a basis for a figure this function chose, and
    // every figure it proposes is in today's money by construction.
    assert.equal('amountBasis' in suggestGoal(snapshot(), ASOF, null, 'at_horizon'), false)
  })

  it('produces byte for byte the old goal when no basis is stated', () => {
    // Goal reads an absent amountBasis as `today`, which is what that goal has always meant.
    assert.equal('amountBasis' in suggestGoal(snapshot(), ASOF, 1_500_000), false)
  })
})

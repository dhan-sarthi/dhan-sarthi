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
import { futureValue } from './projection.ts'
import { buildRoadmap } from './roadmap.ts'
import { SHELF, snapshot } from './snapshot.testkit.ts'

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

describe('suggestGoal: the goal the customer chose', () => {
  /** A card at 34.8%, a buffer of a few days and two dependents: every rung is broken at once. */
  const struggling = snapshot({
    customer: { dependents: 2 },
    protection: { dependents: 2, lifeCoverNeeded: 12_000_000, gap: 12_000_000 },
    debt: { total: 186_000, hasHighInterest: true, highInterestTotal: 186_000, highestRate: 34.8 },
    balances: { savings: 20_000, total: 20_000, idleFloor: 0, idleMonths: 0 },
    buffer: { monthsCovered: 0.3, targetMonths: 6, shortfall: 340_000 },
  })

  it('proposes exactly the goals it always proposed when nothing was chosen', () => {
    // Pinned as bytes, key order included, because a stored roadmap version is compared on its
    // goal and the wire carries it as written: a refactor that moved a key would cut a version.
    const rungs: Array<[ReturnType<typeof snapshot>, string]> = [
      [
        struggling,
        '{"id":"goal-debt","kind":"debt_payoff","purpose":"Clear the expensive debt",' +
          '"targetAmount":186000,"targetDate":"2029-09-01","createdAt":"2026-09-01"}',
      ],
      [
        snapshot({ buffer: { monthsCovered: 1 } }),
        '{"id":"goal-buffer","kind":"emergency_fund","purpose":"Six months of breathing room",' +
          '"targetAmount":360000,"targetDate":"2028-09-01","createdAt":"2026-09-01"}',
      ],
      [
        snapshot(),
        '{"id":"goal-retire","kind":"retirement","purpose":"Enough to stop working at 60",' +
          '"targetAmount":18000000,"targetDate":"2051-09-01","createdAt":"2026-09-01"}',
      ],
    ]
    for (const [s, bytes] of rungs) {
      assert.equal(JSON.stringify(suggestGoal(s, ASOF, null)), bytes)
      assert.equal(JSON.stringify(suggestGoal(s, ASOF, null, null, null)), bytes)
    }
  })

  it('plans for the long game even with a card at 34.8% — the route, not the goal, puts it first', () => {
    const g = suggestGoal(struggling, ASOF, null, null, 'retirement')
    assert.equal(g.kind, 'retirement')
    assert.equal(g.id, 'goal-retire')
    // Sized exactly as the ladder's own last rung: 60,000 a month, 25 years of it, at 60.
    assert.equal(g.targetAmount, 18_000_000)
    assert.equal(g.targetDate, '2051-09-01')
  })

  it('sizes a chosen safety net at six months, as the ladder does', () => {
    const g = suggestGoal(struggling, ASOF, null, null, 'emergency_fund')
    assert.equal(g.kind, 'emergency_fund')
    assert.equal(g.targetAmount, 360_000)
    assert.equal(g.targetDate, '2028-09-01')
  })

  it('gives the same debt goal the ladder would, where the ladder would have chosen it too', () => {
    assert.deepEqual(
      suggestGoal(struggling, ASOF, null, null, 'debt_payoff'),
      suggestGoal(struggling, ASOF, null),
    )
  })

  it('does not plan a payoff where none of the debt is expensive: the instalments clear it', () => {
    // A car loan at 9.4% is already being paid down by its EMI, which the outgoings count. Saving
    // towards its balance as well would pay it twice, so the ladder proposes instead.
    const cheap = snapshot({
      debt: { total: 628_000, hasHighInterest: false, highInterestTotal: 0, highestRate: 9.4 },
    })
    assert.deepEqual(
      suggestGoal(cheap, ASOF, null, null, 'debt_payoff'),
      suggestGoal(cheap, ASOF, null),
    )
  })

  it('sizes a chosen cover goal at the whole requirement, which the cover in force counts towards', () => {
    const g = suggestGoal(struggling, ASOF, null, null, 'protection')
    assert.equal(g.kind, 'protection')
    assert.equal(g.id, 'goal-cover')
    assert.equal(g.targetAmount, 12_000_000)
    assert.equal(g.targetDate, '2027-09-01')
  })

  it('proposes a year of outgoings, five years out, for something specific', () => {
    const g = suggestGoal(snapshot(), ASOF, null, null, 'wealth_target')
    assert.equal(g.kind, 'wealth_target')
    assert.equal(g.id, 'goal-wealth')
    // 60,000 a month for twelve months is 7.2 lakh, rounded up to the lakh.
    assert.equal(g.targetAmount, 800_000)
    assert.equal(g.targetDate, '2031-09-01')
  })

  it('sizes something specific above what the equity already held reaches on its own', () => {
    // Karan's shape: ₹13.84 lakh in funds, which the route counts towards any growth goal. A year
    // of outgoings alone sat under what those funds grow to by 2031, and the stage asked ₹0.
    const invested = snapshot({ holdings: { total: 1_384_140, equity: 1_384_140, debt: 0 } })
    const g = suggestGoal(invested, ASOF, null, null, 'wealth_target')
    const reached = futureValue(0, 5, 10, 1_384_140)
    assert.ok(g.targetAmount >= reached + 720_000, `${g.targetAmount} against ${reached}`)
    assert.equal(g.targetAmount % 100_000, 0)

    const stage = buildRoadmap(invested, g, SHELF, ASOF).stages.find((s) => s.isGoal)
    assert.equal(stage?.kind, 'grow')
    assert.ok((stage?.monthly ?? 0) > 0, 'the goal is planned, not reached by the funds alone')
  })

  it('falls back to the ladder when the chosen goal has nothing to aim at', () => {
    const clean = snapshot()
    const ladder = suggestGoal(clean, ASOF, null)
    // No debt to clear, no cover missing, and a buffer already past the three months the route
    // builds one to: each would be a plan for a problem the customer does not have.
    for (const kind of ['debt_payoff', 'protection', 'emergency_fund'] as const) {
      assert.deepEqual(suggestGoal(clean, ASOF, null, null, kind), ladder, kind)
    }
  })

  it('takes a chosen safety net where the buffer cannot be read, as the ladder does', () => {
    const unknown = snapshot({ buffer: { monthsCovered: null, shortfall: 0 } })
    assert.equal(suggestGoal(unknown, ASOF, null, null, 'emergency_fund').kind, 'emergency_fund')
  })

  it('puts the customer’s own amount on the goal they chose', () => {
    for (const kind of [
      'emergency_fund',
      'debt_payoff',
      'protection',
      'wealth_target',
      'retirement',
    ] as const) {
      const g = suggestGoal(struggling, ASOF, 1_500_000, 'at_horizon', kind)
      assert.equal(g.kind, kind)
      assert.equal(g.targetAmount, 1_500_000, kind)
      assert.equal(g.amountBasis, 'at_horizon', kind)
      assert.equal('amountBasis' in suggestGoal(struggling, ASOF, null, 'at_horizon', kind), false)
    }
  })

  it('still puts the amount on the ladder’s goal where no kind was ever chosen', () => {
    const g = suggestGoal(snapshot(), ASOF, 1_500_000, 'at_horizon')
    assert.equal(g.kind, 'retirement')
    assert.equal(g.targetAmount, 1_500_000)
    assert.equal(g.amountBasis, 'at_horizon')
  })
})

describe('suggestGoal: a figure belongs to the goal it was typed for', () => {
  /*
   * The stored target is the customer's figure for the kind they chose. Where that kind stops
   * applying and the ladder proposes instead, the ladder's goal carries its own figure — and the
   * customer's comes back with their goal. Each case is one that carried the figure across.
   */
  const ladder = (s: ReturnType<typeof snapshot>) => suggestGoal(s, ASOF, null)

  it('keeps a long-game figure off a safety net the plan falls back to, and back on it after', () => {
    const settled = snapshot({ buffer: { monthsCovered: 6.5 } })
    const thin = snapshot({ buffer: { monthsCovered: 2.8 } })
    // Chosen with the buffer at six and a half months, so the plan stayed on the long game.
    const fellBack = suggestGoal(settled, ASOF, 25_000_000, 'at_horizon', 'emergency_fund')
    assert.deepEqual(fellBack, ladder(settled))
    assert.equal('amountBasis' in fellBack, false)
    // When the buffer dips the chosen safety net applies, and the figure typed for it with it.
    const applies = suggestGoal(thin, ASOF, 25_000_000, 'at_horizon', 'emergency_fund')
    assert.equal(applies.kind, 'emergency_fund')
    assert.equal(applies.targetAmount, 25_000_000)
  })

  it('does not turn a cover figure into a retirement number once the policy is bought', () => {
    const covered = snapshot({ protection: { dependents: 2, lifeCoverNeeded: 0, gap: 0 } })
    const g = suggestGoal(covered, ASOF, 15_000_000, null, 'protection')
    assert.equal(g.kind, 'retirement')
    assert.deepEqual(g, ladder(covered))
  })

  it('does not carry a payoff figure onto whatever comes after the card is cleared', () => {
    const cleared = snapshot({ debt: { total: 0, hasHighInterest: false, highInterestTotal: 0 } })
    const g = suggestGoal(cleared, ASOF, 39_770, null, 'debt_payoff')
    assert.notEqual(g.targetAmount, 39_770)
    assert.deepEqual(g, ladder(cleared))
  })
})

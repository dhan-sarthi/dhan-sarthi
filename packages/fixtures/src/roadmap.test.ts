/**
 * The route, and the three things it used to say that were not true.
 *
 * These live here rather than in `@dhan/core` for the reason `engine.test.ts` gives: core may
 * not depend on the fixtures, and a roadmap asserted against a literal snapshot is a roadmap
 * asserted against whatever the literal happened to say. Every case below is built over a real
 * derived customer, then nudged one field at a time where a branch needs a condition the three
 * personas do not currently supply.
 *
 * What each group is protecting, in one line each:
 *
 * - **the rate a goal is funded at** — a target the customer already inflated must not be
 *   discounted for inflation a second time
 * - **a balance the payment does not beat** — no payoff date, on it or on anything behind it
 * - **which stage the plan is on** — an array position, said out loud, plus a way to ask the
 *   question against a clock rather than against the day the plan was cut
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildRoadmap,
  compoundedOneOff,
  currentStage,
  derive,
  fundingRatePct,
  monthlyInterest,
  paymentToClear,
  requiredMonthly,
  suggestGoal,
} from '@dhan/core'
import type { Goal, Roadmap, Snapshot } from '@dhan/core'
import { generateCustomerFile } from './generate.ts'
import { PERSONAS, PRIYA, ROHAN } from './personas.ts'
import { PRODUCT_SHELF } from './shelf.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const rohan = derive(generateCustomerFile(ROHAN, OPTS), ASOF)
const priya = derive(generateCustomerFile(PRIYA, OPTS), ASOF)

const build = (snapshot: Snapshot, goal: Goal): Roadmap =>
  buildRoadmap(snapshot, goal, PRODUCT_SHELF, ASOF)

const suggested = (snapshot: Snapshot): Roadmap =>
  build(snapshot, suggestGoal(snapshot, ASOF, null))

/**
 * What the stage would need a month, as against what it got.
 *
 * `Stage.monthly` is capped at what the customer has spare, so two very different requirements
 * come out as the same number once neither is affordable. The requirement is the stage's
 * contribution plus the shortfall the roadmap reports against it.
 */
function requirement(roadmap: Roadmap): number {
  const grow = roadmap.stages.find((s) => s.kind === 'grow')
  assert.ok(grow, 'expected a growth stage')
  return grow.monthly + roadmap.shortfallMonthly
}

/* ------------------------------------------------------------------ *
 * 1. The money a target is counted in
 * ------------------------------------------------------------------ */

describe('the rate a goal is funded at', () => {
  const HOUSE: Goal = {
    id: 'goal-house',
    kind: 'wealth_target',
    purpose: 'House deposit',
    targetAmount: 2_500_000,
    targetDate: '2041-09-01',
    createdAt: ASOF,
  }

  it('funds a long target in today’s money at the real rate, as it always has', () => {
    assert.equal(fundingRatePct({ kind: 'retirement' }, 31), 4.5)
    assert.equal(fundingRatePct({ kind: 'wealth_target', amountBasis: 'today' }, 15), 4.5)
    // Absent means today's money, so nothing written before the field existed moves.
    assert.equal(
      fundingRatePct({ kind: 'wealth_target' }, 15),
      fundingRatePct({ kind: 'wealth_target', amountBasis: 'today' }, 15),
    )
  })

  it('does not discount a target the customer already inflated a second time', () => {
    /*
     * The defect, in the form a customer meets it.
     *
     * ₹25,00,000 in today's money, inflated by the customer at 5.5% over fifteen years to the
     * ₹55,81,191 a house will actually cost by then. The engine assumed every target was in
     * today's money and funded anything ten years out at the real rate — so it took the
     * inflation the customer had just put in straight back out, and asked for a contribution
     * sized as though the target were in 2026 rupees.
     */
    const atHorizonAmount = compoundedOneOff(HOUSE.targetAmount, 15, 5.5)
    assert.equal(atHorizonAmount, 5_581_191)

    const discountedTwice = requirement(build(rohan, { ...HOUSE, targetAmount: atHorizonAmount }))
    const once = requirement(
      build(rohan, { ...HOUSE, targetAmount: atHorizonAmount, amountBasis: 'at_horizon' }),
    )

    // Both net of the equity Rohan already holds, which is why they moved when the folios he
    // had imported off his consolidated statement went onto his record. The gap is the point.
    assert.equal(once, 10_513)
    assert.equal(discountedTwice, 19_653)
    assert.ok(
      discountedTwice > once,
      'a target already in the rupees of 2041 must not be funded as though it were in 2026 rupees',
    )
  })

  it('sizes an at-horizon target at the nominal rate, to the rupee', () => {
    const goal: Goal = { ...HOUSE, amountBasis: 'at_horizon' }
    const roadmap = build(rohan, goal)
    assert.equal(fundingRatePct(goal, 15), 10)
    assert.equal(
      requirement(roadmap),
      requiredMonthly(goal.targetAmount, 15, 10, rohan.holdings.equity),
    )
  })

  it('leaves every horizon under ten years exactly where it was', () => {
    // Below the threshold the engine already funded at the nominal rate, so the basis cannot
    // change a number there — which is why the create screen was safe to offer the adjustment.
    for (const years of [1, 5, 9.99]) {
      assert.equal(
        fundingRatePct({ kind: 'wealth_target' }, years),
        fundingRatePct({ kind: 'wealth_target', amountBasis: 'at_horizon' }, years),
      )
    }
  })

  it('applies no inflation adjustment at all to a goal funded with a deposit', () => {
    // A buffer or a short target is funded at the contractual rate, so there is nothing to
    // discount and the basis is a no-op rather than a second branch.
    for (const basis of ['today', 'at_horizon'] as const) {
      assert.equal(fundingRatePct({ kind: 'emergency_fund', amountBasis: basis }, 30), 6.9)
      assert.equal(fundingRatePct({ kind: 'debt_payoff', amountBasis: basis }, 3), 6.9)
    }
  })

  it('is the rate the roadmap actually used, not a second opinion about it', () => {
    // The point of exporting it: a screen that quotes a monthly figure and the stage that
    // carries one a moment later have to agree, and they can only agree by asking once.
    const roadmap = suggested(rohan)
    const horizon = 60 - rohan.customer.age
    assert.equal(roadmap.goal.kind, 'retirement')
    assert.equal(
      requirement(roadmap),
      requiredMonthly(
        roadmap.goal.targetAmount,
        horizon,
        fundingRatePct(roadmap.goal, horizon),
        rohan.holdings.equity,
      ),
    )
  })
})

/* ------------------------------------------------------------------ *
 * 2. A balance the payment does not beat
 * ------------------------------------------------------------------ */

describe('a debt the payment does not clear', () => {
  const roadmap = suggested(priya)
  const debt = roadmap.stages.find((s) => s.kind === 'clear_debt' && s.targetAmount > 0)

  it('is the case this persona exists to produce', () => {
    assert.ok(debt)
    assert.ok(
      debt.monthly <= monthlyInterest(debt.targetAmount, priya.debt.highestRate),
      'these tests are only interesting while the interest outruns the payment',
    )
  })

  it('names no payoff date', () => {
    /*
     * It used to name October 2036 — `monthsToClear` returns null on a balance that grows and
     * the stage fell back to a flat 120 months so it had *a* length. The label directly above
     * said the balance would not clear.
     *
     * Zero months is how a stage says it has no end, and `completesOn` back on `startsOn` is
     * how that reads on the wire.
     */
    assert.ok(debt)
    assert.equal(debt.monthsToComplete, 0)
    assert.equal(debt.completesOn, debt.startsOn)
    assert.match(debt.label, /will not clear/)
  })

  it('does not date the stages queued behind it off a payoff that never happens', () => {
    // The expensive half of the bug: the stage is sequential, so ten invented years of
    // payments moved everything after it. Priya's emergency buffer was scheduled to start in
    // October 2036 and her route ran to April 2040.
    assert.ok(debt)
    const behind = roadmap.stages.filter((s) => s.index > debt.index)
    assert.ok(behind.length > 0, 'this persona has a buffer stage queued behind the card')
    for (const stage of behind) {
      assert.equal(stage.startsOn, debt.startsOn, `${stage.kind} is dated off the debt clearing`)
    }
    assert.ok(
      roadmap.totalMonths < 120,
      `a route of ${roadmap.totalMonths} months is still carrying the fallback`,
    )
  })

  it('refuses to call the route feasible, and says what would fix it', () => {
    /*
     * A prerequisite that cannot be reached is a plan that cannot be reached, and this one
     * reported itself feasible with nothing short: the goal *is* the debt, so the goal stage
     * that computes feasibility was skipped entirely and `feasible` kept its initial `true`.
     */
    assert.ok(debt)
    assert.equal(roadmap.feasible, false)
    assert.equal(
      roadmap.shortfallMonthly,
      paymentToClear(debt.targetAmount, priya.debt.highestRate, 36) - debt.monthly,
    )
    assert.equal(roadmap.shortfallMonthly, 20_305)
  })

  it('still dates a debt the payment does beat', () => {
    // The guard on the other side. Same customer, enough spare to outrun the interest: the
    // stage gets a real term, a real date, and stops holding the route open.
    const funded: Snapshot = {
      ...priya,
      surplus: { ...priya.surplus, deployable: 30_000 },
    }
    const clearing = suggested(funded).stages.find((s) => s.kind === 'clear_debt')
    assert.ok(clearing)
    assert.ok(clearing.monthly > monthlyInterest(clearing.targetAmount, funded.debt.highestRate))
    assert.ok(clearing.monthsToComplete > 0)
    assert.ok(clearing.completesOn > clearing.startsOn)
    assert.match(clearing.label, /Clear /)
  })

  it('leaves the personas whose debts do clear exactly as they were', () => {
    for (const spec of PERSONAS.filter((p) => p !== PRIYA)) {
      const snapshot = derive(generateCustomerFile(spec, OPTS), ASOF)
      for (const stage of suggested(snapshot).stages) {
        assert.ok(
          stage.monthsToComplete > 0,
          `${spec.slug}: ${stage.kind} lost its term, and only an unclearable debt may`,
        )
      }
    }
  })
})

/* ------------------------------------------------------------------ *
 * 3. Which stage the plan is on
 * ------------------------------------------------------------------ */

describe('the stage the plan is on', () => {
  it('is an array position into stages, and names a real one for every persona', () => {
    /*
     * Pinning a convention rather than reproducing a bug: `currentStageIndex` is 0 and `0` is
     * correct, because it is a position into `stages` and not a `Stage.index` — those are
     * one-based. The two have been read for each other before, so this says which it is.
     */
    for (const spec of PERSONAS) {
      const snapshot = derive(generateCustomerFile(spec, OPTS), ASOF)
      const roadmap = suggested(snapshot)
      const stage = roadmap.stages[roadmap.currentStageIndex]
      assert.ok(stage, `${spec.slug}: currentStageIndex names no stage`)
      assert.equal(
        stage.index,
        roadmap.currentStageIndex + 1,
        `${spec.slug}: one-based Stage.index`,
      )
      assert.equal(stage.startsOn, ASOF, `${spec.slug}: the plan opens at a stage running now`)
    }
  })

  it('is fixed when the roadmap is cut, which is why there is a function beside it', () => {
    /*
     * A roadmap outlives the day it was cut — the API stores it and serves it again while the
     * snapshot and the goal hold. `currentStageIndex` cannot know that: by November Rohan's
     * term policy has been in force for a month and the route is on the growth stage, and the
     * stored index still names the policy. `currentStage` asks against a clock instead.
     */
    const roadmap = suggested(rohan)
    const frozen = roadmap.stages[roadmap.currentStageIndex]
    assert.ok(frozen)

    assert.equal(currentStage(roadmap, ASOF)?.index, frozen.index)

    const later = currentStage(roadmap, '2026-11-01')
    assert.ok(later)
    assert.equal(later.kind, 'grow')
    assert.notEqual(later.index, frozen.index)
  })

  it('stops at a stage with no end rather than walking past it', () => {
    // Nothing behind an unclearable debt has a date, so no clock advances the route past it.
    const roadmap = suggested(priya)
    for (const asOf of [ASOF, '2027-01-01', '2036-01-01']) {
      const stage = currentStage(roadmap, asOf)
      assert.ok(stage)
      assert.ok(
        stage.kind === 'free_up' || stage.kind === 'clear_debt',
        `${asOf}: the route moved on from a balance that never clears`,
      )
    }
  })
})

/**
 * The suggested goal: whatever is most broken, in ladder order.
 *
 * Built over a real derived snapshot so the shape is honest, then nudged field by field so
 * each branch is exercised regardless of which persona happens to sit where this month.
 *
 * The ladder's branches and the sizing fallback are pinned against literals in
 * `@dhan/core/src/goal.test.ts`; this file is here because it needs the generator. See CONTRIBUTING.md
 * under "Where tests live" for why that cycle cannot be broken.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildRoadmap, derive, suggestGoal } from '@dhan/core'
import type { Snapshot } from '@dhan/core'
import { generateCustomerFile } from './generate.ts'
import { KARAN, PRIYA, ROHAN, SUNIL } from './personas.ts'
import { PRODUCT_SHELF } from './shelf.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const rohan = derive(generateCustomerFile(ROHAN, OPTS), ASOF)
const priya = derive(generateCustomerFile(PRIYA, OPTS), ASOF)
const sunil = derive(generateCustomerFile(SUNIL, OPTS), ASOF)
const karan = derive(generateCustomerFile(KARAN, OPTS), ASOF)

/** Rohan with the two prerequisites satisfied, so the ladder reaches retirement. */
const settled: Snapshot = {
  ...rohan,
  debt: { ...rohan.debt, hasHighInterest: false },
  buffer: { ...rohan.buffer, monthsCovered: 6 },
}

const outflow = (s: Snapshot): number => s.commitments.total + s.discretionary.monthly

describe('the suggested goal', () => {
  it('puts expensive debt before everything else', () => {
    assert.equal(priya.debt.hasHighInterest, true)
    const goal = suggestGoal(priya, ASOF, null)
    assert.equal(goal.kind, 'debt_payoff')
    /*
     * The expensive debt, which for Priya is ₹3,10,012 of a ₹5,82,776 total.
     *
     * It used to assert `debt.total`, and that was wrong in a way no single-debt persona
     * could show: the goal is priced at `highestRate`, so targeting the total asks what it
     * would cost to clear her cheaper loans at her credit card's rate.
     */
    assert.equal(goal.targetAmount, priya.debt.highInterestTotal)
    assert.ok(priya.debt.highInterestTotal < priya.debt.total)
    assert.equal(goal.targetDate, '2029-09-01')
    assert.equal(goal.createdAt, ASOF)
  })

  it('outranks a thin buffer with the debt, not the other way round', () => {
    const both: Snapshot = { ...priya, buffer: { ...priya.buffer, monthsCovered: 0.5 } }
    assert.equal(suggestGoal(both, ASOF, null).kind, 'debt_payoff')
  })

  it('asks for six months of outflow when the buffer is under three', () => {
    const thin: Snapshot = { ...settled, buffer: { ...settled.buffer, monthsCovered: 2.9 } }
    const goal = suggestGoal(thin, ASOF, null)
    assert.equal(goal.kind, 'emergency_fund')
    assert.equal(goal.targetAmount, Math.round(outflow(thin) * 6))
    assert.equal(goal.targetDate, '2028-09-01')
  })

  it('otherwise aims at twenty-five times annual spending, in today’s money', () => {
    const goal = suggestGoal(settled, ASOF, null)
    assert.equal(goal.kind, 'retirement')
    assert.equal(goal.targetAmount, Math.round((outflow(settled) * 12 * 25) / 500_000) * 500_000)
    assert.equal(goal.targetAmount % 500_000, 0)
  })

  it('dates retirement at sixty, and never sooner than five years out', () => {
    assert.equal(
      suggestGoal(settled, ASOF, null).targetDate,
      `${2026 + 60 - settled.customer.age}-09-01`,
    )
    const older: Snapshot = { ...settled, customer: { ...settled.customer, age: 58 } }
    assert.equal(suggestGoal(older, ASOF, null).targetDate, '2031-09-01')
  })

  it('respects a target the customer set, on every branch', () => {
    assert.equal(suggestGoal(priya, ASOF, 1_00_000).targetAmount, 1_00_000)
    const thin: Snapshot = { ...settled, buffer: { ...settled.buffer, monthsCovered: 1 } }
    assert.equal(suggestGoal(thin, ASOF, 2_50_000).targetAmount, 2_50_000)
    assert.equal(suggestGoal(settled, ASOF, 7_500_000).targetAmount, 7_500_000)
  })

  it('records which money the customer stated their target in, on every branch', () => {
    const thin: Snapshot = { ...settled, buffer: { ...settled.buffer, monthsCovered: 1 } }
    for (const snapshot of [priya, thin, settled]) {
      assert.equal(suggestGoal(snapshot, ASOF, 5_581_191, 'at_horizon').amountBasis, 'at_horizon')
      assert.equal(suggestGoal(snapshot, ASOF, 5_581_191, 'today').amountBasis, 'today')
    }
  })

  it('leaves the basis off a goal nobody stated an amount for', () => {
    /*
     * Absence is the whole compatibility story, so it is asserted as absence rather than as
     * "today". Every figure this function *proposes* is in today's money — the retirement
     * branch says why, at length — and a basis on a proposal would be the app claiming the
     * customer said something they never said.
     */
    const proposed = suggestGoal(settled, ASOF, null, 'at_horizon')
    assert.ok(!('amountBasis' in proposed))
    assert.deepEqual(proposed, suggestGoal(settled, ASOF, null))
    assert.ok(!('amountBasis' in suggestGoal(settled, ASOF, 7_500_000)))
  })

  it('is a pure function of its inputs', () => {
    assert.deepEqual(suggestGoal(rohan, ASOF, null), suggestGoal(rohan, ASOF, null))
    assert.notEqual(
      suggestGoal(rohan, ASOF, null).createdAt,
      suggestGoal(rohan, '2027-01-01', null).createdAt,
    )
  })
})

describe('the goal the customer chose, over a real statement', () => {
  it('plans Rohan’s family cover, which he has two dependents and no policy for', () => {
    assert.ok(rohan.protection.gap > 0)
    const goal = suggestGoal(rohan, ASOF, null, null, 'protection')
    assert.equal(goal.kind, 'protection')
    assert.equal(goal.targetAmount, rohan.protection.lifeCoverNeeded)
    const route = buildRoadmap(rohan, goal, PRODUCT_SHELF, ASOF)
    assert.equal(route.stages.find((s) => s.isGoal)?.kind, 'get_cover')
  })

  it('does not plan Rohan’s education loan as a payoff: its EMIs clear it in months', () => {
    // Aimed at every rupee owed, this was a three-year deposit against a loan five instalments
    // from done, which then flipped to retirement the month the loan ended.
    assert.equal(rohan.debt.hasHighInterest, false)
    assert.ok(rohan.debt.total > 0)
    assert.deepEqual(
      suggestGoal(rohan, ASOF, null, null, 'debt_payoff'),
      suggestGoal(rohan, ASOF, null),
    )
  })

  it('keeps Sunil’s feasible buffer plan when he asks to clear loans nothing expensive is on', () => {
    assert.equal(sunil.debt.hasHighInterest, false)
    const ladder = buildRoadmap(sunil, suggestGoal(sunil, ASOF, null), PRODUCT_SHELF, ASOF)
    const chosen = buildRoadmap(
      sunil,
      suggestGoal(sunil, ASOF, null, null, 'debt_payoff'),
      PRODUCT_SHELF,
      ASOF,
    )
    assert.deepEqual(chosen, ladder)
    assert.equal(chosen.feasible, true)
  })

  it('plans Karan’s something specific with money going in, not his funds alone', () => {
    // A year of his outgoings is under what his ₹13.84 lakh of funds reach by 2031, which left
    // the goal stage asking ₹0 a month with nothing to project.
    assert.ok(karan.holdings.equity > 0)
    const goal = suggestGoal(karan, ASOF, null, null, 'wealth_target')
    const route = buildRoadmap(karan, goal, PRODUCT_SHELF, ASOF)
    const stage = route.stages.find((s) => s.isGoal)
    assert.equal(stage?.kind, 'grow')
    assert.ok((stage?.monthly ?? 0) > 0, `${stage?.monthly}`)
    assert.notEqual(route.projection, null)
  })

  it('keeps Priya’s card on her route to the long game with no habit to cut', () => {
    // IDBI's own feed names no habit, so nothing is freed up and nothing is spare for the card.
    const habitless: Snapshot = {
      ...priya,
      discretionary: { ...priya.discretionary, topHabits: [] },
    }
    const route = buildRoadmap(
      habitless,
      suggestGoal(habitless, ASOF, null, null, 'retirement'),
      PRODUCT_SHELF,
      ASOF,
    )
    const kinds = route.stages.map((s) => s.kind)
    assert.ok(kinds.includes('clear_debt'), kinds.join(', '))
    assert.ok(kinds.indexOf('clear_debt') < kinds.indexOf('grow'), kinds.join(', '))
    assert.equal(route.feasible, false)
  })

  it('keeps Priya on her card when she asks for cover nobody depends on her for', () => {
    assert.equal(priya.protection.gap, 0)
    assert.deepEqual(
      suggestGoal(priya, ASOF, null, null, 'protection'),
      suggestGoal(priya, ASOF, null),
    )
  })

  it('still routes Priya through her card when she picks the long game', () => {
    const goal = suggestGoal(priya, ASOF, null, null, 'retirement')
    assert.equal(goal.kind, 'retirement')
    const kinds = buildRoadmap(priya, goal, PRODUCT_SHELF, ASOF).stages.map((s) => s.kind)
    // The card at her highest rate before the goal the plan is for, which comes last.
    assert.ok(kinds.indexOf('clear_debt') >= 0, kinds.join(', '))
    assert.ok(kinds.indexOf('clear_debt') < kinds.indexOf('grow'), kinds.join(', '))
    assert.equal(kinds[kinds.length - 1], 'grow')
  })
})

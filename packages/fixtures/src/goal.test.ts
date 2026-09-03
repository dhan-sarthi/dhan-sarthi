/**
 * The suggested goal: whatever is most broken, in ladder order.
 *
 * Built over a real derived snapshot so the shape is honest, then nudged field by field so
 * each branch is exercised regardless of which persona happens to sit where this month.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { derive, suggestGoal } from '@dhan/core'
import type { Snapshot } from '@dhan/core'
import { generateCustomerFile } from './generate.ts'
import { PRIYA, ROHAN } from './personas.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const rohan = derive(generateCustomerFile(ROHAN, OPTS), ASOF)
const priya = derive(generateCustomerFile(PRIYA, OPTS), ASOF)

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
    assert.equal(goal.targetAmount, priya.debt.total)
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

  it('is a pure function of its inputs', () => {
    assert.deepEqual(suggestGoal(rohan, ASOF, null), suggestGoal(rohan, ASOF, null))
    assert.notEqual(
      suggestGoal(rohan, ASOF, null).createdAt,
      suggestGoal(rohan, '2027-01-01', null).createdAt,
    )
  })
})

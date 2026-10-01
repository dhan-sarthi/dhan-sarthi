/**
 * Goal health, against the three rows of the Definitions table, over real roadmaps built from
 * the snapshot testkit where the distinction depends on the plan.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { suggestGoal } from '../goal.ts'
import { findInsights } from '../insights.ts'
import { buildRoadmap } from '../roadmap.ts'
import { SHELF, snapshot } from '../snapshot.testkit.ts'
import { goalHealth, goalLabel } from './health.ts'

const AS_OF = '2026-09-01'

describe('goalHealth', () => {
  it('is on track: feasible, no shortfall, nothing urgent', () => {
    const s = snapshot()
    const roadmap = buildRoadmap(s, suggestGoal(s, AS_OF, null), SHELF, AS_OF)
    assert.equal(roadmap.feasible, true)
    assert.equal(goalHealth(roadmap, findInsights(s)), 'on_track')
  })

  it('is at risk when the plan is feasible but an urgent insight stands', () => {
    const s = snapshot({
      debt: { total: 50_000, hasHighInterest: true, highInterestTotal: 50_000, highestRate: 34.8 },
    })
    assert.equal(goalHealth({ feasible: true, shortfallMonthly: 0 }, findInsights(s)), 'at_risk')
  })

  it('is at risk on a monthly shortfall alone', () => {
    assert.equal(goalHealth({ feasible: true, shortfallMonthly: 2_500 }, []), 'at_risk')
  })

  it('is off track when the plan is not feasible, whatever else is true', () => {
    // A ₹10 lakh card balance at 34.8% accrues more than the ₹20,000 surplus can pay: the
    // clear-debt stage has no end (`monthsToComplete: 0`) and the roadmap says it cannot finish.
    const s = snapshot({
      debt: {
        total: 10_00_000,
        hasHighInterest: true,
        highInterestTotal: 10_00_000,
        highestRate: 34.8,
      },
      surplus: { monthly: 20_000, deployable: 20_000 },
    })
    const roadmap = buildRoadmap(s, suggestGoal(s, AS_OF, null), SHELF, AS_OF)
    assert.ok(roadmap.stages.some((stage) => stage.monthsToComplete === 0))
    assert.equal(roadmap.feasible, false)
    assert.equal(goalHealth(roadmap, []), 'off_track')
  })

  it('does not count the always-present handoff, or an important insight, as urgent', () => {
    const s = snapshot({ buffer: { monthsCovered: 1.2, shortfall: 3_00_000 } })
    const kinds = findInsights(s).map((i) => i.kind)
    assert.ok(kinds.includes('buffer_thin') && kinds.includes('human_handoff'))
    assert.equal(goalHealth({ feasible: true, shortfallMonthly: 0 }, findInsights(s)), 'on_track')
  })
})

describe('goalLabel', () => {
  it('names the engine’s goals for the RM, not in the customer’s second person', () => {
    assert.equal(
      goalLabel({ kind: 'protection', purpose: 'Cover for the people who depend on you' }),
      'Life cover',
    )
    assert.equal(goalLabel({ kind: 'emergency_fund' }), 'Emergency fund')
    assert.equal(
      goalLabel({ kind: 'retirement', purpose: 'Enough to stop working at 60' }),
      'Retirement',
    )
  })

  it('keeps a wealth target’s own purpose, re-voiced', () => {
    assert.equal(goalLabel({ kind: 'wealth_target', purpose: 'house deposit' }), 'House deposit')
    assert.equal(
      goalLabel({ kind: 'wealth_target', purpose: 'your daughter’s college' }),
      'Their daughter’s college',
    )
    assert.equal(goalLabel({ kind: 'wealth_target', purpose: '  ' }), 'Wealth goal')
  })
})

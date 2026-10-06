/**
 * `revoice` over the engine's own sentences: what the customer was told, as the RM reads it.
 *
 * The cases are the ones that went wrong on the console: "This is costing they" on the credit
 * band, "costs they more" on the arrears stage, "gets they there" on every growth stage, and
 * "₹N more than them have" on a debt the surplus cannot clear. The engine's sentences are taken
 * from the engine where a hand-built snapshot reaches them, so a reworded stage is tested as it
 * now reads rather than as it read when this file was written.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CONDUCT_BANDS } from '../credit.ts'
import { findInsights } from '../insights.ts'
import { buildRoadmap } from '../roadmap.ts'
import type { Goal } from '../roadmap.ts'
import { SHELF, snapshot } from '../snapshot.testkit.ts'
import { revoice } from './util.ts'

const ASOF = '2026-09-01'

/** Third person gone wrong: a subject pronoun where the sentence needs an object, or the reverse. */
const MISVOICED = /\b(costing|costs|cost|gets|get|find|tells|shows) they\b|\bthan them [a-z]/i

const goal: Goal = {
  id: 'goal-test',
  kind: 'wealth_target',
  purpose: 'A house deposit',
  targetAmount: 2_000_000,
  targetDate: '2036-09-01',
  createdAt: ASOF,
}

describe('revoice', () => {
  it('re-voices every conduct band caption', () => {
    assert.deepEqual(
      CONDUCT_BANDS.map((b) => revoice(b.caption)),
      [
        'Nothing wrong here',
        'One thing to tidy',
        'This is costing them',
        'They are behind with us',
      ],
    )
  })

  it('makes "you" after a verb an object, and leaves it a subject elsewhere', () => {
    assert.equal(revoice('₹9,812 a month gets you there.'), '₹9,812 a month gets them there.')
    assert.equal(revoice('The mark costs you more.'), 'The mark costs them more.')
    assert.equal(revoice('any return I could find you.'), 'any return I could find them.')
    assert.equal(revoice('Stay inside the limit you set.'), 'Stay inside the limit they set.')
    assert.equal(
      revoice('This needs ₹9,000 and you have ₹4,000.'),
      'This needs ₹9,000 and they have ₹4,000.',
    )
  })

  it('reads "than you" as a subject when a verb follows, and an object when nothing does', () => {
    assert.equal(revoice('₹1,04,452 more than you have.'), '₹1,04,452 more than they have.')
    assert.equal(revoice('more than you would like.'), 'more than they would like.')
    assert.equal(revoice('Somebody earns more than you.'), 'Somebody earns more than them.')
  })

  it('keeps the rules it had: prepositions, possessives and a sentence-initial capital', () => {
    assert.equal(revoice('2 people depend on you'), '2 people depend on them')
    assert.equal(revoice('Your card is at 34.8%'), 'Their card is at 34.8%')
    assert.equal(revoice('You have a missed repayment'), 'They have a missed repayment')
    assert.equal(revoice('as you told us'), 'as declared')
  })

  it('re-voices the arrears stage and the growth stage the roadmap writes', () => {
    const arrears = buildRoadmap(snapshot({ debt: { missedRepayment: true } }), goal, SHELF, ASOF)
    const grow = buildRoadmap(snapshot(), goal, SHELF, ASOF)
    const whys = [...arrears.stages, ...grow.stages].map((s) => revoice(s.why))
    assert.ok(
      whys.some((w) => /costs them more/.test(w)),
      'the arrears stage reached',
    )
    assert.ok(
      whys.some((w) => /gets them there/.test(w)),
      'a growth stage reached',
    )
    for (const why of whys) {
      assert.doesNotMatch(why, MISVOICED, why)
      assert.doesNotMatch(why, /\byou\b/i, why)
    }
  })

  it('re-voices the missed-repayment insight', () => {
    const insight = findInsights(snapshot({ debt: { missedRepayment: true } })).find(
      (i) => i.kind === 'missed_repayment',
    )
    assert.ok(insight)
    assert.equal(
      revoice(insight.detail),
      'Clear it before anything else. A mark on their credit file costs them more, and for ' +
        'longer, than any return I could find them.',
    )
  })
})

/**
 * The profile screen's promises, checked against the gate that has to keep them.
 *
 * The result screen tells a customer what picking a profile will change. That sentence is the
 * only reason the questionnaire is worth answering, and it is a claim about code in another
 * package: `RISK_CEILING` in `packages/core/src/suitability.ts`, whose `PROFILE_CEILING` table is
 * module-private and cannot be imported.
 *
 * So it is checked by *behaviour* rather than by reading the table — which is the better test
 * anyway. Each profile is run against a product at every one of SEBI's six riskometer bands, and
 * the highest band that gets through has to be the ceiling the screen names. The day somebody
 * changes `PROFILE_CEILING`, this goes red and the copy gets corrected instead of quietly
 * becoming a lie.
 *
 * The products are synthetic rather than shelf rows on purpose. `RISK_CEILING` is the fourth of
 * nine rules and the earliest failure wins, so a real product with a lock-in would be refused by
 * `EMERGENCY_BUFFER` before the ceiling was ever consulted, and the test would pass while
 * measuring nothing. A zero-lock-in, non-volatile, zero-cost product at each band isolates the
 * one rule under test.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { derive, evaluate } from '@dhan/core'
import type { Product, Riskometer, Snapshot } from '@dhan/core'
import { PRODUCT_SHELF, ROHAN, generateCustomerFile } from '@dhan/fixtures'
import {
  EMPTY_ANSWERS,
  MAX_SCORE,
  PROFILES,
  PROFILE_COPY,
  QUESTIONS,
  compare,
  outcomeOf,
  profileForFraction,
} from './risk.ts'
import type { Answers, RiskProfile } from './risk.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

/** SEBI's six, lowest first. Restated here because the gate's copy is private too. */
const BANDS: readonly Riskometer[] = [
  'Low',
  'Low to Moderate',
  'Moderate',
  'Moderately High',
  'High',
  'Very High',
]

/** Rohan clears the three rules that sit ahead of `RISK_CEILING`; the profile is then swapped in. */
function snapshotFor(profile: RiskProfile): Snapshot {
  const base = derive(generateCustomerFile(ROHAN, OPTS), ASOF)
  return { ...base, customer: { ...base.customer, riskProfile: profile } }
}

/** Nothing about it can trip any rule except the ceiling. */
function productAt(riskometer: Riskometer): Product {
  return {
    productId: `TEST_${riskometer.replace(/\s+/g, '_')}`,
    name: `Test product (${riskometer})`,
    category: 'Debt',
    riskometer,
    minInvestment: 0,
    lockInYears: 0,
    transactable: true,
    manufacturer: 'Test',
  }
}

function blockedOnRisk(profile: RiskProfile, band: Riskometer): boolean {
  const verdict = evaluate({
    product: productAt(band),
    snapshot: snapshotFor(profile),
    amount: 0,
    goal: null,
    alternatives: PRODUCT_SHELF,
  })
  return verdict.verdict === 'BLOCKED' && verdict.ruleId === 'RISK_CEILING'
}

describe('the ceiling each profile is shown is the ceiling the gate enforces', () => {
  for (const profile of PROFILES) {
    it(`${profile} tops out at ${PROFILE_COPY[profile].ceiling}`, () => {
      const allowed = BANDS.filter((band) => !blockedOnRisk(profile, band))
      const highest = allowed[allowed.length - 1]

      assert.equal(
        highest,
        PROFILE_COPY[profile].ceiling,
        `PROFILE_COPY.${profile}.ceiling says ${PROFILE_COPY[profile].ceiling}, the gate allows up to ${String(highest)}`,
      )
      // The allowed set has to be a prefix of the ladder: a ceiling that let a band through and
      // refused a lower one would not be a ceiling at all.
      assert.deepEqual(allowed, BANDS.slice(0, allowed.length))
    })
  }

  it('only Conservative narrows anything, which is what the copy says', () => {
    // The uncomfortable half of `PROFILE_CEILING`, and the reason the Balanced and Growth
    // sentences point at the horizon rule instead of claiming a protection they do not provide.
    assert.equal(blockedOnRisk('Conservative', 'Very High'), true)
    assert.equal(blockedOnRisk('Balanced', 'Very High'), false)
    assert.equal(blockedOnRisk('Growth', 'Very High'), false)
    assert.equal(PROFILE_COPY.Balanced.ceiling, PROFILE_COPY.Growth.ceiling)
  })

  it('a Conservative profile refuses the index fund on the real shelf', () => {
    // The claim in `PROFILE_COPY.Conservative.effect`, against a product a customer can see.
    const indexFund = PRODUCT_SHELF.find((p) => p.productId === 'MF_INDEX_103')
    assert.ok(indexFund)
    const verdict = evaluate({
      product: indexFund,
      snapshot: snapshotFor('Conservative'),
      amount: indexFund.minInvestment,
      goal: null,
      alternatives: PRODUCT_SHELF,
    })
    assert.equal(verdict.verdict, 'BLOCKED')
    assert.equal(verdict.ruleId, 'RISK_CEILING')
  })
})

describe('the questionnaire', () => {
  it('is six questions of four options scored nought to three', () => {
    assert.equal(QUESTIONS.length, 6)
    for (const q of QUESTIONS) {
      assert.equal(q.options.length, 4)
      assert.deepEqual(
        q.options.map((o) => o.score),
        [0, 1, 2, 3],
      )
    }
    assert.equal(MAX_SCORE, 18)
  })

  it('labels exactly the two questions that are legible in the source', () => {
    // `spec/screens/03-profiling/02-profile-question.md`: Q1 and Q6 are transcribed, Q5 is
    // occluded and Q2-Q4 never appear. Anything else claiming to be from the source is invented.
    const fromSource = QUESTIONS.filter((q) => q.from === 'source').map((q) => q.id)
    assert.deepEqual(fromSource, ['objectives', 'knowledge'])
    assert.equal(QUESTIONS.filter((q) => q.from === 'authored').length, 4)
  })

  it('has nothing to say before the first answer', () => {
    const out = outcomeOf(EMPTY_ANSWERS)
    assert.equal(out.profile, null)
    assert.equal(out.answered, 0)
    assert.equal(out.complete, false)
  })

  it('lands on each of the three profiles, and errs cautious at the joins', () => {
    // Equal thirds of 18: 0-6 Conservative, 7-12 Balanced, 13-18 Growth. Picking the second
    // option every time scores exactly 6 and stays Conservative, and picking the third scores
    // exactly 12 and stays Balanced — both boundaries fall on the narrower side. That is the
    // direction a suitability instrument should be wrong in: the cost of reading someone as
    // more cautious than they are is a product they have to ask twice for.
    const all = (choice: number): Answers => QUESTIONS.map(() => choice)
    assert.equal(outcomeOf(all(0)).profile, 'Conservative')
    assert.equal(outcomeOf(all(1)).profile, 'Conservative')
    assert.equal(outcomeOf(all(2)).profile, 'Balanced')
    assert.equal(outcomeOf(all(3)).profile, 'Growth')
    assert.equal(outcomeOf(all(1)).score, 6)
    assert.equal(outcomeOf(all(2)).score, 12)
    assert.equal(outcomeOf(all(3)).score, MAX_SCORE)
    assert.equal(outcomeOf(all(3)).complete, true)
  })

  it('reaches Balanced and Growth on mixed answers', () => {
    assert.equal(outcomeOf([1, 2, 1, 2, 2, 1]).profile, 'Balanced')
    assert.equal(outcomeOf([2, 3, 2, 3, 3, 2]).profile, 'Growth')
  })

  it('bands on thirds, inclusive at the lower edge', () => {
    assert.equal(profileForFraction(0), 'Conservative')
    assert.equal(profileForFraction(1 / 3), 'Conservative')
    assert.equal(profileForFraction(0.34), 'Balanced')
    assert.equal(profileForFraction(2 / 3), 'Balanced')
    assert.equal(profileForFraction(0.67), 'Growth')
    assert.equal(profileForFraction(1), 'Growth')
  })

  it('scales the running readout over what has been answered, not over six', () => {
    // Two bold answers out of six is Growth so far, not Conservative-with-four-zeroes. Treating
    // unanswered questions as the most cautious option is what makes a live readout read
    // `Conservative` on every frame and then jump at the end.
    const answers: Answers = [3, 3, null, null, null, null]
    const out = outcomeOf(answers)
    assert.equal(out.answered, 2)
    assert.equal(out.score, 6)
    assert.equal(out.possible, 6)
    assert.equal(out.profile, 'Growth')
    assert.equal(out.complete, false)
  })

  it('ignores an out-of-range choice rather than scoring it', () => {
    const out = outcomeOf([9, 0, null, null, null, null])
    assert.equal(out.answered, 1)
    assert.equal(out.score, 0)
    assert.equal(out.profile, 'Conservative')
  })
})

describe('comparing an old profile with a new one', () => {
  it('knows which way the change goes', () => {
    assert.equal(compare('Growth', 'Conservative'), 'narrower')
    assert.equal(compare('Conservative', 'Growth'), 'wider')
    assert.equal(compare('Balanced', 'Balanced'), 'same')
  })
})

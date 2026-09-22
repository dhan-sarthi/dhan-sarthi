/**
 * The wording a finding gets on /noticed and in Spend's Smart insights (D13).
 *
 * Karan's own findings and figures (the demo view on 1 Sept 2026): each card names the thing to
 * do with its amount, says why with a number, and never repeats the engine's "before anything
 * else", which put the card debt ahead of a missed repayment on two screens. A headline in a
 * shape the module does not know keeps the engine's words.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Insight, Snapshot } from '@dhan/contracts'
import { copyOf } from './insight-copy.ts'

/** Only the fields `copyOf` reads are filled; the rest of `Snapshot` is not consulted. */
const KARAN = {
  debt: {
    total: 814_315,
    hasHighInterest: true,
    highInterestTotal: 186_240,
    highestRate: 34.8,
    missedRepayment: true,
    monthlyOutgo: 30_500,
    endingSoon: null,
  },
  protection: {
    dependents: 2,
    lifeCoverInForce: 270_000,
    lifeCoverNeeded: 23_040_000,
    gap: 22_770_000,
  },
  buffer: { monthsCovered: 7.3, targetMonths: 6, shortfall: 0 },
  balances: { idleFloor: 12_000, idleMonths: 0, maturingSoon: null },
  discretionary: {
    categoryTrends: [],
    topHabits: [
      {
        key: 'POS PIZZA HUT PUNE',
        merchant: 'Fast food',
        typicalAmount: 857,
        monthlyAverage: 8_070,
      },
      { key: 'POS DMART PUNE', merchant: 'DMart', typicalAmount: 1_299, monthlyAverage: 5_998 },
    ],
  },
} as unknown as Snapshot

const finding = (
  kind: Insight['kind'],
  headline: string,
  detail: string,
  monthlyValue = 0,
): Insight => ({
  kind,
  severity: 'opportunity',
  headline,
  detail,
  monthlyValue,
  evidence: [],
  suggests: null,
})

describe('copyOf', () => {
  it('words the missed repayment as the thing to do, without ranking it against the card', () => {
    const copy = copyOf(
      finding(
        'missed_repayment',
        'You have a missed loan repayment on record.',
        'Clear it before anything else. A mark on your credit file costs you more, and for longer, than any return I could find you.',
      ),
      KARAN,
    )
    assert.equal(copy.title, 'Clear the missed repayment')
    assert.equal(copy.reworded, true)
    assert.doesNotMatch(`${copy.title} ${copy.why}`, /before anything else|first/i)
  })

  it('names the expensive debt and what it costs, and no longer says "Clear this first"', () => {
    const copy = copyOf(
      finding(
        'expensive_debt',
        '₹1,86,240 at 34.8% costs you ₹5,401 a month.',
        'Nothing you can invest in returns 34.8%. Clear this first.',
        5_401,
      ),
      KARAN,
    )
    assert.equal(copy.title, 'Pay off ₹1,86,240 at 34.8%')
    assert.equal(copy.why, '₹5,401 a month in interest, and nothing you can invest returns 34.8%.')
    assert.equal(copy.worth, 5_401)
    assert.doesNotMatch(copy.why, /first/i)
  })

  it('says what a habit figure is a share of, with a kind of place in lower case', () => {
    const copy = copyOf(
      finding(
        'habit_cost',
        'Fast food, 8.2 times a month. ₹96,845 a year.',
        'Usually ₹857 at a time. Small enough that it never feels like much.',
        2_421,
      ),
      KARAN,
    )
    assert.equal(copy.title, 'Cut ₹2,421 a month of fast food spending')
    assert.equal(copy.why, '30% of the ₹8,070 a month it costs, usually ₹857 at a time.')
  })

  it('reads a price rise and a subscription count off the headline', () => {
    const rise = copyOf(
      finding(
        'price_increase',
        'Netflix went from ₹499 to ₹649 in February 2026.',
        '₹1,800 a year extra that you never agreed to.',
        150,
      ),
      KARAN,
    )
    assert.equal(rise.title, 'Decide if Netflix is worth ₹649 a month')
    assert.equal(rise.why, '₹150 a month more since February 2026, a rise you never agreed to.')

    const subs = copyOf(
      finding(
        'subscription_review',
        '7 subscriptions cost you ₹39,132 a year.',
        'I cannot tell which of these you still use. You can.',
        3_261,
      ),
      KARAN,
    )
    assert.equal(subs.title, 'Review ₹3,261 a month of subscriptions')
    assert.equal(subs.why, '7 of them, ₹39,132 a year, and only you know which you still use.')
  })

  it("keeps the engine's words for a headline shape it does not know", () => {
    const odd = finding('price_increase', 'Netflix costs more now.', 'Since February.', 150)
    const copy = copyOf(odd, KARAN)
    assert.equal(copy.title, odd.headline)
    assert.equal(copy.why, odd.detail)
    assert.equal(copy.reworded, false)
    assert.equal(copy.worth, 150)
  })

  it("never counts core's guessed figures for idle cash as money on the table", () => {
    const idle = finding('idle_cash', '₹12,000 has sat untouched.', 'It pays 2.7%.', 40)
    // Karan's idle months are 0, so the card falls back to the engine's words — still worth 0.
    const copy = copyOf(idle, KARAN)
    assert.equal(copy.reworded, false)
    assert.equal(copy.worth, 0)
  })
})

/**
 * The arithmetic the roadmap is built from.
 *
 * Every figure the customer is shown about the future comes out of this file, and until now it
 * had no test anywhere in the repo — not in `@dhan/core` and not in `@dhan/fixtures`. It is
 * also the easiest module in the codebase to test, because it takes numbers and returns
 * numbers: there is no snapshot, no persona and no ledger involved.
 *
 * The important cases are the ones the docblocks argue about: `monthsToClear` returning null
 * rather than a fiction, `requiredMonthly` inverting `futureValue`, and the real-terms line.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_INFLATION_PCT,
  DEFAULT_RATES,
  compoundedOneOff,
  compoundedValueOf,
  futureValue,
  monthlyInterest,
  monthsToClear,
  paymentToClear,
  project,
  requiredMonthly,
} from './projection.ts'

describe('futureValue', () => {
  it('returns the corpus untouched over a zero horizon', () => {
    assert.equal(futureValue(5_000, 0, 10, 250_000), 250_000)
  })

  it('is exactly the sum of the contributions at a zero rate', () => {
    assert.equal(futureValue(5_000, 2, 0, 0), 120_000)
    assert.equal(futureValue(5_000, 2, 0, 50_000), 170_000)
  })

  it('treats contributions as arriving at the start of the month', () => {
    // Twelve contributions of 1,000 at 12% nominal, i = 1% a month. Start-of-month means each
    // one earns a full month more than an end-of-month annuity would:
    //   1000 * ((1.01^12 - 1) / 0.01) * 1.01 = 12,809.33
    // An end-of-month convention gives 12,682.50. The 127 rupees between them is the whole
    // point of the `* (1 + i)` term, so the assertion is exact rather than approximate.
    assert.equal(futureValue(1_000, 1, 12, 0), 12_809)
  })

  it('compounds an existing corpus alongside the contributions', () => {
    const withCorpus = futureValue(5_000, 10, 10, 200_000)
    const contributionsOnly = futureValue(5_000, 10, 10, 0)
    // The corpus compounds *monthly* at the nominal rate, like the contributions beside it —
    // 2,00,000 * (1 + 0.10/12)^120 ≈ 5,41,408, not the 5,18,748 an annual 1.10^10 would give.
    // Worth pinning: the two conventions differ by ₹22,660 over ten years on two lakh, and a
    // screen quoting one beside a plan built on the other is a number the customer can catch.
    assert.equal(withCorpus - contributionsOnly, Math.round(200_000 * (1 + 0.1 / 12) ** 120))
    assert.notEqual(withCorpus - contributionsOnly, Math.round(200_000 * 1.1 ** 10))
  })
})

describe('requiredMonthly', () => {
  it('inverts futureValue: fund the answer and the target is reached', () => {
    for (const [target, years, rate] of [
      [1_000_000, 5, 10],
      [5_000_000, 20, 10],
      [300_000, 3, 6.9],
    ] as const) {
      const monthly = requiredMonthly(target, years, rate)
      assert.ok(
        futureValue(monthly, years, rate) >= target,
        `${monthly}/month should reach ${target} in ${years}y at ${rate}%`,
      )
      // And it is the *smallest* such payment, to the rupee: one less falls short.
      assert.ok(futureValue(monthly - 1, years, rate) < target)
    }
  })

  it('credits an existing corpus against the target', () => {
    const fromScratch = requiredMonthly(2_000_000, 10, 10)
    const withHoldings = requiredMonthly(2_000_000, 10, 10, 500_000)
    assert.ok(withHoldings < fromScratch)
  })

  it('asks for nothing when the corpus already grows past the target', () => {
    assert.equal(requiredMonthly(1_000_000, 20, 10, 1_000_000), 0)
  })

  it('falls back to the plain shortfall over a zero horizon', () => {
    assert.equal(requiredMonthly(500_000, 0, 10, 120_000), 380_000)
    assert.equal(requiredMonthly(100_000, 0, 10, 250_000), 0)
  })
})

describe('monthsToClear', () => {
  it('returns null where the payment never beats the interest', () => {
    // The documented case: ₹5.83 lakh at 34.8% accrues about ₹16,900 a month, so ₹6,898 a
    // month leaves the balance growing. A naive balance/payment would promise 85 months.
    assert.equal(monthsToClear(583_000, 34.8, 6_898), null)
    assert.equal(Math.ceil(583_000 / 6_898), 85)
  })

  it('returns null at exactly the interest-only payment, where the balance stands still', () => {
    const interestOnly = (583_000 * 34.8) / 100 / 12
    assert.equal(monthsToClear(583_000, 34.8, interestOnly), null)
    assert.ok((monthsToClear(583_000, 34.8, interestOnly + 1) ?? 0) > 0)
  })

  it('amortises properly rather than dividing the balance by the payment', () => {
    const months = monthsToClear(186_000, 34.8, 20_000)
    assert.ok(months !== null)
    // Dividing gives 10. The interest still accruing makes it longer, and pretending otherwise
    // is a payoff date that never arrives.
    assert.ok(months > Math.ceil(186_000 / 20_000), `${months} should exceed the naive 10`)
    assert.equal(months, 11)
  })

  it('divides cleanly at a zero rate', () => {
    assert.equal(monthsToClear(100_000, 0, 10_000), 10)
    assert.equal(monthsToClear(100_001, 0, 10_000), 11)
  })

  it('is zero for nothing owed and null for nothing paid', () => {
    assert.equal(monthsToClear(0, 34.8, 5_000), 0)
    assert.equal(monthsToClear(-5, 34.8, 5_000), 0)
    assert.equal(monthsToClear(186_000, 34.8, 0), null)
  })
})

describe('paymentToClear', () => {
  it('produces a payment that really does retire the balance in the window', () => {
    const payment = paymentToClear(186_000, 34.8, 36)
    assert.equal(monthsToClear(186_000, 34.8, payment), 36)
    assert.equal(monthsToClear(186_000, 34.8, payment - 1), 37)
  })

  it('always exceeds the interest accruing, so the answer is never a standstill', () => {
    const payment = paymentToClear(583_000, 34.8, 36)
    assert.ok(payment > monthlyInterest(583_000, 34.8))
  })

  it('is the whole principal where there are no months to spread it over', () => {
    assert.equal(paymentToClear(186_000, 34.8, 0), 186_000)
  })
})

describe('monthlyInterest', () => {
  it('is the annual rate over twelve, rounded', () => {
    assert.equal(monthlyInterest(186_000, 34.8), 5_394)
    assert.equal(monthlyInterest(0, 34.8), 0)
  })
})

describe('project', () => {
  it('returns one scenario per rate, with a real-terms figure below the nominal one', () => {
    const p = project(5_000, 10, 100_000)

    assert.equal(p.scenarios.length, DEFAULT_RATES.length)
    assert.equal(p.inflationPct, DEFAULT_INFLATION_PCT)
    for (const s of p.scenarios) {
      assert.equal(s.corpus, futureValue(5_000, 10, s.ratePct, 100_000))
      assert.ok(s.realCorpus < s.corpus, `${s.label}: real should sit below nominal`)
      assert.equal(s.contributed, 5_000 * 120 + 100_000)
    }
  })

  it('accepts a single contractual rate, for deposit-style stages', () => {
    const p = project(5_000, 3, 0, { rates: [{ label: 'Contractual', ratePct: 6.9 }] })
    assert.equal(p.scenarios.length, 1)
    assert.equal(p.scenarios[0]?.label, 'Contractual')
  })

  it('carries the disclaimer on every projection', () => {
    assert.ok(project(1_000, 5).disclaimer.length > 0)
  })
})

describe('compounding helpers', () => {
  it('compoundedValueOf is futureValue with no corpus', () => {
    assert.equal(compoundedValueOf(500, 30), futureValue(500, 30, 10, 0))
  })

  it('compoundedOneOff grows a single amount', () => {
    assert.equal(compoundedOneOff(52_900, 30, 10), Math.round(52_900 * 1.1 ** 30))
  })
})

/**
 * The conduct figure, against literals.
 *
 * Unit level on purpose, the same division of labour `protection.test.ts` states: these say
 * what the arithmetic *is*, with no generator in sight, so a reader can check a weight or a
 * cut-off without knowing what is on a persona's file. The outcome assertions — all four
 * personas' scores at the anchor, and the invariant that the figure and the suitability gate
 * never describe one customer differently — belong in `packages/fixtures`, the one place
 * allowed to see both this package and the generator.
 *
 * Every boundary below is asserted against the exported constant rather than against the
 * number it holds today. A weight that moves should fail in `packages/fixtures` with a persona
 * named, not here with a literal that was only ever a copy of the thing under test.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BUREAU_BANDS,
  CONDUCT_BAND_NONE,
  CONDUCT_WEIGHTS,
  CREDIT_BLIND_SPOTS,
  DELINQUENCY_CAP,
  DPD_BUCKETS,
  FOIR_CLEAN_BELOW,
  FOIR_ZERO_AT,
  INDICATIVE_RATES,
  RATE_CLEAN_BELOW,
  bureauBand,
  conductBand,
  delinquencyCeiling,
  creditFacts,
  ratesForBand,
} from './credit.ts'
import type { CreditBasis, CreditComponent, CreditComponentId, CreditFacts } from './credit.ts'

type Loan = CreditBasis['liabilities'][number]

/** The gate's own threshold, which is the only option this module takes. `derive.ts:314`. */
const OPTIONS = { highInterestThreshold: 24 }

const loan = (over: Partial<Loan> = {}): Loan => ({
  outstandingPrincipal: 400_000,
  emiAmount: 9_600,
  loanInterestRate: 9.15,
  dpdStatus: 0,
  ...over,
})

/**
 * A basis assembled the way `derive.ts:566-590` assembles one — `monthlyOutgo` is the sum of
 * the instalments and `highestRate` the worst rate on the file. Building it any other way
 * would let a test assert against a combination the engine could never hand this module, which
 * is how a unit suite ends up green over an impossible customer.
 */
const basis = (liabilities: readonly Loan[], monthlyIncome = 100_000): CreditBasis => ({
  liabilities,
  income: { monthly: monthlyIncome },
  debt: {
    monthlyOutgo: liabilities.reduce((s, l) => s + l.emiAmount, 0),
    highestRate:
      liabilities.length > 0 ? Math.max(...liabilities.map((l) => l.loanInterestRate)) : 0,
  },
})

const part = (facts: CreditFacts, id: CreditComponentId): CreditComponent => {
  const found = facts.components.find((c) => c.id === id)
  assert.ok(found, `expected a ${id} component in the working`)
  return found
}

describe('creditFacts', () => {
  it('says there is nothing to judge on a file with no borrowing, and still says what it cannot see', () => {
    const facts = creditFacts(basis([]), OPTIONS)

    assert.equal(facts.conductScore, null)
    assert.equal(facts.outOf, null)
    assert.equal(facts.liabilityCount, 0)
    assert.deepEqual(facts.components, [])
    // Nothing to judge is not nothing to say. A bank that can tell you nothing about how you
    // borrow still owes you the list of what it would have needed in order to.
    assert.deepEqual([...facts.blind], [...CREDIT_BLIND_SPOTS])
  })

  it('gives a file that is clean on all three axes the whole figure, and shows its working', () => {
    const facts = creditFacts(basis([loan()]), OPTIONS)

    assert.equal(facts.conductScore, 100)
    assert.equal(facts.outOf, 100)
    assert.equal(facts.capped, false)
    const sum = facts.components.reduce((s, c) => s + (c.earned ?? 0), 0)
    assert.equal(sum, 100)
  })

  it('drops a file twelve days past due into the first bucket rather than to zero', () => {
    const facts = creditFacts(basis([loan({ dpdStatus: 12 })]), OPTIONS)

    const lateBucket = DPD_BUCKETS[1]
    assert.ok(lateBucket, 'the 1–30 day bucket')
    assert.equal(part(facts, 'repayment').earned, CONDUCT_WEIGHTS.repayment * lateBucket.share)
    assert.equal(facts.dpdDays, 12)
  })

  it('earns nothing on repayment past ninety days, without touching the other two components', () => {
    const facts = creditFacts(basis([loan({ dpdStatus: 95 })]), OPTIONS)

    assert.equal(part(facts, 'repayment').earned, 0)
    // The denominator does not move: the input was readable and the answer was zero, which is
    // a verdict rather than a gap, and a verdict is exactly what should cost its full weight.
    assert.equal(facts.outOf, 100)
    assert.equal(facts.conductScore, CONDUCT_WEIGHTS.cost + CONDUCT_WEIGHTS.load)
  })

  it('earns nothing on cost at the gate’s own threshold, and something a hair below it', () => {
    const atTheLine = creditFacts(
      basis([loan({ loanInterestRate: OPTIONS.highInterestThreshold })]),
      OPTIONS,
    )
    assert.equal(part(atTheLine, 'cost').earned, 0)

    // Both sides, because the whole point of a ramp is that it is continuous up to the cut-off
    // and flat after it. A `>` where a `>=` belongs is invisible from one side alone.
    const justUnder = creditFacts(
      basis([loan({ loanInterestRate: OPTIONS.highInterestThreshold - 0.1 })]),
      OPTIONS,
    )
    const earned = part(justUnder, 'cost').earned ?? 0
    assert.ok(earned > 0, 'a rate below the threshold is not yet worthless')
    assert.ok(earned < CONDUCT_WEIGHTS.cost, 'and it is not yet the full component either')
  })

  it('earns the whole cost component on a rate at or below the clean line', () => {
    const below = creditFacts(basis([loan({ loanInterestRate: RATE_CLEAN_BELOW - 1 })]), OPTIONS)
    assert.equal(part(below, 'cost').earned, CONDUCT_WEIGHTS.cost)

    // The ramp starts at 1 rather than below it, so the clean line itself is still full marks.
    const atTheLine = creditFacts(basis([loan({ loanInterestRate: RATE_CLEAN_BELOW })]), OPTIONS)
    assert.equal(part(atTheLine, 'cost').earned, CONDUCT_WEIGHTS.cost)
  })

  it('takes an unreadable income out of the denominator rather than charging the customer for it', () => {
    const facts = creditFacts(basis([loan()], 0), OPTIONS)

    assert.equal(facts.emiToIncome, null)
    // This is the regression the module exists to prevent. Scoring load at zero here would
    // read as a customer at 80 out of 100 — a twenty-point penalty for a salary IDBI's own
    // statement could not show us. It is 80 out of 80, and the working says which one it is.
    assert.equal(facts.outOf, CONDUCT_WEIGHTS.repayment + CONDUCT_WEIGHTS.cost)
    assert.equal(facts.conductScore, 80)
    assert.equal(part(facts, 'load').earned, null)
  })

  it('refuses to read an unpriced loan as the cheapest money on the file', () => {
    /*
     * A rate of zero is what the bank's own adapter writes when operation 391 returned no terms
     * for an account — `to-domain.ts:497`, `facts.interestRate ?? 0`, and the miss is anticipated
     * one line above it. Fed to the ramp that zero is the single most flattering value it can
     * take, so an unpriced file scored full marks on the one axis `HIGH_INTEREST_DEBT` exists to
     * be able to zero out. It comes out of both halves of the fraction instead.
     */
    const unpriced = creditFacts(basis([loan({ loanInterestRate: 0 })]), OPTIONS)

    assert.equal(part(unpriced, 'cost').earned, null)
    assert.equal(unpriced.outOf, CONDUCT_WEIGHTS.repayment + CONDUCT_WEIGHTS.load)
    assert.notEqual(unpriced.outOf, 100)

    // `every`, not `some`: `highestRate` is a max, so one unread member could be the highest and
    // the max would never know. A file with one priced loan and one unpriced is not a read file.
    const partly = creditFacts(basis([loan(), loan({ loanInterestRate: 0 })]), OPTIONS)
    assert.equal(part(partly, 'cost').earned, null)
  })

  it('refuses to read an unknown instalment as no instalment', () => {
    /*
     * The same gap on the FOIR's numerator: `to-domain.ts:496` writes a zero for an instalment it
     * could not read, so an unknown EMI is indistinguishable from none and `clamp01` pays the
     * full twenty to a customer whose obligations were never seen.
     */
    const unread = creditFacts(basis([loan({ emiAmount: 0 })]), OPTIONS)
    assert.equal(part(unread, 'load').earned, null)
    assert.equal(unread.outOf, CONDUCT_WEIGHTS.repayment + CONDUCT_WEIGHTS.cost)

    // A card is the deliberate exception: it has no instalment to read, so a zero on one is the
    // truth rather than a miss, and requiring an EMI of it would null this component for every
    // customer who holds one.
    const card = creditFacts(basis([loan(), loan({ emiAmount: 0, isRevolving: true })]), OPTIONS)
    assert.notEqual(part(card, 'load').earned, null)
    assert.equal(card.outOf, 100)
  })

  it('holds a delinquent file to a ceiling that travels with its own denominator', () => {
    // dpd 12 and an unreadable income: 20 of 50 on repayment plus 30 of 30 on cost is 50 of 80,
    // which is already under the ceiling — the assertion is that the ceiling itself moved, not
    // that this file was capped. A raw 64 against an `outOf` of 80 is 80%, which is the band the
    // cap exists to keep a delinquent file out of.
    const facts = creditFacts(basis([loan({ dpdStatus: 12 })], 0), OPTIONS)
    assert.equal(facts.outOf, 80)
    assert.ok(delinquencyCeiling(80) < DELINQUENCY_CAP)
    assert.ok(facts.conductScore !== null && facts.conductScore <= delinquencyCeiling(80))
  })

  it('pays the load component in full at the comfortable FOIR and nothing at the ceiling', () => {
    const income = 100_000
    const comfortable = creditFacts(
      basis([loan({ emiAmount: FOIR_CLEAN_BELOW * income })], income),
      OPTIONS,
    )
    assert.equal(comfortable.emiToIncome, FOIR_CLEAN_BELOW)
    assert.equal(part(comfortable, 'load').earned, CONDUCT_WEIGHTS.load)

    const atTheCeiling = creditFacts(
      basis([loan({ emiAmount: FOIR_ZERO_AT * income })], income),
      OPTIONS,
    )
    assert.equal(atTheCeiling.emiToIncome, FOIR_ZERO_AT)
    assert.equal(part(atTheCeiling, 'load').earned, 0)
  })

  it('holds a delinquent file at the cap, and leaves the same figure alone without one', () => {
    // Sunil's shape: current on everything he is priced on, and twelve days down on one
    // mandate. He would read "one thing to tidy" while `MISSED_REPAYMENT` refuses him every
    // non-protection product on the shelf, which is two surfaces describing one customer
    // differently in front of the person it is about.
    const delinquent = creditFacts(
      basis([loan({ dpdStatus: 12, loanInterestRate: 11.4, emiAmount: 16_600 })]),
      OPTIONS,
    )
    assert.equal(delinquent.capped, true)
    assert.equal(delinquent.conductScore, DELINQUENCY_CAP)

    // Priya's shape: the same 70, earned rather than held down, and the cap must not touch it.
    const expensive = creditFacts(
      basis([loan({ loanInterestRate: 34.8, emiAmount: 17_300 })]),
      OPTIONS,
    )
    assert.equal(expensive.capped, false)
    assert.equal(expensive.conductScore, 70)
  })

  it('splits the balance into revolving and instalment with nothing falling between them', () => {
    const card = loan({
      outstandingPrincipal: 78_000,
      emiAmount: 3_900,
      loanInterestRate: 34.8,
      isRevolving: true,
    })
    const facts = creditFacts(basis([card, loan()]), OPTIONS)

    assert.equal(facts.revolvingBalance, 78_000)
    assert.equal(facts.instalmentBalance, 400_000)
    // The two are `DebtFacts.total` by construction (`derive.ts:566`, the sum of every
    // outstanding principal). A liability that landed in neither half would make the screen's
    // two rows quietly fail to add up to the figure above them.
    assert.equal(facts.revolvingBalance + facts.instalmentBalance, 478_000)
  })

  it('is deterministic: the same file twice is the same facts', () => {
    const file = basis([loan({ dpdStatus: 12 }), loan({ isRevolving: true })])
    assert.deepEqual(creditFacts(file, OPTIONS), creditFacts(file, OPTIONS))
  })

  it('reports all four blind spots on every file, because today there is no pull to shrink them', () => {
    const facts = creditFacts(basis([loan()]), OPTIONS)

    assert.equal(CREDIT_BLIND_SPOTS.length, 4)
    assert.deepEqual([...facts.blind], [...CREDIT_BLIND_SPOTS])
    // Asserted as a fact about today, not a law. When a credentialled bureau pull lands, the
    // array shrinks and this test changes with it — that is the design, and the screen follows
    // the array rather than the other way round.
  })
})

describe('conductBand', () => {
  it('captions an absent figure as unknown rather than as the bottom band', () => {
    assert.equal(conductBand(null, null), CONDUCT_BAND_NONE)
    assert.equal(conductBand(40, null), CONDUCT_BAND_NONE)
    assert.notEqual(conductBand(null, null), conductBand(0, 100))
  })

  it('refuses to divide by a denominator of nothing', () => {
    // Unreachable today — `repayment` is never null, so `outOf` is at least 50 wherever there is
    // a liability at all — but a caption is not the place to find out that it became reachable.
    assert.equal(conductBand(0, 0), CONDUCT_BAND_NONE)
  })

  it('changes caption across the cap, which is what makes the cap mean anything', () => {
    // Both sides of the one boundary the module enforces. If 64 and 65 read the same, holding
    // a delinquent customer at 64 buys nothing and the cap may as well not exist.
    assert.notEqual(conductBand(DELINQUENCY_CAP, 100), conductBand(DELINQUENCY_CAP + 1, 100))
    assert.equal(conductBand(DELINQUENCY_CAP, 100), 'This is costing you')
    assert.equal(conductBand(DELINQUENCY_CAP + 1, 100), 'One thing to tidy')
  })

  it('reads the figure as a share of its own denominator, not out of a notional hundred', () => {
    /*
     * The regression this function was changed for. A file whose income could not be read drops
     * `load` from both halves and comes back 80 of 80 — nothing wrong with anything we could
     * see. Against a fixed floor of 85 that captioned the customer "One thing to tidy" for a gap
     * in the bank's own data, which is the exact harm `outOf` exists to prevent.
     */
    assert.equal(conductBand(80, 80), 'Nothing wrong here')
    assert.equal(conductBand(80, 100), 'One thing to tidy')
    // And the cap travels with the denominator for the same reason.
    assert.equal(delinquencyCeiling(100), DELINQUENCY_CAP)
    assert.equal(delinquencyCeiling(80), 51)
    assert.equal(conductBand(delinquencyCeiling(80), 80), 'This is costing you')
  })
})

describe('the simulator’s tables', () => {
  it('carries one indicative row per bureau band, resolvable by name, and never an empty card line', () => {
    assert.equal(INDICATIVE_RATES.length, BUREAU_BANDS.length)

    for (const band of BUREAU_BANDS) {
      assert.equal(bureauBand(band.min), band.name)
      assert.equal(bureauBand(band.max), band.name)

      const rates = ratesForBand(band.name)
      assert.ok(rates, `no indicative rates for ${band.name}`)
      // `home` and `car` are allowed to be null — a band that cannot get a home loan is the
      // honest row. `card` never is: in India the band decides whether a card is issued at
      // all, not what it costs, so there is always a sentence to write and never a rate.
      assert.ok(rates.card.length > 0, `${band.name} has no card sentence`)
    }
  })
})

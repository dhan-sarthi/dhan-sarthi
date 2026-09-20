/**
 * The suitability gate against real snapshots.
 *
 * These are the compliance story, so they are tested against derived customers rather than hand
 * built inputs — a rule that only fires on a literal somebody wrote to make it fire has not been
 * shown to work.
 *
 * `@dhan/core/src/suitability.test.ts` is the other half and neither replaces the other. It
 * asks whether each rule does what its `description` says, one flipped fact at a time against a
 * base snapshot on which every rule passes — which is the question a compliance officer asks,
 * and which a persona cannot answer because several rules are live at once. This file asks
 * whether the gate reaches the right verdict for a customer who actually exists. Run both.
 *
 * These stay here because they need the generator, which imports `@dhan/core`; the reasons that
 * cycle cannot be broken are in CONTRIBUTING.md under "Where tests live".
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDailyPlan, derive, evaluate, ruleBook } from '@dhan/core'
import type { Snapshot } from '@dhan/core'
import { generateCustomerFile } from './generate.ts'
import { PRIYA, ROHAN, SUNIL } from './personas.ts'
import { PRODUCT_SHELF, productById } from './shelf.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const snap = (spec: typeof ROHAN): Snapshot => derive(generateCustomerFile(spec, OPTS), ASOF)

const check = (
  snapshot: Snapshot,
  productId: string,
  amount: number,
  goal: { kind: string; horizonYears: number } | null = null,
) =>
  evaluate({
    product: productById(productId),
    snapshot,
    amount,
    goal,
    alternatives: PRODUCT_SHELF,
  })

describe('the refusal', () => {
  it('turns down a ULIP that IDBI sells, and names the alternative', () => {
    // The one thing in this app that costs the bank money in the short run, which is exactly
    // why it is the only thing that proves the rest of it.
    const v = check(snap(ROHAN), 'LIC_ULIP_401', 2_500, { kind: 'protection', horizonYears: 20 })

    assert.equal(v.verdict, 'BLOCKED')
    assert.equal(v.ruleId, 'BUNDLED_PROTECTION')
    assert.equal(v.alternative?.productId, 'LIC_TERM_201')
    assert.match(v.spoken ?? '', /IDBI sells this one/)
    // The audit trail has to carry the arithmetic, not just the conclusion.
    assert.match(v.recorded, /x the\s+unbundled term alternative|x the unbundled term/)
  })

  it('turns down an amount, not only a product', () => {
    // Nobody expects a bank app to refuse money. It costs nothing to build and it is the second
    // most credible thing we own.
    const s = snap(ROHAN)
    const v = check(s, 'MF_INDEX_103', s.surplus.deployable + 20_000, {
      kind: 'wealth_target',
      horizonYears: 15,
    })

    assert.equal(v.verdict, 'BLOCKED')
    assert.equal(v.ruleId, 'AFFORDABILITY')
    assert.match(v.recorded, /exceeds deployable surplus/)
  })

  it('checks the amount against what is deployable, not the headline surplus', () => {
    // A SIP sized against a median month breaks the first time a hospital bill lands, so the
    // provision for irregular months has to be respected here or it is decorative.
    //
    // Sunil is the only persona whose provision bites, and his missed repayment blocks every
    // investment several rules earlier — correctly. So this clears that one condition to reach
    // the rule under test. Isolating a rule is fair; asserting on a customer the rule never
    // gets to see is not.
    const base = snap(SUNIL)
    assert.ok(base.irregular.monthlyProvision > 0)
    assert.ok(base.surplus.deployable < base.surplus.monthly)

    const s = { ...base, debt: { ...base.debt, missedRepayment: false } }
    const between = Math.round((s.surplus.deployable + s.surplus.monthly) / 2)

    assert.equal(check(s, 'IDBI_SSP_002', between).ruleId, 'AFFORDABILITY')
    // And just below the deployable ceiling it goes through.
    assert.equal(check(s, 'IDBI_SSP_002', s.surplus.deployable - 100).verdict, 'PASS')
  })
})

describe('order of objections', () => {
  it('leads with the card, not the risk profile', () => {
    // The earliest failing rule wins, so the most fundamental objection is the one reported.
    const v = check(snap(PRIYA), 'MF_INDEX_103', 5_000, { kind: 'wealth_target', horizonYears: 10 })
    assert.equal(v.ruleId, 'HIGH_INTEREST_DEBT')
    assert.match(v.spoken ?? '', /34\.8%/)
    assert.deepEqual(v.passed, [])
  })

  it('records which rules were cleared before the one that failed', () => {
    const v = check(snap(ROHAN), 'MF_ELSS_104', 5_000, { kind: 'wealth_target', horizonYears: 10 })
    assert.equal(v.ruleId, 'TAX_BENEFIT_UNAVAILABLE')
    assert.ok(v.passed.includes('HIGH_INTEREST_DEBT'))
    assert.ok(v.passed.includes('EMERGENCY_BUFFER'))
  })
})

describe('protection is not an investment', () => {
  it('does not refuse cover to someone in debt', () => {
    // Refusing term cover because of a missed repayment is backwards: if he dies, his family
    // inherits the debt and loses the income. Debt is an argument for cover, not against it.
    const s = snap(SUNIL)
    assert.equal(s.debt.missedRepayment, true)
    assert.equal(s.customer.dependents, 4)

    assert.equal(check(s, 'LIC_TERM_201', 985).verdict, 'PASS')
    assert.equal(check(s, 'NIVA_HEALTH_202', 1_450).verdict, 'PASS')
    assert.equal(check(s, 'GOI_PMJJBY_203', 36).verdict, 'PASS')

    // But every investment is still blocked.
    assert.equal(check(s, 'MF_INDEX_103', 3_000).ruleId, 'MISSED_REPAYMENT')
    // And a ULIP is an investment however it is marketed.
    assert.equal(check(s, 'LIC_ULIP_401', 2_500).verdict, 'BLOCKED')
  })

  it('substitutes a cheaper policy only within the same kind of cover', () => {
    // Accident cover at ₹2 a month is not a stand-in for life cover, however much less it costs.
    const s = snap(PRIYA)
    assert.equal(s.surplus.deployable, 0)

    const term = check(s, 'LIC_TERM_201', 985)
    assert.equal(term.ruleId, 'AFFORDABILITY')
    assert.equal(term.alternative?.productId, 'GOI_PMJJBY_203')

    const health = check(s, 'NIVA_HEALTH_202', 1_450)
    assert.equal(health.verdict, 'BLOCKED')
    // Nothing cheaper of this kind exists, so it is deferred rather than swapped for something
    // that does not cover the same thing.
    assert.equal(health.alternative, null)
  })

  it('never refuses a premium too small to matter', () => {
    const s = snap(PRIYA)
    assert.equal(check(s, 'GOI_PMJJBY_203', 36).verdict, 'PASS')
    assert.equal(check(s, 'GOI_PMSBY_204', 2).verdict, 'PASS')
  })
})

describe('matching the product to the goal', () => {
  it('refuses equity for money that is needed soon', () => {
    const v = check(snap(ROHAN), 'MF_INDEX_103', 6_000, {
      kind: 'wealth_target',
      horizonYears: 2,
    })
    assert.equal(v.ruleId, 'VOLATILITY_VS_HORIZON')
    assert.equal(v.alternative?.productId, 'IDBI_SSP_002')
  })

  it('refuses a tax-saving fund to someone who cannot claim the deduction', () => {
    const rohan = snap(ROHAN)
    assert.equal(rohan.customer.taxRegime, 'new')
    const blocked = check(rohan, 'MF_ELSS_104', 5_000, { kind: 'wealth_target', horizonYears: 10 })
    assert.equal(blocked.ruleId, 'TAX_BENEFIT_UNAVAILABLE')
    assert.equal(blocked.alternative?.productId, 'MF_INDEX_103')

    // On the old regime the trade is at least arguable, so the rule stands down. Sunil is
    // blocked earlier for a different reason, which is itself the point of rule ordering.
    const sunil = snap(SUNIL)
    assert.equal(sunil.customer.taxRegime, 'old')
    assert.notEqual(check(sunil, 'MF_ELSS_104', 3_000).ruleId, 'TAX_BENEFIT_UNAVAILABLE')
  })

  it('lets the right product through for the customer it suits', () => {
    const s = snap(ROHAN)
    assert.equal(
      check(s, 'MF_INDEX_103', 6_000, { kind: 'wealth_target', horizonYears: 15 }).verdict,
      'PASS',
    )
    assert.equal(
      check(s, 'IDBI_SSP_002', 5_000, { kind: 'emergency_fund', horizonYears: 1 }).verdict,
      'PASS',
    )
    assert.equal(check(s, 'LIC_TERM_201', 985).verdict, 'PASS')
  })
})

describe('the rule book', () => {
  it('is readable without running anything', () => {
    // A rule a compliance officer can only exercise by standing up a server is a rule nobody
    // can audit.
    assert.ok(ruleBook.length >= 8)
    for (const rule of ruleBook) {
      assert.match(rule.id, /^[A-Z_]+$/)
      assert.ok(rule.description.length > 30, `${rule.id} needs a real description`)
    }
  })

  it('always gives the customer a sentence and the file a record', () => {
    const s = snap(PRIYA)
    for (const product of PRODUCT_SHELF) {
      const v = evaluate({ product, snapshot: s, amount: 5_000, alternatives: PRODUCT_SHELF })
      assert.ok(v.recorded.length > 0, `${product.productId} produced no audit line`)
      if (v.verdict === 'BLOCKED') {
        assert.ok(
          v.spoken && v.spoken.length > 20,
          `${product.productId} blocked with nothing to say`,
        )
      }
    }
  })
})

describe('the gate agrees with itself', () => {
  /*
   * The gate runs twice on every money action: once when the daily plan proposes it, and
   * again in the decision route when the customer accepts. Those two runs read the same
   * snapshot, so they must reach the same verdict — and for a while they did not.
   *
   * AFFORDABILITY measures a monthly commitment against `surplus.deployable` and a one-off
   * transfer against the balance. `buildDailyPlan` knew which was which and passed it; the
   * Action it returned then dropped the distinction, so the decision route re-read a
   * ₹2,00,000 transfer of a maturing deposit as ₹2,00,000 a month and refused it. The
   * product's own headline recommendation refused itself when you said yes to it.
   */
  it('carries the cadence on a lump-sum action, so accepting it is not re-read as monthly', () => {
    const file = generateCustomerFile(ROHAN, OPTS)
    const snapshot = derive(file, ASOF)
    const plan = buildDailyPlan(snapshot, null, file.transactions, PRODUCT_SHELF, ASOF)

    const sweep = [plan.primary, ...plan.secondary].find(
      (a) => a !== null && a.kind === 'open_sweep_in',
    )
    assert.ok(sweep, 'Rohan has a maturing deposit, so a sweep-in should be proposed')
    assert.equal(sweep.cadence, 'lump_sum')

    // Exactly what the decision route now does with it.
    const onAccept = evaluate({
      product: productById(sweep.productId!),
      snapshot,
      amount: sweep.amount,
      cadence: sweep.cadence ?? 'monthly',
      goal: null,
      alternatives: PRODUCT_SHELF,
    })
    assert.equal(onAccept.verdict, 'PASS')

    // And the bug, stated as a test: without the cadence the same accept is refused.
    const withoutCadence = evaluate({
      product: productById(sweep.productId!),
      snapshot,
      amount: sweep.amount,
      goal: null,
      alternatives: PRODUCT_SHELF,
    })
    assert.equal(withoutCadence.verdict, 'BLOCKED')
    assert.equal(withoutCadence.ruleId, 'AFFORDABILITY')
  })

  it('still refuses a monthly commitment that is genuinely unaffordable', () => {
    // The fix must not turn AFFORDABILITY off. A real monthly overreach is still blocked.
    const v = check(snap(ROHAN), 'IDBI_SSP_002', 60_000)
    assert.equal(v.verdict, 'BLOCKED')
    assert.equal(v.ruleId, 'AFFORDABILITY')
  })
})

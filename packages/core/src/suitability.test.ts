/**
 * The suitability gate, rule by rule.
 *
 * These are unit tests over literals, not outcome tests over a persona. The distinction is the
 * whole reason this file exists beside `@dhan/fixtures/src/suitability.test.ts` rather than
 * replacing it:
 *
 * - **Here**: one fact changes, one rule fires, and the assertion names the rule id. The base
 *   snapshot passes every rule, so a block has exactly one cause and a broken rule cannot hide
 *   behind an earlier one. This is the file that answers "does `RISK_CEILING` do what its
 *   `description` says", which is the compliance question.
 * - **There**: four generated personas are run through the gate and the shelf, and the
 *   assertions are about whether the *advice* comes out right for a real-looking customer.
 *   That needs the generator, which imports `@dhan/core`, so those tests cannot move here
 *   without a package cycle. See the note in `CONTRIBUTING.md` under "Where tests live".
 *
 * The rule bodies are prose the customer reads, so the assertions check the rule id and the
 * decisive figure rather than the whole sentence — a reworded refusal is not a regression and a
 * test that says it is will be deleted the first time someone edits the copy.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { evaluate, ruleBook } from './suitability.ts'
import { SHELF, product, snapshot } from './snapshot.testkit.ts'

const INDEX = SHELF.find((p) => p.productId === 'MF_INDEX_103')!
const TERM = SHELF.find((p) => p.productId === 'INS_TERM_201')!
const PMJJBY = SHELF.find((p) => p.productId === 'INS_PMJJBY_203')!
const ULIP = SHELF.find((p) => p.productId === 'INS_ULIP_205')!
const ELSS = SHELF.find((p) => p.productId === 'MF_ELSS_107')!

describe('evaluate: the clean case', () => {
  it('passes a healthy customer and records every rule as checked', () => {
    const v = evaluate({ product: INDEX, snapshot: snapshot(), amount: 5_000, alternatives: SHELF })

    assert.equal(v.verdict, 'PASS')
    assert.equal(v.ruleId, null)
    assert.equal(v.spoken, null)
    assert.equal(v.alternative, null)
    // Every rule in the book cleared, and the record says how many.
    assert.deepEqual(
      v.passed,
      ruleBook.map((r) => r.id),
    )
    assert.match(v.recorded, new RegExp(`All ${ruleBook.length} suitability rules passed`))
  })

  it('publishes the rule book in evaluation order, with a description for each', () => {
    assert.deepEqual(
      ruleBook.map((r) => r.id),
      [
        'HIGH_INTEREST_DEBT',
        'MISSED_REPAYMENT',
        'EMERGENCY_BUFFER',
        'RISK_CEILING',
        'VOLATILITY_VS_HORIZON',
        'AFFORDABILITY',
        'HORIZON_VS_LOCKIN',
        'TAX_BENEFIT_UNAVAILABLE',
        'BUNDLED_PROTECTION',
      ],
    )
    for (const rule of ruleBook) assert.ok(rule.description.length > 20, rule.id)
  })
})

describe('HIGH_INTEREST_DEBT', () => {
  const indebted = snapshot({
    debt: { total: 814_000, hasHighInterest: true, highInterestTotal: 186_000, highestRate: 34.8 },
  })

  it('blocks an investment and quotes the expensive balance, not the total', () => {
    const v = evaluate({ product: INDEX, snapshot: indebted, amount: 5_000, alternatives: SHELF })

    assert.equal(v.verdict, 'BLOCKED')
    assert.equal(v.ruleId, 'HIGH_INTEREST_DEBT')
    assert.deepEqual(v.passed, [])
    // 1,86,000 is the card; 8,14,000 is the card plus a 9.4% car loan and is not what this
    // rule is about. Quoting the total here is the defect DebtFacts.highInterestTotal exists
    // to prevent.
    assert.match(v.spoken ?? '', /1,86,000/)
    assert.doesNotMatch(v.spoken ?? '', /8,14,000/)
  })

  it('does not block pure protection: debt is an argument for cover, not against it', () => {
    for (const cover of [TERM, PMJJBY]) {
      const v = evaluate({ product: cover, snapshot: indebted, amount: 0, alternatives: SHELF })
      assert.equal(v.verdict, 'PASS', cover.productId)
    }
  })

  it('does block a ULIP, because it bundles investment', () => {
    const v = evaluate({ product: ULIP, snapshot: indebted, amount: 0, alternatives: SHELF })
    assert.equal(v.ruleId, 'HIGH_INTEREST_DEBT')
  })

  it('blocks a term plan that bundles investment: the flag outranks the category', () => {
    // The carve-out is two conditions, not one, and a bundled term plan is the only shape that
    // tells them apart — ULIP above fails on the category alone. `./protection.ts` owns both
    // conditions now, so this pins the second of them through the gate's own interface: a change
    // over there that let the flag through would fail here rather than on a screen.
    const bundled = product({
      category: 'Term Insurance',
      riskometer: 'Moderate',
      bundlesProtectionAndInvestment: true,
    })
    const v = evaluate({ product: bundled, snapshot: indebted, amount: 0, alternatives: SHELF })
    assert.equal(v.ruleId, 'HIGH_INTEREST_DEBT')
  })
})

describe('MISSED_REPAYMENT', () => {
  const missed = snapshot({ debt: { total: 200_000, missedRepayment: true } })

  it('blocks an investment', () => {
    const v = evaluate({ product: INDEX, snapshot: missed, amount: 1_000, alternatives: SHELF })
    assert.equal(v.ruleId, 'MISSED_REPAYMENT')
    assert.match(v.recorded, /DPD/)
  })

  it('exempts pure protection', () => {
    assert.equal(
      evaluate({ product: TERM, snapshot: missed, amount: 0, alternatives: SHELF }).verdict,
      'PASS',
    )
  })

  it('yields to HIGH_INTEREST_DEBT when both are true, so the bigger objection is heard', () => {
    const both = snapshot({
      debt: {
        total: 186_000,
        hasHighInterest: true,
        highInterestTotal: 186_000,
        highestRate: 34.8,
        missedRepayment: true,
      },
    })
    assert.equal(
      evaluate({ product: INDEX, snapshot: both, amount: 1_000, alternatives: SHELF }).ruleId,
      'HIGH_INTEREST_DEBT',
    )
  })
})

describe('EMERGENCY_BUFFER', () => {
  const thin = snapshot({ buffer: { monthsCovered: 1, targetMonths: 6, shortfall: 120_000 } })

  it('blocks a locked-in product and names a liquid alternative', () => {
    const locked = product({ category: 'Fixed Deposit', riskometer: 'Low', lockInYears: 5 })
    const v = evaluate({ product: locked, snapshot: thin, amount: 1_000, alternatives: SHELF })

    assert.equal(v.ruleId, 'EMERGENCY_BUFFER')
    // The first reachable home on the shelf, in shelf order — the rule takes `Liquid` or
    // `Sweep-in FD`, and the sweep comes first. What matters is that the refusal names
    // somewhere the money can go and reach, not which of the two.
    assert.equal(v.alternative?.productId, 'IDBI_SWEEP_001')
    assert.equal(v.alternative?.monthly, 5_000)
  })

  it('lets a product with no lock-in through on a thin buffer', () => {
    const v = evaluate({ product: INDEX, snapshot: thin, amount: 1_000, alternatives: SHELF })
    assert.equal(v.verdict, 'PASS')
  })

  it('blocks a ULIP even though its lock-in field says zero', () => {
    // The rule carves ULIP out by category rather than by lockInYears, so a ULIP mis-declared
    // as unlocked is still caught. Proving that needs a ULIP with lockInYears: 0.
    const unlocked = product({
      productId: 'INS_ULIP_BAD',
      category: 'ULIP',
      riskometer: 'High',
      lockInYears: 0,
      bundlesProtectionAndInvestment: true,
    })
    const v = evaluate({ product: unlocked, snapshot: thin, amount: 0, alternatives: SHELF })
    assert.equal(v.ruleId, 'EMERGENCY_BUFFER')
  })

  it('treats an unreadable outflow as below the floor, never above it', () => {
    // monthsCovered: null means the outflow could not be read. The gate may refuse more than
    // the truth and never less, so null must behave like a thin buffer rather than a fat one.
    const unreadable = snapshot({
      buffer: { monthsCovered: null, targetMonths: 6, shortfall: 0 },
    })
    const locked = product({ category: 'Fixed Deposit', riskometer: 'Low', lockInYears: 5 })
    assert.equal(
      evaluate({ product: locked, snapshot: unreadable, amount: 1_000, alternatives: SHELF })
        .ruleId,
      'EMERGENCY_BUFFER',
    )
  })

  it('exempts pure protection from the buffer floor', () => {
    assert.equal(
      evaluate({ product: TERM, snapshot: thin, amount: 0, alternatives: SHELF }).verdict,
      'PASS',
    )
  })
})

describe('RISK_CEILING', () => {
  it('caps a Conservative customer at Moderate and offers something within the ceiling', () => {
    const conservative = snapshot({ customer: { riskProfile: 'Conservative' } })
    const v = evaluate({
      product: INDEX,
      snapshot: conservative,
      amount: 1_000,
      alternatives: SHELF,
    })

    assert.equal(v.ruleId, 'RISK_CEILING')
    assert.match(v.recorded, /ceiling Moderate/)
    assert.ok(v.alternative, 'a refusal should name something the customer may hold')
    assert.notEqual(v.alternative?.productId, 'INS_ULIP_205')
  })

  it('lets a Balanced customer hold Very High, because SEBI rates every equity fund there', () => {
    const balanced = snapshot({ customer: { riskProfile: 'Balanced' } })
    assert.equal(
      evaluate({ product: INDEX, snapshot: balanced, amount: 1_000, alternatives: SHELF }).verdict,
      'PASS',
    )
  })
})

describe('VOLATILITY_VS_HORIZON', () => {
  it('blocks a market-linked product for a goal under three years away', () => {
    const v = evaluate({
      product: INDEX,
      snapshot: snapshot(),
      amount: 1_000,
      goal: { kind: 'wealth_target', horizonYears: 2 },
      alternatives: SHELF,
    })

    assert.equal(v.ruleId, 'VOLATILITY_VS_HORIZON')
    assert.equal(v.alternative?.productId, 'IDBI_RD_004')
  })

  it('allows the same product at exactly three years', () => {
    const v = evaluate({
      product: INDEX,
      snapshot: snapshot(),
      amount: 1_000,
      goal: { kind: 'wealth_target', horizonYears: 3 },
      alternatives: SHELF,
    })
    assert.equal(v.verdict, 'PASS')
  })

  it('does not touch a non-volatile product on a short horizon', () => {
    const rd = SHELF.find((p) => p.productId === 'IDBI_RD_004')!
    const v = evaluate({
      product: rd,
      snapshot: snapshot(),
      amount: 1_000,
      goal: { kind: 'emergency_fund', horizonYears: 1 },
      alternatives: SHELF,
    })
    assert.equal(v.verdict, 'PASS')
  })
})

describe('AFFORDABILITY', () => {
  it('checks a monthly amount against deployable surplus, not the raw surplus', () => {
    // 40,000 spare on a normal month, 12,000 of it held back for irregular costs.
    const provisioned = snapshot({
      surplus: { monthly: 40_000, deployable: 28_000 },
      irregular: { total: 144_000, monthlyRunRate: 12_000, monthlyProvision: 12_000 },
    })

    assert.equal(
      evaluate({ product: INDEX, snapshot: provisioned, amount: 28_000, alternatives: SHELF })
        .verdict,
      'PASS',
    )
    const over = evaluate({
      product: INDEX,
      snapshot: provisioned,
      amount: 30_000,
      alternatives: SHELF,
    })
    assert.equal(over.ruleId, 'AFFORDABILITY')
    assert.match(over.recorded, /28,000/)
  })

  it('reads a lump sum against the balance, less what the buffer is still short', () => {
    // The regression this cadence field exists for: an idle-cash sweep of ₹1,41,663 read as a
    // ₹1,41,663 monthly commitment and refused to every customer alive.
    const idle = snapshot({
      balances: { savings: 141_663, total: 141_663, idleFloor: 120_000 },
      surplus: { monthly: 4_000, deployable: 4_000 },
      buffer: { monthsCovered: 2, shortfall: 40_000 },
    })
    const sweep = SHELF.find((p) => p.productId === 'IDBI_SWEEP_001')!

    const asLump = evaluate({
      product: sweep,
      snapshot: idle,
      amount: 101_663,
      cadence: 'lump_sum',
      alternatives: SHELF,
    })
    assert.equal(asLump.verdict, 'PASS')

    // One rupee past the headroom (141,663 − 40,000) and it blocks.
    const tooMuch = evaluate({
      product: sweep,
      snapshot: idle,
      amount: 101_664,
      cadence: 'lump_sum',
      alternatives: SHELF,
    })
    assert.equal(tooMuch.ruleId, 'AFFORDABILITY')

    // And the same amount read as a monthly commitment is refused, which is the old behaviour
    // and is correct for a monthly cadence.
    assert.equal(
      evaluate({ product: sweep, snapshot: idle, amount: 101_663, alternatives: SHELF }).ruleId,
      'AFFORDABILITY',
    )
  })

  it('defaults an unstated cadence to monthly, the stricter of the two', () => {
    const idle = snapshot({
      balances: { savings: 500_000, total: 500_000 },
      surplus: { monthly: 4_000, deployable: 4_000 },
    })
    assert.equal(
      evaluate({ product: INDEX, snapshot: idle, amount: 100_000, alternatives: SHELF }).ruleId,
      'AFFORDABILITY',
    )
  })

  it('never refuses PMJJBY on affordability: ₹37 a month is not a decision', () => {
    const broke = snapshot({ surplus: { monthly: 0, deployable: 0 } })
    assert.equal(
      evaluate({ product: PMJJBY, snapshot: broke, amount: 37, alternatives: SHELF }).verdict,
      'PASS',
    )
  })

  it('substitutes a cheaper policy of the same cover type rather than leaving her uncovered', () => {
    const tight = snapshot({ surplus: { monthly: 500, deployable: 500 } })
    const v = evaluate({ product: TERM, snapshot: tight, amount: 1_200, alternatives: SHELF })

    assert.equal(v.ruleId, 'AFFORDABILITY')
    assert.equal(v.alternative?.productId, 'INS_PMJJBY_203')
  })

  it('will not offer accident cover as a substitute for life cover', () => {
    const accident = product({
      productId: 'INS_PA_210',
      name: 'Personal Accident',
      category: 'Government Insurance',
      minInvestment: 20,
      insuranceProduct: true,
      coverType: 'accident',
    })
    const tight = snapshot({ surplus: { monthly: 500, deployable: 500 } })
    const v = evaluate({
      product: TERM,
      snapshot: tight,
      amount: 1_200,
      // Cheaper than PMJJBY, but the wrong kind of cover, so it must not be picked.
      alternatives: [accident, TERM],
    })

    assert.equal(v.ruleId, 'AFFORDABILITY')
    assert.equal(v.alternative, null)
    assert.match(v.recorded, /Deferred rather than substituted/)
  })

  it('skips the rule entirely when the question is about the product, not an amount', () => {
    const broke = snapshot({ surplus: { monthly: 0, deployable: 0 } })
    assert.equal(
      evaluate({ product: INDEX, snapshot: broke, amount: 0, alternatives: SHELF }).verdict,
      'PASS',
    )
  })
})

describe('HORIZON_VS_LOCKIN', () => {
  // Not volatile and not tax-gated, so the lock-in is the only thing that can fire — and the
  // horizon is past the three-year volatility floor either way.
  const ppf = product({
    productId: 'IDBI_PPF_009',
    name: 'Public Provident Fund',
    category: 'PPF',
    riskometer: 'Low',
    minInvestment: 500,
    lockInYears: 15,
  })

  it('blocks a lock-in longer than the goal it is proposed for', () => {
    const v = evaluate({
      product: ppf,
      snapshot: snapshot(),
      amount: 500,
      goal: { kind: 'wealth_target', horizonYears: 5 },
      alternatives: SHELF,
    })

    assert.equal(v.ruleId, 'HORIZON_VS_LOCKIN')
    assert.match(v.recorded, /lock-in 15y exceeds goal horizon 5y/)
  })

  it('allows a lock-in exactly equal to the horizon', () => {
    const v = evaluate({
      product: ppf,
      snapshot: snapshot(),
      amount: 500,
      goal: { kind: 'retirement', horizonYears: 15 },
      alternatives: SHELF,
    })
    assert.equal(v.verdict, 'PASS')
  })

  it('does not fire when there is no goal to compare against', () => {
    const v = evaluate({ product: ppf, snapshot: snapshot(), amount: 500, alternatives: SHELF })
    assert.equal(v.verdict, 'PASS')
  })
})

describe('TAX_BENEFIT_UNAVAILABLE', () => {
  it('blocks ELSS on the new regime and offers the index fund instead', () => {
    const v = evaluate({
      product: ELSS,
      snapshot: snapshot({ customer: { taxRegime: 'new' } }),
      amount: 500,
      alternatives: SHELF,
    })

    assert.equal(v.ruleId, 'TAX_BENEFIT_UNAVAILABLE')
    assert.equal(v.alternative?.productId, 'MF_INDEX_103')
  })

  it('lets ELSS through on the old regime, where the trade is at least arguable', () => {
    const v = evaluate({
      product: ELSS,
      snapshot: snapshot({ customer: { taxRegime: 'old' } }),
      amount: 500,
      alternatives: SHELF,
    })
    assert.equal(v.verdict, 'PASS')
  })
})

describe('BUNDLED_PROTECTION', () => {
  it('refuses a ULIP priced at more than twice the term alternative', () => {
    // 5,000 against a 1,200 term premium is 4.2x.
    const v = evaluate({ product: ULIP, snapshot: snapshot(), amount: 0, alternatives: SHELF })

    assert.equal(v.ruleId, 'BUNDLED_PROTECTION')
    assert.equal(v.alternative?.productId, 'INS_TERM_201')
    assert.match(v.recorded, /4\.2x/)
  })

  it('does not fire below the 2x ratio', () => {
    const modest = product({
      productId: 'INS_ULIP_CHEAP',
      category: 'ULIP',
      riskometer: 'High',
      minInvestment: 2_000,
      bundlesProtectionAndInvestment: true,
    })
    const v = evaluate({ product: modest, snapshot: snapshot(), amount: 0, alternatives: SHELF })
    assert.equal(v.verdict, 'PASS')
  })

  it('does not fire with no term policy on the shelf to compare against', () => {
    const v = evaluate({
      product: ULIP,
      snapshot: snapshot(),
      amount: 0,
      alternatives: SHELF.filter((p) => p.category !== 'Term Insurance'),
    })
    assert.equal(v.verdict, 'PASS')
  })
})

describe('ordering', () => {
  it('reports the earliest failing rule, so the most fundamental objection wins', () => {
    // Every rule below HIGH_INTEREST_DEBT would also fire: no buffer, Conservative profile, a
    // short horizon, nothing spare. The customer hears about the card.
    const everythingWrong = snapshot({
      customer: { riskProfile: 'Conservative' },
      debt: {
        total: 186_000,
        hasHighInterest: true,
        highInterestTotal: 186_000,
        highestRate: 34.8,
      },
      buffer: { monthsCovered: 0, shortfall: 180_000 },
      surplus: { monthly: 0, deployable: 0 },
    })
    const v = evaluate({
      product: ULIP,
      snapshot: everythingWrong,
      amount: 5_000,
      goal: { kind: 'wealth_target', horizonYears: 1 },
      alternatives: SHELF,
    })

    assert.equal(v.ruleId, 'HIGH_INTEREST_DEBT')
    assert.deepEqual(v.passed, [])
  })

  it('records the rules cleared before the failure', () => {
    const conservative = snapshot({ customer: { riskProfile: 'Conservative' } })
    const v = evaluate({
      product: INDEX,
      snapshot: conservative,
      amount: 1_000,
      alternatives: SHELF,
    })

    assert.equal(v.ruleId, 'RISK_CEILING')
    assert.deepEqual(v.passed, ['HIGH_INTEREST_DEBT', 'MISSED_REPAYMENT', 'EMERGENCY_BUFFER'])
  })
})

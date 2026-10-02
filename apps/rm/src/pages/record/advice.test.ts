import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluate, type Product, type Snapshot } from '@dhan/core'
import { detailWords } from '../access/actions.ts'
import {
  RULES,
  RULE_COUNT,
  VERDICT_WORDS,
  isGenesis,
  ladder,
  refusedStake,
  ruleIndex,
  shortHash,
  verdictSplit,
} from './advice.ts'

test('the rule book is the engine’s, in its order, each with a short name', () => {
  assert.equal(RULE_COUNT, RULES.length)
  assert.ok(RULE_COUNT > 0)
  for (const rule of RULES) {
    assert.ok(rule.label.length > 0 && rule.label.length < rule.description.length, rule.id)
  }
  assert.equal(ruleIndex(RULES[0]?.id ?? ''), 1)
  assert.equal(ruleIndex('NOT_A_RULE'), null)
})

test('a refusal clears the rules before the one that failed, and reaches none after it', () => {
  const failing = RULES[3]?.id ?? ''
  const rungs = ladder({
    verdict: 'BLOCKED',
    ruleId: failing,
    rulesPassed: RULES.slice(0, 3).map((r) => r.id),
  })
  assert.deepEqual(
    rungs.map((r) => r.state),
    RULES.map((_, i) => (i < 3 ? 'passed' : i === 3 ? 'failed' : 'not_reached')),
  )
})

test('a PASS clears every rule; a product off the shelf was never put to them', () => {
  const all = RULES.map((r) => r.id)
  assert.ok(
    ladder({ verdict: 'PASS', ruleId: null, rulesPassed: all }).every((r) => r.state === 'passed'),
  )
  assert.ok(
    ladder({ verdict: 'UNKNOWN_PRODUCT', ruleId: null, rulesPassed: [] }).every(
      (r) => r.state === 'not_reached',
    ),
  )
})

test('hashes: eight digits short; sixty-four zeros start a chain', () => {
  const hash = 'aed054add2d76953bb4b2a708ce16f84ec237ea8480c9b6a41a24ce34b2faef3'
  assert.equal(shortHash(hash), 'aed054ad')
  assert.equal(isGenesis('0'.repeat(64)), true)
  assert.equal(isGenesis(hash), false)
})

test('an access-log field id reads as words; free text passes through', () => {
  assert.equal(detailWords('dateOfBirth'), 'Date of birth')
  assert.equal(detailWords('UTI Nifty 50 Index Fund'), 'UTI Nifty 50 Index Fund')
  assert.equal(detailWords('pan'), 'pan')
})

test('one word per verdict: a refusal is "Refused", never "BLOCKED"', () => {
  assert.equal(VERDICT_WORDS.BLOCKED, 'Refused')
  assert.deepEqual(
    verdictSplit([
      { verdict: 'BLOCKED' },
      { verdict: 'PASS' },
      { verdict: 'BLOCKED' },
      { verdict: 'UNKNOWN_PRODUCT' },
    ]),
    { refused: 2, passed: 1, other: 1 },
  )
})

test('the stake sums refused amounts from the record, monthly and one-off apart', () => {
  const stake = refusedStake([
    {
      verdict: 'BLOCKED',
      amount: 5000,
      recorded: 'Blocked: lock-in 15y exceeds goal horizon 11y.',
    },
    {
      verdict: 'BLOCKED',
      amount: 4200,
      recorded: 'Blocked: proposed ₹4,200/month exceeds deployable surplus ₹2,589',
    },
    {
      verdict: 'BLOCKED',
      amount: 300000,
      recorded: 'Blocked: one-off ₹3,00,000 exceeds reachable balance ₹1,20,000',
    },
    { verdict: 'BLOCKED', amount: null, recorded: 'Blocked: risk.' },
    { verdict: 'PASS', amount: 9000, recorded: 'Pass.' },
  ])
  assert.deepEqual(stake, { monthly: 9200, oneOff: 300000, counted: 3 })
})

/*
 * `refusedStake` tells a one-off from a monthly amount only by the gate's recorded wording. These
 * run the real gate (`evaluate`, the same function the API judges with), so a change to that
 * wording fails here instead of quietly moving a one-off into the headline's monthly sum.
 */

/** The least of a snapshot the gate reads to reach AFFORDABILITY: no debt, a full buffer. */
const SNAPSHOT = {
  debt: { hasHighInterest: false, missedRepayment: false, highestRate: 0, highInterestTotal: 0 },
  buffer: { monthsCovered: 6, shortfall: 0 },
  customer: { riskProfile: 'Growth', taxRegime: 'new' },
  balances: { total: 1_20_000 },
  surplus: { deployable: 2_589, monthly: 2_589 },
  irregular: { monthlyProvision: 0 },
} as unknown as Snapshot

const SWEEP_IN: Product = {
  productId: 'IDBI_SWEEP_FD',
  name: 'IDBI Sweep-in Fixed Deposit',
  category: 'Sweep-in FD',
  riskometer: 'Low',
  minInvestment: 1_000,
  lockInYears: 0,
  transactable: true,
  manufacturer: 'IDBI Bank',
}

function refused(amount: number, cadence: 'monthly' | 'lump_sum') {
  const verdict = evaluate({ product: SWEEP_IN, snapshot: SNAPSHOT, amount, cadence })
  assert.equal(verdict.verdict, 'BLOCKED')
  assert.equal(verdict.ruleId, 'AFFORDABILITY')
  return { verdict: 'BLOCKED' as const, amount, recorded: verdict.recorded }
}

test('the gate’s own wording sorts a one-off from a monthly amount', () => {
  const oneOff = refused(3_00_000, 'lump_sum')
  const monthly = refused(4_200, 'monthly')
  assert.deepEqual(refusedStake([oneOff, monthly]), {
    monthly: 4_200,
    oneOff: 3_00_000,
    counted: 2,
  })
})

test('a refusal that does not say "one-off" counts as monthly, the gate’s default cadence', () => {
  // A rule before affordability says nothing about cadence; the gate reads amounts as monthly
  // unless told otherwise, and so does the sum, until the record carries a cadence field.
  assert.deepEqual(
    refusedStake([
      {
        verdict: 'BLOCKED',
        amount: 8_000,
        recorded: 'Blocked: lock-in 15y exceeds goal horizon 5y.',
      },
      {
        verdict: 'BLOCKED',
        amount: 20_000,
        recorded:
          'Blocked: product riskometer Very High exceeds ceiling Moderate for a Conservative profile.',
      },
    ]),
    { monthly: 28_000, oneOff: 0, counted: 2 },
  )
})

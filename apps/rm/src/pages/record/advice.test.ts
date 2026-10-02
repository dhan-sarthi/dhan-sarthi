import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detailWords } from '../access/actions.ts'
import { RULES, RULE_COUNT, isGenesis, ladder, ruleIndex, shortHash } from './advice.ts'

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

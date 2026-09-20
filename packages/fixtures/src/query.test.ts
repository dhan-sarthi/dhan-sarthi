/**
 * The question router against Rohan's real ledger.
 *
 * Here rather than in `@dhan/core` because the answers quote merchants, and a merchant only
 * exists once a generator has written a narration for the categoriser to read. Which *handler*
 * a question reaches, and what the opening line refuses to invent, are pinned against literals
 * in `@dhan/core/src/query.test.ts`. See CONTRIBUTING.md under "Where tests live".
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  answer,
  buildDailyPlan,
  buildRoadmap,
  derive,
  suggestGoal,
  suggestedQuestions,
} from '@dhan/core'
import { PRODUCT_SHELF, generateCustomerFile, personaBySlug } from './index.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

function rohan() {
  const file = generateCustomerFile(personaBySlug('rohan'), OPTS)
  return { file, snapshot: derive(file, ASOF) }
}

/** Today as the API builds it: goal → roadmap → daily plan over the same snapshot. */
function today() {
  const { file, snapshot } = rohan()
  const goal = suggestGoal(snapshot, ASOF, null)
  const roadmap = buildRoadmap(snapshot, goal, PRODUCT_SHELF, ASOF)
  const plan = buildDailyPlan(snapshot, roadmap, file.transactions, PRODUCT_SHELF, ASOF, {
    lastSeen: '2026-08-26',
    caps: [],
    horizonYears: Math.max(5, 60 - snapshot.customer.age),
  })
  return { file, snapshot, plan }
}

describe('the deterministic question router', () => {
  it('answers every question it suggests with the handler that question is about', () => {
    const { file, snapshot } = rohan()
    for (const q of suggestedQuestions(snapshot)) {
      const a = answer(q, snapshot, file)
      assert.ok(a.matched, `unmatched: ${q}`)
      assert.doesNotMatch(a.text, /on everything in/i, q)
    }
  })

  it('routes "safely spend" to the envelope, not to total spending', () => {
    const { file, snapshot } = rohan()
    const a = answer('What can I safely spend today?', snapshot, file)
    // Both branches of the handler, by what they say rather than by one word of it: the
    // plan branch quotes a per-day figure, the fallback quotes the month after commitments.
    // This matched on "envelope" until that word was cut from the copy for being jargon —
    // the customer does not have an envelope, they have money left for the month.
    assert.match(a.text, /a day|left to spend|after everything committed/i)
    assert.doesNotMatch(a.text, /on everything in/i)
  })

  it('routes "what are my subscriptions costing me" to the subscription list', () => {
    const { file, snapshot } = rohan()
    const a = answer('What are my subscriptions costing me?', snapshot, file)
    assert.match(a.text, /Netflix|Cult|Spotify/)
    assert.doesNotMatch(a.text, /on everything in/i)
  })
})

describe('safe to spend, in text and on Today', () => {
  it('quotes the same pot and per-day figure the daily plan shows', () => {
    const { file, snapshot, plan } = today()
    const s = plan.safeToSpend
    const a = answer('What can I safely spend today?', snapshot, file, { safeToSpend: s })

    assert.ok(a.matched)
    assert.ok(a.text.includes(inr(s.pot)), `${a.text} should quote the pot ${inr(s.pot)}`)
    assert.ok(a.text.includes(inr(s.perDay)), `${a.text} should quote ${inr(s.perDay)} a day`)
    assert.ok(a.evidence.some((e) => e.includes(inr(s.pot))))

    // The pot is the envelope less the plan's commitment and this month's spending — a
    // different number from income minus commitments, which is what the text used to quote.
    const envelope = snapshot.income.monthly - snapshot.commitments.total
    assert.notEqual(s.pot, envelope)
    assert.ok(!a.text.includes(inr(envelope)), `${a.text} must not quote the bare envelope`)
  })

  it('falls back to the envelope for a caller without a plan', () => {
    const { file, snapshot } = rohan()
    const envelope = snapshot.income.monthly - snapshot.commitments.total
    const a = answer('What can I safely spend today?', snapshot, file)
    assert.ok(a.text.includes(inr(envelope)))
  })
})

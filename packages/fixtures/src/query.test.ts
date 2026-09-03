import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { answer, derive, suggestedQuestions } from '@dhan/core'
import { generateCustomerFile, personaBySlug } from './index.ts'

const ASOF = '2026-09-01'
const OPTS = { anchor: ASOF, asOf: ASOF, months: 24 }

function rohan() {
  const file = generateCustomerFile(personaBySlug('rohan'), OPTS)
  return { file, snapshot: derive(file, ASOF) }
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
    assert.match(a.text, /envelope|a day|left/i)
    assert.doesNotMatch(a.text, /on everything in/i)
  })

  it('routes "what are my subscriptions costing me" to the subscription list', () => {
    const { file, snapshot } = rohan()
    const a = answer('What are my subscriptions costing me?', snapshot, file)
    assert.match(a.text, /Netflix|Cult|Spotify/)
    assert.doesNotMatch(a.text, /on everything in/i)
  })
})

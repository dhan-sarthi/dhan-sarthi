/**
 * The text tier with a model in it, and the line the model is not allowed to cross.
 *
 * The claim these tests hold is narrow and is the whole thing: a language model may rewrite the
 * sentence and may not touch anything else. The figures, the evidence, `matched`, and the
 * verdict on any product named all come from code that ran before the completion was asked
 * for, and they come back unchanged whatever the model said — including when it said nothing,
 * which is the case that decides whether this is an enhancement or a dependency.
 *
 * The fake records the messages it was given, so the prompt itself is asserted on rather than
 * trusted: a prompt that stops carrying the suitability sentence is a compliance regression
 * that no amount of output-checking would catch.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Answer, RecordView } from '@dhan/contracts'
import type { ChatMessage, LanguageModelPort } from '../../src/ports/index.ts'
import { ROHAN_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'

/** A model that says whatever it is told to, and keeps what it was asked. */
class FakeModel implements LanguageModelPort {
  readonly name = 'fake'
  readonly live = true
  readonly calls: ChatMessage[][] = []
  private readonly reply: string | null

  constructor(reply: string | null) {
    this.reply = reply
  }

  async complete(messages: readonly ChatMessage[]): Promise<string | null> {
    this.calls.push([...messages])
    return this.reply
  }
}

async function ask(
  model: LanguageModelPort,
  question: string,
  history: { role: 'user' | 'assistant'; text: string }[] = [],
): Promise<{ answer: Answer; record: () => Promise<RecordView> }> {
  const root = await makeRoot({ deps: { model } })
  const { token } = await createSession(root.app, ROHAN_CIF)
  const res = await root.app.inject({
    method: 'POST',
    url: '/api/v1/ask',
    headers: bearer(token),
    payload: { question, history },
  })
  assert.equal(res.statusCode, 200, res.body)
  const answer = res.json<Answer>()
  return {
    answer,
    record: async () => {
      const rec = await root.app.inject({
        method: 'GET',
        url: '/api/v1/record',
        headers: bearer(token),
      })
      assert.equal(rec.statusCode, 200, rec.body)
      return rec.json<RecordView>()
    },
  }
}

const systemOf = (model: FakeModel): string => model.calls[0]?.[0]?.content ?? ''
const materialOf = (model: FakeModel): string => {
  const messages = model.calls[0] ?? []
  return messages[messages.length - 1]?.content ?? ''
}

describe('the text tier with no model', () => {
  it('answers from the rules and says so', async () => {
    const root = await makeRoot()
    const { token } = await createSession(root.app, ROHAN_CIF)
    const res = await root.app.inject({
      method: 'POST',
      url: '/api/v1/ask',
      headers: bearer(token),
      payload: { question: 'How much did I spend on food last month?' },
    })
    assert.equal(res.statusCode, 200, res.body)
    const answer = res.json<Answer>()
    assert.equal(answer.phrasedBy, 'rules')
    assert.equal(answer.matched, true)
    assert.ok(answer.evidence.length > 0)
    // The figure, not a paraphrase of one: this is the tier that runs with no key.
    assert.match(answer.text, /₹/)
  })
})

describe('the text tier with a model', () => {
  it('takes the model’s sentence and keeps the engine’s evidence', async () => {
    const model = new FakeModel('You spent about that much on food, Rohan.')
    const { answer } = await ask(model, 'How much did I spend on food last month?')

    assert.equal(answer.text, 'You spent about that much on food, Rohan.')
    assert.equal(answer.phrasedBy, 'model')
    // `matched` and the receipts are the engine's finding, not the model's, and the screen
    // prints them under the answer. A rewrite must not be able to move them.
    assert.equal(answer.matched, true)
    // On the date range the engine actually read, not on the word in front of it: this
    // asserted `startsWith('Window ')` and broke when that label became "Looked at" in a
    // copy pass. What must survive the rewrite is the receipt, not its wording.
    assert.ok(
      answer.evidence.some((e) => /\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/.test(e)),
      answer.evidence.join(' | '),
    )
  })

  it('falls back to the rules when the completion fails', async () => {
    const model = new FakeModel(null)
    const { answer } = await ask(model, 'How much did I spend on food last month?')

    assert.equal(answer.phrasedBy, 'rules')
    assert.match(answer.text, /₹/)
    assert.ok(answer.evidence.length > 0)
  })

  it('gives the model the figures and never the ledger', async () => {
    const model = new FakeModel('ok')
    await ask(model, 'How much did I spend on food last month?')

    const system = systemOf(model)
    assert.match(system, /You are Uday/)
    assert.match(system, /WHAT I KNOW/)
    // The instruction that the rest of this file's guarantees rest on.
    assert.match(system, /Do not add, subtract, scale, annualise or round any\s+number yourself/)
    assert.match(materialOf(model), /THIS ANSWER/)
  })

  it('carries the prior turns, so a follow-up has something to follow', async () => {
    const model = new FakeModel('ok')
    await ask(model, 'And the month before that?', [
      { role: 'user', text: 'How much did I spend on food last month?' },
      { role: 'assistant', text: '₹7,655 on food & dining in August 2026.' },
    ])

    const roles = (model.calls[0] ?? []).map((m) => m.role)
    assert.deepEqual(roles, ['system', 'user', 'assistant', 'user'])
  })

  it('tells the model it was not understood rather than letting it guess', async () => {
    const model = new FakeModel('ok')
    const { answer } = await ask(model, 'zxcv qwerty asdf')

    assert.equal(answer.matched, false)
    assert.match(materialOf(model), /The rules did not recognise this question/)
  })
})

describe('the suitability gate in front of the model', () => {
  it('decides a product the customer typed, and hands the model the sentence', async () => {
    const model = new FakeModel('No, and here is why.')
    const { answer, record } = await ask(model, 'My cousin says I should take a LIC ULIP')

    const material = materialOf(model)
    assert.match(material, /SUITABILITY VERDICT/)
    assert.match(material, /BLOCKED/)
    assert.match(material, /Say this, close to word for word/)

    // The verdict is on the record before the sentence was written, and the reason the rules
    // recorded is the first thing under the answer.
    const rec = await record()
    const written = rec.adviceRecords.filter((r) => r.source === 'text')
    assert.equal(written.length, 1, JSON.stringify(written))
    assert.equal(written[0]?.verdict, 'BLOCKED')
    assert.equal(answer.evidence[0], written[0]?.recorded)
  })

  it('speaks the rules’ own refusal when the completion fails', async () => {
    const model = new FakeModel(null)
    const { answer, record } = await ask(model, 'My cousin says I should take a LIC ULIP')

    // Not the engine's own sentence about ULIPs in general: a refusal that was computed and
    // recorded for this customer is the one that has to be read out.
    const written = (await record()).adviceRecords.find((r) => r.source === 'text')
    assert.equal(answer.phrasedBy, 'rules')
    assert.equal(answer.text, written?.spoken)
  })

  it('runs no gate and writes no record when no product is named', async () => {
    const model = new FakeModel('ok')
    const { answer, record } = await ask(model, 'How much did I spend on food last month?')

    assert.doesNotMatch(materialOf(model), /SUITABILITY VERDICT/)
    assert.equal((await record()).adviceRecords.filter((r) => r.source === 'text').length, 0)
    assert.ok(answer.evidence.length > 0)
  })
})

/**
 * The RM copilot: the facts, the guard on a model's sentences, the rules that answer when the
 * model does not, and the promise that a product question is judged by the rules and leaves no
 * mark on the customer's record.
 *
 * The model is a fake injected through `deps.copilotModel`, scripted per test. It reads the
 * numbered facts out of the prompt it is sent, so its sentences cite real ids and quote real
 * figures, and each test then breaks exactly one thing: a figure it invented, an id that does
 * not exist, a refused product it puts forward.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { evaluate } from '@dhan/core'
import { ALL_PERSONAS } from '@dhan/fixtures'
import type { AdviceItem, Handoff, JourneyEvent, RmAnswer, RmBrief } from '@dhan/contracts'
import { FixedClock } from '../../src/adapters/clock/fixed-clock.ts'
import { InMemoryAuditStore } from '../../src/adapters/memory/audit-store.memory.ts'
import { NO_ACTIVITY } from '../../src/application/rm/activity.service.ts'
import { factSheet, withVerdict } from '../../src/application/rm/copilot.facts.ts'
import type { CopilotRecord } from '../../src/application/rm/copilot.facts.ts'
import {
  dropReason,
  figuresIn,
  parseLine,
  unsupportedFigures,
} from '../../src/application/rm/copilot.guard.ts'
import { BRIEF_SECTIONS } from '../../src/application/rm/copilot.prompt.ts'
import {
  productCheck,
  rulesAnswer,
  rulesBrief,
  suggestedPrompts,
} from '../../src/application/rm/copilot.rules.ts'
import type { CustomerState } from '../../src/application/rm/customer-state.ts'
import type { AuditStore, ChatMessage, LanguageModelPort } from '../../src/ports/index.ts'
import {
  ARJUN,
  KARAN_CIF,
  MEERA,
  ROHAN_CIF,
  bearer,
  createSession,
  makeRoot,
  signInRm,
} from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const MEERA_ID = 'rm-204117'

/* ------------------------------------------------------------------ *
 * A scripted model
 * ------------------------------------------------------------------ */

type Reply = (messages: readonly ChatMessage[]) => string | null

class FakeModel implements LanguageModelPort {
  readonly name = 'fake:copilot'
  readonly live = true
  calls: ChatMessage[][] = []
  reply: Reply = () => null
  throws = false

  async complete(messages: readonly ChatMessage[]): Promise<string | null> {
    this.calls.push([...messages])
    if (this.throws) throw new Error('fake model failure')
    return this.reply(messages)
  }
}

/** The numbered facts in a prompt, id to text, wherever the prompt put them. */
function factsIn(messages: readonly ChatMessage[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of messages) {
    for (const match of m.content.matchAll(/^(F\d+)\. (.*)$/gm)) {
      out.set(match[1] ?? '', match[2] ?? '')
    }
  }
  return out
}

/** The id of the first fact containing `needle`; fails the test where there is none. */
function idOf(messages: readonly ChatMessage[], needle: string): string {
  for (const [id, text] of factsIn(messages)) if (text.includes(needle)) return id
  throw new Error(`no fact contains "${needle}"`)
}

/* ------------------------------------------------------------------ *
 * The guard, over literals
 * ------------------------------------------------------------------ */

const fact = (id: string, text: string) => ({
  id,
  text,
  source: { kind: 'snapshot' as const, ref: null },
})

describe('the copilot guard', () => {
  it('reads a cited line into its sentence and ids, wherever the brackets sit', () => {
    assert.deepEqual(parseLine("Karan's card is at 34.8%. [F6]"), {
      text: "Karan's card is at 34.8%.",
      cites: ['F6'],
    })
    assert.deepEqual(parseLine('- **Start with the card** [F6, F13]'), {
      text: 'Start with the card.',
      cites: ['F6', 'F13'],
    })
    assert.deepEqual(parseLine('The card [F6] and the loan [F5].'), {
      text: 'The card and the loan.',
      cites: ['F6', 'F5'],
    })
    assert.deepEqual(parseLine('No citation at all.').cites, [])
  })

  it('compares figures by value, so grouping is free and rounding is not', () => {
    const facts = [
      fact('F1', 'Cover of ₹2,00,000 and ₹1,86,240 on a card at 34.8%; ten times income.'),
    ]
    assert.deepEqual(unsupportedFigures('₹2 lakh of cover.', facts), [])
    assert.deepEqual(unsupportedFigures('₹186,240 at 34.8%.', facts), [])
    assert.deepEqual(unsupportedFigures('Ten times income.', facts), [])
    assert.deepEqual(unsupportedFigures('About ₹1.86L outstanding.', facts), ['₹1.86L'])
    assert.deepEqual(unsupportedFigures('Clear it in three months.', facts), ['three'])
    assert.deepEqual(unsupportedFigures('Roughly 35% a year.', facts), ['35'])
    assert.deepEqual(unsupportedFigures('Half the card.', facts), ['half'])
    // A unit has to end its word: "5 kids" is five, not five thousand.
    assert.deepEqual(
      figuresIn('5 kids').map((f) => f.value),
      [5],
    )
  })

  it('drops an unknown id, an uncited line, a banned word and a refused product put forward', async () => {
    const root = await makeRoot()
    try {
      const state = await root.rm.book.state(KARAN_CIF)
      const sheet = factSheet(state, emptyRecord())
      const ctx = { facts: sheet.facts, state }
      const card = sheet.index.loans.find((l) => l.of.ratePct >= 24)
      assert.ok(card, 'Karan carries a card above 24%')
      const ulip = state.shelf.find((p) => p.productId === 'LIC_ULIP_401')
      assert.ok(ulip)
      const refused = sheet.facts.length + 1
      const withUlip = [...sheet.facts, fact(`F${refused}`, `The rules refuse ${ulip.name}.`)]

      assert.equal(dropReason({ text: 'The card first.', cites: [] }, ctx), 'uncited')
      assert.equal(dropReason({ text: 'The card first.', cites: ['F999'] }, ctx), 'unknown_fact')
      assert.equal(
        dropReason({ text: 'Mind the deployable surplus.', cites: [card.id] }, ctx),
        'banned_word',
      )
      assert.equal(
        dropReason({ text: `Suggest ${ulip.name} to Karan.`, cites: [card.id] }, ctx),
        'product_not_in_facts',
      )
      assert.equal(
        dropReason(
          { text: `Karan should start ${ulip.name}.`, cites: [`F${refused}`] },
          { facts: withUlip, state },
        ),
        'refused_product_put_forward',
      )
      assert.equal(
        dropReason(
          { text: `Do not offer ${ulip.name} until the card is cleared.`, cites: [`F${refused}`] },
          { facts: withUlip, state },
        ),
        null,
      )
    } finally {
      await root.close()
    }
  })
})

/* ------------------------------------------------------------------ *
 * The facts and the rules, over the whole population
 * ------------------------------------------------------------------ */

function emptyRecord(): CopilotRecord {
  return { activity: NO_ACTIVITY, handoffs: [], refusals: [], journey: [] }
}

/** A record with one of everything the activity side can report, for the branches that read it. */
function busyRecord(state: CustomerState): CopilotRecord {
  const cif = state.cif
  const name = state.file.customer.custName
  const refusal: AdviceItem = {
    id: '00000000-0000-4000-8000-000000000001',
    at: '2026-06-12',
    cif,
    name,
    productId: 'LIC_ULIP_401',
    productName: 'LIC Market Plus ULIP',
    amount: 5000,
    source: 'text',
    verdict: 'BLOCKED',
    ruleId: 'BUNDLED_PROTECTION',
    rulesPassed: [],
    spoken:
      'Not this one. Cover and investment work better apart: ₹985 a month buys ₹1 crore of term cover.',
    recorded: 'Blocked: bundled protection.',
    hash: 'a'.repeat(64),
    prevHash: '0'.repeat(64),
  }
  const handoff: Handoff = {
    id: 'decision-handoff-1',
    cif,
    name,
    requestedOn: '2026-08-29',
    waitingDays: 3,
    status: 'open',
    reason: 'Talk to your relationship manager',
    context: ['Asked after reading the card signal'],
    note: null,
  }
  const event = (
    id: string,
    at: string,
    kind: JourneyEvent['kind'],
    source: JourneyEvent['source'],
    title: string,
  ): JourneyEvent => ({
    id,
    at,
    kind,
    source,
    title,
    detail: null,
    diff: null,
    verdict: null,
    ruleId: null,
    amount: null,
  })
  return {
    activity: {
      ...NO_ACTIVITY,
      lastActivityAt: '2026-08-29',
      refusals: 1,
      openHandoff: true,
      udayCalls: 2,
      lastCallAt: '2026-08-20T10:00:00.000Z',
    },
    handoffs: [handoff],
    refusals: [refusal],
    journey: [
      event('d1', '2026-08-02', 'decision', 'customer', 'Accepted: check the subscriptions'),
      event('c1', '2026-07-15', 'call', 'rm', 'Call logged by Meera Joshi'),
    ],
  }
}

describe('the copilot without a model', () => {
  let root: TestRoot
  let states: CustomerState[]

  before(async () => {
    root = await makeRoot()
    states = await root.rm.book.states(ALL_PERSONAS.map((p) => p.customer.cif))
  })
  after(() => root.close())

  it('numbers the same record the same way every time', () => {
    for (const state of states.slice(0, 5)) {
      const a = factSheet(state, busyRecord(state))
      const b = factSheet(state, busyRecord(state))
      assert.deepEqual(a.facts, b.facts)
      assert.deepEqual(
        a.facts.map((f) => f.id),
        a.facts.map((_, i) => `F${i + 1}`),
      )
    }
  })

  it('writes a brief for every customer that passes the guard a model is held to', () => {
    assert.equal(states.length, ALL_PERSONAS.length)
    for (const state of states) {
      for (const record of [emptyRecord(), busyRecord(state)]) {
        const sheet = factSheet(state, record)
        const brief = rulesBrief(state, sheet)
        assert.deepEqual(
          brief.map((p) => p.title),
          [...BRIEF_SECTIONS],
        )
        for (const part of brief) {
          assert.ok(part.sentences.length > 0, `${state.cif}: "${part.title}" is empty`)
          for (const s of part.sentences) {
            assert.equal(
              dropReason(s, { facts: sheet.facts, state }),
              null,
              `${state.cif} "${part.title}": ${s.text} [${s.cites.join(', ')}]`,
            )
          }
        }
      }
    }
  })

  it('suggests four to six questions per customer, each of which the rules can answer', () => {
    const seen = new Set<string>()
    for (const state of states) {
      const sheet = factSheet(state, busyRecord(state))
      const prompts = suggestedPrompts(state, { refusals: 1, openHandoff: true })
      assert.ok(prompts.length >= 4 && prompts.length <= 6, `${state.cif}: ${prompts.length}`)
      seen.add(prompts.join('|'))
      for (const q of prompts) {
        // As the service does: a question naming a product carries the rules' check with it.
        const gate = productCheck(q, state)
        const checked =
          gate === null
            ? null
            : withVerdict(sheet, { productName: gate.product.name, ...gate.verdict })
        const answer = rulesAnswer(
          q,
          checked?.sheet ?? sheet,
          gate === null || checked === null
            ? null
            : { factId: checked.id, productId: gate.product.productId },
        )
        assert.ok(
          answer.some((s) => s.cites.length > 0) &&
            !answer[0]?.text.startsWith('The record does not'),
          `${state.cif}: "${q}" has no answer on file`,
        )
      }
    }
    assert.ok(seen.size > states.length / 2, 'the suggestions follow each customer’s own record')
  })

  it('asks about a refusal or a request only where the record has one', () => {
    const karan = states.find((s) => s.cif === KARAN_CIF)
    assert.ok(karan)
    const quiet = suggestedPrompts(karan)
    const busy = suggestedPrompts(karan, { refusals: 2, openHandoff: true })
    assert.ok(!quiet.some((q) => /refused|ask to talk/.test(q)), quiet.join(' | '))
    assert.ok(
      busy.some((q) => q.includes('refused')),
      busy.join(' | '),
    )
    assert.ok(
      busy.some((q) => q.includes('ask to talk')),
      busy.join(' | '),
    )
    assert.ok(quiet.every((q) => q.includes('Karan')))
  })

  it('says plainly when the record does not answer a question', () => {
    const karan = states.find((s) => s.cif === KARAN_CIF)
    assert.ok(karan)
    const answer = rulesAnswer(
      'What is his favourite colour?',
      factSheet(karan, emptyRecord()),
      null,
    )
    assert.equal(answer[0]?.text, 'The record does not answer that directly.')
  })
})

/* ------------------------------------------------------------------ *
 * Over HTTP, with the fake model
 * ------------------------------------------------------------------ */

describe('the copilot routes', () => {
  let root: TestRoot
  let meera: string
  let arjun: string
  const model = new FakeModel()
  let appended = 0

  /** Every advice record anyone appends, counted, so "no record" is measured rather than assumed. */
  function counting(store: AuditStore): AuditStore {
    return new Proxy(store, {
      get(target, prop, receiver) {
        const value: unknown = Reflect.get(target, prop, receiver)
        if (typeof value !== 'function') return value
        if (prop === 'appendAdvice') {
          return (...args: unknown[]) => {
            appended += 1
            return (value as (...a: unknown[]) => unknown).apply(target, args)
          }
        }
        return value.bind(target)
      },
    })
  }

  before(async () => {
    const clock = new FixedClock('2026-09-03T09:00:00.000Z')
    root = await makeRoot({
      deps: { clock, copilotModel: model, audit: counting(new InMemoryAuditStore(clock)) },
    })
    meera = (await signInRm(root.app, MEERA)).token
    arjun = (await signInRm(root.app, ARJUN)).token
  })
  after(() => root.close())
  beforeEach(() => {
    model.calls = []
    model.reply = () => null
    model.throws = false
  })

  const brief = async (cif = KARAN_CIF, token = meera) => {
    const res = await root.app.inject({
      method: 'POST',
      url: `/api/v1/rm/customers/${cif}/brief`,
      headers: bearer(token),
    })
    return { status: res.statusCode, body: res.json<RmBrief>() }
  }
  const ask = async (question: string, cif = KARAN_CIF, token = meera) => {
    const res = await root.app.inject({
      method: 'POST',
      url: `/api/v1/rm/customers/${cif}/ask`,
      headers: bearer(token),
      payload: { question },
    })
    return { status: res.statusCode, body: res.json<RmAnswer>() }
  }
  const accessLog = () => root.deps.rmActivity.listAccess(MEERA_ID, 200)

  it('keeps the model’s cited sentences and drops an invented figure and an unknown id', async () => {
    model.reply = (m) => {
      const card = idOf(m, 'credit card has')
      const cover = idOf(m, 'of life cover against')
      const contact = idOf(m, 'No RM contact')
      const plan = idOf(m, 'plan has')
      return [
        'SINCE THE LAST CONTACT',
        `No RM contact with Karan is on record. [${contact}]`,
        'TALK ABOUT',
        `Karan's credit card has ₹1,86,240 outstanding at 34.8%. [${card}]`,
        `The card is costing Karan ₹9,99,999 a year. [${card}]`,
        `Karan is ₹2,27,70,000 short on life cover. [${cover}]`,
        '**BE CAREFUL ABOUT**',
        `The rules hold back every investment until the card is cleared. [${card}]`,
        'Do not raise anything new before the plan review. [F999]',
        '## They may ask',
        `Karan may ask how the plan is staged. [${plan}]`,
      ].join('\n')
    }
    const { status, body } = await brief()
    assert.equal(status, 200)
    assert.equal(body.phrasedBy, 'model')
    assert.equal(model.calls.length, 1)
    const texts = body.sections.flatMap((s) => s.sentences.map((x) => x.text))
    assert.ok(texts.includes("Karan's credit card has ₹1,86,240 outstanding at 34.8%."))
    assert.ok(!texts.some((t) => t.includes('9,99,999')), 'the invented figure is gone')
    assert.ok(!texts.some((t) => t.includes('plan review')), 'the unknown id is gone')
    const ids = new Set(body.facts.map((f) => f.id))
    for (const s of body.sections.flatMap((p) => p.sentences)) {
      assert.ok(s.cites.length > 0 && s.cites.every((c) => ids.has(c)), s.text)
    }
    assert.deepEqual(
      body.sections.map((s) => s.title),
      [...BRIEF_SECTIONS],
    )
  })

  it('sends the model the facts and the rules, and no figure it could not cite', async () => {
    await brief()
    const [system, user] = model.calls[0] ?? []
    assert.equal(system?.role, 'system')
    assert.match(system?.content ?? '', /Never calculate/)
    assert.match(system?.content ?? '', /never decide whether a product suits/i)
    assert.match(user?.content ?? '', /^FACTS ABOUT KARAN DESHPANDE, AS AT 1 SEP 2026:/)
    const { body } = await brief()
    assert.equal(factsIn(model.calls[1] ?? []).size, body.facts.length)
  })

  for (const [label, setup] of [
    ['returns nothing', (m: FakeModel) => (m.reply = () => null)],
    [
      'returns prose with no citations',
      (m: FakeModel) => (m.reply = () => 'Karan is doing fine.\nCall him.'),
    ],
    ['throws', (m: FakeModel) => (m.throws = true)],
    [
      'keeps too few sentences',
      (m: FakeModel) =>
        (m.reply = (msgs) => `TALK ABOUT\nThe card first. [${idOf(msgs, 'credit card has')}]`),
    ],
  ] as const) {
    it(`falls back to the rules' brief when the model ${label}`, async () => {
      setup(model)
      const { status, body } = await brief()
      assert.equal(status, 200)
      assert.equal(body.phrasedBy, 'rules')
      assert.equal(body.sections.length, 4)
      assert.ok(body.sections.every((s) => s.sentences.length > 0))
    })
  }

  it('judges a named product by the rules, quotes the verdict, and writes no advice record', async () => {
    const reviewer = await createSession(root.app, KARAN_CIF)
    const recordBefore = await root.deps.audit.listForSession(reviewer.session.id)
    const appendedBefore = appended
    const logBefore = (await accessLog()).length

    const { status, body } = await ask('Should Karan put money into the LIC Market Plus ULIP?')
    assert.equal(status, 200)

    const state = await root.rm.book.state(KARAN_CIF)
    const ulip = state.shelf.find((p) => p.productId === 'LIC_ULIP_401')
    assert.ok(ulip)
    const expected = evaluate({
      product: ulip,
      snapshot: state.snapshot,
      amount: 0,
      goal: { kind: state.goal.kind, horizonYears: state.horizonYears },
      alternatives: state.shelf,
    })
    assert.deepEqual(body.verdict, {
      productId: 'LIC_ULIP_401',
      productName: ulip.name,
      verdict: expected.verdict,
      ruleId: expected.ruleId,
      spoken: expected.spoken,
      recorded: expected.recorded,
    })
    assert.equal(body.verdict?.verdict, 'BLOCKED')
    assert.equal(body.phrasedBy, 'rules')
    const check = body.facts[body.facts.length - 1]
    assert.ok(
      check && body.sentences[0]?.cites.includes(check.id),
      'the answer leads with the check',
    )

    assert.equal(appended, appendedBefore, 'no advice record was appended anywhere')
    const recordAfter = await root.deps.audit.listForSession(reviewer.session.id)
    assert.equal(recordAfter.adviceRecords.length, recordBefore.adviceRecords.length)

    const log = await accessLog()
    assert.equal(log.length, logBefore + 1)
    assert.equal(log[0]?.action, 'checked')
    assert.equal(log[0]?.cif, KARAN_CIF)
    assert.match(log[0]?.detail ?? '', /LIC Market Plus ULIP: refused under "Expensive debt first"/)
  })

  it('drops a model sentence that puts a refused product forward, and keeps one that states the refusal', async () => {
    model.reply = (m) => {
      const check = idOf(m, 'Checked just now')
      return `Karan should start the LIC Market Plus ULIP this month. [${check}]`
    }
    const pushed = await ask('Is the LIC Market Plus ULIP right for Karan?')
    assert.equal(pushed.body.phrasedBy, 'rules')
    assert.ok(!pushed.body.sentences.some((s) => s.text.includes('should start')))

    model.reply = (m) => {
      const check = idOf(m, 'Checked just now')
      const card = idOf(m, 'credit card has')
      return [
        `The rules refuse the LIC Market Plus ULIP for Karan. [${check}]`,
        `Karan's credit card has ₹1,86,240 outstanding at 34.8%, and that comes first. [${card}]`,
      ].join('\n')
    }
    const stated = await ask('Is the LIC Market Plus ULIP right for Karan?')
    assert.equal(stated.body.phrasedBy, 'model')
    assert.equal(stated.body.sentences.length, 2)
    assert.equal(stated.body.verdict?.verdict, 'BLOCKED')
  })

  it('answers from the facts with citations, and logs the question', async () => {
    model.reply = (m) => {
      const spend = idOf(m, 'fixed payments')
      return [
        `Karan has ₹22,501 a month left after fixed payments and everyday spending. [${spend}]`,
        `That is about ₹2,70,012 a year. [${spend}]`,
      ].join('\n')
    }
    const { status, body } = await ask('How much does Karan have left over each month?')
    assert.equal(status, 200)
    assert.equal(body.phrasedBy, 'model')
    assert.equal(body.verdict, null)
    assert.equal(body.sentences.length, 1, 'the annualised figure was the model’s own arithmetic')
    const log = await accessLog()
    assert.equal(log[0]?.action, 'asked')
    assert.equal(log[0]?.detail, 'How much does Karan have left over each month?')
  })

  it('answers from the rules when the model returns nothing usable', async () => {
    model.reply = () => 'Karan has about ₹22k spare.'
    const { body } = await ask('How much does Karan have left over each month?')
    assert.equal(body.phrasedBy, 'rules')
    assert.ok(body.sentences.length > 0)
    assert.ok(body.sentences.every((s) => s.cites.length === 1))
    assert.ok(body.sentences.some((s) => s.text.includes('₹22,501')))
  })

  it('writes a briefed entry for every brief', async () => {
    const before = (await accessLog()).length
    await brief(ROHAN_CIF)
    const log = await accessLog()
    assert.equal(log.length, before + 1)
    assert.equal(log[0]?.action, 'briefed')
    assert.equal(log[0]?.cif, ROHAN_CIF)
  })

  it('refuses a customer outside the caller’s book, before anything is read or written', async () => {
    const calls = model.calls.length
    const before = (await root.deps.rmActivity.listAccess('rm-204388', 50)).length
    const b = await brief(KARAN_CIF, arjun)
    const a = await ask('How is Karan doing?', KARAN_CIF, arjun)
    assert.equal(b.status, 403)
    assert.equal(a.status, 403)
    assert.equal(model.calls.length, calls, 'the model was never asked')
    // The refusals are on the log as refusals; nothing was briefed or asked.
    const log = await root.deps.rmActivity.listAccess('rm-204388', 50)
    assert.deepEqual(
      log.slice(0, log.length - before).map((e) => e.action),
      ['denied', 'denied'],
    )
  })

  it('offers the customer page questions about this customer', async () => {
    const page = await root.app.inject({
      method: 'GET',
      url: `/api/v1/rm/customers/${KARAN_CIF}`,
      headers: bearer(meera),
    })
    assert.equal(page.statusCode, 200)
    const prompts = page.json<{ copilotPrompts: string[] }>().copilotPrompts
    assert.ok(prompts.length >= 4 && prompts.length <= 6)
    assert.ok(prompts.every((p) => p.includes('Karan')))
  })
})

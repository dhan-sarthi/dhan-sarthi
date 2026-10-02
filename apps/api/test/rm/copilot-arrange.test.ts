/**
 * The copilot's brief in the engine's order, with the engine's tags, one sentence at a time, its
 * citations ascending, and its rupee figures held to the meaning their facts give them.
 *
 * Three layers, as `copilot.test.ts` has them: the pure pieces over literals; the rules' brief
 * over every customer in the population, with the three records a brief most often meets (no
 * activity, a request waiting, a Priority customer with nothing urgent); and the routes with a
 * scripted model that writes the brief out of order, mislabels a figure, tags a point with the
 * wrong severity and cites in any order it likes.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { ALL_PERSONAS } from '@dhan/fixtures'
import type { CitedSentence, Fact, RmAnswer, RmBrief } from '@dhan/contracts'
import { NO_ACTIVITY } from '../../src/application/rm/activity.service.ts'
import {
  WHOLE_LINE_SECTIONS,
  arrangeBrief,
  briefInReadingOrder,
  factRanks,
  inReadingOrder,
  oneSentenceALine,
  sentencesOf,
  sortCites,
} from '../../src/application/rm/copilot.arrange.ts'
import type { FactRank } from '../../src/application/rm/copilot.arrange.ts'
import { factSheet } from '../../src/application/rm/copilot.facts.ts'
import type { CopilotRecord } from '../../src/application/rm/copilot.facts.ts'
import { dropReason } from '../../src/application/rm/copilot.guard.ts'
import { mislabelledFigure, typedFigures } from '../../src/application/rm/copilot.meaning.ts'
import { briefHeading } from '../../src/application/rm/copilot.prompt.ts'
import { rulesBrief } from '../../src/application/rm/copilot.rules.ts'
import type { BriefPart } from '../../src/application/rm/copilot.rules.ts'
import type { CustomerState } from '../../src/application/rm/customer-state.ts'
import type { ChatMessage, LanguageModelPort } from '../../src/ports/index.ts'
import { ARJUN, KARAN_CIF, MEERA, bearer, makeRoot, signInRm } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const fact = (id: string, text: string): Fact => ({
  id,
  text,
  source: { kind: 'snapshot', ref: null },
})

/* ------------------------------------------------------------------ *
 * The pure pieces
 * ------------------------------------------------------------------ */

describe('one sentence a line', () => {
  it('splits a line of two sentences, each keeping the ids that cover it', () => {
    assert.deepEqual(
      sentencesOf(
        'Urgent first: ₹9,800 a month in EMIs, a repayment missed. Uday holds back every investment. [F12]',
      ),
      [
        'Urgent first: ₹9,800 a month in EMIs, a repayment missed. [F12]',
        'Uday holds back every investment. [F12]',
      ],
    )
    assert.deepEqual(sentencesOf('The card is at 34.8% [F6]. The cover is short [F7].'), [
      'The card is at 34.8% [F6].',
      'The cover is short [F7].',
    ])
    assert.deepEqual(sentencesOf('The card first. [F6] The cover next. [F7]'), [
      'The card first. [F6]',
      'The cover next. [F7]',
    ])
  })

  it('keeps a question with its answer, quoted words, decimals, short forms and list numbers whole', () => {
    for (const line of [
      'Why no investment now? Uday blocks every investment until the card is cleared. [F11]',
      'Sneha was told, "Not yet. You are paying 34.8% on ₹2,22,712." [F18]',
      'Imran heard: “Not this month. Fix the repayment first.” [F21]',
      'The card is at 34.8% and costs Rs. 5,401 a month. [F6]',
      '1. Karan’s card is at 34.8%. [F6]',
    ]) {
      assert.deepEqual(sentencesOf(line), [line], line)
    }
  })

  it('leaves a part with no ids after it uncited, for the guard to drop', () => {
    assert.deepEqual(sentencesOf('The card [F6]. Nothing else matters.'), [
      'The card [F6].',
      'Nothing else matters.',
    ])
  })

  it('keeps a question and its answer whole under "They may ask", and splits the rest', () => {
    const reply = [
      'TALK ABOUT',
      'A point. Its detail. [F3]',
      'THEY MAY ASK',
      'Imran may ask why investing is on hold. The short answer is the missed repayment. [F12]',
    ].join('\n')
    assert.equal(
      oneSentenceALine(reply, briefHeading, WHOLE_LINE_SECTIONS),
      [
        'TALK ABOUT',
        'A point. [F3]',
        'Its detail. [F3]',
        'THEY MAY ASK',
        'Imran may ask why investing is on hold. The short answer is the missed repayment. [F12]',
      ].join('\n'),
    )
  })

  it('passes headings through and splits only the lines under them', () => {
    assert.equal(
      oneSentenceALine('TALK ABOUT\nA point. Its detail. [F3]\n\nBE CAREFUL ABOUT'),
      'TALK ABOUT\nA point. [F3]\nIts detail. [F3]\n\nBE CAREFUL ABOUT',
    )
  })
})

/**
 * The footnote numbers each sentence prints, as the console draws them
 * (apps/rm/src/features/copilot/cite.ts): numbered by first citation down the page, each
 * sentence's in its own citing order.
 */
function printed(sentences: readonly CitedSentence[]): number[][] {
  const n = new Map<string, number>()
  for (const s of sentences) for (const id of s.cites) if (!n.has(id)) n.set(id, n.size + 1)
  return sentences.map((s) => [...new Set(s.cites)].map((id) => n.get(id) ?? 0))
}

const ascending = (xs: readonly number[]): boolean =>
  xs.every((x, i) => i === 0 || x > (xs[i - 1] ?? 0))

describe('citations', () => {
  it('sorts by fact number, not by string, and keeps each id once', () => {
    assert.deepEqual(sortCites(['F14', 'F6', 'F14', 'F2']), ['F2', 'F6', 'F14'])
    assert.deepEqual(sortCites([]), [])
  })

  it('puts each sentence’s ids in the order the console numbers them, so "2 1" cannot print', () => {
    // The live answer that printed "2 1": the check (F27) first, then the card beside it.
    const answer = [
      { text: 'The rules refuse the index fund.', cites: ['F27'] },
      { text: 'Karan is paying 34.8% on the card.', cites: ['F27', 'F6', 'F6'] },
      { text: 'The car loan and the card.', cites: ['F14', 'F5', 'F6'] },
    ]
    assert.deepEqual(printed(answer.map((s) => ({ ...s, cites: sortCites(s.cites) }))), [
      [1],
      [2, 1],
      [3, 2, 4],
    ])
    const read = inReadingOrder(answer)
    assert.deepEqual(
      read.map((s) => s.cites),
      [['F27'], ['F27', 'F6'], ['F6', 'F5', 'F14']],
    )
    assert.deepEqual(printed(read), [[1], [1, 2], [2, 3, 4]])
  })

  it('numbers a brief across its parts, as the console reads it top to bottom', () => {
    const parts: BriefPart[] = [
      { title: 'Since the last contact', sentences: [{ text: 'A.', cites: ['F20'] }] },
      { title: 'Talk about', sentences: [{ text: 'B.', cites: ['F13', 'F20'] }] },
      { title: 'Be careful about', sentences: [] },
      { title: 'They may ask', sentences: [{ text: 'C.', cites: ['F7', 'F13', 'F2'] }] },
    ]
    const read = briefInReadingOrder(parts)
    assert.deepEqual(
      read.map((p) => [p.title, p.sentences.map((s) => s.cites)]),
      [
        ['Since the last contact', [['F20']]],
        ['Talk about', [['F20', 'F13']]],
        ['Be careful about', []],
        ['They may ask', [['F13', 'F2', 'F7']]],
      ],
    )
    assert.ok(printed(read.flatMap((p) => p.sentences)).every(ascending))
  })
})

describe('what a figure means', () => {
  const reach = fact(
    'F13',
    'Important: 1 month of savings — ₹3.76L short of 6 months. ₹73,478 in reach against ₹74,929 going out a month.',
  )
  const cover = fact(
    'F7',
    'Karan has ₹2,70,000 of life cover against a need of ₹2,30,40,000 (ten times annual income, a rule of thumb), so ₹2,27,70,000 short; no health cover on file.',
  )

  it('types a fact’s rupee figures by the word beside them, and leaves counts alone', () => {
    assert.deepEqual(
      typedFigures(reach.text).map((f) => [f.value, f.label]),
      [
        [376000, 'shortfall'],
        [73478, 'held'],
        [74929, 'outgoings'],
      ],
    )
    assert.deepEqual(
      typedFigures(cover.text).map((f) => [f.value, f.label]),
      [
        [23040000, 'need'],
        [22770000, 'shortfall'],
      ],
    )
  })

  it('drops the reachable balance called the shortfall, and cover needed called the gap', () => {
    assert.equal(
      mislabelledFigure(
        'Imran has 1 month of savings, and the record says ₹73,478 is short of 6 months.',
        [reach],
      ),
      '₹73,478 as shortfall',
    )
    assert.equal(
      mislabelledFigure('Karan is ₹2,30,40,000 short on life cover.', [cover]),
      '₹2,30,40,000 as shortfall',
    )
  })

  it('keeps the same figures said the way their facts say them', () => {
    for (const text of [
      'Imran has ₹73,478 in reach against ₹74,929 going out a month.',
      'Imran’s savings are ₹3.76L short of 6 months.',
      'Imran is short of 6 months by ₹3.76L.',
      'Karan is ₹2,27,70,000 short on life cover.',
      'The record puts the need at ₹2,30,40,000, against ₹2,70,000 held.',
      'Karan is short on life cover, with 2 dependents and ₹2,70,000 held against a need of ₹2,30,40,000.',
    ]) {
      assert.equal(mislabelledFigure(text, [reach, cover]), null, text)
    }
  })

  it('judges nothing its facts leave untyped or never name', () => {
    // ₹2,70,000 has no label word in its fact, and no cited fact names anything "outstanding".
    assert.equal(mislabelledFigure('Karan owes ₹2,70,000.', [cover]), null)
    assert.equal(mislabelledFigure('₹3.76L is outstanding.', [reach]), null)
  })

  it('lets a need stand for the shortfall and held for the idle part, but not the other way', () => {
    const savings = fact(
      'F4',
      'Farhan has ₹32,10,407 in savings and deposits, enough for 21.3 months of outgoings against a target of 6; ₹7,69,641 of it has sat untouched for 11 months.',
    )
    for (const text of [
      'Karan needs ₹2,27,70,000 more life cover.',
      'Karan needs another ₹2,27,70,000 of cover.',
      'The gap to the ₹2,30,40,000 need is ₹2,27,70,000.',
      'Farhan has ₹7,69,641 held in savings that has not moved in 11 months.',
      '₹7,69,641 has sat idle in savings for 11 months.',
    ]) {
      assert.equal(mislabelledFigure(text, [cover, savings]), null, text)
    }
    assert.equal(
      mislabelledFigure('Farhan has ₹32,10,407 sitting idle.', [savings]),
      '₹32,10,407 as idle',
    )
    assert.equal(
      mislabelledFigure('Karan is ₹2,30,40,000 short.', [cover]),
      '₹2,30,40,000 as shortfall',
    )
  })

  it('reads "balance" and a bare "left" as no meaning, since a card or a loan has them too', () => {
    const card = fact(
      'F6',
      "Karan's credit card has ₹1,86,240 outstanding at 34.8%, ₹5,600 a month, paid to HDFC.",
    )
    const spending = fact(
      'F3',
      'Karan commits ₹52,300 a month to fixed payments (EMIs, rent, bills, subscriptions and SIPs) and spends about ₹40,199 on everyday things, leaving ₹22,501 a month.',
    )
    for (const text of [
      'Karan’s card balance of ₹1,86,240 is at 34.8%.',
      'Karan has ₹1,86,240 left to pay on the card.',
    ]) {
      assert.equal(mislabelledFigure(text, [card, spending, reach]), null, text)
    }
  })
})

describe('the brief’s order and tags', () => {
  const ranks = new Map<string, FactRank>([
    ['F13', { rank: 0, severity: 'urgent', signal: true }],
    ['F14', { rank: 1, severity: 'urgent', signal: true }],
    ['F15', { rank: 2, severity: 'important', signal: true }],
    ['F16', { rank: 3, severity: 'opportunity', signal: true }],
    // The card loan is the evidence for the card signal.
    ['F6', { rank: 1, severity: 'urgent', signal: false }],
  ])
  const facts = [
    fact('F6', 'Card loan.'),
    fact('F12', 'The plan.'),
    fact('F13', 'Urgent: missed repayment.'),
    fact('F14', 'Urgent: card.'),
    fact('F15', 'Important: cover.'),
    fact('F16', 'Opportunity: Netflix.'),
    fact('F20', 'A refusal.'),
  ]
  const brief = (talk: CitedSentence[], careful: CitedSentence[] = []): BriefPart[] => [
    { title: 'Since the last contact', sentences: [{ text: 'Nothing new.', cites: ['F20'] }] },
    { title: 'Talk about', sentences: talk },
    { title: 'Be careful about', sentences: careful },
    { title: 'They may ask', sentences: [{ text: 'About the plan.', cites: ['F12'] }] },
  ]
  const part = (parts: BriefPart[], title: BriefPart['title']): CitedSentence[] =>
    parts.find((p) => p.title === title)?.sentences ?? []

  it('orders by the engine’s rank and tags from severity, whatever the model wrote', () => {
    const out = arrangeBrief(
      brief(
        [
          { text: 'The plan has three stages.', cites: ['F12'] },
          { text: 'Opportunity: the cover is short.', cites: ['F15'] },
          { text: 'Urgent first: the card is at 34.8%.', cites: ['F14', 'F6', 'F14'] },
          { text: 'Important: a repayment was missed.', cites: ['F13'] },
        ],
        [
          { text: 'Do not raise the refused product.', cites: ['F20'] },
          { text: 'No investment while the card is open.', cites: ['F6'] },
          { text: 'Nothing but cover until the repayment clears.', cites: ['F13'] },
        ],
      ),
      ranks,
      facts,
    )
    assert.deepEqual(part(out.sections, 'Talk about'), [
      { text: 'Urgent: A repayment was missed.', cites: ['F13'] },
      { text: 'Urgent: The card is at 34.8%.', cites: ['F6', 'F14'] },
      { text: 'Important: The cover is short.', cites: ['F15'] },
      { text: 'The plan has three stages.', cites: ['F12'] },
    ])
    assert.deepEqual(
      part(out.sections, 'Be careful about').map((s) => s.text),
      [
        'Nothing but cover until the repayment clears.',
        'No investment while the card is open.',
        'Do not raise the refused product.',
      ],
    )
    assert.equal(out.reordered, true)
    assert.deepEqual(out.dropped, [])
  })

  it('tags a point only where it cites the signal’s own line, and once per point', () => {
    const out = arrangeBrief(
      brief([
        { text: 'A repayment was missed.', cites: ['F13'] },
        { text: 'Uday holds back every investment.', cites: ['F13'] },
        { text: 'The card loan is at 34.8%.', cites: ['F6'] },
      ]),
      ranks,
      facts,
    )
    assert.deepEqual(
      part(out.sections, 'Talk about').map((s) => s.text),
      [
        'Urgent: A repayment was missed.',
        'Uday holds back every investment.',
        'The card loan is at 34.8%.',
      ],
    )
  })

  it('drops an urgency the facts do not give, and an order claim the ranking moved', () => {
    const out = arrangeBrief(
      brief([
        { text: 'Raise the cover first.', cites: ['F15'] },
        { text: 'The Netflix rise is urgent.', cites: ['F16'] },
        { text: 'Nothing urgent sits behind the plan.', cites: ['F12'] },
        { text: 'The missed repayment is urgent.', cites: ['F13'] },
      ]),
      ranks,
      facts,
    )
    assert.deepEqual(
      out.dropped.map((d) => [d.reason, d.text]),
      [
        ['urgency_claim', 'The Netflix rise is urgent.'],
        ['order_claim', 'Raise the cover first.'],
      ],
    )
    assert.deepEqual(
      part(out.sections, 'Talk about').map((s) => s.text),
      ['Urgent: The missed repayment is urgent.', 'Nothing urgent sits behind the plan.'],
    )
  })

  it('leaves the unranked parts in the order they came, leads removed, citations sorted', () => {
    const parts = brief([{ text: 'A.', cites: ['F13'] }])
    parts[0] = {
      title: 'Since the last contact',
      sentences: [
        { text: 'Urgent: one.', cites: ['F20', 'F13'] },
        { text: 'Two.', cites: ['F12'] },
      ],
    }
    const out = arrangeBrief(parts, ranks, facts)
    assert.deepEqual(part(out.sections, 'Since the last contact'), [
      { text: 'One.', cites: ['F13', 'F20'] },
      { text: 'Two.', cites: ['F12'] },
    ])
  })
})

/* ------------------------------------------------------------------ *
 * The rules' brief over the population
 * ------------------------------------------------------------------ */

function emptyRecord(): CopilotRecord {
  return { activity: NO_ACTIVITY, handoffs: [], refusals: [], journey: [] }
}

/** A customer who asked for the RM three days ago, about their top signal, and was active then. */
function waitingRecord(state: CustomerState): CopilotRecord {
  return {
    activity: { ...NO_ACTIVITY, lastActivityAt: '2026-08-29', openHandoff: true },
    handoffs: [
      {
        id: 'decision-handoff-1',
        cif: state.cif,
        name: state.file.customer.custName,
        requestedOn: '2026-08-29',
        waitingDays: 3,
        status: 'open',
        reason:
          state.signals[0]?.title ?? 'Asked from the app, with nothing pressing on their plan',
        context: [],
        note: null,
      },
    ],
    refusals: [],
    journey: [],
  }
}

const textOf = (part: BriefPart | undefined): string[] => part?.sentences.map((s) => s.text) ?? []

describe('the rules’ brief, arranged', () => {
  let root: TestRoot
  let states: CustomerState[]

  before(async () => {
    root = await makeRoot()
    states = await root.rm.book.states(ALL_PERSONAS.map((p) => p.customer.cif))
  })
  after(() => root.close())

  const arranged = (state: CustomerState, record: CopilotRecord) => {
    const sheet = factSheet(state, record)
    return { sheet, out: arrangeBrief(rulesBrief(state, sheet), factRanks(sheet), sheet.facts) }
  }

  it('keeps every sentence for every customer, in the engine’s order, tagged by severity', () => {
    for (const state of states) {
      for (const record of [emptyRecord(), waitingRecord(state)]) {
        const { sheet, out } = arranged(state, record)
        const ranks = factRanks(sheet)
        assert.deepEqual(out.dropped, [], state.cif)
        for (const part of out.sections) {
          assert.ok(part.sentences.length > 0, `${state.cif}: "${part.title}" is empty`)
          let last = -1
          for (const s of part.sentences) {
            const where = `${state.cif} "${part.title}": ${s.text} [${s.cites.join(', ')}]`
            assert.equal(dropReason(s, { facts: sheet.facts, state }), null, where)
            assert.deepEqual(s.cites, sortCites(s.cites), where)
            // "1 months" (but "1.1 months" is right), "₹0 held", and a colon inside a colon
            // inside a colon after the tag.
            assert.doesNotMatch(s.text, /(?<![\d.])1 months\b|₹0 held|: [^:]*: .*: /, where)
            if (part.title === 'Talk about' || part.title === 'Be careful about') {
              const rank = Math.min(...s.cites.map((c) => ranks.get(c)?.rank ?? Infinity))
              assert.ok(rank >= last, `${where} comes after a lower-ranked point`)
              last = rank
            }
            if (part.title === 'Talk about') {
              const signal = sheet.index.signals.find((x) => s.cites.includes(x.id))
              const tag = /^(Urgent|Important|Opportunity): /.exec(s.text)?.[1]
              assert.equal(tag?.toLowerCase(), signal?.of.severity, where)
            }
          }
        }
      }
    }
  })

  it('never reads a fact, quoted as it stands, as giving a figure the wrong meaning', () => {
    // The cheapest guard on false drops: a model that copies a fact's own sentence word for
    // word, citing any of the customer's facts, is never dropped for meaning.
    for (const state of states) {
      for (const record of [emptyRecord(), waitingRecord(state)]) {
        const { facts } = factSheet(state, record)
        for (const f of facts) {
          for (const piece of f.text.split(/(?<=\.)\s+(?=[A-Z₹])/)) {
            assert.equal(mislabelledFigure(piece, [f]), null, `${state.cif} ${f.id}: ${piece}`)
            assert.equal(mislabelledFigure(piece, facts), null, `${state.cif} ${f.id}: ${piece}`)
          }
        }
      }
    }
  })

  it('leads with the top signal, as Uday’s read raises it first', () => {
    for (const state of states) {
      const top = state.signals[0]
      if (!top) continue
      const { sheet, out } = arranged(state, emptyRecord())
      const talk = out.sections.find((p) => p.title === 'Talk about')
      const lead = talk?.sentences[0]
      assert.ok(lead, state.cif)
      assert.deepEqual(lead.cites, [sheet.index.signals[0]?.id], state.cif)
      assert.ok(lead.text.includes(top.detail), `${state.cif}: ${lead.text}`)
    }
  })

  it('says once that a customer with no activity has never been contacted', () => {
    const karan = states.find((s) => s.cif === KARAN_CIF)
    assert.ok(karan)
    const { out } = arranged(karan, emptyRecord())
    const since = textOf(out.sections[0])
    assert.equal(
      since[0],
      "No RM contact and no app activity are on record, so this would be the desk's first conversation with Karan.",
    )
    assert.ok(!since.some((t) => /no app activity from|was last active/.test(t)), since.join(' | '))
    assert.match(textOf(out.sections[1])[0] ?? '', /^Urgent: /)
  })

  it('leads with a waiting request, quotes it, and answers it first in "They may ask"', () => {
    const thin = states.find(
      (s) =>
        s.snapshot.buffer.monthsCovered === 1 &&
        s.snapshot.protection.lifeCoverInForce === 0 &&
        s.snapshot.protection.gap > 0,
    )
    assert.ok(thin, 'a customer with one month of savings and no life cover')
    const first = thin.file.customer.custName.split(' ')[0] ?? ''
    const { out } = arranged(thin, waitingRecord(thin))
    const [since, , careful, ask] = out.sections.map(textOf)
    assert.equal(
      since?.[0],
      `${first} asked to talk to the RM on 29 Aug 2026 and has waited 3 days, so start by answering that. The request: "${thin.signals[0]?.title ?? ''}".`,
    )
    assert.equal(
      since?.[1],
      `No earlier RM contact is on record, so this would be the desk's first conversation with ${first}.`,
    )
    assert.match(ask?.[0] ?? '', /will want to know what is happening with the request/)
    assert.ok(
      careful?.some((t) => t.includes('only 1 month of outgoings')),
      careful?.join(' | '),
    )
    assert.ok(
      ask?.some((t) => t.endsWith('with none held.')),
      ask?.join(' | '),
    )
  })

  it('says nothing is urgent for a Priority customer with no urgent signal, and does not call it pressing', () => {
    const calm = states.filter(
      (s) =>
        s.segment === 'priority' &&
        s.signals.length > 0 &&
        !s.signals.some((x) => x.severity === 'urgent'),
    )
    assert.ok(calm.length > 0, 'a Priority customer with signals and none urgent')
    for (const state of calm) {
      const { out } = arranged(state, emptyRecord())
      const talk = textOf(out.sections[1])
      const top = state.signals[0]
      assert.ok(top)
      const tag = top.severity === 'important' ? 'Important' : 'Opportunity'
      // The tag and the signal's own title first, as on every point; the framing last.
      assert.ok(
        talk[0]?.startsWith(`${tag}: ${top.title.replace(/\.$/, '')}. `) &&
          talk[0].endsWith(' Nothing urgent is open, so start here.'),
        `${state.cif}: ${talk[0] ?? ''}`,
      )
      assert.ok(!talk.slice(1).some((t) => /urgent/i.test(t)), talk.join(' | '))
      assert.ok(!talk.some((t) => /pressing|^Next:/.test(t)), talk.join(' | '))
      const plan = talk.find((t) => t.includes('plan'))
      assert.ok(plan === undefined || !/: [^.]*: /.test(plan), `${state.cif}: ${plan ?? ''}`)
      const careful = textOf(out.sections[2])
      if (careful[0]?.startsWith('Nothing on the record')) {
        assert.match(careful[0], /risk profile is \w+/)
      }

      // With a request waiting, the brief already says to start with it, and says it once.
      const waiting = arranged(state, waitingRecord(state)).out
      const lead = textOf(waiting.sections[1])[0] ?? ''
      assert.ok(lead.endsWith('. Nothing urgent is open.'), `${state.cif}: ${lead}`)
      const starts = waiting.sections
        .flatMap((p) => p.sentences)
        .filter((s) => /\bstart\b/.test(s.text))
      assert.equal(starts.length, 1, starts.map((s) => s.text).join(' | '))
      assert.match(textOf(waiting.sections[0])[0] ?? '', /so start by answering that/)
    }
  })
})

/* ------------------------------------------------------------------ *
 * Over HTTP, with a scripted model
 * ------------------------------------------------------------------ */

class FakeModel implements LanguageModelPort {
  readonly name = 'fake:copilot'
  readonly live = true
  calls: ChatMessage[][] = []
  reply: (messages: readonly ChatMessage[]) => string | null = () => null

  async complete(messages: readonly ChatMessage[]): Promise<string | null> {
    this.calls.push([...messages])
    return this.reply(messages)
  }
}

/** The numbered facts in a prompt, id to text. */
function factsIn(messages: readonly ChatMessage[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of messages) {
    for (const match of m.content.matchAll(/^(F\d+)\. (.*)$/gm)) {
      out.set(match[1] ?? '', match[2] ?? '')
    }
  }
  return out
}

/** The first fact `test` accepts, as its id and text; fails the test where there is none. */
function find(messages: readonly ChatMessage[], test: (text: string) => boolean) {
  for (const [id, text] of factsIn(messages)) if (test(text)) return { id, text }
  throw new Error('no such fact in the prompt')
}

/** The signal's title, as its fact line states it after the severity. */
const titleOf = (text: string): string => text.replace(/^\w+: /, '').split('. ')[0] ?? ''

describe('the copilot routes, arranged', () => {
  let root: TestRoot
  let meera: string
  let arjun: string
  const model = new FakeModel()

  before(async () => {
    root = await makeRoot({ deps: { copilotModel: model } })
    meera = (await signInRm(root.app, MEERA)).token
    arjun = (await signInRm(root.app, ARJUN)).token
  })
  after(() => root.close())
  beforeEach(() => {
    model.calls = []
    model.reply = () => null
  })

  const brief = async (token = meera) => {
    const res = await root.app.inject({
      method: 'POST',
      url: `/api/v1/rm/customers/${KARAN_CIF}/brief`,
      headers: bearer(token),
    })
    return { status: res.statusCode, body: res.json<RmBrief>() }
  }
  const ask = async (question: string, token = meera) => {
    const res = await root.app.inject({
      method: 'POST',
      url: `/api/v1/rm/customers/${KARAN_CIF}/ask`,
      headers: bearer(token),
      payload: { question },
    })
    return { status: res.statusCode, body: res.json<RmAnswer>() }
  }
  const section = (b: RmBrief, title: string) => b.sections.find((s) => s.title === title)

  /** Karan's lines a scripted brief needs, by meaning rather than by number. */
  const karan = (m: readonly ChatMessage[]) => ({
    missed: find(m, (t) => t.startsWith('Urgent:') && t.includes('repayment missed')),
    card: find(m, (t) => t.startsWith('Urgent:') && t.includes('34.8%')),
    cover: find(m, (t) => t.startsWith('Important:') && t.includes('life cover')),
    rise: find(m, (t) => t.startsWith('Opportunity:')),
    cardLoan: find(m, (t) => t.includes('credit card has')),
    coverLine: find(m, (t) => t.includes('of life cover against a need of')),
    contact: find(m, (t) => t.startsWith('No RM contact')),
    plan: find(m, (t) => t.includes('plan has')),
  })

  /** A brief out of the engine's order, with the wrong tags and citations in any order. */
  const scripted = (m: readonly ChatMessage[]): string => {
    const f = karan(m)
    return [
      'SINCE THE LAST CONTACT',
      `No RM contact with Karan is on record. [${f.contact.id}]`,
      'TALK ABOUT',
      `Opportunity: ${titleOf(f.cover.text)}. [${f.cover.id}]`,
      `Urgent first: ${titleOf(f.card.text)}. [${f.card.id}, ${f.cardLoan.id}, ${f.card.id}]`,
      `Important: ${titleOf(f.missed.text)}. A missed repayment is on record. [${f.missed.id}]`,
      'BE CAREFUL ABOUT',
      `Do not put forward any investment while the card is at 34.8%. [${f.cardLoan.id}]`,
      `Nothing but cover until the missed repayment clears. [${f.missed.id}]`,
      'THEY MAY ASK',
      `Karan may ask how the plan is staged. [${f.plan.id}]`,
    ].join('\n')
  }

  it('puts the model’s talking points in the engine’s order with the engine’s tags', async () => {
    model.reply = scripted
    const { status, body } = await brief()
    assert.equal(status, 200)
    assert.equal(body.phrasedBy, 'model')
    const ids = Object.fromEntries(
      Object.entries(karan(model.calls[0] ?? [])).map(([k, v]) => [k, v.id]),
    )
    const byNumber = (...xs: (string | undefined)[]) => sortCites(xs.filter((x) => x !== undefined))
    assert.deepEqual(section(body, 'Talk about')?.sentences, [
      {
        text: `Urgent: ${titleOf(factsIn(model.calls[0] ?? []).get(ids.missed ?? '') ?? '')}.`,
        cites: [ids.missed],
      },
      { text: 'A missed repayment is on record.', cites: [ids.missed] },
      {
        text: `Urgent: ${titleOf(factsIn(model.calls[0] ?? []).get(ids.card ?? '') ?? '')}.`,
        cites: byNumber(ids.cardLoan, ids.card),
      },
      {
        text: `Important: ${titleOf(factsIn(model.calls[0] ?? []).get(ids.cover ?? '') ?? '')}.`,
        cites: [ids.cover],
      },
    ])
    assert.deepEqual(
      section(body, 'Be careful about')?.sentences.map((s) => s.text),
      [
        'Nothing but cover until the missed repayment clears.',
        'Do not put forward any investment while the card is at 34.8%.',
      ],
    )
  })

  it('drops a sentence that gives a figure another meaning, and keeps the one that does not', async () => {
    model.reply = (m) => {
      const f = karan(m)
      const need = /a need of (₹[\d,]+)/.exec(f.coverLine.text)?.[1] ?? ''
      const gap = /so (₹[\d,]+) short/.exec(f.coverLine.text)?.[1] ?? ''
      return [
        'SINCE THE LAST CONTACT',
        `No RM contact with Karan is on record. [${f.contact.id}]`,
        'TALK ABOUT',
        `${titleOf(f.missed.text)}. [${f.missed.id}]`,
        `Karan is ${need} short on life cover. [${f.coverLine.id}]`,
        `Karan is ${gap} short on life cover. [${f.coverLine.id}]`,
        'BE CAREFUL ABOUT',
        `Nothing but cover until the missed repayment clears. [${f.missed.id}]`,
        'THEY MAY ASK',
        `Karan may ask how the plan is staged. [${f.plan.id}]`,
      ].join('\n')
    }
    const { body } = await brief()
    assert.equal(body.phrasedBy, 'model')
    const talk = section(body, 'Talk about')?.sentences.map((s) => s.text) ?? []
    assert.ok(
      talk.includes('Karan is ₹2,27,70,000 short on life cover.'),
      `the true gap stays: ${talk.join(' | ')}`,
    )
    assert.ok(
      !talk.some((t) => t.includes('₹2,30,40,000')),
      `cover needed called the gap is gone: ${talk.join(' | ')}`,
    )
  })

  it('answers with its citations ascending and each once', async () => {
    model.reply = (m) => {
      const f = karan(m)
      return `Karan's credit card has ₹1,86,240 outstanding at 34.8%. [${f.card.id}, ${f.cardLoan.id}, ${f.card.id}]`
    }
    const { body } = await ask('What is Karan paying on the card?')
    assert.equal(body.phrasedBy, 'model')
    const f = karan(model.calls[0] ?? [])
    assert.deepEqual(body.sentences, [
      {
        text: "Karan's credit card has ₹1,86,240 outstanding at 34.8%.",
        cites: sortCites([f.card.id, f.cardLoan.id]),
      },
    ])
    assert.ok(Number(f.cardLoan.id.slice(1)) < Number(f.card.id.slice(1)), 'F6 sorts before F14')
  })

  it('answers from the rules when the model’s only sentence mislabels a figure', async () => {
    model.reply = (m) => {
      const f = karan(m)
      return `Karan's cover gap is ₹2,30,40,000. [${f.coverLine.id}]`
    }
    const { body } = await ask('How short is Karan on life cover?')
    assert.equal(body.phrasedBy, 'rules')
    assert.ok(printed(body.sentences).every(ascending), JSON.stringify(body.sentences))
  })

  it('prints a checked product’s answer "1 2", not "2 1"', async () => {
    model.reply = (m) => {
      const f = karan(m)
      const check = find(m, (t) => t.startsWith('Checked just now'))
      return [
        `The suitability rules refuse UTI Nifty 50 Index Fund for Karan. [${check.id}]`,
        `Karan is paying 34.8% on ₹1,86,240, and the record says nothing else changes that outcome. [${f.cardLoan.id}, ${check.id}]`,
      ].join('\n')
    }
    const { body } = await ask('Would the rules pass an index fund for Karan?')
    assert.equal(body.phrasedBy, 'model')
    const check = body.facts.find((f) => f.text.startsWith('Checked just now'))?.id
    assert.ok(check)
    assert.equal(body.sentences[1]?.cites[0], check, 'the check, footnote 1, prints first')
    assert.deepEqual(printed(body.sentences), [[1], [1, 2]])

    // And with no model, the rules' answer to the same question.
    model.reply = () => null
    const rules = await ask('Would the rules pass an index fund for Karan?')
    assert.equal(rules.body.phrasedBy, 'rules')
    assert.ok(printed(rules.body.sentences).every(ascending), JSON.stringify(rules.body.sentences))
  })

  it('prints every footnote in a brief ascending, the model’s or the rules’', async () => {
    for (const reply of [() => null, scripted]) {
      model.reply = reply
      const { body } = await brief()
      const all = body.sections.flatMap((s) => s.sentences)
      assert.ok(all.length > 0)
      assert.ok(printed(all).every(ascending), `${body.phrasedBy}: ${JSON.stringify(printed(all))}`)
    }
  })

  it('names the attempt on the denied entry when a brief or question is refused', async () => {
    const before = (await root.deps.rmActivity.listAccess('rm-204388', 50)).length
    assert.equal((await brief(arjun)).status, 403)
    assert.equal((await ask('How is Karan doing?', arjun)).status, 403)
    assert.equal(model.calls.length, 0, 'the model was never asked')
    const log = await root.deps.rmActivity.listAccess('rm-204388', 50)
    assert.equal(log.length, before + 2)
    assert.deepEqual(
      log.slice(0, 2).map((e) => [e.action, e.purpose, e.detail]),
      [
        ['denied', 'Question about the customer', 'How is Karan doing?'],
        ['denied', 'Meeting brief', null],
      ],
    )
  })
})

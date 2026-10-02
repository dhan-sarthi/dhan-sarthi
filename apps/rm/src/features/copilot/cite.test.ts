import type { Fact } from '@dhan/contracts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  historyOf,
  leadOf,
  notesFor,
  numberCitations,
  sourceRef,
  splitQuestion,
  uncited,
} from './cite.ts'

const fact = (id: string, kind: Fact['source']['kind'] = 'snapshot', ref: string | null = null) =>
  ({ id, text: `fact ${id}`, source: { kind, ref } }) as Fact

const facts = [fact('F1'), fact('F2'), fact('F6'), fact('F14'), fact('F26')]

test('footnotes are numbered by first citation, not by fact id', () => {
  const notes = numberCitations(
    [
      { text: 'a', cites: ['F14', 'F6'] },
      { text: 'b', cites: ['F6', 'F2'] },
      { text: 'c', cites: ['F14'] },
    ],
    facts,
  )
  assert.deepEqual(
    [...notes.values()].map((n) => [n.fact.id, n.n]),
    [
      ['F14', 1],
      ['F6', 2],
      ['F2', 3],
    ],
  )
})

test('a cited id with no fact behind it gets no number and no marker', () => {
  const notes = numberCitations([{ text: 'a', cites: ['F99', 'F1'] }], facts)
  assert.equal(notes.get('F1')?.n, 1)
  assert.equal(notes.has('F99'), false)
  assert.deepEqual(
    notesFor({ text: 'a', cites: ['F99', 'F1', 'F1'] }, notes).map((n) => n.n),
    [1],
  )
})

test('a sentence prints its footnotes in ascending number, never "2 1"', () => {
  // A tile above the brief cites F14 first, so F14 is 1 and F6 is 2 by the time this sentence,
  // citing [F6, F14] in the server's order, is drawn.
  const notes = numberCitations(
    [
      { text: 'tile', cites: ['F14'] },
      { text: 'a', cites: ['F6', 'F14'] },
    ],
    facts,
  )
  assert.deepEqual(
    notesFor({ text: 'a', cites: ['F6', 'F14'] }, notes).map((n) => [n.fact.id, n.n]),
    [
      ['F14', 1],
      ['F6', 2],
    ],
  )
})

test('uncited facts keep the server order', () => {
  const notes = numberCitations([{ text: 'a', cites: ['F6'] }], facts)
  assert.deepEqual(
    uncited(facts, notes).map((f) => f.id),
    ['F1', 'F2', 'F14', 'F26'],
  )
})

test('talking points lose their "Urgent:" to a tag and keep every other word', () => {
  assert.deepEqual(leadOf('Urgent: Karan has ₹1,86,240 on the card at 34.8%.'), {
    lead: 'urgent',
    word: 'Urgent',
    rest: 'Karan has ₹1,86,240 on the card at 34.8%.',
  })
  assert.deepEqual(leadOf('Urgent first: ₹9,800 a month in EMIs, a repayment missed.'), {
    lead: 'urgent',
    word: 'Urgent first',
    rest: '₹9,800 a month in EMIs, a repayment missed.',
  })
  assert.equal(leadOf('Opportunity: the record points to PMJJBY.').lead, 'opportunity')
  assert.equal(leadOf('The urgent point is the card at 34.8%.').lead, null)
})

test('a "They may ask" line splits into its question and its answer', () => {
  assert.deepEqual(
    splitQuestion('What is the short answer on the card? It has ₹1,86,240 outstanding.'),
    { question: 'What is the short answer on the card?', answer: 'It has ₹1,86,240 outstanding.' },
  )
  assert.equal(splitQuestion('Do not offer investments while the card stays at 34.8%.'), null)
  // A question at the very end is a question, not a pair.
  assert.equal(splitQuestion('Has Karan asked for a call?'), null)
})

test('fact references read as a desk would quote them', () => {
  assert.equal(sourceRef({ kind: 'roadmap', ref: 'v3' }), 'Version 3')
  assert.equal(sourceRef({ kind: 'roadmap', ref: 'v0' }), null)
  assert.equal(
    sourceRef({ kind: 'ledger', ref: 'ledger:mandate_returned:S00000330' }),
    'Line S00000330',
  )
  assert.equal(
    sourceRef({ kind: 'decision', ref: '1b04c75c-1b1c-4ac7-856a-93ad23753a35' }),
    'Record 1b04c75c',
  )
  assert.equal(sourceRef({ kind: 'profile', ref: 'IDBI0003308471' }), null)
  assert.equal(sourceRef({ kind: 'snapshot', ref: null }), null)
})

test('history goes back as plain turns, newest last, within the contract', () => {
  const turns = Array.from({ length: 8 }, (_, i) => ({
    question: `q${i}`,
    sentences: [
      { text: `a${i} one.`, cites: ['F1'] },
      { text: `a${i} two.`, cites: [] },
    ],
  }))
  const history = historyOf(turns)
  assert.equal(history.length, 12)
  assert.deepEqual(history.at(-1), { role: 'assistant', text: 'a7 one. a7 two.' })
  assert.deepEqual(history.at(-2), { role: 'user', text: 'q7' })
  const long = historyOf([{ question: 'x'.repeat(3000), sentences: [] }])
  assert.equal(long[0]?.text.length, 2000)
  assert.equal(long.length, 1)
})

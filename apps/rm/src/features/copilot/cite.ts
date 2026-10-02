/**
 * The copilot's footnotes, worked out once and drawn everywhere.
 *
 * The server names facts `F1`…`F26` in the order it assembled them, which is the order the record
 * happens to be read in, not the order the RM reads the brief. A footnote reader expects 1, 2, 3
 * down the page, so the screen renumbers by first citation and the Sources list follows that
 * order. The fact ids stay on the data; only the numbers on screen are the screen's.
 *
 * Pure, with type-only imports, so `node --test` can run it without a bundler.
 */
import type { CitedSentence, Fact, FactId, FactSourceKind } from '@dhan/contracts'

export interface Footnote {
  n: number
  fact: Fact
}

/**
 * Footnote numbers by fact id, in order of first citation. A cited id with no fact behind it is
 * left out rather than numbered: the server's guard drops such sentences, and a marker that
 * opened onto nothing would be worse than no marker.
 */
export function numberCitations(
  sentences: readonly CitedSentence[],
  facts: readonly Fact[],
): Map<FactId, Footnote> {
  const byId = new Map(facts.map((fact) => [fact.id, fact]))
  const notes = new Map<FactId, Footnote>()
  for (const sentence of sentences) {
    for (const id of sentence.cites) {
      const fact = byId.get(id)
      if (fact && !notes.has(id)) notes.set(id, { n: notes.size + 1, fact })
    }
  }
  return notes
}

/** The footnotes one sentence carries, in its own citing order, without repeats. */
export function notesFor(
  sentence: CitedSentence,
  notes: ReadonlyMap<FactId, Footnote>,
): Footnote[] {
  const seen = new Set<FactId>()
  const out: Footnote[] = []
  for (const id of sentence.cites) {
    const note = notes.get(id)
    if (note && !seen.has(id)) {
      seen.add(id)
      out.push(note)
    }
  }
  return out
}

/** Facts the answer had in front of it but did not cite, in the server's order. */
export function uncited(facts: readonly Fact[], notes: ReadonlyMap<FactId, Footnote>): Fact[] {
  return facts.filter((fact) => !notes.has(fact.id))
}

/* ---------------------------------------------------------------- Sentence leads */

export type Lead = 'urgent' | 'important' | 'opportunity'

/**
 * The brief marks its talking points "Urgent:", "Important:" or "Opportunity:" in the engine's
 * order. Drawn as a tag, the RM can scan the list by weight; the word on the tag is the sentence's
 * own, so nothing the server checked is reworded. A sentence that does not open that way is left
 * exactly as it is.
 */
export function leadOf(text: string): { lead: Lead | null; word: string; rest: string } {
  const match = /^(urgent|important|opportunity)( first)?:\s+(.+)$/is.exec(text.trim())
  if (!match) return { lead: null, word: '', rest: text }
  const word = `${match[1] ?? ''}${match[2] ?? ''}`
  const rest = match[3] ?? ''
  return {
    lead: (match[1] ?? '').toLowerCase() as Lead,
    word: word.charAt(0).toUpperCase() + word.slice(1),
    rest: rest.charAt(0).toUpperCase() + rest.slice(1),
  }
}

/**
 * "What is the short answer on the card? It has ₹1,86,240 outstanding…" splits into the question
 * the customer may ask and the line to answer it with, so the RM can find the question at a
 * glance. Only a short opening question counts; a question mark deep in a sentence is prose.
 */
export function splitQuestion(text: string): { question: string; answer: string } | null {
  const match = /^(.{6,120}?\?)\s+(\S.*)$/s.exec(text.trim())
  if (!match) return null
  return { question: match[1] ?? '', answer: match[2] ?? '' }
}

/* ---------------------------------------------------------------- Sources */

/** Where a fact came from, in the words a desk uses. */
export const SOURCE_KIND_LABEL: Readonly<Record<FactSourceKind, string>> = {
  profile: 'Profile',
  snapshot: 'Money snapshot',
  roadmap: 'Plan',
  insight: 'Signal',
  advice: 'Advice record',
  decision: 'Activity',
  ledger: 'Statement',
}

/**
 * The fact's own reference, when it is one a person can use: a plan version, a statement line,
 * the start of a record id they can match against the Advice record tab. A CIF is already on the
 * page and an insight's kind is drawn by the caller with its label, so neither is repeated here.
 */
export function sourceRef(source: Fact['source']): string | null {
  const ref = source.ref
  if (!ref) return null
  switch (source.kind) {
    case 'roadmap': {
      const version = /^v(\d+)$/.exec(ref)
      return version ? `Version ${version[1] ?? ''}` : ref
    }
    case 'ledger': {
      const line = ref.split(':').pop() ?? ref
      return `Line ${line}`
    }
    case 'advice':
    case 'decision':
      return `Record ${ref.slice(0, 8)}`
    case 'profile':
    case 'insight':
    case 'snapshot':
      return null
  }
}

/* ---------------------------------------------------------------- History */

/** What the API accepts for one remembered turn. */
const TURN_TEXT_MAX = 2000
const HISTORY_MAX = 12

export interface PastTurn {
  question: string
  sentences: readonly CitedSentence[]
}

/**
 * The conversation so far, as the ask route takes it: most recent last, at most twelve turns, each
 * within the length the contract allows. The answers go back as their plain sentences; the
 * citations are the server's to rebuild, not ours to send.
 */
export function historyOf(
  turns: readonly PastTurn[],
): { role: 'user' | 'assistant'; text: string }[] {
  const out: { role: 'user' | 'assistant'; text: string }[] = []
  for (const turn of turns) {
    const question = turn.question.trim()
    if (question) out.push({ role: 'user', text: question.slice(0, TURN_TEXT_MAX) })
    const answer = turn.sentences
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join(' ')
    if (answer) out.push({ role: 'assistant', text: answer.slice(0, TURN_TEXT_MAX) })
  }
  return out.slice(-HISTORY_MAX)
}

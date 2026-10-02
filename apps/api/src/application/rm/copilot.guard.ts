/**
 * The guard between the model and the RM: what a model's sentence must prove before anyone
 * reads it.
 *
 * The prompt asks the model to cite the facts each sentence rests on and to quote figures
 * rather than compute them. A prompt is a request, so this file checks, sentence by sentence,
 * and drops what fails:
 *
 * - **Every cited id exists**, and there is at least one. A sentence with no citation is a
 *   claim with no footnote.
 * - **Every figure appears in a cited fact.** Rupees, percentages, counts, dates and number
 *   words, compared by value after taking out ₹, digit grouping and lakh/crore units, so
 *   "₹2 lakh" may quote "₹2,00,000" but "₹1.86L" may not quote "₹1,86,240": the first is the
 *   same number, the second is a rounding the model did itself.
 * - **A product it names is one a cited fact names**, and a product the rules refuse this
 *   customer is never put forward. The model does not decide suitability; this is the backstop
 *   behind the prompt's rule, not the rule itself.
 * - **No word the desk has banned** ("envelope", "deployable surplus", "DPD" …).
 *
 * What it cannot check is meaning: a sentence that quotes "2" from "2 dependents" as a count of
 * loans passes. That is why every sentence carries its citations to the screen, and why the UI
 * labels model text "check before advising".
 */
import { evaluate } from '@dhan/core'
import type { CitedSentence, Fact } from '@dhan/contracts'
import type { ShelfProduct } from '../../ports/index.ts'
import type { CustomerState } from './customer-state.ts'

/* ------------------------------------------------------------------ *
 * Figures
 * ------------------------------------------------------------------ */

const UNIT: Readonly<Record<string, number>> = {
  l: 1e5,
  lac: 1e5,
  lacs: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  cr: 1e7,
  crore: 1e7,
  crores: 1e7,
  k: 1e3,
}

/**
 * A figure as written: an optional currency mark, digits with any grouping, an optional
 * decimal, an optional Indian unit and an optional ordinal ending. The unit must end the word,
 * so "5 kids" is the number 5 and not five thousand.
 */
const FIGURE =
  /(?:₹|\brs\.?|\binr)?\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(lakhs?|lacs?|crores?|cr|l|k)(?![a-z]))?(?:st|nd|rd|th)?(?![a-z\d])/gi

/**
 * Numbers spelled out. "one" is left out: it is far more often a pronoun ("the one action")
 * than a count, and a guard that dropped every such sentence would drop good ones. Words for a
 * calculation ("half", "double") are in, because they are exactly the arithmetic the model was
 * told not to do.
 */
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1e3,
  lakh: 1e5,
  lakhs: 1e5,
  crore: 1e7,
  crores: 1e7,
  million: 1e6,
  billion: 1e9,
  dozen: 12,
  twice: 2,
  double: 2,
  doubled: 2,
  triple: 3,
  tripled: 3,
  half: 0.5,
  quarter: 0.25,
}
const WORD = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi')

/** Rounded to the paisa so 1.86 × 1e5 and 186000 compare equal. */
const keyOf = (n: number): number => Math.round(n * 100) / 100

interface Figure {
  /** As written, for the log. */
  raw: string
  value: number
  /** The number word, lower-cased, where the figure was spelled out. */
  word: string | null
}

/** Every figure in a text: written ones first, then number words in what is left. */
export function figuresIn(text: string): Figure[] {
  const out: Figure[] = []
  const rest = text.replace(FIGURE, (raw: string, digits: string, unit: string | undefined) => {
    const scale = unit === undefined ? 1 : (UNIT[unit.toLowerCase()] ?? 1)
    out.push({
      raw: raw.trim(),
      value: keyOf(Number(digits.replace(/,/g, '')) * scale),
      word: null,
    })
    return ' '
  })
  for (const m of rest.matchAll(WORD)) {
    const word = (m[1] ?? '').toLowerCase()
    out.push({ raw: word, value: keyOf(NUMBER_WORDS[word] ?? Number.NaN), word })
  }
  return out
}

/**
 * The figures in `text` that none of `facts` contains. A figure is contained when a fact holds
 * the same value, however it is grouped; a number word also when a fact uses the same word
 * ("ten times" quoting "ten times").
 */
export function unsupportedFigures(text: string, facts: readonly Fact[]): string[] {
  const allowed = facts.flatMap((f) => figuresIn(f.text))
  const values = new Set(allowed.map((f) => f.value))
  const words = new Set(allowed.map((f) => f.word).filter((w): w is string => w !== null))
  return figuresIn(text)
    .filter((f) => !values.has(f.value) && (f.word === null || !words.has(f.word)))
    .map((f) => f.raw)
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ')

/** The names a product goes by, normalised, past the two-character tickers that match inside words. */
function needles(product: ShelfProduct): string[] {
  return [product.name, ...product.aliases].map((n) => norm(n).trim()).filter((n) => n.length > 2)
}

/**
 * The one shelf product a question names: the longest name or alias found in it, as the text
 * chat's gate matches (`conversation.service.ts`), so "IDBI Flexi Cap" is never answered as a
 * shorter name it contains. Null where it names none; nothing is guessed.
 */
export function namedProduct(text: string, shelf: readonly ShelfProduct[]): ShelfProduct | null {
  const haystack = ` ${norm(text)} `
  let best: ShelfProduct | null = null
  let bestLength = 0
  for (const product of shelf) {
    for (const needle of needles(product)) {
      if (needle.length > bestLength && haystack.includes(` ${needle} `)) {
        best = product
        bestLength = needle.length
      }
    }
  }
  return best
}

/** Every shelf product a sentence names, by any of its names. */
export function productsNamed(text: string, shelf: readonly ShelfProduct[]): ShelfProduct[] {
  const haystack = ` ${norm(text)} `
  return shelf.filter((p) => needles(p).some((n) => haystack.includes(` ${n} `)))
}

/** Words that put a product forward. */
const ADVOCACY =
  /\b(recommend\w*|suggest\w*|offer\w*|pitch\w*|sell\w*|propos\w*|buy\w*|start\w*|open\w*|switch\w*|invest\w*|consider\w*|go for|sign\w* up|enrol\w*|take out|top up|good fit|right for|suits?|suited|suitable|worth)\b/i
/** Words that hold one back. A sentence that refuses a product may name it. */
const RESTRAINT =
  /\b(not|no|never|cannot|avoid\w*|hold\w* off|held back|hold\w* back|refus\w*|block\w*|turn\w* down|declin\w*|until|unsuitable|wrong|instead|rather than)\b|n't\b/i

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

/** The desk's copy rules and the brand's banned list (docs/product/rm-console.md, "Copy"). */
const BANNED =
  /\b(envelopes?|deployable|dpd|indicative requirement|seamless\w*|leverag\w*|empower\w*|revolutionary|game-changing|holistic|cutting-edge)\b/i

/* ------------------------------------------------------------------ *
 * Parsing and keeping
 * ------------------------------------------------------------------ */

export type DropReason =
  | 'uncited'
  | 'unknown_fact'
  | 'figure_not_in_facts'
  | 'product_not_in_facts'
  | 'refused_product_put_forward'
  | 'banned_word'
  | 'malformed'
  | 'no_section'

export interface Candidate {
  /** The section heading the line fell under, as the model wrote it; null before any heading. */
  section: string | null
  text: string
  cites: string[]
}

const CITATION = /\[\s*(F\d+(?:\s*[,;]\s*F\d+)*)\s*\]/gi
/** A list marker a model adds despite being told not to: "- ", "* ", "• ", "1. ", "2) ". */
const MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/

/**
 * One line a model wrote, as a sentence and the ids it cites. Every `[F…]` group in the line is
 * collected, wherever it sits, and taken out of the text; a line with none is uncited.
 */
export function parseLine(line: string): { text: string; cites: string[] } {
  const cites: string[] = []
  const text = line
    .replace(MARKER, '')
    .replace(/\*\*|__/g, '')
    .replace(CITATION, (_m, ids: string) => {
      for (const id of ids.split(/[,;]/)) cites.push(id.trim().toUpperCase())
      return ' '
    })
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const ended = text.length > 0 && !/[.!?"”')]$/.test(text) ? `${text}.` : text
  return { text: ended, cites: [...new Set(cites)] }
}

/** The model's text as lines, each under the last heading `heading` recognised above it. */
export function candidates(output: string, heading: (line: string) => string | null): Candidate[] {
  let section: string | null = null
  const out: Candidate[] = []
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length === 0) continue
    const title = heading(line)
    if (title !== null) {
      section = title
      continue
    }
    out.push({ section, ...parseLine(line) })
  }
  return out
}

export interface GuardContext {
  facts: readonly Fact[]
  state: Pick<CustomerState, 'snapshot' | 'goal' | 'horizonYears' | 'shelf'>
}

/**
 * Why a sentence must go, or null to keep it.
 *
 * The product checks run the same `evaluate()` the app does, at no amount, for this customer's
 * goal and horizon, as the text chat's gate does for a product named in a question.
 */
export function dropReason(sentence: CitedSentence, ctx: GuardContext): DropReason | null {
  const { text, cites } = sentence
  if (text.length < 3 || text.length > 500 || /\bF\d+\b/.test(text)) return 'malformed'
  if (cites.length === 0) return 'uncited'
  const byId = new Map(ctx.facts.map((f) => [f.id, f]))
  const cited = cites.map((id) => byId.get(id))
  if (cited.some((f) => f === undefined)) return 'unknown_fact'
  const sources = cited.filter((f): f is Fact => f !== undefined)
  if (BANNED.test(text)) return 'banned_word'
  if (unsupportedFigures(text, sources).length > 0) return 'figure_not_in_facts'

  const named = productsNamed(text, ctx.state.shelf)
  if (named.length > 0) {
    const citedText = sources.map((f) => f.text).join(' ')
    const inFacts = productsNamed(citedText, ctx.state.shelf)
    if (named.some((p) => !inFacts.includes(p))) return 'product_not_in_facts'
    if (ADVOCACY.test(text) && !RESTRAINT.test(text)) {
      const { snapshot, goal, horizonYears, shelf } = ctx.state
      const refused = named.some(
        (product) =>
          evaluate({
            product,
            snapshot,
            amount: 0,
            goal: { kind: goal.kind, horizonYears },
            alternatives: shelf,
          }).verdict === 'BLOCKED',
      )
      if (refused) return 'refused_product_put_forward'
    }
  }
  return null
}

export interface Screened {
  kept: Candidate[]
  dropped: { text: string; reason: DropReason }[]
}

/** Each candidate kept or dropped, with the reason, for the log and the tests. */
export function screen(
  lines: readonly Candidate[],
  ctx: GuardContext,
  needsSection: boolean,
): Screened {
  const kept: Candidate[] = []
  const dropped: Screened['dropped'] = []
  for (const line of lines) {
    const reason = needsSection && line.section === null ? 'no_section' : dropReason(line, ctx)
    if (reason === null) kept.push(line)
    else dropped.push({ text: line.text, reason })
  }
  return { kept, dropped }
}

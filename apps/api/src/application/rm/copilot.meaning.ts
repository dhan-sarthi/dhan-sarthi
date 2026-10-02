/**
 * What a rupee figure means, read off the words around it, so the guard can hold a sentence to
 * the meaning its facts give a figure and not only to the figure.
 *
 * The figure guard (`copilot.guard.ts`) proves that every figure a sentence quotes is in a fact
 * it cites. That is not enough on its own: Imran's facts hold "₹73,478 in reach" and "₹3.76L
 * short of 6 months", and a model wrote "₹73,478 is short of 6 months". Every figure is in the
 * cited fact; the sentence is still wrong, because it calls the reachable balance the shortfall.
 *
 * Each fact's figures are typed here, deterministically, from the fact's own words: a rupee
 * figure takes the label of the nearest label word in its clause ("₹3.76L short" is a
 * shortfall, "a need of ₹2,30,40,000" is cover needed). The same reading is applied to a model's
 * sentence, and the sentence is mislabelled only on a contradiction the facts prove:
 *
 * - the sentence gives a figure a label,
 * - the cited facts type that same figure, and never with that label (or one plain English lets
 *   it stand for: `ALSO_MEANS`), and
 * - the cited facts give that label to a different figure.
 *
 * So a figure the facts leave untyped is never judged, and a label the facts never use is never
 * judged. Both cost some misses; both keep false drops close to none, which matters more: a
 * dropped good sentence sends the RM the rules' brief, a kept bad one is caught by the "check
 * before advising" label and the footnote beside it.
 *
 * Only rupee figures are typed (a ₹ or Rs mark, a lakh or crore unit, or Indian digit grouping).
 * Counts and dates ("6 months", "3 dependents") are where the label words sit too close to
 * every figure to read reliably, and they are not where the misleading confusions are.
 */
import type { Fact } from '@dhan/contracts'

/** The meanings a rupee figure can have in the copilot's facts, by the words that carry them. */
export type FigureLabel =
  'shortfall' | 'need' | 'held' | 'outstanding' | 'income' | 'outgoings' | 'left over' | 'idle'

/**
 * The words that give a figure its meaning. Kept to words that mean one thing beside a figure:
 * "has", "cover", "loan" and "debt" are left out because they sit beside figures of every kind
 * ("the car loan's ₹18,500 EMI"). So are "balance", which is a card's as often as a savings
 * account's ("a card balance of ₹1,86,240"), and a bare "left", which is a loan's as often as
 * the month's ("₹6,28,075 left to pay"); the facts say "in reach", "leaving" and "left over".
 */
const LABEL_WORDS: Readonly<Record<string, FigureLabel>> = {
  short: 'shortfall',
  shortfall: 'shortfall',
  shortfalls: 'shortfall',
  gap: 'shortfall',
  deficit: 'shortfall',
  need: 'need',
  needs: 'need',
  needed: 'need',
  required: 'need',
  requires: 'need',
  requirement: 'need',
  held: 'held',
  holds: 'held',
  reach: 'held',
  savings: 'held',
  deposits: 'held',
  outstanding: 'outstanding',
  owes: 'outstanding',
  owed: 'outstanding',
  owing: 'outstanding',
  income: 'income',
  salary: 'income',
  earns: 'income',
  declared: 'income',
  outgoings: 'outgoings',
  goingout: 'outgoings',
  spends: 'outgoings',
  spending: 'outgoings',
  spent: 'outgoings',
  commits: 'outgoings',
  committed: 'outgoings',
  leftover: 'left over',
  leaving: 'left over',
  spare: 'left over',
  surplus: 'left over',
  idle: 'idle',
  untouched: 'idle',
}

/** Words that end a clause: what sits on the other side describes another figure. */
const CLAUSE_WORDS = new Set([
  'and',
  'but',
  'or',
  'while',
  'whereas',
  'against',
  'versus',
  'vs',
  'than',
  'so',
  'because',
  'which',
])

/** Two-word labels, joined so they read as one word. */
const PHRASES: readonly [RegExp, string][] = [
  [/\bgoing\s+out\b/gi, 'goingout'],
  [/\bleft\s+over\b/gi, 'leftover'],
]

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
 * A figure (with its currency mark and unit, as the figure guard reads them), a word, or a mark
 * that ends a clause. A full stop ends one; a decimal point does not.
 */
const TOKEN =
  /((?:₹|\brs\.?|\binr)\s?)?(\d[\d,]*(?:\.\d+)?)(?:\s?(lakhs?|lacs?|crores?|cr|l|k)(?![a-z]))?(?:st|nd|rd|th)?(?![a-z\d])|([a-z]+(?:['’-][a-z]+)*)|([,;:()[\]—–?!"“”]|\.(?!\d)|\s-\s)/gi

type Token =
  | { kind: 'figure'; value: number; raw: string; money: boolean }
  | { kind: 'word'; word: string }
  | { kind: 'stop' }

/** Rounded to the paisa, as the figure guard compares, so ₹3.76L and 3,76,000 are one value. */
const keyOf = (n: number): number => Math.round(n * 100) / 100

function tokens(text: string): Token[] {
  let joined = text
  for (const [phrase, word] of PHRASES) joined = joined.replace(phrase, word)
  const out: Token[] = []
  for (const m of joined.matchAll(TOKEN)) {
    const [raw, mark, digits, unit, word] = m
    if (digits !== undefined) {
      const scale = unit === undefined ? 1 : (UNIT[unit.toLowerCase()] ?? 1)
      out.push({
        kind: 'figure',
        value: keyOf(Number(digits.replace(/,/g, '')) * scale),
        raw: raw.trim(),
        money: mark !== undefined || unit !== undefined || digits.includes(','),
      })
    } else if (word !== undefined) {
      const w = word.toLowerCase()
      out.push(CLAUSE_WORDS.has(w) ? { kind: 'stop' } : { kind: 'word', word: w })
    } else {
      out.push({ kind: 'stop' })
    }
  }
  return out
}

export interface TypedFigure {
  /** As written, for the log. */
  raw: string
  value: number
  label: FigureLabel
}

/** How far a label word may sit from the figure it names, in words. */
export const FACT_REACH = 5
export const SENTENCE_REACH = 3

/**
 * The label nearest a figure, in its clause and within `reach` words, looking both ways and
 * stopping at another rupee figure (a label past it is that figure's). A tie goes to the word
 * after: "₹3.76L short" and "₹1.86L outstanding" put the label after the figure, which is the
 * commoner order in the facts.
 */
function labelAt(list: readonly Token[], at: number, reach: number): FigureLabel | null {
  const look = (step: 1 | -1): { label: FigureLabel; distance: number } | null => {
    let distance = 0
    for (let i = at + step; i >= 0 && i < list.length; i += step) {
      const t = list[i]
      if (t === undefined || t.kind === 'stop') return null
      if (t.kind === 'figure') {
        if (t.money) return null
        continue
      }
      distance += 1
      if (distance > reach) return null
      const label = LABEL_WORDS[t.word]
      if (label !== undefined) return { label, distance }
    }
    return null
  }
  const after = look(1)
  const before = look(-1)
  if (after && (!before || after.distance <= before.distance)) return after.label
  return before?.label ?? null
}

/** Every rupee figure in `text` that a label word names. Figures nothing names are left out. */
export function typedFigures(text: string, reach = FACT_REACH): TypedFigure[] {
  const list = tokens(text)
  const out: TypedFigure[] = []
  list.forEach((t, i) => {
    if (t.kind !== 'figure' || !t.money) return
    const label = labelAt(list, i, reach)
    if (label !== null) out.push({ raw: t.raw, value: t.value, label })
  })
  return out
}

/**
 * What a sentence's label may stand for besides itself. One way only, and only where plain
 * English says both: "needs ₹2,27,70,000 more cover" calls the shortfall a need, and "₹7,69,641
 * held in savings" calls the idle part of the savings held. The other way round is the error
 * this file exists for: the cover needed called the gap, or all the savings called idle.
 */
const ALSO_MEANS: Readonly<Partial<Record<FigureLabel, readonly FigureLabel[]>>> = {
  need: ['shortfall'],
  held: ['idle'],
}

const agrees = (claim: FigureLabel, fact: FigureLabel): boolean =>
  claim === fact || (ALSO_MEANS[claim]?.includes(fact) ?? false)

/**
 * The first figure `text` gives a meaning its cited facts contradict, as "₹73,478 as shortfall",
 * or null. See the file comment for what counts as a contradiction.
 */
export function mislabelledFigure(text: string, cited: readonly Fact[]): string | null {
  const known = cited.flatMap((f) => typedFigures(f.text, FACT_REACH))
  if (known.length === 0) return null
  for (const claim of typedFigures(text, SENTENCE_REACH)) {
    const same = known.filter((k) => k.value === claim.value)
    if (same.length === 0 || same.some((k) => agrees(claim.label, k.label))) continue
    if (known.some((k) => k.label === claim.label && k.value !== claim.value)) {
      return `${claim.raw} as ${claim.label}`
    }
  }
  return null
}

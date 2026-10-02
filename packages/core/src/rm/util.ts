/**
 * Small helpers shared by the RM definitions and deliberately not re-exported from the package:
 * they are how these modules read the engine's sentences, not definitions anyone else should
 * build on.
 */
import { daysBetween } from '../dates.ts'

export const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * Every rupee figure in a sentence, in order, as rupees.
 *
 * Reads the two forms the engine writes: the exact `₹1,86,240` and the spoken `₹1.5 lakh` /
 * `₹1.2 crore` it uses for round targets such as a cover amount.
 */
export function amountsIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/₹\s?(-?[\d,]+(?:\.\d+)?)(?:\s(lakh|crore)\b)?/g)) {
    const digits = m[1]
    if (digits === undefined) continue
    const base = Number(digits.replace(/,/g, ''))
    if (!Number.isFinite(base)) continue
    const unit = m[2] === 'crore' ? 1e7 : m[2] === 'lakh' ? 1e5 : 1
    out.push(Math.round(base * unit))
  }
  return out
}

/** The first percentage in a sentence, as a number: "34.8%" is 34.8. */
export function percentIn(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)%/.exec(text)
  return m?.[1] === undefined ? null : Number(m[1])
}

/** The first number immediately before `word`: `numberBefore('about 1.4 months', 'months')`. */
export function numberBefore(text: string, word: string): number | null {
  // A lookahead rather than `\b`, so a word ending in punctuation ("months'") still matches.
  const m = new RegExp(String.raw`(\d+(?:\.\d+)?) ${word}(?![A-Za-z])`).exec(text)
  return m?.[1] === undefined ? null : Number(m[1])
}

/**
 * The engine's second person, turned into the RM's third.
 *
 * Insight evidence is written to the customer ("2 people depend on you", "your lowest balance").
 * The console's copy rule is that the RM reads about the customer, never as them, so evidence
 * is re-voiced on the way through rather than rewritten: it is the audit trail, and the closer
 * it stays to what the customer was shown, the more it is worth. Object pronouns go first, so
 * "depend on you" becomes "depend on them" before the bare "you" rule could make it "on they".
 *
 * Two kinds of object come before the prepositions. "Than you" is a subject when a verb follows
 * ("₹40,000 more than you have" is "than they have", not "than them have") and an object when
 * nothing does ("more than you." is "than them."). And "you" straight after a verb the engine
 * uses on the customer ("this is costing you", "gets you there", "costs you more") is the
 * verb's object, so "them"; the bare rule made it "costing they". A verb that is not listed
 * falls through to "they", which is right wherever "you" is the subject ("the limit you set").
 * Words that are as often nouns ("the charges you pay", "the covers you hold") stay off the
 * list for the same reason.
 */
const OBJECT_AFTER =
  'costs?|costing|gets?|getting|gives?|giving|tells?|telling|shows?|showing|finds?|sells?|' +
  'selling|owes?|earns?|earning|helps?|helping|lets?|pays?|paying|saves?|saving|makes?|' +
  'making|takes?|protects?|reminds?|charging|brings?'

const PRONOUNS: readonly [RegExp, string][] = [
  [/\bas you told us\b/gi, 'as declared'],
  [/\bthan you(?= [a-z])/gi, 'than they'],
  [new RegExp(String.raw`\b(${OBJECT_AFTER}) you\b`, 'gi'), '$1 them'],
  [/\b(on|to|for|with|from|at|by|of|than) you\b/gi, '$1 them'],
  [/\byou're\b/gi, "they're"],
  [/\byou've\b/gi, "they've"],
  [/\byourself\b/gi, 'themselves'],
  [/\byours\b/gi, 'theirs'],
  [/\byour\b/gi, 'their'],
  [/\byou\b/gi, 'they'],
]

export function revoice(text: string): string {
  let out = text
  for (const [pattern, replacement] of PRONOUNS) {
    out = out.replace(pattern, (match, ...groups: unknown[]) => {
      const first = groups[0]
      const expanded = replacement.replace(/\$1/g, typeof first === 'string' ? first : '')
      // Keep a sentence-initial capital: "Your card" becomes "Their card", not "their card".
      return /^[A-Z]/.test(match) && !/^[A-Z]/.test(expanded)
        ? expanded.charAt(0).toUpperCase() + expanded.slice(1)
        : expanded
    })
  }
  return out
}

/**
 * Whole days from `at` to `asOf`, never negative; null where there is no date.
 *
 * Accepts a simulated date or a real ISO instant: activity mixes the two (a decision carries
 * the session's simulated date, a call its wall-clock time), and the date part is all a day
 * count needs. An instant later than the RM clock reads as today rather than as the future.
 */
export function daysSince(at: string | null, asOf: string): number | null {
  if (at === null) return null
  return Math.max(0, daysBetween(at.slice(0, 10), asOf.slice(0, 10)))
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/** "Card at 34.8%" becomes "card at 34.8%", for a title quoted inside a sentence. */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/** Code-unit order, so a sort is the same on every machine whatever its locale. */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

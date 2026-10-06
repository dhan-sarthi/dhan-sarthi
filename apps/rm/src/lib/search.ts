/**
 * How Cmd-K decides what a query matches, and in what order.
 *
 * The palette used cmdk's own filter, a loose subsequence match: "Sneha" found Sneha Kulkarni and
 * then Gurpreet Singh and Prakash Wankhede, whose names merely contain s, n, e, h and a in order.
 * An RM types a name, a CIF or a city, and wants that person first and nobody unrelated after.
 *
 * So matches are graded, best first: the whole name; the CIF; the start of the name; the start of
 * a word in it ("desh" for Karan Deshpande, "kar desh" for both words); the start or the tail of
 * a CIF (RMs read the last digits off a form); the city; a run of four or more letters inside the
 * name; and, last, a name with one typo in a word of four letters or more. Anything weaker is not
 * a match and is not listed. A typo is only a fallback (`rankCustomers`): "Snea" finds Sneha when
 * nothing else matches, but "desh" lists the Deshpandes and Deshmukhs without a Desai under them.
 *
 * Pure, no React, no DOM: `search.test.ts` runs it under `node --test`.
 */

export type MatchField = 'name' | 'cif' | 'city'

export interface CustomerMatch {
  /** Higher is better; only the order means anything. */
  score: number
  field: MatchField
  /** The matched run in the name, as [start, end) character offsets, for drawing it bold. */
  highlight: readonly [number, number] | null
}

export interface CustomerFields {
  name: string
  cif: string
  city: string
}

/** Lower case, accents off, one space between words. */
export function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function compact(text: string): string {
  return normalise(text).replace(/[\s-]/g, '')
}

interface Word {
  text: string
  start: number
}

/** The words of an already-normalised string, with where each starts. */
function wordsOf(text: string): Word[] {
  const out: Word[] = []
  const re = /[^ ]+/g
  for (let m = re.exec(text); m !== null; m = re.exec(text))
    out.push({ text: m[0], start: m.index })
  return out
}

/**
 * Every token in the query starts a different word of the target, in any order. Returns where the
 * first token's word starts, or -1.
 */
function tokensStartWords(tokens: readonly string[], words: readonly Word[]): number {
  const used = new Set<number>()
  let first = -1
  for (const [t, token] of tokens.entries()) {
    const i = words.findIndex((w, k) => !used.has(k) && w.text.startsWith(token))
    if (i < 0) return -1
    used.add(i)
    if (t === 0) first = words[i]?.start ?? -1
  }
  return first
}

/** True when `a` becomes `b` with one insertion, deletion, substitution or swap of neighbours. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const diff: number[] = []
    for (let i = 0; i < a.length && diff.length <= 2; i += 1) if (a[i] !== b[i]) diff.push(i)
    if (diff.length === 1) return true
    const [x, y] = diff
    return diff.length === 2 && x !== undefined && y === x + 1 && a[x] === b[y] && a[y] === b[x]
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a]
  for (let i = 0; i < long.length; i += 1) {
    if (long.slice(0, i) + long.slice(i + 1) === short) return true
  }
  return false
}

/** The shortest token one typo is allowed in. Below this, one edit turns most names into most others. */
export const TYPO_MIN_LENGTH = 4

/** The score of a match that needed a typo forgiven: the weakest kind there is. */
export const TYPO_SCORE = 20

/** The best way `query` matches a customer, or null when it does not match at all. */
export function matchCustomer(query: string, fields: CustomerFields): CustomerMatch | null {
  const q = normalise(query)
  if (q === '') return null
  const tokens = q.split(' ')
  const name = normalise(fields.name)
  const city = normalise(fields.city)
  const cif = compact(fields.cif)
  const qCif = compact(query)
  const nameWords = wordsOf(name)
  // Offsets only line up with the original when normalising kept its length (plain ASCII names).
  const sameShape = name.length === fields.name.length
  const span = (start: number, length: number): CustomerMatch['highlight'] =>
    sameShape && start >= 0 ? [start, start + length] : null

  if (name === q) return { score: 100, field: 'name', highlight: span(0, q.length) }
  if (cif === qCif) return { score: 98, field: 'cif', highlight: null }
  if (name.startsWith(q)) return { score: 90, field: 'name', highlight: span(0, q.length) }

  const wordStart = tokensStartWords(tokens, nameWords)
  if (wordStart >= 0) {
    return { score: 80, field: 'name', highlight: span(wordStart, tokens[0]?.length ?? 0) }
  }

  // A CIF is read off a form from either end: "IDBI00077" or "1205".
  if (qCif.length >= 3 && cif.startsWith(qCif)) return { score: 75, field: 'cif', highlight: null }
  if (/^\d{4,}$/.test(qCif) && cif.endsWith(qCif)) {
    return { score: 70, field: 'cif', highlight: null }
  }

  if (city === q) return { score: 58, field: 'city', highlight: null }
  if (q.length >= 2 && city.startsWith(q)) return { score: 55, field: 'city', highlight: null }

  // "sneha mumbai": name words and the city together.
  const combined = wordsOf(`${name} ${city}`)
  if (tokens.length > 1 && tokensStartWords(tokens, combined) >= 0) {
    return { score: 50, field: 'name', highlight: null }
  }

  if (q.length >= 4 && !q.includes(' ')) {
    const at = name.indexOf(q)
    if (at >= 0) return { score: 30, field: 'name', highlight: span(at, q.length) }
  }

  // One typo in a token of four letters or more, against the start of a word of the name. The
  // first letter has to be right: people rarely miss it, and it keeps "Ravi" from finding "Kavi".
  const typo = tokens.every(
    (token) =>
      token.length >= TYPO_MIN_LENGTH &&
      nameWords.some(
        (w) =>
          w.text[0] === token[0] &&
          (withinOneEdit(token, w.text.slice(0, token.length)) ||
            withinOneEdit(token, w.text.slice(0, token.length + 1)) ||
            withinOneEdit(token, w.text.slice(0, token.length - 1))),
      ),
  )
  if (typo) return { score: TYPO_SCORE, field: 'name', highlight: null }

  return null
}

export interface RankedCustomer<T> {
  row: T
  match: CustomerMatch
}

/**
 * The customers a query finds, best first, at most `limit`. Typo matches are listed only when
 * nothing matched without one: forgiving a slip is for when the RM would otherwise see nothing,
 * not for padding a list that already has the person in it. Ties keep the book's order.
 */
export function rankCustomers<T extends CustomerFields>(
  query: string,
  rows: readonly T[],
  limit = Infinity,
): RankedCustomer<T>[] {
  const found: RankedCustomer<T>[] = []
  for (const row of rows) {
    const match = matchCustomer(query, row)
    if (match) found.push({ row, match })
  }
  const exact = found.some((f) => f.match.score > TYPO_SCORE)
  return rankBy(
    exact ? found.filter((f) => f.match.score > TYPO_SCORE) : found,
    (f) => f.match.score,
    limit,
  )
}

export interface PageFields {
  label: string
  hint: string
}

/** A page matches on the start of its name or of a word in it, or, more weakly, of its hint. */
export function matchPage(query: string, page: PageFields): number | null {
  const q = normalise(query)
  if (q === '') return null
  const tokens = q.split(' ')
  const label = normalise(page.label)
  if (label === q) return 100
  if (label.startsWith(q)) return 90
  if (tokensStartWords(tokens, wordsOf(label)) >= 0) return 80
  if (q.length >= 3 && tokensStartWords(tokens, wordsOf(normalise(page.hint))) >= 0) return 40
  return null
}

/**
 * The matching items, best first. Ties keep the order they came in, so the caller decides what
 * an even match falls back to (the book's own order, say).
 */
export function rankBy<T>(
  items: readonly T[],
  score: (item: T) => number | null,
  limit = Infinity,
): T[] {
  return items
    .map((item, index) => ({ item, index, score: score(item) }))
    .filter((x): x is { item: T; index: number; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item)
}

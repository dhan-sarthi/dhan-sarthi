/**
 * The shape of what the RM reads, whoever wrote the words: one sentence at a time, its
 * citations in order, and the brief's talking points in the engine's order with the engine's
 * tags.
 *
 * The model is asked to keep the engine's order and to write one sentence a line. It does not
 * always, so the code does it:
 *
 * - **One sentence a line.** A line holding two sentences is split, each sentence keeping the
 *   ids written after it, or the line's closing ids where it has none of its own. A full stop
 *   inside quotation marks is the customer's words, not a sentence end, and "Question? Answer."
 *   stays whole. Under "They may ask" no line is split: a question and its answer are one point.
 * - **Citations ascending, without repeats**, as the RM reads them. The console numbers
 *   footnotes 1, 2, 3 by first citation down the page, so ids sorted by fact number alone can
 *   still print "2 1": the answer's first sentence cites the check (F27, footnote 1) and its
 *   second cites [F6, F27]. Each sentence's ids therefore go in the order their footnotes are
 *   numbered: ids already cited above first, then new ones by fact number. A sentence citing
 *   nothing earlier reads [F6, F14], never [F14, F6, F14].
 * - **The engine's ranking.** Each fact that states a signal carries the signal's rank and
 *   severity, the order Uday's read and the signals list use. A fact that is the evidence for a
 *   signal (the overdue loan behind a missed repayment, the cover behind a cover gap) carries its
 *   signal's rank too. Under "Talk about" and "Be careful about" the sentences are ordered by the
 *   best rank they cite; a sentence citing no ranked fact keeps its place among the others,
 *   after the ranked ones.
 * - **Tags from severity.** A lead the model wrote ("Urgent first:", "Important:") is removed,
 *   and each talking point that cites a signal's own line is tagged "Urgent:", "Important:" or
 *   "Opportunity:" from that signal's severity, so the chip the UI draws always has the signal
 *   among its footnotes. A point resting only on evidence is ordered by it but not tagged.
 * - **No claim against the ranking.** A sentence that calls something urgent is dropped unless
 *   it cites a fact that says "urgent": an urgent signal's line, or the goal line ("an urgent
 *   issue is open"). So is a ranked sentence that says "first" or "next" and was moved: after
 *   reordering, its words would contradict its place.
 */
import type { CitedSentence, Fact } from '@dhan/contracts'
import type { SignalKind, SignalSeverity } from '@dhan/core'
import type { FactSheet } from './copilot.facts.ts'
import type { BriefSection } from './copilot.prompt.ts'
import type { BriefPart } from './copilot.rules.ts'
import { HIGH_INTEREST_PCT } from './customer-state.ts'

/* ------------------------------------------------------------------ *
 * One sentence a line
 * ------------------------------------------------------------------ */

const CITE_GROUP = /\[\s*F\d+(?:\s*[,;]\s*F\d+)*\s*\]/i
const CITE_GROUPS_AHEAD = /^(?:\s*\[\s*F\d+(?:\s*[,;]\s*F\d+)*\s*\])*/i
/** What may open the next sentence: a capital or an opening quotation mark. */
const NEXT_SENTENCE = /^\s+["“‘A-Z]/
/** A full stop that ends a short form, not a sentence: "Rs. 500", "No. 4", "e.g. a card". */
const SHORT_FORM = /(?:^|[\s(])(?:rs|no|nos|mr|mrs|ms|dr|st|vs|approx|etc|e\.g|i\.e)\.$/i

/**
 * One line a model wrote, as one line per sentence. Each part keeps its own `[F…]` group; a
 * part with none takes the next group written after it on the line, which is where the model
 * puts the ids that cover the line. A part with no group after it stays uncited, and the guard
 * drops it.
 */
export function sentencesOf(line: string): string[] {
  const parts: string[] = []
  let start = 0
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line.charAt(i)
    if (ch === '"') quoted = !quoted
    else if (ch === '“') quoted = true
    else if (ch === '”') quoted = false
    if (quoted || (ch !== '.' && ch !== '!')) continue
    if (/\d/.test(line.charAt(i + 1))) continue
    if (SHORT_FORM.test(line.slice(Math.max(0, i - 6), i + 1))) continue
    // "1. Karan's card …": a list number, which the guard strips, not a sentence.
    if (/^\s*\d+$/.test(line.slice(start, i))) continue
    let end = i + 1
    while (/[’')]/.test(line.charAt(end))) end += 1
    end += CITE_GROUPS_AHEAD.exec(line.slice(end))?.[0].length ?? 0
    if (!NEXT_SENTENCE.test(line.slice(end))) continue
    parts.push(line.slice(start, end).trim())
    start = end
    i = end - 1
  }
  parts.push(line.slice(start).trim())

  const out = parts.filter((p) => p.length > 0)
  return out.map((part, i) => {
    if (CITE_GROUP.test(part)) return part
    const covering = out.slice(i + 1).find((p) => CITE_GROUP.test(p))
    const group = covering?.match(/\[[^\]]*\](?=[^[]*$)/)?.[0]
    return group ? `${part} ${group}` : part
  })
}

/**
 * The brief's parts whose lines stay whole: a likely question with its short answer is one
 * point, however the model punctuated it ("Imran may ask why investing is on hold. The short
 * answer is …"). Split, the answer would read as a point of its own, and the part's cap would
 * cut the last answer from its question.
 */
export const WHOLE_LINE_SECTIONS: readonly BriefSection[] = ['They may ask']

/**
 * A model's whole reply with every line split by `sentencesOf`, except under a heading in
 * `whole`; headings and blank lines pass through. `heading` recognises a heading line, as the
 * guard's `candidates` does, and an answer to a question has none.
 */
export function oneSentenceALine(
  output: string,
  heading: (line: string) => string | null = () => null,
  whole: readonly string[] = [],
): string {
  let section: string | null = null
  return output
    .split(/\r?\n/)
    .flatMap((line) => {
      if (line.trim().length === 0) return [line]
      const title = heading(line.trim())
      if (title !== null) {
        section = title
        return [line]
      }
      return section !== null && whole.includes(section) ? [line] : sentencesOf(line)
    })
    .join('\n')
}

/* ------------------------------------------------------------------ *
 * Citations
 * ------------------------------------------------------------------ */

const factNumber = (id: string): number => Number(id.slice(1))

/** Fact ids in ascending order, each once: F2 before F10. */
export function sortCites(cites: readonly string[]): string[] {
  return [...new Set(cites)].sort((a, b) => factNumber(a) - factNumber(b))
}

/**
 * The same sentences, read top to bottom, each with its citations in the order the console
 * numbers their footnotes (see the file comment): an id cited above keeps its earlier place,
 * and ids new to a sentence follow by fact number. Every sentence's footnotes then print
 * ascending, and a sentence with only new ids is simply sorted.
 */
export function inReadingOrder(sentences: readonly CitedSentence[]): CitedSentence[] {
  const numbered = new Map<string, number>()
  return sentences.map((s) => {
    const cites = sortCites(s.cites)
    for (const id of cites) if (!numbered.has(id)) numbered.set(id, numbered.size)
    const n = (id: string): number => numbered.get(id) ?? 0
    return { text: s.text, cites: cites.sort((a, b) => n(a) - n(b)) }
  })
}

/** `inReadingOrder` across a whole brief, its parts read in order as the console reads them. */
export function briefInReadingOrder(parts: readonly BriefPart[]): BriefPart[] {
  const read = inReadingOrder(parts.flatMap((p) => p.sentences))
  let at = 0
  return parts.map((p) => {
    const sentences = read.slice(at, at + p.sentences.length)
    at += p.sentences.length
    return { title: p.title, sentences }
  })
}

/* ------------------------------------------------------------------ *
 * Ranks
 * ------------------------------------------------------------------ */

export interface FactRank {
  /** The signal's place in the engine's list, from 0. */
  rank: number
  severity: SignalSeverity
  /** True for the signal's own line; false for a line that is its evidence. */
  signal: boolean
}

/**
 * Each ranked fact's rank and severity: the signal lines in the engine's order, and the lines
 * that are a signal's evidence, at their signal's rank. A loan is evidence for a missed
 * repayment when an instalment is overdue, for expensive debt above the rate the rules hold
 * investments back at, and for a loan ending; savings for a thin buffer or idle cash; cover and
 * policies for a cover gap; what falls due for a maturing deposit or an ending loan.
 */
export function factRanks(sheet: FactSheet): Map<string, FactRank> {
  const ix = sheet.index
  const ranks = new Map<string, FactRank>()
  const bySignal = new Map<SignalKind, FactRank>()
  ix.signals.forEach((s, rank) => {
    const r: FactRank = { rank, severity: s.of.severity, signal: true }
    ranks.set(s.id, r)
    if (!bySignal.has(s.of.kind)) bySignal.set(s.of.kind, r)
  })
  const evidence = (id: string | null, kinds: readonly SignalKind[]): void => {
    if (id === null || ranks.has(id)) return
    let best: FactRank | undefined
    for (const kind of kinds) {
      const r = bySignal.get(kind)
      if (r && (!best || r.rank < best.rank)) best = r
    }
    if (best) ranks.set(id, { ...best, signal: false })
  }
  for (const loan of ix.loans) {
    evidence(loan.id, [
      ...(loan.of.overdueDays > 0 ? (['missed_repayment'] as const) : []),
      ...(loan.of.ratePct >= HIGH_INTEREST_PCT ? (['expensive_debt'] as const) : []),
      'emi_ending',
    ])
  }
  evidence(ix.buffer, ['buffer_thin', 'idle_cash'])
  evidence(ix.protection, ['protection_gap'])
  evidence(ix.policies, ['protection_gap'])
  if (ix.upcoming.of.length > 0) evidence(ix.upcoming.id, ['deposit_maturing', 'emi_ending'])
  return ranks
}

/**
 * The best rank a sentence cites, or null where it cites no ranked fact. `signalsOnly` counts
 * only the signals' own lines, which is what a tag rests on: the footnote under a tagged point
 * then always opens onto the signal that gave it.
 */
export function rankOf(
  cites: readonly string[],
  ranks: ReadonlyMap<string, FactRank>,
  signalsOnly = false,
): FactRank | null {
  let best: FactRank | null = null
  for (const id of cites) {
    const r = ranks.get(id)
    if (r && (!signalsOnly || r.signal) && (best === null || r.rank < best.rank)) best = r
  }
  return best
}

/* ------------------------------------------------------------------ *
 * The brief
 * ------------------------------------------------------------------ */

/** The parts ordered by the engine's ranking, and the one whose points carry a tag. */
export const RANKED_SECTIONS: readonly BriefSection[] = ['Talk about', 'Be careful about']
const TAGGED_SECTION: BriefSection = 'Talk about'

const TAG: Readonly<Record<SignalSeverity, string>> = {
  urgent: 'Urgent',
  important: 'Important',
  opportunity: 'Opportunity',
}

/** A severity lead, however the model wrote it: "Urgent first:", "Important —", "OPPORTUNITY:". */
const LEAD = /^\s*(?:urgent|important|opportunity)(?:\s+first)?\s*[:—–-]\s*/i
/** Words that place a point in a list, or after another one ("also needs attention"). */
const ORDER_WORDS =
  /\b(?:first|firstly|next|second|secondly|third|thirdly|finally|lastly|also|another)\b/i
const URGENT = /\burgent(?:ly)?\b/i
/** "Nothing urgent", "not urgent", "no urgent issue": a sentence saying urgency is absent. */
const NOT_URGENT = /\b(?:no|nothing|not|none|never)\b(?:\W+\w+){0,2}?\W+urgent/i

export type ArrangeDrop = 'urgency_claim' | 'order_claim'

export interface Arranged {
  sections: BriefPart[]
  dropped: { text: string; reason: ArrangeDrop }[]
  /** Whether any ranked part came out in a different order than it went in. */
  reordered: boolean
}

function unlead(text: string): string {
  const rest = text.replace(LEAD, '')
  if (rest === text) return text
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

/**
 * The brief as the RM reads it: leads removed, citations in order, the ranked parts in the
 * engine's order, talking points tagged by severity. Pure; the rules' brief goes through it as
 * the model's does, and comes out in the order it went in. `facts` are the lines the sentences
 * cite, read only for the word "urgent".
 */
export function arrangeBrief(
  parts: readonly BriefPart[],
  ranks: ReadonlyMap<string, FactRank>,
  facts: readonly Fact[],
): Arranged {
  const dropped: Arranged['dropped'] = []
  let reordered = false
  // The signal lines open "Urgent:", so the word alone finds them, and the goal line too.
  const saysUrgent = new Set(facts.filter((f) => URGENT.test(f.text)).map((f) => f.id))
  const sections = parts.map((part): BriefPart => {
    const sentences = part.sentences
      .map((s) => ({ text: unlead(s.text), cites: sortCites(s.cites) }))
      .filter((s) => {
        const claimsUrgency = URGENT.test(s.text) && !NOT_URGENT.test(s.text)
        if (claimsUrgency && !s.cites.some((id) => saysUrgent.has(id))) {
          dropped.push({ text: s.text, reason: 'urgency_claim' })
          return false
        }
        return true
      })
    if (!RANKED_SECTIONS.includes(part.title)) return { title: part.title, sentences }

    const ranked = sentences.map((s, at) => ({
      s,
      at,
      r: rankOf(s.cites, ranks),
      tag: rankOf(s.cites, ranks, true),
    }))
    const sorted = [...ranked].sort(
      (a, b) =>
        (a.r?.rank ?? Number.POSITIVE_INFINITY) - (b.r?.rank ?? Number.POSITIVE_INFINITY) ||
        a.at - b.at,
    )
    const kept = sorted.filter((x, now) => {
      if (now === x.at) return true
      reordered = true
      if (!ORDER_WORDS.test(x.s.text)) return true
      dropped.push({ text: x.s.text, reason: 'order_claim' })
      return false
    })
    // One tag a point: a sentence carrying on from the one above, on the same signal, has none.
    const tagged = kept.map((x, i) => {
      const previous = kept[i - 1]
      const fresh = previous === undefined || previous.tag?.rank !== x.tag?.rank
      return part.title === TAGGED_SECTION && x.tag !== null && fresh
        ? { text: `${TAG[x.tag.severity]}: ${x.s.text}`, cites: x.s.cites }
        : x.s
    })
    return { title: part.title, sentences: tagged }
  })
  return { sections, dropped, reordered }
}

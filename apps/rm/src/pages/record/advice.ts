/**
 * What the two advice-record views (one customer's, the whole book's) share: the rule book in
 * the order it runs, the words for a record's source, and how a hash is shown.
 *
 * The rule book comes from `@dhan/core`, the same list the API judged against, so a ladder of
 * "cleared, stopped here, not reached" can never show a rule the engine does not have, or miss
 * one it added. Nothing here holds a customer fact.
 */
import type { AdviceItem, AdviceSource, VerdictOutcome } from '@dhan/contracts'
import { ruleBook, ruleLabel } from '@dhan/core'

/** The nine rules, in the order `evaluate()` runs them. */
export const RULES: readonly { id: string; label: string; description: string }[] = ruleBook.map(
  (rule) => ({ id: rule.id, label: ruleLabel(rule.id), description: rule.description }),
)

export const RULE_COUNT = RULES.length

/** "Lock-in longer than the goal": the short name a chip or a bar can carry. */
export function ruleName(ruleId: string): string {
  return ruleLabel(ruleId)
}

/** The rule book's own sentence, the authority behind the short name. */
export function ruleSentence(ruleId: string): string | null {
  return RULES.find((r) => r.id === ruleId)?.description ?? null
}

/** 1-based position of a rule in the order the engine runs them; null for an unknown id. */
export function ruleIndex(ruleId: string): number | null {
  const i = RULES.findIndex((r) => r.id === ruleId)
  return i === -1 ? null : i + 1
}

export type RungState = 'passed' | 'failed' | 'not_reached'

export interface Rung {
  id: string
  label: string
  state: RungState
}

/**
 * The rule ladder for one record. The engine stops at the first rule that fails, so a refusal
 * reads "cleared these, stopped here", and every rule after it was never asked. A PASS clears
 * all of them; a product off the shelf was never put to the rules at all.
 */
export function ladder(item: Pick<AdviceItem, 'verdict' | 'ruleId' | 'rulesPassed'>): Rung[] {
  const passed = new Set(item.rulesPassed)
  return RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    state: passed.has(rule.id)
      ? 'passed'
      : item.verdict === 'BLOCKED' && rule.id === item.ruleId
        ? 'failed'
        : 'not_reached',
  }))
}

/** Where the question came from, as the RM would say it. */
export const SOURCE_WORDS: Record<AdviceSource, string> = {
  screen: 'In the app',
  avatar_tool: 'On a call with Uday',
  text: 'Text chat',
  api: 'Bank system',
}

/**
 * One word per verdict, the same on every page. A refusal is the rules working, so it is
 * "Refused" in the brand's ink, never a red "BLOCKED": red would tell the RM something went wrong.
 */
export const VERDICT_WORDS: Record<VerdictOutcome, string> = {
  PASS: 'Passed',
  BLOCKED: 'Refused',
  UNKNOWN_PRODUCT: 'Not on shelf',
}

/** "2 refused · 2 passed": the split under a record's count, in the verdict words. */
export function verdictSplit(items: readonly Pick<AdviceItem, 'verdict'>[]): {
  refused: number
  passed: number
  other: number
} {
  let refused = 0
  let passed = 0
  for (const item of items) {
    if (item.verdict === 'BLOCKED') refused += 1
    else if (item.verdict === 'PASS') passed += 1
  }
  return { refused, passed, other: items.length - refused - passed }
}

/**
 * What the refused requests were worth, summed from the records themselves: the amount each
 * customer asked to put into the product. The engine reads a product-check amount as a monthly
 * commitment unless it was a one-off, and a one-off refusal says so in its recorded wording
 * ("one-off ₹… exceeds reachable balance"), so the two are summed apart rather than mixed.
 * A record with no amount (a question about the product alone) adds nothing.
 *
 * The record carries no cadence field, so this reads the engine's English: anything that does not
 * say "one-off" counts as monthly, which is the engine's own default. A one-off refused by an
 * earlier rule than affordability says nothing about its cadence and is counted monthly too;
 * only a `cadence` on the record (a contract change) can fix that. `advice.test.ts` runs the real
 * gate so a change to its wording fails a test instead of moving a sum.
 */
export function refusedStake(
  items: readonly Pick<AdviceItem, 'verdict' | 'amount' | 'recorded'>[],
): {
  monthly: number
  oneOff: number
  /** Refusals that carried an amount. */
  counted: number
} {
  let monthly = 0
  let oneOff = 0
  let counted = 0
  for (const item of items) {
    if (item.verdict !== 'BLOCKED' || item.amount === null || item.amount <= 0) continue
    counted += 1
    if (/\bone-off\b/i.test(item.recorded)) oneOff += item.amount
    else monthly += item.amount
  }
  return { monthly, oneOff, counted }
}

/** The first eight hex digits: enough to tell two records apart at a glance, as git does. */
export function shortHash(hash: string): string {
  return hash.slice(0, 8)
}

/** A chain's first record points at sixty-four zeros: there is nothing before it. */
export function isGenesis(prevHash: string): boolean {
  return /^0+$/.test(prevHash)
}

/** The real instant a verification ran, to the second: "7:03:12 am". */
export function clockTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

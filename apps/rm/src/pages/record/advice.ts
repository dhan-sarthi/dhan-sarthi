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

export const VERDICT_WORDS: Record<VerdictOutcome, string> = {
  PASS: 'PASS',
  BLOCKED: 'BLOCKED',
  UNKNOWN_PRODUCT: 'NOT ON SHELF',
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

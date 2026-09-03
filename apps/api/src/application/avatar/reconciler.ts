/**
 * After the call: does the provider's transcript agree with our own tool ledger?
 *
 * Two questions. Which of the tool calls we recorded appear as tool results in the transcript,
 * in order — those are `verified`. And did every shelf product the avatar named get a
 * `check_suitability` call — that is gate coverage, and a miss is shown on the Record tab
 * rather than hidden. Our ledger is written inside the handler before the model speaks, so the
 * record never depends on the transcript existing; the transcript only corroborates it.
 *
 * What Runway's record looks like, from the live calls (`docs/engineering/avatar-live-call.md`):
 * one `user` turn holding everything the customer said, and one `assistant` turn whose content is
 * the start script followed by what the model spoke after each tool result, with `toolCalls` and
 * `toolResults` (each carrying an id, the name and our result) attached to that turn. A product
 * the rules themselves proposed as the alternative in a verdict counts as covered: the gate wrote
 * that sentence.
 */
import type { AvatarToolCall, ConversationTurn, Reconciliation } from '@dhan/contracts'
import type { ShelfProduct } from '../../ports/index.ts'

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

const isAssistant = (role: string): boolean => /assistant|agent|avatar|uday/i.test(role)

/** The verdict's product and alternative, as the tool's own result names them. */
function coveredBy(call: AvatarToolCall): string[] {
  const out: string[] = []
  const product = call.result['product']
  if (typeof product === 'string') out.push(product)
  const alternative = call.result['alternative']
  if (alternative && typeof alternative === 'object') {
    const name = (alternative as Record<string, unknown>)['name']
    if (typeof name === 'string') out.push(name)
  }
  return out
}

export function reconcile(
  transcript: readonly ConversationTurn[],
  calls: readonly AvatarToolCall[],
  shelf: readonly ShelfProduct[],
): Reconciliation {
  // Match transcript tool results to our rows by tool name, in order of appearance. A turn that
  // carries results is matched on those alone; its toolCalls list is the same calls again.
  const pending = new Map<string, AvatarToolCall[]>()
  for (const call of [...calls].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const list = pending.get(call.tool) ?? []
    list.push(call)
    pending.set(call.tool, list)
  }

  const verified: string[] = []
  for (const turn of transcript) {
    const results = turn.toolResults ?? []
    const names =
      results.length > 0 ? results.map((r) => r.name) : (turn.toolCalls ?? []).map((c) => c.name)
    for (const name of names) {
      const match = pending.get(name)?.shift()
      if (match && !verified.includes(match.id)) verified.push(match.id)
    }
  }
  const unverified = calls.map((c) => c.id).filter((id) => !verified.includes(id))

  // Gate coverage: every shelf product named by the avatar must have been checked, or been the
  // alternative a check proposed.
  const checked = new Set(calls.filter((c) => c.tool === 'check_suitability').flatMap(coveredBy))
  const spoken = new Set<string>()
  for (const turn of transcript) {
    if (!isAssistant(turn.role)) continue
    const text = norm(turn.text)
    for (const product of shelf) {
      const tokens = [product.name, ...product.aliases].map(norm).filter((t) => t.length >= 4)
      if (tokens.some((t) => text.includes(t))) spoken.add(product.name)
    }
  }
  const misses = [...spoken].filter((name) => !checked.has(name))

  return {
    verified,
    unverified,
    gateCoverage: { fired: spoken.size - misses.length, expected: spoken.size, misses },
  }
}

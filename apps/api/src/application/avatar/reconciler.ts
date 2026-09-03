/**
 * After the call: does the provider's transcript agree with our own tool ledger?
 *
 * Two questions. Which of the tool calls we recorded appear as tool results in the transcript,
 * in order — those are `verified`. And did every shelf product the avatar named get a
 * `check_suitability` call — that is gate coverage, and a miss is shown on the Record tab
 * rather than hidden. Our ledger is written inside the handler before the model speaks, so the
 * record never depends on the transcript existing; the transcript only corroborates it.
 */
import type { AvatarToolCall, ConversationTurn, Reconciliation } from '@dhan/contracts'
import type { ShelfProduct } from '../../ports/index.ts'

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

const isAssistant = (role: string): boolean => /assistant|agent|avatar|uday/i.test(role)

export function reconcile(
  transcript: readonly ConversationTurn[],
  calls: readonly AvatarToolCall[],
  shelf: readonly ShelfProduct[],
): Reconciliation {
  // Match transcript tool results to our rows by tool name, in order of appearance.
  const pending = new Map<string, AvatarToolCall[]>()
  for (const call of [...calls].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const list = pending.get(call.tool) ?? []
    list.push(call)
    pending.set(call.tool, list)
  }

  const verified: string[] = []
  for (const turn of transcript) {
    const names = [
      ...(turn.toolResults ?? []).map((r) => r.name),
      ...(turn.toolCalls ?? []).map((c) => c.name),
    ]
    for (const name of names) {
      const list = pending.get(name)
      const match = list?.shift()
      if (match && !verified.includes(match.id)) verified.push(match.id)
    }
  }
  const unverified = calls.map((c) => c.id).filter((id) => !verified.includes(id))

  // Gate coverage: every shelf product named by the avatar must have been checked.
  const checked = new Set(
    calls
      .filter((c) => c.tool === 'check_suitability')
      .map((c) => c.result['product'])
      .filter((p): p is string => typeof p === 'string'),
  )
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

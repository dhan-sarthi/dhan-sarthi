import type { Account } from './types.ts'

/**
 * A conservative ceiling on owned cash that can be moved now. Available can contain credit,
 * and already includes some holds: cap it by unencumbered ownership, never subtract a lien
 * from available a second time. Missing or stale observations cannot authorize a transfer.
 * Legacy fixture files without a liquidity observation retain their original calculation.
 */
export function reachableOwnFunds(account: Account, asOf: string): number {
  const owned = Math.max(0, account.currentBalance)
  const q = account.liquidity
  if (!q) return owned
  if (q.observedOn !== asOf || q.availableBalance === null || q.lienAmount === null) return 0
  return Math.max(0, Math.min(owned - Math.max(0, q.lienAmount), q.availableBalance))
}

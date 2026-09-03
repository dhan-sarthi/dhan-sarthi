/**
 * The single avatar slot: who holds a credential, who is waiting for one, and the minutes spent.
 *
 * All three live in the store rather than in process memory, so a task replacement cannot
 * orphan a billed session, drop the queue or reset the meter. `tryAcquire` must be atomic —
 * `INSERT … ON CONFLICT DO NOTHING RETURNING` — so two requests landing together, or two tasks
 * overlapping during a deploy, cannot both win one credential.
 *
 * Implemented by `adapters/postgres/lease-store.postgres.ts` (`avatar_leases`,
 * `avatar_waitlist`, `sum(minutes_charged)` over `avatar_sessions`) and
 * `adapters/memory/lease-store.memory.ts` (a Map, for the memory profile).
 */
import type { AvatarEndReason, IsoDate, Timestamp } from '@dhan/contracts'

export interface Lease {
  credentialLabel: string
  sessionId: string
  /** Set by `attach` once the provider has answered with an id. Null while creating. */
  runwaySessionId: string | null
  /** The task that opened the RPC handler. Only it can close the handle. */
  taskId: string
  claimedAt: Timestamp
  expiresAt: Timestamp
}

export interface WaitlistEntry {
  ticket: string
  sessionId: string
  enqueuedAt: Timestamp
  /** While set and in the future, the ticket wins the next acquire. */
  claimableUntil: Timestamp | null
  grantedAt: Timestamp | null
  expiredAt: Timestamp | null
}

export interface LeaseStore {
  tryAcquire(
    credentialLabel: string,
    sessionId: string,
    expiresAt: Timestamp,
    taskId: string,
  ): Promise<Lease | null>
  attach(credentialLabel: string, runwaySessionId: string): Promise<void>
  release(credentialLabel: string, minutesCharged: number, reason: AvatarEndReason): Promise<void>
  /** Leases past their expiry, removed and returned so the caller can cancel the provider side. */
  reapExpired(now: Date): Promise<Lease[]>
  listHeld(): Promise<Lease[]>
  /** Minutes charged on `day`, from the store. The daily budget reads this, never a counter. */
  minutesUsed(day: IsoDate): Promise<number>

  /* The waitlist: FIFO, one ticket per session. */

  /** Idempotent per session: a second join returns the existing ticket. */
  enqueue(sessionId: string): Promise<WaitlistEntry>
  peek(): Promise<WaitlistEntry | null>
  get(ticket: string): Promise<WaitlistEntry | null>
  markClaimable(ticket: string, holdUntil: Timestamp): Promise<void>
  expire(ticket: string): Promise<void>
  dequeue(ticket: string): Promise<void>
  /** 1-based, or null when the ticket is not queued. */
  position(ticket: string): Promise<number | null>
  queueLength(): Promise<number>
}

/**
 * Reviewer sessions: who is being viewed, what day it is, and what they have changed.
 *
 * A session is a row, not a browser. Fifteen reviewers get fifteen rows with fifteen clocks.
 * Only the token's hash is stored; the token itself is handed out once and never seen again.
 *
 * Implemented by `adapters/postgres/session-store.postgres.ts` (`subjects`, `sessions`,
 * `idempotency_keys`; optimistic `version` column) and `adapters/memory/session-store.memory.ts`.
 */
import type {
  CategoryCap,
  ConsentScope,
  GoalAmountBasis,
  IsoDate,
  Timestamp,
} from '@dhan/contracts'

export interface Session {
  id: string
  /** The pseudonymisation seam. Audit rows reference this, never the cif. */
  subjectId: string
  cif: string
  tokenHash: string
  /** The simulated today. */
  asOf: IsoDate
  /** When the customer last opened the app, for "since you were away". */
  lastSeen: IsoDate
  goalTarget: number | null
  /**
   * Which money `goalTarget` is in, or null where the customer never said — read as today's
   * money, exactly as an absent `Goal.amountBasis` is. Stored beside the amount rather than
   * inferred from it: a figure the customer inflated themselves and one in today's money are
   * the same number on the wire and want opposite funding rates.
   */
  goalBasis: GoalAmountBasis | null
  caps: CategoryCap[]
  /** Consent scopes the reviewer has withdrawn for this session. */
  scopeOverrides: ConsentScope[]
  /** Bumped on every patch. A stale expected version is a 409. */
  version: number
  /** Hashed user agent plus /24, for the operator view. Never the IP. */
  clientHint: string | null
  createdAt: Timestamp
  lastActiveAt: Timestamp
  expiresAt: Timestamp
  revokedAt: Timestamp | null
}

export interface NewSession {
  cif: string
  tokenHash: string
  asOf: IsoDate
  lastSeen: IsoDate
  expiresAt: Timestamp
  clientHint?: string
}

export interface SessionPatch {
  asOf?: IsoDate
  lastSeen?: IsoDate
  goalTarget?: number | null
  goalBasis?: GoalAmountBasis | null
  caps?: CategoryCap[]
  scopeOverrides?: ConsentScope[]
}

/** What was answered the first time, so a replay answers the same. */
export interface IdempotentResponse {
  /** sha256 of the canonical request, so a different body under the same key is a 409. */
  requestHash: string
  status: number
  body: unknown
  createdAt: Timestamp
}

export interface SessionStore {
  create(input: NewSession): Promise<Session>
  getByTokenHash(tokenHash: string): Promise<Session | null>
  getById(id: string): Promise<Session | null>
  /**
   * `UPDATE … WHERE id = $1 AND version = $2`. Null when no row matched the expected version:
   * the caller answers 409 STALE_CLOCK and the client refetches.
   */
  patch(id: string, patch: SessionPatch, expectedVersion: number): Promise<Session | null>
  /** Slide the expiry on activity. */
  touch(id: string, at: { lastActiveAt: Timestamp; expiresAt: Timestamp }): Promise<void>
  /** DPDP erasure: delete the subject; sessions and snapshots cascade, audit rows stay. */
  erase(id: string): Promise<void>
  putIdempotent(sessionId: string, key: string, response: IdempotentResponse): Promise<void>
  getIdempotent(sessionId: string, key: string): Promise<IdempotentResponse | null>
  /** Expire sessions idle for `days` as at `now`. Returns how many. */
  expireIdle(days: number, now: Date): Promise<number>
}

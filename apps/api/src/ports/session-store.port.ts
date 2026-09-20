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
import type { SaveState } from '@dhan/core'

/**
 * A spend challenge the customer has started, as the row holds it.
 *
 * Flat on purpose, rather than core's `ChallengeTerms` with its nested `SpendTarget`: a jsonb
 * column shaped like a core interface inherits that interface's next field in every row already
 * written, and nobody goes back and migrates jsonb. Four scalars and an id are a shape the
 * reader can keep honest by hand.
 *
 * Nothing about how the challenge is *going* is stored. What has been spent, which days were
 * clean and whether it was won are read off the statement by `challengeProgress` on every
 * request, so there is no progress here to fall out of step with the transactions it counts —
 * and moving the simulated clock back a week correctly un-wins a challenge.
 */
export interface StoredChallenge {
  id: string
  kind: 'merchant' | 'category'
  /** The merchant name or the derived spend category the limit is set over. */
  name: string
  /** Rupees the customer may spend on the target for the whole challenge. */
  limit: number
  days: number
  /** The simulated date it started, which is day 1. */
  startDate: IsoDate
  /** Wall-clock, for the audit; the simulated date is `startDate`. */
  createdAt: Timestamp
}

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
  /**
   * A monthly ceiling on discretionary spending, set by the customer.
   *
   * Null means none, and the envelope is then whatever the month leaves after everything
   * owed. Beside `caps` rather than inside it: a cap is about one category and this is about
   * all of them, and the daily plan reads the two at different points.
   */
  spendLimit: number | null
  /**
   * The savings pot: which hacks are on, what they have put aside, and how far it is accrued.
   *
   * On the session for the same reason `caps` and `spendLimit` are: it is something the customer
   * decided inside the app, and no statement says it. The deposits are kept rather than
   * recomputed because a hack the customer turned off last month still put money in the pot
   * while it was on, and a projection run from today's settings would quietly take it back out.
   * `accruedTo` is how far the hacks have been paid for; a row whose clock has moved on is not
   * wrong, only behind, and the next read catches it up.
   */
  save: SaveState
  /** The one challenge that can be running at a time, or null. */
  challenge: StoredChallenge | null
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
  spendLimit?: number | null
  /** Written whole: the pot is one document, and a half-patched one is a pot that disagrees. */
  save?: SaveState
  /** Null ends the challenge; absent leaves whatever is running alone. */
  challenge?: StoredChallenge | null
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

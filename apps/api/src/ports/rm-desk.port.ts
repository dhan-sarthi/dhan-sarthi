/**
 * The relationship managers' desk: who may sign in to the console, their sessions, and whose
 * book each customer sits in.
 *
 * Kept apart from `SessionStore` on purpose. A reviewer session opens one customer and an RM
 * session opens a book of them, so the two must not share a table, a token prefix or a lookup:
 * an RM bearer that a customer route could resolve, or the reverse, is the bug this split makes
 * impossible rather than unlikely.
 *
 * Implemented by `adapters/memory/rm-desk.memory.ts` (seeded from the fixtures' desk through
 * `generatedRmDesk`) under the memory source and, from migration 0015,
 * `adapters/postgres/rm-desk.postgres.ts` (`app.rm_users`, `app.rm_sessions`, `app.rm_book`)
 * under Postgres.
 */
import type { Timestamp } from '@dhan/contracts'

export interface RmUser {
  /** Stable id, carried on assignments and in the access log: `rm-<employeeNo>`. */
  rmId: string
  /** What the RM types to sign in. */
  employeeNo: string
  name: string
  desk: string
  city: string
  /**
   * `scrypt$<N>$<r>$<p>$<salt>$<hash>`, salt and hash base64url. Never the password: the store
   * cannot tell anyone what it is, only whether a guess matches (application/rm/password.ts).
   */
  passwordHash: string
}

/** One signed-in console. Only the token's sha256 is held, as for a reviewer session. */
export interface RmSession {
  id: string
  rmId: string
  tokenHash: string
  createdAt: Timestamp
  lastActiveAt: Timestamp
  expiresAt: Timestamp
  revokedAt: Timestamp | null
}

export interface NewRmSession {
  rmId: string
  tokenHash: string
  expiresAt: Timestamp
}

export interface RmDeskPort {
  /** Exact match on the employee number. Null for nobody, never a guess. */
  userByEmployeeNo(employeeNo: string): Promise<RmUser | null>
  userById(rmId: string): Promise<RmUser | null>

  createSession(input: NewRmSession): Promise<RmSession>
  /**
   * The row for a token hash, revoked or expired included: whether it still opens anything is
   * the auth service's decision, made in one place for both adapters.
   */
  sessionByTokenHash(tokenHash: string): Promise<RmSession | null>
  /** Slide the expiry on activity. */
  touchSession(id: string, at: { lastActiveAt: Timestamp; expiresAt: Timestamp }): Promise<void>
  revokeSession(id: string, at: Timestamp): Promise<void>

  /** The RM a customer is assigned to, or null where the customer is in nobody's book. */
  assignmentOf(cif: string): Promise<string | null>
  /** Every cif in one RM's book, in a stable order (cif order). */
  bookOf(rmId: string): Promise<string[]>
}

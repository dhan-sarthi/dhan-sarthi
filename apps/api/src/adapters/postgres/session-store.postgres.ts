/**
 * SessionStore over app.subjects, app.sessions and app.idempotency_keys.
 *
 * Creating a session creates its subject: the pseudonym every audit row will name instead of
 * the cif. `patch` is a single optimistic UPDATE keyed on `version`, so two tabs pressing +1
 * month move the clock once. `erase` deletes the subject and lets the cascade take the session,
 * its snapshots, roadmap versions and idempotency keys; audit rows have no key into any of
 * those and stay where they are.
 */
import type {
  CategoryCap,
  ConsentScope,
  GoalAmountBasis,
  IsoDate,
  Timestamp,
} from '@dhan/contracts'
import { NotFound } from '../../application/errors.ts'
import type { Db } from '../../db/pool.ts'
import type {
  Clock,
  IdempotentResponse,
  NewSession,
  Session,
  SessionPatch,
  SessionStore,
} from '../../ports/index.ts'
import { systemClock } from './clock.ts'

interface SessionRow {
  id: string
  subject_id: string
  cif: string
  token_hash: string
  as_of: IsoDate
  last_seen: IsoDate
  goal_target: number | null
  goal_basis: GoalAmountBasis | null
  caps: CategoryCap[]
  scope_overrides: ConsentScope[]
  version: number
  client_hint: string | null
  created_at: Date
  last_active_at: Date
  expires_at: Date
  revoked_at: Date | null
}

const SESSION_COLUMNS = `
  s.id, s.subject_id, sub.cif, s.token_hash, s.as_of, s.last_seen, s.goal_target, s.goal_basis,
  s.caps, s.scope_overrides, s.version, s.client_hint, s.created_at, s.last_active_at, s.expires_at, s.revoked_at`

const SELECT_SQL = `
  SELECT ${SESSION_COLUMNS}
  FROM app.sessions s JOIN app.subjects sub ON sub.subject_id = s.subject_id`

const iso = (d: Date): Timestamp => d.toISOString()

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    subjectId: row.subject_id,
    cif: row.cif,
    tokenHash: row.token_hash,
    asOf: row.as_of,
    lastSeen: row.last_seen,
    goalTarget: row.goal_target,
    goalBasis: row.goal_basis,
    caps: row.caps,
    scopeOverrides: row.scope_overrides,
    version: row.version,
    clientHint: row.client_hint,
    createdAt: iso(row.created_at),
    lastActiveAt: iso(row.last_active_at),
    expiresAt: iso(row.expires_at),
    revokedAt: row.revoked_at === null ? null : iso(row.revoked_at),
  }
}

export class PostgresSessionStore implements SessionStore {
  private readonly db: Db
  private readonly clock: Clock

  constructor(db: Db, clock: Clock = systemClock) {
    this.db = db
    this.clock = clock
  }

  /** The same store over a transaction's client, for the decision unit of work. */
  bind(db: Db): PostgresSessionStore {
    return new PostgresSessionStore(db, this.clock)
  }

  async create(input: NewSession): Promise<Session> {
    const customer = await this.db.query<{ id: string }>(
      `SELECT id FROM app.customers WHERE cif = $1 AND erased_at IS NULL`,
      [input.cif],
    )
    const customerId = customer.rows[0]?.id
    if (!customerId) throw new NotFound(`No customer with cif ${input.cif}.`)

    const subject = await this.db.query<{ subject_id: string }>(
      `INSERT INTO app.subjects (customer_id, cif) VALUES ($1, $2) RETURNING subject_id`,
      [customerId, input.cif],
    )
    const subjectId = subject.rows[0]?.subject_id as string
    const now = this.clock.now()

    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO app.sessions
         (subject_id, token_hash, as_of, last_seen, client_hint, created_at, last_active_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
       RETURNING id`,
      [
        subjectId,
        input.tokenHash,
        input.asOf,
        input.lastSeen,
        input.clientHint ?? null,
        now,
        new Date(input.expiresAt),
      ],
    )
    const id = rows[0]?.id as string
    return (await this.getById(id)) as Session
  }

  async getByTokenHash(tokenHash: string): Promise<Session | null> {
    const { rows } = await this.db.query<SessionRow>(
      `${SELECT_SQL} WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > $2`,
      [tokenHash, this.clock.now()],
    )
    const row = rows[0]
    return row ? toSession(row) : null
  }

  async getById(id: string): Promise<Session | null> {
    const { rows } = await this.db.query<SessionRow>(`${SELECT_SQL} WHERE s.id = $1`, [id])
    const row = rows[0]
    return row ? toSession(row) : null
  }

  async patch(id: string, patch: SessionPatch, expectedVersion: number): Promise<Session | null> {
    const sets: string[] = ['version = s.version + 1', 'last_active_at = $3']
    const values: unknown[] = [id, expectedVersion, this.clock.now()]
    const set = (column: string, value: unknown): void => {
      values.push(value)
      sets.push(`${column} = $${values.length}`)
    }
    if (patch.asOf !== undefined) set('as_of', patch.asOf)
    if (patch.lastSeen !== undefined) set('last_seen', patch.lastSeen)
    if (patch.goalTarget !== undefined) set('goal_target', patch.goalTarget)
    if (patch.goalBasis !== undefined) set('goal_basis', patch.goalBasis)
    if (patch.caps !== undefined) set('caps', JSON.stringify(patch.caps))
    if (patch.scopeOverrides !== undefined) set('scope_overrides', patch.scopeOverrides)

    const { rows } = await this.db.query<SessionRow>(
      `UPDATE app.sessions s SET ${sets.join(', ')}
       FROM app.subjects sub
       WHERE s.id = $1 AND s.version = $2 AND sub.subject_id = s.subject_id
       RETURNING ${SESSION_COLUMNS}`,
      values,
    )
    const row = rows[0]
    return row ? toSession(row) : null
  }

  async touch(id: string, at: { lastActiveAt: Timestamp; expiresAt: Timestamp }): Promise<void> {
    await this.db.query(
      `UPDATE app.sessions SET last_active_at = $2, expires_at = $3 WHERE id = $1`,
      [id, new Date(at.lastActiveAt), new Date(at.expiresAt)],
    )
  }

  async erase(id: string): Promise<void> {
    await this.db.query(
      `DELETE FROM app.subjects WHERE subject_id = (SELECT subject_id FROM app.sessions WHERE id = $1)`,
      [id],
    )
  }

  async putIdempotent(sessionId: string, key: string, response: IdempotentResponse): Promise<void> {
    await this.db.query(
      `INSERT INTO app.idempotency_keys (session_id, key, request_hash, status, response, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id, key) DO NOTHING`,
      [
        sessionId,
        key,
        response.requestHash,
        response.status,
        response.body === undefined ? null : JSON.stringify(response.body),
        new Date(response.createdAt),
      ],
    )
  }

  async getIdempotent(sessionId: string, key: string): Promise<IdempotentResponse | null> {
    const { rows } = await this.db.query<{
      request_hash: string
      status: number
      response: unknown
      created_at: Date
    }>(
      `SELECT request_hash, status, response, created_at FROM app.idempotency_keys
       WHERE session_id = $1 AND key = $2`,
      [sessionId, key],
    )
    const row = rows[0]
    if (!row) return null
    return {
      requestHash: row.request_hash,
      status: row.status,
      body: row.response === null ? undefined : row.response,
      createdAt: iso(row.created_at),
    }
  }

  async expireIdle(days: number, now: Date): Promise<number> {
    const { rowCount } = await this.db.query(
      `UPDATE app.sessions SET revoked_at = $1
       WHERE revoked_at IS NULL AND last_active_at < $1::timestamptz - make_interval(days => $2)`,
      [now, days],
    )
    return rowCount ?? 0
  }
}

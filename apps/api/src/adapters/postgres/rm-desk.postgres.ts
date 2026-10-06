/**
 * RmDeskPort over app.rm_users, app.rm_sessions and app.rm_book (migration 0015).
 *
 * The desk and the book are the seed's: the runtime role can read them and nothing else, so an
 * RM cannot be added, re-passworded or handed a customer through the API. Sign-ins are the only
 * rows the API writes here, and 0015's guard lets it move a sign-in's expiry and revoke it, never
 * un-revoke it. Every answer has the shape the memory desk gives, which the integration suite
 * checks by running the same assertions over both.
 */
import type { Timestamp } from '@dhan/contracts'
import type { Db } from '../../db/pool.ts'
import type { Clock, NewRmSession, RmDeskPort, RmSession, RmUser } from '../../ports/index.ts'
import { systemClock } from './clock.ts'

interface UserRow {
  rm_id: string
  employee_no: string
  name: string
  desk: string
  city: string
  password_hash: string
}

interface SessionRow {
  id: string
  rm_id: string
  token_hash: string
  created_at: Date
  last_active_at: Date
  expires_at: Date
  revoked_at: Date | null
}

const USER_COLUMNS = 'rm_id, employee_no, name, desk, city, password_hash'
const SESSION_COLUMNS = 'id, rm_id, token_hash, created_at, last_active_at, expires_at, revoked_at'

const iso = (d: Date): Timestamp => d.toISOString()

const toUser = (row: UserRow): RmUser => ({
  rmId: row.rm_id,
  employeeNo: row.employee_no,
  name: row.name,
  desk: row.desk,
  city: row.city,
  passwordHash: row.password_hash,
})

const toSession = (row: SessionRow): RmSession => ({
  id: row.id,
  rmId: row.rm_id,
  tokenHash: row.token_hash,
  createdAt: iso(row.created_at),
  lastActiveAt: iso(row.last_active_at),
  expiresAt: iso(row.expires_at),
  revokedAt: row.revoked_at === null ? null : iso(row.revoked_at),
})

export class PostgresRmDesk implements RmDeskPort {
  private readonly db: Db
  private readonly clock: Clock

  constructor(db: Db, clock: Clock = systemClock) {
    this.db = db
    this.clock = clock
  }

  async userByEmployeeNo(employeeNo: string): Promise<RmUser | null> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM app.rm_users WHERE employee_no = $1`,
      [employeeNo],
    )
    const row = rows[0]
    return row ? toUser(row) : null
  }

  async userById(rmId: string): Promise<RmUser | null> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM app.rm_users WHERE rm_id = $1`,
      [rmId],
    )
    const row = rows[0]
    return row ? toUser(row) : null
  }

  async createSession(input: NewRmSession): Promise<RmSession> {
    // Stamped from the injected clock, not the database's now(), so a session the auth service
    // creates and then checks against the same clock agrees with it, as the memory desk does.
    const now = this.clock.now()
    const { rows } = await this.db.query<SessionRow>(
      `INSERT INTO app.rm_sessions (rm_id, token_hash, created_at, last_active_at, expires_at)
       VALUES ($1, $2, $3, $3, $4)
       RETURNING ${SESSION_COLUMNS}`,
      [input.rmId, input.tokenHash, now, new Date(input.expiresAt)],
    )
    return toSession(rows[0] as SessionRow)
  }

  async sessionByTokenHash(tokenHash: string): Promise<RmSession | null> {
    // Revoked and expired rows included: whether one still opens a book is the auth service's
    // call, made the same way over both adapters.
    const { rows } = await this.db.query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM app.rm_sessions WHERE token_hash = $1`,
      [tokenHash],
    )
    const row = rows[0]
    return row ? toSession(row) : null
  }

  async touchSession(
    id: string,
    at: { lastActiveAt: Timestamp; expiresAt: Timestamp },
  ): Promise<void> {
    await this.db.query(
      `UPDATE app.rm_sessions SET last_active_at = $2, expires_at = $3 WHERE id = $1`,
      [id, new Date(at.lastActiveAt), new Date(at.expiresAt)],
    )
  }

  async revokeSession(id: string, at: Timestamp): Promise<void> {
    // The first revocation stands; a second sign-out is a no-op rather than a new time.
    await this.db.query(
      `UPDATE app.rm_sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL`,
      [id, new Date(at)],
    )
  }

  async assignmentOf(cif: string): Promise<string | null> {
    const { rows } = await this.db.query<{ rm_id: string }>(
      `SELECT rm_id FROM app.rm_book WHERE cif = $1`,
      [cif],
    )
    return rows[0]?.rm_id ?? null
  }

  async bookOf(rmId: string): Promise<string[]> {
    // COLLATE "C": the memory desk sorts with JavaScript's code-unit order, and a cif compared
    // under the database's locale could come back in a different one.
    const { rows } = await this.db.query<{ cif: string }>(
      `SELECT cif FROM app.rm_book WHERE rm_id = $1 ORDER BY cif COLLATE "C"`,
      [rmId],
    )
    return rows.map((r) => r.cif)
  }
}

/**
 * LeaseStore over app.avatar_leases, app.avatar_waitlist and the minutes in app.avatar_sessions.
 *
 * All three live here rather than in process memory so a task replacement cannot orphan a
 * billed session, drop the queue or reset the meter. `tryAcquire` is one statement —
 * `INSERT … ON CONFLICT DO NOTHING RETURNING` — which is what makes two requests landing
 * together, or two tasks overlapping during a deploy, unable to both win one credential.
 */
import { randomBytes } from 'node:crypto'
import type { AvatarEndReason, IsoDate, Timestamp } from '@dhan/contracts'
import type { Db } from '../../db/pool.ts'
import type { Clock, Lease, LeaseStore, WaitlistEntry } from '../../ports/index.ts'
import { BUDGET_TIME_ZONE, systemClock } from './clock.ts'

interface LeaseRow {
  credential_label: string
  session_id: string
  runway_session_id: string | null
  task_id: string
  claimed_at: Date
  expires_at: Date
}

interface WaitlistRow {
  ticket: string
  session_id: string
  enqueued_at: Date
  claimable_until: Date | null
  granted_at: Date | null
  expired_at: Date | null
}

const LEASE_COLUMNS =
  'credential_label, session_id, runway_session_id, task_id, claimed_at, expires_at'
const WAITLIST_COLUMNS = 'ticket, session_id, enqueued_at, claimable_until, granted_at, expired_at'
const QUEUED = 'granted_at IS NULL AND expired_at IS NULL'

const iso = (d: Date): Timestamp => d.toISOString()
const isoOrNull = (d: Date | null): Timestamp | null => (d === null ? null : iso(d))

const toLease = (row: LeaseRow): Lease => ({
  credentialLabel: row.credential_label,
  sessionId: row.session_id,
  runwaySessionId: row.runway_session_id,
  taskId: row.task_id,
  claimedAt: iso(row.claimed_at),
  expiresAt: iso(row.expires_at),
})

const toEntry = (row: WaitlistRow): WaitlistEntry => ({
  ticket: row.ticket,
  sessionId: row.session_id,
  enqueuedAt: iso(row.enqueued_at),
  claimableUntil: isoOrNull(row.claimable_until),
  grantedAt: isoOrNull(row.granted_at),
  expiredAt: isoOrNull(row.expired_at),
})

export interface LeaseStoreOptions {
  budgetTimeZone?: string
  ticket?: () => string
}

export class PostgresLeaseStore implements LeaseStore {
  private readonly db: Db
  private readonly clock: Clock
  private readonly opts: LeaseStoreOptions

  constructor(db: Db, clock: Clock = systemClock, opts: LeaseStoreOptions = {}) {
    this.db = db
    this.clock = clock
    this.opts = opts
  }

  async tryAcquire(
    credentialLabel: string,
    sessionId: string,
    expiresAt: Timestamp,
    taskId: string,
  ): Promise<Lease | null> {
    const { rows } = await this.db.query<LeaseRow>(
      `INSERT INTO app.avatar_leases (credential_label, session_id, task_id, claimed_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (credential_label) DO NOTHING
       RETURNING ${LEASE_COLUMNS}`,
      [credentialLabel, sessionId, taskId, this.clock.now(), new Date(expiresAt)],
    )
    const row = rows[0]
    return row ? toLease(row) : null
  }

  async attach(credentialLabel: string, runwaySessionId: string): Promise<void> {
    await this.db.query(
      `UPDATE app.avatar_leases SET runway_session_id = $2 WHERE credential_label = $1`,
      [credentialLabel, runwaySessionId],
    )
  }

  async release(
    credentialLabel: string,
    minutesCharged: number,
    reason: AvatarEndReason,
  ): Promise<void> {
    const { rows } = await this.db.query<{ runway_session_id: string | null }>(
      `DELETE FROM app.avatar_leases WHERE credential_label = $1 RETURNING runway_session_id`,
      [credentialLabel],
    )
    const runwaySessionId = rows[0]?.runway_session_id
    if (!runwaySessionId) return
    // The meter reads avatar_sessions, so a release that never reaches markAvatarEnded still
    // charges its minutes. An explicit markAvatarEnded afterwards overwrites this.
    await this.db.query(
      `UPDATE app.avatar_sessions SET ended_at = $2, end_reason = $3, minutes_charged = $4
       WHERE runway_session_id = $1 AND ended_at IS NULL`,
      [runwaySessionId, this.clock.now(), reason, Math.max(0, minutesCharged)],
    )
  }

  async reapExpired(now: Date): Promise<Lease[]> {
    const { rows } = await this.db.query<LeaseRow>(
      `DELETE FROM app.avatar_leases WHERE expires_at <= $1 RETURNING ${LEASE_COLUMNS}`,
      [now],
    )
    return rows.map(toLease)
  }

  async listHeld(): Promise<Lease[]> {
    const { rows } = await this.db.query<LeaseRow>(
      `SELECT ${LEASE_COLUMNS} FROM app.avatar_leases ORDER BY claimed_at`,
    )
    return rows.map(toLease)
  }

  /**
   * Charged minutes for the day, plus the running time of calls still open: billing runs from
   * creation, so a call in progress has already spent what it has spent.
   */
  async minutesUsed(day: IsoDate): Promise<number> {
    const { rows } = await this.db.query<{ minutes: number }>(
      `SELECT coalesce(sum(
                coalesce(minutes_charged,
                         greatest(0, extract(epoch FROM ($3::timestamptz - opened_at)) / 60))
              ), 0)::numeric(12,2) AS minutes
       FROM app.avatar_sessions
       WHERE (opened_at AT TIME ZONE $2)::date = $1::date`,
      [day, this.opts.budgetTimeZone ?? BUDGET_TIME_ZONE, this.clock.now()],
    )
    return rows[0]?.minutes ?? 0
  }

  /* The waitlist ---------------------------------------------------- */

  async enqueue(sessionId: string): Promise<WaitlistEntry> {
    const live = await this.db.query<WaitlistRow>(
      `SELECT ${WAITLIST_COLUMNS} FROM app.avatar_waitlist WHERE session_id = $1 AND ${QUEUED}`,
      [sessionId],
    )
    const existing = live.rows[0]
    if (existing) return toEntry(existing)

    // A ticket that was granted or expired earlier does not block a fresh join.
    await this.db.query(`DELETE FROM app.avatar_waitlist WHERE session_id = $1`, [sessionId])
    const ticket = (this.opts.ticket ?? newTicket)()
    const { rows } = await this.db.query<WaitlistRow>(
      `INSERT INTO app.avatar_waitlist (ticket, session_id, enqueued_at)
       VALUES ($1, $2, $3)
       RETURNING ${WAITLIST_COLUMNS}`,
      [ticket, sessionId, this.clock.now()],
    )
    return toEntry(rows[0] as WaitlistRow)
  }

  async peek(): Promise<WaitlistEntry | null> {
    const { rows } = await this.db.query<WaitlistRow>(
      `SELECT ${WAITLIST_COLUMNS} FROM app.avatar_waitlist WHERE ${QUEUED} ORDER BY enqueued_at, ticket LIMIT 1`,
    )
    const row = rows[0]
    return row ? toEntry(row) : null
  }

  async get(ticket: string): Promise<WaitlistEntry | null> {
    const { rows } = await this.db.query<WaitlistRow>(
      `SELECT ${WAITLIST_COLUMNS} FROM app.avatar_waitlist WHERE ticket = $1`,
      [ticket],
    )
    const row = rows[0]
    return row ? toEntry(row) : null
  }

  async markClaimable(ticket: string, holdUntil: Timestamp): Promise<void> {
    await this.db.query(`UPDATE app.avatar_waitlist SET claimable_until = $2 WHERE ticket = $1`, [
      ticket,
      new Date(holdUntil),
    ])
  }

  async expire(ticket: string): Promise<void> {
    await this.db.query(
      `UPDATE app.avatar_waitlist SET expired_at = $2 WHERE ticket = $1 AND ${QUEUED}`,
      [ticket, this.clock.now()],
    )
  }

  async dequeue(ticket: string): Promise<void> {
    await this.db.query(`DELETE FROM app.avatar_waitlist WHERE ticket = $1`, [ticket])
  }

  async position(ticket: string): Promise<number | null> {
    const { rows } = await this.db.query<{ position: number }>(
      `WITH mine AS (
         SELECT enqueued_at, ticket FROM app.avatar_waitlist WHERE ticket = $1 AND ${QUEUED}
       )
       SELECT (count(w.*) + 1)::int AS position
       FROM mine LEFT JOIN app.avatar_waitlist w
         ON w.granted_at IS NULL AND w.expired_at IS NULL
        AND (w.enqueued_at < mine.enqueued_at OR (w.enqueued_at = mine.enqueued_at AND w.ticket < mine.ticket))
       GROUP BY mine.ticket`,
      [ticket],
    )
    return rows[0]?.position ?? null
  }

  async queueLength(): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM app.avatar_waitlist WHERE ${QUEUED}`,
    )
    return rows[0]?.n ?? 0
  }
}

const newTicket = (): string => `wt_${randomBytes(12).toString('hex')}`

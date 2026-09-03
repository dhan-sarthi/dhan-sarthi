/**
 * One transaction across the stores a decision touches.
 *
 * `POST /actions/:id/decision` appends an advice record, a decision and a roadmap version, and
 * either all three land or none do. Each Postgres store can be re-bound to a checked-out client
 * (`bind`), so the service writes through the same interfaces it uses everywhere else and only
 * the composition root knows a transaction is involved.
 *
 * `scope()` is the row-security seam: it sets the per-request customer or subject for the
 * rest of the transaction, and migration 0007's policies do the rest.
 */
import type pg from 'pg'
import type { Db } from '../../db/pool.ts'
import type { AuditStore, SessionStore, SnapshotStore } from '../../ports/index.ts'
import type { PostgresAuditStore } from './audit-store.postgres.ts'
import type { PostgresSessionStore } from './session-store.postgres.ts'
import type { PostgresSnapshotStore } from './snapshot-store.postgres.ts'

export interface PostgresStores {
  audit: PostgresAuditStore
  snapshots: PostgresSnapshotStore
  sessions: PostgresSessionStore
}

/** What a unit of work hands the caller: the same ports, bound to one transaction. */
export interface TransactionalStores {
  audit: AuditStore
  snapshots: SnapshotStore
  sessions: SessionStore
}

export interface Scope {
  customerId?: string
  subjectId?: string
}

export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    try {
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    }
  } finally {
    client.release()
  }
}

/** `SET LOCAL` the row-security scope for the current transaction. */
export async function scope(db: Db, s: Scope): Promise<void> {
  if (s.customerId !== undefined) {
    await db.query(`SELECT set_config('app.customer_id', $1, true)`, [s.customerId])
  }
  if (s.subjectId !== undefined) {
    await db.query(`SELECT set_config('app.subject_id', $1, true)`, [s.subjectId])
  }
}

export class PostgresUnitOfWork {
  private readonly pool: pg.Pool
  private readonly stores: PostgresStores

  constructor(pool: pg.Pool, stores: PostgresStores) {
    this.pool = pool
    this.stores = stores
  }

  run<T>(
    fn: (stores: TransactionalStores, client: pg.PoolClient) => Promise<T>,
    s?: Scope,
  ): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      if (s) await scope(client, s)
      return fn(
        {
          audit: this.stores.audit.bind(client),
          snapshots: this.stores.snapshots.bind(client),
          sessions: this.stores.sessions.bind(client),
        },
        client,
      )
    })
  }
}

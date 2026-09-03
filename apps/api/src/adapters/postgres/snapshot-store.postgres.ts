/**
 * SnapshotStore over app.snapshots and app.roadmap_versions.
 *
 * Content-addressed and never updated. `put` is `INSERT … ON CONFLICT DO NOTHING` on
 * (subject, as_of, input_hash, engine_version), then a read: the first reviewer at a clock
 * position pays the derivation, everyone after reads JSON. `find` looks across subjects by cif,
 * because the same inputs derive to the same snapshot whoever is looking.
 *
 * The snapshot hash is the application's canonical form (`application/hash.ts`), not the
 * database's jsonb text, so the ETag, the advice record and `pnpm audit:verify` all mean the
 * same bytes.
 */
import type { Goal, Roadmap, Snapshot } from '@dhan/core'
import type { IsoDate, Timestamp } from '@dhan/contracts'
import { Conflict, NotFound } from '../../application/errors.ts'
import { hashOf } from '../../application/hash.ts'
import { PG, pgCode } from '../../db/pool.ts'
import type { Db } from '../../db/pool.ts'
import type {
  Clock,
  NewRoadmapVersion,
  NewSnapshot,
  RoadmapVersion,
  SnapshotStore,
  StoredSnapshot,
} from '../../ports/index.ts'
import { systemClock } from './clock.ts'

interface SnapshotRow {
  id: string
  cif: string
  subject_id: string
  session_id: string
  as_of: IsoDate
  engine_version: string
  input_hash: string
  snapshot_hash: string
  snapshot: Snapshot
  created_at: Date
}

interface RoadmapRow {
  id: string
  session_id: string
  version: number
  snapshot_id: string
  goal: Goal
  roadmap: Roadmap
  reason_for_change: string
  created_at: Date
}

const SNAPSHOT_SQL = `
  SELECT s.id, c.cif, s.subject_id, s.session_id, s.as_of, s.engine_version, s.input_hash,
         s.snapshot_hash, s.snapshot, s.created_at
  FROM app.snapshots s JOIN app.customers c ON c.id = s.customer_id`

const ROADMAP_SQL = `
  SELECT id, session_id, version, snapshot_id, goal, roadmap, reason_for_change, created_at
  FROM app.roadmap_versions`

const iso = (d: Date): Timestamp => d.toISOString()

function toStored(row: SnapshotRow): StoredSnapshot {
  return {
    id: row.id,
    cif: row.cif,
    subjectId: row.subject_id,
    sessionId: row.session_id,
    asOf: row.as_of,
    engineVersion: row.engine_version,
    inputHash: row.input_hash,
    snapshotHash: row.snapshot_hash,
    snapshot: row.snapshot,
    createdAt: iso(row.created_at),
  }
}

function toRoadmap(row: RoadmapRow): RoadmapVersion {
  return {
    id: row.id,
    sessionId: row.session_id,
    version: row.version,
    snapshotId: row.snapshot_id,
    goal: row.goal,
    roadmap: row.roadmap,
    reasonForChange: row.reason_for_change,
    createdAt: iso(row.created_at),
  }
}

export class PostgresSnapshotStore implements SnapshotStore {
  private readonly db: Db
  private readonly clock: Clock

  constructor(db: Db, clock: Clock = systemClock) {
    this.db = db
    this.clock = clock
  }

  bind(db: Db): PostgresSnapshotStore {
    return new PostgresSnapshotStore(db, this.clock)
  }

  async find(
    cif: string,
    asOf: IsoDate,
    inputHash: string,
    engineVersion: string,
  ): Promise<StoredSnapshot | null> {
    const { rows } = await this.db.query<SnapshotRow>(
      `${SNAPSHOT_SQL}
       WHERE c.cif = $1 AND s.as_of = $2 AND s.input_hash = $3 AND s.engine_version = $4
       ORDER BY s.created_at LIMIT 1`,
      [cif, asOf, inputHash, engineVersion],
    )
    const row = rows[0]
    return row ? toStored(row) : null
  }

  async put(input: NewSnapshot): Promise<StoredSnapshot> {
    const customer = await this.db.query<{ id: string }>(
      `SELECT id FROM app.customers WHERE cif = $1 AND erased_at IS NULL`,
      [input.cif],
    )
    const customerId = customer.rows[0]?.id
    if (!customerId) throw new NotFound(`No customer with cif ${input.cif}.`)

    // A new build names a version the seed never registered; the row is the registration.
    await this.db.query(
      `INSERT INTO ref.engine_versions (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`,
      [input.engineVersion],
    )

    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO app.snapshots
         (customer_id, subject_id, session_id, sync_run_id, consent_id, as_of, engine_version,
          input_hash, snapshot, snapshot_hash, created_at)
       VALUES ($1, $2, $3,
               (SELECT id FROM staging.sync_runs WHERE customer_id = $1 AND status = 'succeeded'
                  ORDER BY as_of DESC, started_at DESC LIMIT 1),
               (SELECT id FROM app.consents WHERE customer_id = $1 AND status = 'ACTIVE'
                  ORDER BY valid_to DESC LIMIT 1),
               $4, $5, $6, $7, $8, $9)
       ON CONFLICT (subject_id, as_of, input_hash, engine_version) DO NOTHING
       RETURNING id`,
      [
        customerId,
        input.subjectId,
        input.sessionId,
        input.asOf,
        input.engineVersion,
        input.inputHash,
        JSON.stringify(input.snapshot),
        hashOf(input.snapshot),
        this.clock.now(),
      ],
    )

    const id = rows[0]?.id
    const found = id
      ? await this.getById(id)
      : await this.findForSubject(input.subjectId, input.asOf, input.inputHash, input.engineVersion)
    if (!found) throw new Conflict('The snapshot vanished between insert and read.')
    return found
  }

  async getById(id: string): Promise<StoredSnapshot | null> {
    const { rows } = await this.db.query<SnapshotRow>(`${SNAPSHOT_SQL} WHERE s.id = $1`, [id])
    const row = rows[0]
    return row ? toStored(row) : null
  }

  async putRoadmap(input: NewRoadmapVersion): Promise<RoadmapVersion> {
    try {
      const { rows } = await this.db.query<RoadmapRow>(
        `INSERT INTO app.roadmap_versions
           (session_id, version, snapshot_id, goal, roadmap, reason_for_change, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, session_id, version, snapshot_id, goal, roadmap, reason_for_change, created_at`,
        [
          input.sessionId,
          input.version,
          input.snapshotId,
          JSON.stringify(input.goal),
          JSON.stringify(input.roadmap),
          input.reasonForChange,
          this.clock.now(),
        ],
      )
      return toRoadmap(rows[0] as RoadmapRow)
    } catch (err) {
      if (pgCode(err) === PG.uniqueViolation) {
        throw new Conflict(`Roadmap version ${input.version} already exists for this session.`, {
          version: input.version,
        })
      }
      throw err
    }
  }

  async latestRoadmap(sessionId: string): Promise<RoadmapVersion | null> {
    const { rows } = await this.db.query<RoadmapRow>(
      `${ROADMAP_SQL} WHERE session_id = $1 ORDER BY version DESC LIMIT 1`,
      [sessionId],
    )
    const row = rows[0]
    return row ? toRoadmap(row) : null
  }

  async listRoadmaps(sessionId: string): Promise<RoadmapVersion[]> {
    const { rows } = await this.db.query<RoadmapRow>(
      `${ROADMAP_SQL} WHERE session_id = $1 ORDER BY version`,
      [sessionId],
    )
    return rows.map(toRoadmap)
  }

  private async findForSubject(
    subjectId: string,
    asOf: IsoDate,
    inputHash: string,
    engineVersion: string,
  ): Promise<StoredSnapshot | null> {
    const { rows } = await this.db.query<SnapshotRow>(
      `${SNAPSHOT_SQL}
       WHERE s.subject_id = $1 AND s.as_of = $2 AND s.input_hash = $3 AND s.engine_version = $4`,
      [subjectId, asOf, inputHash, engineVersion],
    )
    const row = rows[0]
    return row ? toStored(row) : null
  }
}

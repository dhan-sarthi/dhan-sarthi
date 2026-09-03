/**
 * SnapshotStore over app.snapshots and app.roadmap_versions.
 *
 * Content-addressed and never updated. `put` is one statement — `INSERT … ON CONFLICT DO
 * NOTHING RETURNING`, else the row that already matched — on (subject, as_of, input_hash,
 * engine_version), so a session pays one round trip whether or not it is the first to derive.
 * `find` looks across subjects by cif, because the same inputs derive to the same snapshot
 * whoever is looking; the rows a session cites are nonetheless its own subject's, so erasing
 * one reviewer never cascades into another's plan versions.
 *
 * The snapshot hash is the application's canonical form (`application/hash.ts`), not the
 * database's jsonb text, so the ETag, the advice record and `pnpm audit:verify` all mean the
 * same bytes.
 */
import type { Goal, Roadmap, Snapshot } from '@dhan/core'
import type { ConsentScope, IsoDate, Timestamp } from '@dhan/contracts'
import { Conflict, NotFound } from '../../application/errors.ts'
import { hashOf } from '../../application/hash.ts'
import { PG, pgCode } from '../../db/pool.ts'
import type { Db } from '../../db/pool.ts'
import type {
  Clock,
  NewRoadmapVersion,
  NewSnapshot,
  PutSnapshotResult,
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
  snapshot_hash: string | null
  goal: Goal
  roadmap: Roadmap
  reason_for_change: string
  at_sim: IsoDate
  scope_overrides: ConsentScope[]
  created_at: Date
}

const SNAPSHOT_SQL = `
  SELECT s.id, c.cif, s.subject_id, s.session_id, s.as_of, s.engine_version, s.input_hash,
         s.snapshot_hash, s.snapshot, s.created_at
  FROM app.snapshots s JOIN app.customers c ON c.id = s.customer_id`

/**
 * Insert or read back, in one statement. The second branch only runs when the first inserted
 * nothing, and reads the row the conflict pointed at. `$1` cif, `$2` subject, `$3` session,
 * `$4` as-of, `$5` engine version, `$6` input hash, `$7` snapshot, `$8` snapshot hash, `$9` now.
 */
const PUT_SQL = `
  WITH cust AS (SELECT id FROM app.customers WHERE cif = $1 AND erased_at IS NULL),
  ins AS (
    INSERT INTO app.snapshots
      (customer_id, subject_id, session_id, sync_run_id, consent_id, as_of, engine_version,
       input_hash, snapshot, snapshot_hash, created_at)
    SELECT cust.id, $2::uuid, $3::uuid,
           (SELECT id FROM staging.sync_runs WHERE customer_id = cust.id AND status = 'succeeded'
              ORDER BY as_of DESC, started_at DESC LIMIT 1),
           (SELECT id FROM app.consents WHERE customer_id = cust.id AND status = 'ACTIVE'
              ORDER BY valid_to DESC LIMIT 1),
           $4::date, $5::text, $6::text, $7::jsonb, $8::text, $9::timestamptz
    FROM cust
    ON CONFLICT (subject_id, as_of, input_hash, engine_version) DO NOTHING
    RETURNING id, subject_id, session_id, as_of, engine_version, input_hash, snapshot_hash, snapshot, created_at
  )
  SELECT ins.id, $1::text AS cif, ins.subject_id, ins.session_id, ins.as_of, ins.engine_version,
         ins.input_hash, ins.snapshot_hash, ins.snapshot, ins.created_at, true AS inserted
  FROM ins
  UNION ALL
  SELECT s.id, $1::text, s.subject_id, s.session_id, s.as_of, s.engine_version,
         s.input_hash, s.snapshot_hash, s.snapshot, s.created_at, false
  FROM app.snapshots s
  WHERE s.subject_id = $2::uuid AND s.as_of = $4::date AND s.input_hash = $6::text
    AND s.engine_version = $5::text AND NOT EXISTS (SELECT 1 FROM ins)`

// at_sim arrived with migration 0008; rows cut before it carry the same date inside the roadmap.
const ROADMAP_COLUMNS = `
  r.id, r.session_id, r.version, r.snapshot_id, r.goal, r.roadmap, r.reason_for_change,
  coalesce(r.at_sim, (r.roadmap->>'createdAt')::date) AS at_sim, r.scope_overrides, r.created_at`

const ROADMAP_SQL = `
  SELECT ${ROADMAP_COLUMNS}, s.snapshot_hash
  FROM app.roadmap_versions r LEFT JOIN app.snapshots s ON s.id = r.snapshot_id`

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
    snapshotHash: row.snapshot_hash ?? '',
    goal: row.goal,
    roadmap: row.roadmap,
    reasonForChange: row.reason_for_change,
    atSim: row.at_sim,
    scopeOverrides: row.scope_overrides,
    createdAt: iso(row.created_at),
  }
}

export class PostgresSnapshotStore implements SnapshotStore {
  private readonly db: Db
  private readonly clock: Clock
  /** Engine versions this process has registered, so the registration costs one round trip, once. */
  private readonly registered = new Set<string>()

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

  async put(input: NewSnapshot): Promise<PutSnapshotResult> {
    // A new build names a version the seed never registered; the row is the registration.
    if (!this.registered.has(input.engineVersion)) {
      await this.db.query(
        `INSERT INTO ref.engine_versions (version) VALUES ($1) ON CONFLICT (version) DO NOTHING`,
        [input.engineVersion],
      )
      this.registered.add(input.engineVersion)
    }

    const { rows } = await this.db.query<SnapshotRow & { inserted: boolean }>(PUT_SQL, [
      input.cif,
      input.subjectId,
      input.sessionId,
      input.asOf,
      input.engineVersion,
      input.inputHash,
      JSON.stringify(input.snapshot),
      hashOf(input.snapshot),
      this.clock.now(),
    ])
    const row = rows[0]
    if (!row) throw new NotFound(`No customer with cif ${input.cif}.`)
    return { ...toStored(row), inserted: row.inserted }
  }

  async getById(id: string): Promise<StoredSnapshot | null> {
    const { rows } = await this.db.query<SnapshotRow>(`${SNAPSHOT_SQL} WHERE s.id = $1`, [id])
    const row = rows[0]
    return row ? toStored(row) : null
  }

  async putRoadmap(input: NewRoadmapVersion): Promise<RoadmapVersion> {
    try {
      const { rows } = await this.db.query<RoadmapRow>(
        `INSERT INTO app.roadmap_versions AS r
           (session_id, version, snapshot_id, goal, roadmap, reason_for_change, at_sim, scope_overrides, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${ROADMAP_COLUMNS}, $10::text AS snapshot_hash`,
        [
          input.sessionId,
          input.version,
          input.snapshotId,
          JSON.stringify(input.goal),
          JSON.stringify(input.roadmap),
          input.reasonForChange,
          input.atSim,
          input.scopeOverrides,
          this.clock.now(),
          input.snapshotHash,
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
      `${ROADMAP_SQL} WHERE r.session_id = $1 ORDER BY r.version DESC LIMIT 1`,
      [sessionId],
    )
    const row = rows[0]
    return row ? toRoadmap(row) : null
  }

  async listRoadmaps(sessionId: string): Promise<RoadmapVersion[]> {
    const { rows } = await this.db.query<RoadmapRow>(
      `${ROADMAP_SQL} WHERE r.session_id = $1 ORDER BY r.version`,
      [sessionId],
    )
    return rows.map(toRoadmap)
  }
}

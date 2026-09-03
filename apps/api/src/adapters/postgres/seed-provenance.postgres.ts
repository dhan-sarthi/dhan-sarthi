/**
 * SeedInfo over staging.seed_runs: where the bank rows came from, and whether they still
 * match what the generator would produce today.
 */
import type { SeedProvenance } from '@dhan/contracts'
import type { DriftCheck, SeedInfo } from '../../application/seed-info.ts'
import type { Db } from '../../db/pool.ts'
import { buildSeedPlan } from '../../db/seed-bundle.ts'
import type { SeedOptions } from '../../db/seed-bundle.ts'

interface SeedRunRow {
  id: string
  generator_version: string
  anchor: string
  history_from: string
  horizon_to: string
  personas: string[]
  content_sha256: string
  ran_at: Date
}

const LATEST_SQL = `
  SELECT id, generator_version, anchor, history_from, horizon_to, personas, content_sha256, ran_at
  FROM staging.seed_runs ORDER BY ran_at DESC LIMIT 1`

export async function latestSeedRun(db: Db): Promise<SeedProvenance | null> {
  const { rows } = await db.query<SeedRunRow>(LATEST_SQL)
  const row = rows[0]
  if (!row) return null
  return {
    seedRunId: row.id,
    generatorVersion: row.generator_version,
    anchor: row.anchor,
    historyFrom: row.history_from,
    horizonTo: row.horizon_to,
    personas: row.personas,
    contentSha256: row.content_sha256,
    ranAt: row.ran_at.toISOString(),
  }
}

export class PostgresSeedInfo implements SeedInfo {
  private readonly db: Db
  /** The options the running build would seed with; drift is measured against them. */
  private readonly options: SeedOptions

  constructor(db: Db, options: SeedOptions) {
    this.db = db
    this.options = options
  }

  provenance(): Promise<SeedProvenance | null> {
    return latestSeedRun(this.db)
  }

  async drift(): Promise<DriftCheck> {
    const last = await latestSeedRun(this.db)
    if (!last) return { checked: false, ok: null, expectedSha256: null, actualSha256: null }
    const plan = buildSeedPlan({
      ...this.options,
      anchor: last.anchor,
      generatorVersion: last.generatorVersion,
    })
    return {
      checked: true,
      ok: plan.contentSha256 === last.contentSha256,
      expectedSha256: last.contentSha256,
      actualSha256: plan.contentSha256,
    }
  }
}

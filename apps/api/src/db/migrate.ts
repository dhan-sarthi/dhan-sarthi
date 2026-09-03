/**
 * Ordered, idempotent SQL migrations: `pnpm --filter @dhan/api migrate`.
 *
 * Plain SQL files under apps/api/migrations, applied in filename order, each in its own
 * transaction, recorded in public.schema_migrations with a checksum. A file that changed after
 * it was applied fails loudly rather than silently diverging — the schema in production is the
 * one in the repository, or the migrator says so. Concurrent migrators (two tasks booting at
 * once) serialise on an advisory lock.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type pg from 'pg'
import { loadConfig } from '../config.ts'
import { createPool } from './pool.ts'

export interface Migration {
  version: number
  name: string
  file: string
  sql: string
  checksum: string
}

export interface AppliedMigration {
  version: number
  name: string
  checksum: string
  appliedAt: Date
}

export interface MigrateOptions {
  /** Defaults to apps/api/migrations. */
  dir?: string
  log?: (line: string) => void
}

export interface MigrateResult {
  applied: Migration[]
  alreadyApplied: number
}

const DEFAULT_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url))
const FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/
const LOCK_KEY = 'dhan-sarthi:migrate'

export async function listMigrations(dir: string = DEFAULT_DIR): Promise<Migration[]> {
  const names = (await readdir(dir)).filter((f) => FILE.test(f)).sort()
  const out: Migration[] = []
  for (const file of names) {
    const match = FILE.exec(file)
    if (!match) continue
    const sql = await readFile(join(dir, file), 'utf8')
    out.push({
      version: Number(match[1]),
      name: match[2] ?? file,
      file,
      sql,
      checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
    })
  }
  const versions = new Set(out.map((m) => m.version))
  if (versions.size !== out.length) throw new Error(`duplicate migration version in ${dir}`)
  return out
}

export async function appliedMigrations(db: pg.Pool | pg.PoolClient): Promise<AppliedMigration[]> {
  const exists = await db.query<{ ok: boolean }>(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok`,
  )
  if (!exists.rows[0]?.ok) return []
  const { rows } = await db.query<{
    version: number
    name: string
    checksum: string
    applied_at: Date
  }>('SELECT version, name, checksum, applied_at FROM public.schema_migrations ORDER BY version')
  return rows.map((r) => ({
    version: r.version,
    name: r.name,
    checksum: r.checksum,
    appliedAt: r.applied_at,
  }))
}

export async function migrate(pool: pg.Pool, opts: MigrateOptions = {}): Promise<MigrateResult> {
  const log = opts.log ?? (() => {})
  const migrations = await listMigrations(opts.dir)
  const client = await pool.connect()
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [LOCK_KEY])
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version    integer PRIMARY KEY,
        name       text NOT NULL,
        checksum   char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`)

    const applied = new Map((await appliedMigrations(client)).map((m) => [m.version, m]))
    const result: MigrateResult = { applied: [], alreadyApplied: 0 }

    for (const m of migrations) {
      const seen = applied.get(m.version)
      if (seen) {
        if (seen.checksum !== m.checksum) {
          throw new Error(
            `migration ${m.file} was applied with checksum ${seen.checksum.slice(0, 12)} ` +
              `but the file now hashes to ${m.checksum.slice(0, 12)}; migrations are immutable once applied`,
          )
        }
        result.alreadyApplied += 1
        continue
      }

      log(`applying ${m.file}`)
      await client.query('BEGIN')
      try {
        await client.query(m.sql)
        await client.query(
          'INSERT INTO public.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [m.version, m.name, m.checksum],
        )
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`migration ${m.file} failed: ${(err as Error).message}`, { cause: err })
      }
      result.applied.push(m)
    }
    return result
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [LOCK_KEY]).catch(() => {})
    client.release()
  }
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

const out = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

async function main(): Promise<void> {
  const config = loadConfig()
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  const pool = createPool({
    connectionString: config.DATABASE_URL,
    applicationName: 'dhan-migrate',
  })
  try {
    const result = await migrate(pool, { log: out })
    out(
      `migrations: ${result.applied.length} applied, ${result.alreadyApplied} already applied` +
        (result.applied.length > 0 ? ` (${result.applied.map((m) => m.file).join(', ')})` : ''),
    )
  } finally {
    await pool.end()
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`migrate: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  })
}

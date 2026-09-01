import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
})

export const query = (text, params) => pool.query(text, params)

/** pgvector wants a bracketed literal, not a Postgres array. */
export const toVector = (arr) => `[${arr.join(',')}]`

export async function migrate() {
  const dir = join(here, '..', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    await pool.query(readFileSync(join(dir, f), 'utf8'))
    console.log(`  migrated ${f}`)
  }
}

export async function healthy() {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

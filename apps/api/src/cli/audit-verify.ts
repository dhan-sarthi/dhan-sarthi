/**
 * `pnpm --filter @dhan/api audit:verify [--subject <uuid>] [--session <uuid>]`
 *
 * Walks every subject's chain in app.audit_records, recomputing each record's hash from the
 * row and checking it links to the one before. The compliance-reviewer moment, from a terminal:
 * a tampered row prints the break, an intact chain prints OK. Exit code 1 on any break.
 */
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { PostgresAuditStore, verifyAdviceChain } from '../adapters/postgres/audit-store.postgres.ts'
import { loadConfig } from '../config.ts'
import { createPool } from '../db/pool.ts'
import type { Db } from '../db/pool.ts'

export interface ChainReport {
  subjectId: string
  ok: boolean
  length: number
  brokenAt?: string
}

export async function verifyAll(
  db: Db,
  only?: { subjectId?: string; sessionId?: string },
): Promise<ChainReport[]> {
  const store = new PostgresAuditStore(db)
  let subjects: string[]
  if (only?.subjectId) {
    subjects = [only.subjectId]
  } else if (only?.sessionId) {
    const { rows } = await db.query<{ subject_id: string }>(
      `SELECT subject_id FROM app.audit_records WHERE session_id = $1 LIMIT 1`,
      [only.sessionId],
    )
    subjects = rows.map((r) => r.subject_id)
  } else {
    subjects = await store.listSubjects()
  }

  const reports: ChainReport[] = []
  for (const subjectId of subjects) {
    const result = verifyAdviceChain(await store.listForSubject(subjectId))
    reports.push({
      subjectId,
      ok: result.ok,
      length: result.length,
      ...(result.brokenAt === undefined ? {} : { brokenAt: result.brokenAt }),
    })
  }
  return reports
}

const out = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { subject: { type: 'string' }, session: { type: 'string' } },
  })
  const config = loadConfig()
  if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set')

  const pool = createPool({
    connectionString: config.DATABASE_URL,
    applicationName: 'dhan-audit-verify',
    max: 1,
  })
  try {
    const reports = await verifyAll(pool, {
      ...(values.subject === undefined ? {} : { subjectId: values.subject }),
      ...(values.session === undefined ? {} : { sessionId: values.session }),
    })
    if (reports.length === 0) out('audit: no records to verify')
    for (const r of reports) {
      out(
        r.ok
          ? `subject ${r.subjectId}  OK  ${r.length} record${r.length === 1 ? '' : 's'}`
          : `subject ${r.subjectId}  BROKEN at record ${r.brokenAt}  (${r.length} records)`,
      )
    }
    const broken = reports.filter((r) => !r.ok).length
    out(`audit: ${reports.length} chain${reports.length === 1 ? '' : 's'}, ${broken} broken`)
    if (broken > 0) process.exitCode = 1
  } finally {
    await pool.end()
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`audit:verify: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  })
}

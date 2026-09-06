import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type pg from 'pg'
import { PostgresBankData } from '../../src/adapters/postgres/bank-data.postgres.ts'
import { loadConfig } from '../../src/config.ts'
import { createPool } from '../../src/db/pool.ts'

const url = loadConfig().DATABASE_URL

describe('catalogue projection metadata and observed-data isolation', { skip: !url }, () => {
  let pool: pg.Pool
  let client: pg.PoolClient
  before(async () => {
    pool = createPool({ connectionString: url!, applicationName: 'catalogue-isolation-test' })
    client = await pool.connect()
    await client.query('BEGIN')
  })
  after(async () => {
    if (client) {
      await client.query('ROLLBACK')
      client.release()
    }
    await pool?.end()
  })

  it('records documentation for all services without pretending execution was verified', async () => {
    const { rows } = await client.query(
      `SELECT endpoint_code, verified, execution_verified, http_method, path_template FROM staging.endpoint_registry WHERE source = 'idbi_api'`,
    )
    assert.equal(rows.length, 25)
    assert.ok(
      rows.every(
        (r) =>
          r.verified && !r.execution_verified && r.http_method === null && r.path_template === null,
      ),
    )
  })

  it('stores replayable catalogue captures separately from unsupported fixture fields', async () => {
    const { rows } = await client.query(
      `SELECT payload FROM staging.raw_payloads WHERE source = 'fixtures' AND endpoint_code = 'fixtures/customer-file'`,
    )
    assert.equal(rows.length, 3)
    for (const { payload } of rows) {
      assert.equal(payload.version, 'catalogue-replay-1')
      assert.equal('transactions' in payload.supplement, false)
      assert.deepEqual(
        [...new Set(payload.captures.map((c: { endpoint: string }) => c.endpoint))].sort(),
        ['362', '393', '402', '441'],
      )
    }
  })

  it('refuses to simulate a provider loan mixed into otherwise synthetic bank data', async () => {
    const { rows } = await client.query<{ cif: string; id: string }>(
      `SELECT c.cif, l.id FROM bank.loan_snapshots l JOIN bank.accounts a ON a.id=l.account_id JOIN app.customers c ON c.id=a.customer_id LIMIT 1`,
    )
    const row = rows[0]
    assert.ok(row)
    await client.query('SAVEPOINT observed_loan')
    try {
      await client.query(`UPDATE bank.loan_snapshots SET source='idbi_api' WHERE id=$1`, [row.id])
      const bank = await PostgresBankData.connect(client, { cacheTtlMs: 0 })
      await assert.rejects(
        bank.loadCustomerFile(row.cif, '2026-09-01', 24),
        /fixture clock replay is not allowed/,
      )
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT observed_loan')
    }
  })
})

/**
 * The Postgres track end to end, against a real database: migrate → seed → check → parity →
 * append-only → chain verification, plus the smoke checks from
 * docs/engineering/schema/90_smoke.sql that apply to the demo subset.
 *
 * Runs only when DATABASE_URL is set. The seed is idempotent and leaves the rows a reviewer is
 * using alone; everything else the suite writes happens inside one transaction that is rolled
 * back at the end, so the shared team database is left as it was found.
 *
 *   cd apps/api && BANK_SOURCE=postgres node --test --experimental-strip-types --env-file=.env \
 *     test/integration/postgres.test.ts
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type pg from 'pg'
import { derive } from '@dhan/core'
import { PERSONAS, generateCustomerFile, seedBundles } from '@dhan/fixtures'
import { FixedClock } from '../../src/adapters/clock/fixed-clock.ts'
import { seedContentHash as memorySeedHash } from '../../src/adapters/memory/bank-data.memory.ts'
import {
  PostgresAuditStore,
  verifyAdviceChain,
} from '../../src/adapters/postgres/audit-store.postgres.ts'
import { PostgresBankData } from '../../src/adapters/postgres/bank-data.postgres.ts'
import { PostgresLeaseStore } from '../../src/adapters/postgres/lease-store.postgres.ts'
import { PostgresProductShelf } from '../../src/adapters/postgres/product-shelf.postgres.ts'
import { PostgresSeedInfo } from '../../src/adapters/postgres/seed-provenance.postgres.ts'
import { PostgresSessionStore } from '../../src/adapters/postgres/session-store.postgres.ts'
import { PostgresSnapshotStore } from '../../src/adapters/postgres/snapshot-store.postgres.ts'
import { HISTORY_WINDOW_MONTHS } from '../../src/application/advisory.service.ts'
import { GENESIS_HASH, hashOf, sha256Hex } from '../../src/application/hash.ts'
import { verifyAll } from '../../src/cli/audit-verify.ts'
import { checkSeed, seed, seedVersions } from '../../src/cli/seed.ts'
import type { SeedReport } from '../../src/cli/seed.ts'
import { loadConfig } from '../../src/config.ts'
import type { Config } from '../../src/config.ts'
import { migrate } from '../../src/db/migrate.ts'
import { PG, createPool, pgCode } from '../../src/db/pool.ts'
import { seedContentHash as postgresSeedHash } from '../../src/db/seed-bundle.ts'
import type { AdviceRecordInput } from '../../src/ports/index.ts'
import { bankDataPortContract } from '../ports/bank-data.contract.test.ts'

const ROHAN_CIF = 'IDBI0009182731'

function readConfig(): Config | null {
  try {
    return loadConfig({ ...process.env, BANK_SOURCE: 'postgres' })
  } catch {
    return null
  }
}

const config = readConfig()
const DATABASE_URL = config?.DATABASE_URL

/** A statement that must fail with one SQLSTATE, probed under a savepoint so the transaction survives. */
async function expectPgErrorIn(
  client: pg.PoolClient,
  codes: readonly string[],
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await client.query('SAVEPOINT probe')
  try {
    await client.query(sql, params)
    assert.fail(`expected one of SQLSTATE ${codes.join('/')} from: ${sql.trim().slice(0, 60)}`)
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err
    assert.ok(codes.includes(pgCode(err) ?? ''), (err as Error).message)
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT probe')
  }
}

async function expectPgError(
  client: pg.PoolClient,
  code: string,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await client.query('SAVEPOINT probe')
  try {
    await client.query(sql, params)
    assert.fail(`expected SQLSTATE ${code} from: ${sql.trim().slice(0, 60)}`)
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err
    assert.equal(pgCode(err), code, (err as Error).message)
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT probe')
  }
}

describe(
  'postgres: migrate → seed → check → parity → append-only → chain',
  { skip: DATABASE_URL && config ? false : 'DATABASE_URL is not set' },
  () => {
    const cfg = config as Config
    const url = DATABASE_URL as string
    const options = {
      anchor: cfg.SEED_ANCHOR,
      historyMonths: HISTORY_WINDOW_MONTHS,
      forwardMonths: cfg.SEED_FORWARD_MONTHS,
      generatorVersion: seedVersions(cfg.GIT_SHA).generator,
    }
    const clock = new FixedClock('2026-09-03T09:00:00.000Z')
    let pool: pg.Pool
    let report: SeedReport

    before(async () => {
      pool = createPool({
        connectionString: url,
        applicationName: 'dhan-integration',
        max: 3,
        statementTimeoutMs: 120_000,
      })
      const first = await migrate(pool)
      assert.ok(first.applied.length + first.alreadyApplied >= 8, 'eight migrations are known')
      report = await seed(pool, options)
    })

    after(async () => {
      await pool?.end()
    })

    it('applies migrations once: a second run applies nothing', async () => {
      const again = await migrate(pool)
      assert.equal(again.applied.length, 0)
      assert.ok(again.alreadyApplied >= 8)
    })

    it('seeds the three personas and reproduces the headline numbers', () => {
      assert.deepEqual(
        report.personas.map((p) => p.slug),
        PERSONAS.map((p) => p.slug),
      )
      const rohan = report.personas.find((p) => p.slug === 'rohan')
      assert.ok(rohan)
      assert.equal(rohan.idleFloor, 122_841)
      assert.equal(rohan.deployable, 12_246)
      assert.match(report.contentSha256, /^[0-9a-f]{64}$/)
    })

    it('--check finds no drift, and the hash is the one the memory adapter computes', async () => {
      const check = await checkSeed(pool, options)
      assert.equal(check.ok, true, JSON.stringify(check))
      assert.equal(check.actualSha256, report.contentSha256)
      const bundles = seedBundles(options)
      assert.equal(memorySeedHash(bundles), report.contentSha256)
      assert.equal(postgresSeedHash(bundles), report.contentSha256)

      const info = new PostgresSeedInfo(pool, options)
      const provenance = await info.provenance()
      assert.ok(provenance)
      assert.deepEqual(provenance.personas, ['rohan', 'priya', 'sunil'])
      assert.equal(provenance.anchor, options.anchor)
      const drift = await info.drift()
      assert.deepEqual(drift, {
        checked: true,
        ok: true,
        expectedSha256: report.contentSha256,
        actualSha256: report.contentSha256,
      })
    })

    it('reports the seeded horizon as data freshness under a simulated clock', async () => {
      const bank = await PostgresBankData.connect(pool)
      const d = bank.describe()
      assert.equal(d.source, 'postgres')
      assert.equal(d.simulatedClock, true)
      assert.equal(d.dataFreshnessDate, (await bank.ledgerHorizon(ROHAN_CIF)).to)
    })

    it('derives Rohan at the anchor to an idle floor of ₹1,22,841 and ₹12,246 deployable', async () => {
      const bank = await PostgresBankData.connect(pool)
      const { file } = await bank.loadCustomerFile(ROHAN_CIF, options.anchor, HISTORY_WINDOW_MONTHS)
      const snapshot = derive(file, options.anchor)
      assert.equal(snapshot.balances.idleFloor, 122_841)
      assert.equal(snapshot.surplus.deployable, 12_246)

      const spec = PERSONAS.find((p) => p.slug === 'rohan')
      assert.ok(spec)
      const expected = derive(
        generateCustomerFile(spec, {
          anchor: options.anchor,
          asOf: options.anchor,
          months: HISTORY_WINDOW_MONTHS,
        }),
        options.anchor,
      )
      assert.deepEqual(snapshot, expected)
    })

    // The same suite the memory adapter passes: every persona at six clock positions.
    bankDataPortContract('postgres', () => PostgresBankData.connect(pool))

    describe('reviewer state and the record, in one rolled-back transaction', () => {
      let client: pg.PoolClient
      let sessionId: string
      let subjectId: string
      let snapshotId: string
      let customerId: string
      let casaAccountId: string
      let syncRunId: string

      before(async () => {
        client = await pool.connect()
        await client.query('BEGIN')
        const customer = await client.query<{ id: string }>(
          `SELECT id FROM app.customers WHERE cif = $1`,
          [ROHAN_CIF],
        )
        customerId = customer.rows[0]?.id as string
        const account = await client.query<{ id: string }>(
          `SELECT id FROM bank.accounts WHERE customer_id = $1 AND product_kind = 'CASA' ORDER BY created_at LIMIT 1`,
          [customerId],
        )
        casaAccountId = account.rows[0]?.id as string
        const run = await client.query<{ id: string }>(
          `SELECT id FROM staging.sync_runs WHERE customer_id = $1 ORDER BY as_of DESC LIMIT 1`,
          [customerId],
        )
        syncRunId = run.rows[0]?.id as string
      })

      after(async () => {
        await client.query('ROLLBACK').catch(() => {})
        client.release()
      })

      it('sessions: optimistic version, token lookup, idempotency keys', async () => {
        const sessions = new PostgresSessionStore(client, clock)
        const tokenHash = sha256Hex(`token-${Date.now()}`)
        const created = await sessions.create({
          cif: ROHAN_CIF,
          tokenHash,
          asOf: options.anchor,
          lastSeen: '2026-08-26',
          expiresAt: '2026-10-03T09:00:00.000Z',
          clientHint: 'ua:test',
        })
        sessionId = created.id
        subjectId = created.subjectId
        assert.equal(created.version, 1)
        assert.equal(created.cif, ROHAN_CIF)
        assert.deepEqual(created.caps, [])
        assert.deepEqual(created.scopeOverrides, [])
        assert.equal(created.goalTarget, null)

        assert.equal((await sessions.getByTokenHash(tokenHash))?.id, sessionId)
        assert.equal(await sessions.getByTokenHash(sha256Hex('nope')), null)

        assert.equal(await sessions.patch(sessionId, { asOf: '2026-10-01' }, 99), null)
        const moved = await sessions.patch(
          sessionId,
          {
            asOf: '2026-10-01',
            lastSeen: options.anchor,
            goalTarget: 500_000,
            caps: [{ category: 'Food & dining', monthlyLimit: 5_000 }],
          },
          1,
        )
        assert.ok(moved)
        assert.equal(moved.version, 2)
        assert.equal(moved.asOf, '2026-10-01')
        assert.equal(moved.goalTarget, 500_000)
        assert.deepEqual(moved.caps, [{ category: 'Food & dining', monthlyLimit: 5_000 }])

        await sessions.putIdempotent(sessionId, 'key-1', {
          requestHash: sha256Hex('body'),
          status: 200,
          body: { ok: true },
          createdAt: clock.now().toISOString(),
        })
        const replay = await sessions.getIdempotent(sessionId, 'key-1')
        assert.equal(replay?.status, 200)
        assert.deepEqual(replay?.body, { ok: true })
        assert.equal(await sessions.getIdempotent(sessionId, 'key-2'), null)
      })

      it('snapshots: content-addressed put, find by cif, roadmap versions', async () => {
        const snapshots = new PostgresSnapshotStore(client, clock)
        const bank = await PostgresBankData.connect(client)
        const { file } = await bank.loadCustomerFile(
          ROHAN_CIF,
          options.anchor,
          HISTORY_WINDOW_MONTHS,
        )
        const snapshot = derive(file, options.anchor)
        const inputHash = hashOf({ file, window: HISTORY_WINDOW_MONTHS })
        const input = {
          cif: ROHAN_CIF,
          subjectId,
          sessionId,
          asOf: options.anchor,
          engineVersion: 'integration-test',
          inputHash,
          snapshot,
        }
        const first = await snapshots.put(input)
        const second = await snapshots.put(input)
        snapshotId = first.id
        assert.equal(second.id, first.id)
        // One round trip either way: the first call wrote the row, the second read it back.
        assert.equal(first.inserted, true)
        assert.equal(second.inserted, false)
        assert.equal(first.snapshotHash, hashOf(snapshot))
        assert.equal(first.subjectId, subjectId)
        assert.equal(
          (await snapshots.find(ROHAN_CIF, options.anchor, inputHash, 'integration-test'))?.id,
          first.id,
        )
        assert.equal(
          await snapshots.find(ROHAN_CIF, '1999-01-01', inputHash, 'integration-test'),
          null,
        )
        assert.equal((await snapshots.getById(first.id))?.snapshot.balances.idleFloor, 122_841)

        const goal = {
          id: 'goal-retire',
          kind: 'retirement' as const,
          targetAmount: 1,
          targetDate: '2057-09-01',
          createdAt: options.anchor,
        }
        const roadmap = {
          version: 1,
          createdAt: options.anchor,
          reasonForChange: 'First plan.',
          goal,
          stages: [],
          currentStageIndex: 0,
          monthlyCommitment: 0,
          totalMonths: 0,
          completesOn: options.anchor,
          feasible: true,
          shortfallMonthly: 0,
          projection: null,
          disclaimer: 'test',
        }
        const v1 = await snapshots.putRoadmap({
          sessionId,
          version: 1,
          snapshotId: first.id,
          snapshotHash: first.snapshotHash,
          goal,
          roadmap,
          reasonForChange: 'First plan.',
          atSim: options.anchor,
          scopeOverrides: ['LIABILITIES'],
        })
        assert.equal(v1.version, 1)
        assert.equal(v1.atSim, options.anchor)
        assert.deepEqual(v1.scopeOverrides, ['LIABILITIES'])
        const latest = await snapshots.latestRoadmap(sessionId)
        assert.equal(latest?.id, v1.id)
        // Read back through the join, so "nothing changed" can be decided by hash alone.
        assert.equal(latest?.snapshotHash, first.snapshotHash)
        assert.equal(latest?.atSim, options.anchor)
        assert.deepEqual(latest?.scopeOverrides, ['LIABILITIES'])
        assert.equal((await snapshots.listRoadmaps(sessionId)).length, 1)
        // A failed statement aborts the surrounding transaction; probe it under a savepoint.
        await client.query('SAVEPOINT dup')
        await assert.rejects(
          snapshots.putRoadmap({
            sessionId,
            version: 1,
            snapshotId: first.id,
            snapshotHash: first.snapshotHash,
            goal,
            roadmap,
            reasonForChange: 'again',
            atSim: options.anchor,
            scopeOverrides: [],
          }),
          /already exists/,
        )
        await client.query('ROLLBACK TO SAVEPOINT dup')

        // A row cut before migration 0008 carries no at_sim; it is read as the date the engine
        // stamped inside the roadmap, which is the same fact.
        await client.query(
          `INSERT INTO app.roadmap_versions (session_id, version, snapshot_id, goal, roadmap, reason_for_change)
           VALUES ($1, 2, $2, $3, $4, 'legacy row')`,
          [
            sessionId,
            first.id,
            JSON.stringify(goal),
            JSON.stringify({ ...roadmap, version: 2, createdAt: '2026-10-01' }),
          ],
        )
        const legacy = await snapshots.latestRoadmap(sessionId)
        assert.equal(legacy?.version, 2)
        assert.equal(legacy?.atSim, '2026-10-01')
        assert.deepEqual(legacy?.scopeOverrides, [])
      })

      it('the record: hash chain per subject, verified in code and linked by the database', async () => {
        const audit = new PostgresAuditStore(client, clock)
        const base: AdviceRecordInput = {
          sessionId,
          subjectId,
          snapshotId,
          consentId: 'CONS_SYN_1',
          source: 'screen',
          actionId: 'act-1',
          actionKind: 'buy_term_cover',
          productId: 'LIC_TERM_201',
          amount: 880,
          verdict: 'PASS',
          ruleId: null,
          rulesPassed: ['HIGH_INTEREST_DEBT', 'MISSED_REPAYMENT'],
          spoken: null,
          recorded: 'All 9 suitability rules passed.',
          alternative: null,
          evidence: ['two dependents, no cover in force'],
          engineVersion: 'integration-test',
          runwaySessionId: null,
          atSim: options.anchor,
        }
        const one = await audit.appendAdvice(base)
        const two = await audit.appendAdvice({
          ...base,
          actionId: 'act-2',
          productId: 'LIC_ULIP_401',
          amount: 2_500,
          verdict: 'BLOCKED',
          ruleId: 'BUNDLED_PROTECTION',
          spoken: 'No. It costs about 3 times what a term plan costs for the same job.',
          recorded: 'Blocked: bundled protection-and-investment product.',
          alternative: {
            productId: 'LIC_TERM_201',
            name: 'LIC Term Assurance — ₹1 crore cover',
            monthly: 880,
          },
        })
        assert.equal(one.seq, 1)
        assert.equal(one.prevHash, GENESIS_HASH)
        assert.equal(two.seq, 2)
        assert.equal(two.prevHash, one.recordHash)
        assert.equal(two.snapshotId, snapshotId)

        assert.deepEqual(await audit.verifyChain(sessionId), { ok: true, length: 2 })
        assert.deepEqual(await verifyAll(client, { sessionId }), [
          { subjectId, ok: true, length: 2 },
        ])

        // A copy with one sentence changed is exactly what the verifier must catch.
        const records = await audit.listForSubject(subjectId)
        const tampered = records.map((r, i) => (i === 1 ? { ...r, spoken: 'tampered' } : r))
        assert.deepEqual(verifyAdviceChain(tampered), { ok: false, length: 2, brokenAt: two.id })

        // The database refuses a record that does not link to the subject's last one.
        await expectPgError(
          client,
          PG.integrityViolation,
          `INSERT INTO app.audit_records
             (id, subject_id, session_id, seq, snapshot_id, consent_id, source, verdict, recorded,
              engine_version, at_sim, prev_hash, record_hash, created_at)
           VALUES (gen_random_uuid(), $1, $2, 3, $3, 'CONS_SYN_1', 'api', 'PASS', 'forged', 'x', $4,
                   repeat('0', 64), repeat('f', 64), now())`,
          [subjectId, sessionId, snapshotId, options.anchor],
        )

        // A double tap on the same action is one decision.
        const decided = await audit.appendDecision({
          sessionId,
          adviceRecordId: one.id,
          actionId: 'act-1',
          actionKind: 'buy_term_cover',
          kind: 'did_it',
          amount: 880,
          productId: 'LIC_TERM_201',
          shown: 'Do it',
          evidence: [],
          note: null,
          atSim: options.anchor,
        })
        const again = await audit.appendDecision({
          sessionId,
          adviceRecordId: one.id,
          actionId: 'act-1',
          actionKind: 'buy_term_cover',
          kind: 'declined',
          amount: 880,
          productId: 'LIC_TERM_201',
          shown: 'Not now',
          evidence: [],
          note: null,
          atSim: options.anchor,
        })
        assert.equal(again.id, decided.id)
        assert.equal(again.kind, 'did_it')

        await audit.appendAvatarSession({
          runwaySessionId: 'rw-test-1',
          sessionId,
          credentialLabel: 'runway-1',
          taskId: 'task-a',
          openedAt: clock.now().toISOString(),
          readyAt: null,
          rpcConnectedAt: null,
          grantedAt: null,
        })
        const call = await audit.appendToolCall({
          runwaySessionId: 'rw-test-1',
          tool: 'check_suitability',
          args: { product_name: 'ULIP' },
          result: { verdict: 'BLOCKED' },
          adviceRecordId: two.id,
          latencyMs: 42,
        })
        assert.match(call.id, /^[0-9a-f-]{36}$/)
        await audit.markAvatarEnded('rw-test-1', 'client', 1.5, clock.now().toISOString())
        await audit.attachTranscript('rw-test-1', null, null)
        const avatar = await audit.getAvatarSession('rw-test-1')
        assert.equal(avatar?.transcriptStatus, 'unavailable')
        assert.equal(avatar?.minutesCharged, 1.5)
        assert.equal(avatar?.endReason, 'client')
        assert.equal((await audit.listToolCalls('rw-test-1')).length, 1)
        assert.equal(await audit.getTranscript('rw-test-1'), null)

        const trail = await audit.listForSession(sessionId)
        assert.equal(trail.adviceRecords.length, 2)
        assert.equal(trail.decisions.length, 1)
        assert.equal(trail.avatarSessions.length, 1)
      })

      it('append-only: UPDATE, DELETE and TRUNCATE on the record fail for the owner and for dhan_app', async () => {
        await expectPgError(
          client,
          PG.integrityViolation,
          `UPDATE app.audit_records SET spoken = 'tampered' WHERE subject_id = $1`,
          [subjectId],
        )
        await expectPgError(
          client,
          PG.integrityViolation,
          `DELETE FROM app.audit_records WHERE subject_id = $1`,
          [subjectId],
        )
        // TRUNCATE is refused before the trigger can fire when a foreign key points at the table
        // (SQLSTATE 0A000); either refusal keeps the record intact.
        await expectPgErrorIn(
          client,
          [PG.integrityViolation, '0A000'],
          `TRUNCATE app.audit_records`,
        )
        await expectPgError(
          client,
          PG.integrityViolation,
          `UPDATE app.decisions SET kind = 'declined' WHERE session_id = $1`,
          [sessionId],
        )
        await expectPgError(
          client,
          PG.integrityViolation,
          `UPDATE app.snapshots SET surplus_deployable = 0 WHERE id = $1`,
          [snapshotId],
        )

        // As the runtime role the privilege is missing before any trigger is reached.
        await client.query('SAVEPOINT as_app')
        await client.query('SET LOCAL ROLE dhan_app')
        await expectPgError(
          client,
          PG.insufficientPrivilege,
          `UPDATE app.audit_records SET spoken = 'tampered' WHERE subject_id = $1`,
          [subjectId],
        )
        await expectPgError(
          client,
          PG.insufficientPrivilege,
          `DELETE FROM app.snapshots WHERE id = $1`,
          [snapshotId],
        )
        // Reads and inserts still work for the role.
        const visible = await client.query(
          `SELECT count(*)::int AS n FROM app.audit_records WHERE subject_id = $1`,
          [subjectId],
        )
        assert.equal(visible.rows[0]?.n, 2)
        await client.query('ROLLBACK TO SAVEPOINT as_app')
      })

      it('leases: one credential, one winner; the waitlist is FIFO and idempotent', async () => {
        const leases = new PostgresLeaseStore(client, clock)
        const expires = new Date(clock.now().getTime() + 600_000).toISOString()
        const won = await leases.tryAcquire('runway-1', sessionId, expires, 'task-a')
        assert.ok(won)
        assert.equal(await leases.tryAcquire('runway-1', sessionId, expires, 'task-b'), null)
        await leases.attach('runway-1', 'rw-test-1')
        assert.equal((await leases.listHeld())[0]?.runwaySessionId, 'rw-test-1')
        assert.equal(typeof (await leases.minutesUsed(clock.today())), 'number')
        assert.deepEqual(await leases.reapExpired(clock.now()), [])
        await leases.release('runway-1', 2, 'client')
        assert.deepEqual(await leases.listHeld(), [])

        const ticket = await leases.enqueue(sessionId)
        assert.equal((await leases.enqueue(sessionId)).ticket, ticket.ticket)
        assert.equal(await leases.position(ticket.ticket), 1)
        assert.equal(await leases.queueLength(), 1)
        assert.equal((await leases.peek())?.ticket, ticket.ticket)
        await leases.markClaimable(ticket.ticket, expires)
        assert.equal((await leases.get(ticket.ticket))?.claimableUntil, expires)
        await leases.expire(ticket.ticket)
        assert.equal(await leases.position(ticket.ticket), null)
        const fresh = await leases.enqueue(sessionId)
        assert.notEqual(fresh.ticket, ticket.ticket)
        await leases.dequeue(fresh.ticket)
        assert.equal(await leases.queueLength(), 0)
      })

      it('the shelf: fifteen products, resolved by id, name, alias or substring, never guessed', async () => {
        const shelf = new PostgresProductShelf(client)
        const products = await shelf.list()
        assert.equal(products.length, 15)
        assert.equal((await shelf.byId('LIC_ULIP_401'))?.category, 'ULIP')
        assert.equal((await shelf.resolve('ULIP'))?.productId, 'LIC_ULIP_401')
        assert.equal(
          (await shelf.resolve('the LIC Market Plus my cousin mentioned'))?.productId,
          'LIC_ULIP_401',
        )
        assert.equal((await shelf.resolve('term plan'))?.productId, 'LIC_TERM_201')
        assert.equal((await shelf.resolve('UTI Nifty 50 Index Fund'))?.productId, 'MF_INDEX_103')
        assert.equal((await shelf.resolve('PPF'))?.productId, 'GOI_PPF_302')
        assert.equal(await shelf.resolve('bitcoin'), null)
        assert.ok(products.every((p) => p.source === 'fixture' && p.verified === false))
      })

      it('smoke: consent trigger, payload idempotency, check constraints, hash fill, current views', async () => {
        const revoked = await client.query<{ id: string }>(
          `INSERT INTO app.consents (customer_id, consent_reference, kind, scopes, data_period_from, data_period_to,
             fetch_type, status, granted_at, valid_to, revoked_at)
           VALUES ($1, 'CONS_SYN_REVOKED_TEST', 'synthetic', ARRAY['TXN'], '2025-08-01', '2026-07-31', 'ONETIME',
                   'REVOKED', now() - interval '2 days', now() + interval '1 year', now() - interval '1 day')
           RETURNING id`,
          [customerId],
        )
        await expectPgError(
          client,
          PG.insufficientPrivilege,
          `INSERT INTO staging.sync_runs (customer_id, consent_id, source, trigger, as_of) VALUES ($1, $2, 'fixtures', 'manual', now())`,
          [customerId, revoked.rows[0]?.id],
        )

        const payload = '{"accounts":[{"accountNumberMasked":"XXXXXX7412"}]}'
        const hash = sha256Hex(payload)
        for (let i = 0; i < 2; i += 1) {
          await client.query(
            `INSERT INTO staging.raw_payloads (sync_run_id, source, endpoint_code, customer_id, payload, payload_hash, payload_bytes)
             VALUES ($1, 'fixtures', 'smoke/test', $2, $3, $4, $5)
             ON CONFLICT (source, endpoint_code, payload_hash) DO NOTHING`,
            [syncRunId, customerId, payload, hash, payload.length],
          )
        }
        const dupes = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM staging.raw_payloads WHERE payload_hash = $1`,
          [hash],
        )
        assert.equal(dupes.rows[0]?.n, 1)

        await expectPgError(
          client,
          PG.checkViolation,
          `INSERT INTO bank.transactions (account_id, customer_id, source, first_seen_run_id, tran_id, dedupe_hash,
             tran_date, value_date, tran_type, amount, channel_code, narration, rrn)
           VALUES ($1, $2, 'fixtures', $3, 'SMOKE1', $4, '2026-08-03', '2026-08-03', 'DEBIT', 10, 'UPI', 'UPI/BAD', 'ABC')`,
          [casaAccountId, customerId, syncRunId, sha256Hex('smoke-bad-rrn')],
        )

        const filled = await client.query<{ ok: boolean }>(
          `INSERT INTO app.snapshots (customer_id, subject_id, session_id, as_of, engine_version, input_hash, snapshot)
           VALUES ($1, $2, $3, '1999-01-01', 'integration-test', $4, '{"surplus":{"deployable":11481},"income":{"monthly":85000}}')
           RETURNING snapshot_hash = common.sha256_hex(snapshot) AS ok`,
          [customerId, subjectId, sessionId, sha256Hex('smoke-inputs')],
        )
        assert.equal(filled.rows[0]?.ok, true)

        const run = await client.query<{ id: string }>(
          `INSERT INTO staging.sync_runs (customer_id, consent_id, source, trigger, as_of, finished_at, status)
           SELECT $1, id, 'fixtures', 'schedule', '2030-01-01T00:00:00Z', now(), 'succeeded'
           FROM app.consents WHERE customer_id = $1 AND status = 'ACTIVE' ORDER BY valid_to DESC LIMIT 1
           RETURNING id`,
          [customerId],
        )
        await client.query(
          `INSERT INTO bank.account_snapshots (account_id, sync_run_id, source, as_of, account_type, status, current_balance)
           VALUES ($1, $2, 'fixtures', '2030-01-01T00:00:00Z', 'SAVINGS', 'ACTIVE', 1)`,
          [casaAccountId, run.rows[0]?.id],
        )
        const current = await client.query<{ current_balance: number }>(
          `SELECT current_balance FROM bank.account_snapshots_current WHERE account_id = $1`,
          [casaAccountId],
        )
        assert.equal(current.rows[0]?.current_balance, 1)

        const tables = await client.query<{ table_schema: string; n: number }>(
          `SELECT table_schema, count(*)::int AS n FROM information_schema.tables
           WHERE table_schema IN ('ref', 'staging', 'bank', 'app') AND table_type = 'BASE TABLE'
           GROUP BY 1 ORDER BY 1`,
        )
        assert.deepEqual(Object.fromEntries(tables.rows.map((r) => [r.table_schema, r.n])), {
          app: 16,
          bank: 12,
          ref: 7,
          staging: 6,
        })
      })

      it('erasure: the subject goes, the session and snapshots cascade, the record stays', async () => {
        const sessions = new PostgresSessionStore(client, clock)
        const snapshots = new PostgresSnapshotStore(client, clock)
        const audit = new PostgresAuditStore(client, clock)
        await sessions.erase(sessionId)
        assert.equal(await sessions.getById(sessionId), null)
        assert.equal(await snapshots.getById(snapshotId), null)
        assert.equal((await audit.listForSubject(subjectId)).length, 2)
        assert.deepEqual(await audit.verifyChain(sessionId), { ok: true, length: 2 })
      })
    })
  },
)

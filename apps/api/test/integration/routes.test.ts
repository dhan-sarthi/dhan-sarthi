/**
 * Every session route, walked through the real app, with the answers a reviewer would check:
 * the picker order, when a plan version is cut and what its reason says, the simulated date it
 * carries, the text tier quoting Today's pot, a text-tier verdict on the record, the statement
 * paged to the ledger's start, the chain, erasure.
 *
 * The walk runs on the memory profile always, and against Postgres as the runtime role
 * (`dhan_app`, the least-privileged role migration 0007 grants) when DATABASE_URL is set — so a
 * grant the API needs and does not have fails here, not on a reviewer's first tap. The Postgres
 * walk writes a session and erases it at the end; the advice records it wrote stay, append-only,
 * unlinkable to anything, exactly as erasure is meant to leave them.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type pg from 'pg'
import type {
  Answer,
  ChainVerification,
  CustomersResponse,
  DecisionResponse,
  ErrorBody,
  EvaluateResponse,
  RecordView,
  SessionState,
  TransactionsPage,
  View,
} from '@dhan/contracts'
import { FixedClock } from '../../src/adapters/clock/fixed-clock.ts'
import { PostgresAuditStore } from '../../src/adapters/postgres/audit-store.postgres.ts'
import { PostgresBankData } from '../../src/adapters/postgres/bank-data.postgres.ts'
import { PostgresLeaseStore } from '../../src/adapters/postgres/lease-store.postgres.ts'
import { PostgresProductShelf } from '../../src/adapters/postgres/product-shelf.postgres.ts'
import { PostgresSeedInfo } from '../../src/adapters/postgres/seed-provenance.postgres.ts'
import { PostgresSessionStore } from '../../src/adapters/postgres/session-store.postgres.ts'
import { PostgresSnapshotStore } from '../../src/adapters/postgres/snapshot-store.postgres.ts'
import {
  FIRST_PLAN_REASON,
  HISTORY_WINDOW_MONTHS,
  TARGET_CHANGED_REASON,
} from '../../src/application/advisory.service.ts'
import { seedVersions } from '../../src/cli/seed.ts'
import { loadConfig } from '../../src/config.ts'
import type { Config } from '../../src/config.ts'
import { createPool } from '../../src/db/pool.ts'
import { ANCHOR, ROHAN_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

interface Harness {
  root: TestRoot
  /** The role the database sees; null on the memory profile. */
  role: () => Promise<string | null>
  close: () => Promise<void>
}

function walk(name: string, open: () => Promise<Harness>, skip: string | false): void {
  describe(`the session routes on ${name}`, { skip }, () => {
    let h: Harness
    let token: string
    let session: SessionState

    before(async () => {
      h = await open()
    })
    after(async () => {
      await h?.close()
    })

    const get = (url: string, headers: Record<string, string> = {}) =>
      h.root.app.inject({ method: 'GET', url, headers: { ...bearer(token), ...headers } })
    const send = (
      method: 'POST' | 'PATCH' | 'DELETE',
      url: string,
      payload?: Record<string, unknown>,
      headers: Record<string, string> = {},
    ) =>
      h.root.app.inject({
        method,
        url,
        headers: { ...bearer(token), ...headers },
        ...(payload === undefined ? {} : { payload }),
      })
    const view = async (): Promise<{ view: View; timing: string; etag: string }> => {
      const res = await get('/api/v1/view')
      assert.equal(res.statusCode, 200, res.body)
      return {
        view: res.json<View>(),
        timing: String(res.headers['server-timing'] ?? ''),
        etag: String(res.headers['etag'] ?? ''),
      }
    }
    const record = async (): Promise<RecordView> => {
      const res = await get('/api/v1/record')
      assert.equal(res.statusCode, 200, res.body)
      return res.json<RecordView>()
    }

    it('connects as the least-privileged role where there is a database', async () => {
      const role = await h.role()
      if (role !== null) assert.equal(role, 'dhan_app')
    })

    it('lists the picker in display order: Karan, Rohan, Priya, Sunil', async () => {
      const res = await h.root.app.inject({ method: 'GET', url: '/api/v1/customers' })
      assert.equal(res.statusCode, 200, res.body)
      assert.deepEqual(
        res.json<CustomersResponse>().map((c) => c.name),
        ['Karan Deshpande', 'Rohan Mehta', 'Priya Nair', 'Sunil Kumar'],
      )
      const created = await createSession(h.root.app, ROHAN_CIF)
      token = created.token
      session = created.session
    })

    it('cuts the first plan once and keeps it on every view after', async () => {
      const first = await view()
      assert.equal(first.view.meta.roadmapVersion, 1)
      assert.match(first.timing, /snapshot;desc=(derived|stored)/)
      assert.match(first.timing, /roadmap;desc=cut/)
      assert.match(first.timing, /view;dur=\d+/)

      const again = await view()
      assert.equal(again.view.meta.roadmapVersion, 1)
      assert.equal(again.etag, first.etag)
      assert.match(again.timing, /snapshot;desc=memo/)
      assert.match(again.timing, /roadmap;desc=kept/)

      const cached = await get('/api/v1/view', { 'if-none-match': first.etag })
      assert.equal(cached.statusCode, 304)
      assert.equal(cached.headers['cache-control'], 'private, no-store')

      const rec = await record()
      assert.equal(rec.roadmapVersions.length, 1)
      assert.equal(rec.roadmapVersions[0]?.reasonForChange, FIRST_PLAN_REASON)
      assert.equal(rec.roadmapVersions[0]?.atSim, ANCHOR)
    })

    it('caps a category, reports the breach on the plan, and clears it again', async () => {
      const before = await view()
      const category = before.view.snapshot.discretionary.byCategory[0]?.[0]
      assert.ok(category, 'the seeded ledger should have at least one spend category')
      assert.equal(before.view.plan.since.capBreached, false)

      // A rupee, so the breach is a property of the cap rather than of the amount spent.
      const set = await send('POST', '/api/v1/session/caps', { category, monthlyLimit: 1 })
      assert.equal(set.statusCode, 200, set.body)
      assert.deepEqual(set.json<SessionState>().caps, [{ category, monthlyLimit: 1 }])
      assert.equal((await view()).view.plan.since.capBreached, true)

      // Null is the removal, and it has to be distinguishable from "no cap sent".
      const cleared = await send('POST', '/api/v1/session/caps', { category, monthlyLimit: null })
      assert.equal(cleared.statusCode, 200, cleared.body)
      assert.deepEqual(cleared.json<SessionState>().caps, [])
      assert.equal((await view()).view.plan.since.capBreached, false)

      // A cap is not an observation about the customer, so it cuts no new plan version.
      assert.equal((await view()).view.meta.roadmapVersion, before.view.meta.roadmapVersion)
    })

    it('refuses a cap of zero or less rather than storing one nothing can satisfy', async () => {
      const bad = await send('POST', '/api/v1/session/caps', {
        category: 'Eating out',
        monthlyLimit: 0,
      })
      assert.equal(bad.statusCode, 400, bad.body)
    })

    it('names the scope when consent is withdrawn and when it is restored', async () => {
      const before = await view()
      const off = await send('POST', '/api/v1/session/consent', {
        scope: 'LIABILITIES',
        granted: false,
      })
      assert.equal(off.statusCode, 200, off.body)

      const without = await view()
      assert.equal(without.view.meta.roadmapVersion, 2)
      assert.equal(without.view.snapshot.debt.total, 0)
      assert.notEqual(without.view.meta.snapshotId, before.view.meta.snapshotId)
      assert.equal((await view()).view.meta.roadmapVersion, 2)

      const on = await send('POST', '/api/v1/session/consent', {
        scope: 'LIABILITIES',
        granted: true,
      })
      assert.equal(on.statusCode, 200, on.body)

      const restored = await view()
      assert.equal(restored.view.meta.roadmapVersion, 3)
      assert.equal(restored.view.meta.snapshotId, before.view.meta.snapshotId)
      // The same snapshot and the same goal as version 3: nothing to cut.
      assert.equal((await view()).view.meta.roadmapVersion, 3)

      const rec = await record()
      assert.deepEqual(
        rec.roadmapVersions.map((v) => [v.version, v.reasonForChange, v.atSim]),
        [
          [1, FIRST_PLAN_REASON, ANCHOR],
          [2, 'Re-cut after you withdrew Loans.', ANCHOR],
          [3, 'Re-cut after you restored Loans.', ANCHOR],
        ],
      )
    })

    it('says which date the clock moved to, and when the target changed', async () => {
      const moved = await send('POST', '/api/v1/session/clock', {
        advanceDays: 30,
        expectedVersion: (await get('/api/v1/session')).json<SessionState>().version,
      })
      assert.equal(moved.statusCode, 200, moved.body)
      const october = await view()
      assert.equal(october.view.meta.asOf, '2026-10-01')
      assert.equal(october.view.meta.roadmapVersion, 4)

      const target = await send('PATCH', '/api/v1/session/goal', { targetAmount: 5_000_000 })
      assert.equal(target.statusCode, 200, target.body)
      const retargeted = await view()
      assert.equal(retargeted.view.meta.roadmapVersion, 5)
      assert.equal(retargeted.view.goal.targetAmount, 5_000_000)
      assert.equal(retargeted.view.meta.snapshotId, october.view.meta.snapshotId)

      const rec = await record()
      assert.deepEqual(
        rec.roadmapVersions.slice(3).map((v) => [v.version, v.reasonForChange, v.atSim]),
        [
          [4, 'Re-cut after the clock moved to 1 October 2026.', '2026-10-01'],
          [5, TARGET_CHANGED_REASON, '2026-10-01'],
        ],
      )
    })

    it('quotes the same safe-to-spend pot in text as on Today', async () => {
      const { view: v } = await view()
      const res = await send('POST', '/api/v1/ask', { question: 'What can I safely spend today?' })
      assert.equal(res.statusCode, 200, res.body)
      const a = res.json<Answer>()
      assert.equal(a.matched, true)
      assert.ok(a.text.includes(inr(v.plan.safeToSpend.pot)), a.text)
      assert.ok(a.text.includes(inr(v.plan.safeToSpend.perDay)), a.text)
    })

    it('puts a text-tier verdict on the record with its rule, beside the decisions', async () => {
      const res = await send('POST', '/api/v1/suitability/evaluate', {
        productId: 'LIC_ULIP_401',
        amount: 5000,
      })
      assert.equal(res.statusCode, 200, res.body)
      const { verdict, adviceRecordId } = res.json<EvaluateResponse>()
      assert.equal(verdict.verdict, 'BLOCKED')

      const rec = await record()
      const row = rec.adviceRecords.find((r) => r.id === adviceRecordId)
      assert.ok(row)
      assert.equal(row.source, 'text')
      assert.equal(row.verdict, 'BLOCKED')
      assert.equal(row.ruleId, 'BUNDLED_PROTECTION')
      assert.equal(row.productId, 'LIC_ULIP_401')
      assert.equal(row.atSim, '2026-10-01')
      assert.equal(rec.decisions.length, 0)
      // A check is not a decision, and a re-check does not re-cut the plan.
      assert.equal(rec.roadmapVersions.length, 5)
    })

    it('records a decision and re-cuts the plan for it', async () => {
      const { view: v } = await view()
      assert.ok(v.plan.primary)
      const res = await send(
        'POST',
        `/api/v1/actions/${v.plan.primary.id}/decision`,
        { kind: 'did_it' },
        { 'idempotency-key': `routes-${session.id}` },
      )
      assert.equal(res.statusCode, 200, res.body)
      assert.equal(res.json<DecisionResponse>().roadmapVersion, 6)

      const rec = await record()
      assert.equal(rec.decisions.length, 1)
      assert.equal(rec.decisions[0]?.actionId, v.plan.primary.id)
      assert.match(rec.roadmapVersions.at(-1)?.reasonForChange ?? '', /Re-cut after 1 decision/)
      assert.equal(rec.roadmapVersions.at(-1)?.atSim, '2026-10-01')
      assert.equal(rec.chainVerified, true)

      const verify = (await get('/api/v1/record/verify')).json<ChainVerification>()
      assert.equal(verify.ok, true)
      assert.equal(verify.length, rec.adviceRecords.length)
    })

    it('pages the statement to the start of the ledger and then stops', async () => {
      const horizon = (await get('/api/v1/session')).json<SessionState>().ledgerHorizon
      const seen = new Set<string>()
      let cursor: string | null = null
      let pages = 0
      let earliest = '9999-12-31'
      let previous = '9999-12-31'
      for (;;) {
        const url: string = `/api/v1/transactions?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        const page: TransactionsPage = (await get(url)).json<TransactionsPage>()
        pages += 1
        for (const t of page.items) {
          assert.ok(!seen.has(t.txnId), `duplicate ${t.txnId} on page ${pages}`)
          seen.add(t.txnId)
          assert.ok(t.txnDate <= previous, 'newest first')
          assert.ok(t.txnDate <= '2026-10-01', 'never past the simulated today')
          previous = t.txnDate
          if (t.txnDate < earliest) earliest = t.txnDate
        }
        if (page.nextCursor === null) break
        cursor = page.nextCursor
        assert.ok(pages < 50, 'the cursor must end')
      }
      assert.ok(pages > 1)
      assert.ok(seen.size > 1000, `${seen.size} lines`)
      assert.equal(earliest.slice(0, 7), horizon.from.slice(0, 7))
    })

    it('erases the session; the bearer stops working', async () => {
      const res = await send('DELETE', '/api/v1/session')
      assert.equal(res.statusCode, 204)
      const gone = await get('/api/v1/view')
      assert.equal(gone.statusCode, 401)
      assert.equal(gone.json<ErrorBody>().code, 'UNAUTHORIZED')
    })
  })
}

/* ------------------------------------------------------------------ */

walk(
  'the memory profile',
  async () => {
    const root = await makeRoot()
    return { root, role: async () => null, close: () => root.close() }
  },
  false,
)

function readConfig(): Config | null {
  try {
    return loadConfig({ ...process.env, BANK_SOURCE: 'postgres', DB_ROLE: 'dhan_app' })
  } catch {
    return null
  }
}

const config = readConfig()

walk(
  'postgres as dhan_app',
  async () => {
    const cfg = config as Config
    const clock = new FixedClock('2026-09-03T09:00:00.000Z')
    // The same pool profiles.ts builds for the API: every connection takes the role first.
    const pool: pg.Pool = createPool({
      connectionString: cfg.DATABASE_URL as string,
      applicationName: 'dhan-integration-routes',
      max: 3,
      statementTimeoutMs: 30_000,
      role: cfg.DB_ROLE as string,
    })
    const bank = await PostgresBankData.connect(pool)
    const root = await makeRoot({
      env: {
        BANK_SOURCE: 'postgres',
        DATABASE_URL: cfg.DATABASE_URL as string,
        DB_ROLE: 'dhan_app',
      },
      deps: {
        clock,
        bank,
        shelf: new PostgresProductShelf(pool),
        sessions: new PostgresSessionStore(pool, clock),
        snapshots: new PostgresSnapshotStore(pool, clock),
        audit: new PostgresAuditStore(pool, clock),
        leases: new PostgresLeaseStore(pool, clock),
        seed: new PostgresSeedInfo(pool, {
          anchor: cfg.SEED_ANCHOR,
          historyMonths: HISTORY_WINDOW_MONTHS,
          forwardMonths: cfg.SEED_FORWARD_MONTHS,
          generatorVersion: seedVersions(cfg.GIT_SHA).generator,
        }),
      },
    })
    return {
      root,
      role: async () => {
        const { rows } = await pool.query<{ role: string }>('SELECT current_user AS role')
        return rows[0]?.role ?? null
      },
      close: async () => {
        await root.close()
        await pool.end()
      },
    }
  },
  config?.DATABASE_URL ? false : 'DATABASE_URL is not set',
)

/**
 * The activity simulator itself: the same journey from two processes, a reviewer's session left
 * exactly as the reviewer left it, a second run that adds nothing, and a boot that keeps
 * answering while journeys are laid down.
 *
 * Most of these run the simulator over a handful of customers (`only`) rather than the whole
 * population: what is being proven is how one journey is laid, and fifty of them take a minute
 * and a quarter. `activity.test.ts` runs the whole book once and reads the result.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { BOOK_ACTIVITY, RM_BOOK } from '@dhan/fixtures'
import type { RmJourney } from '@dhan/contracts'
import { FixedClock } from '../../src/adapters/clock/fixed-clock.ts'
import { InMemoryAuditStore } from '../../src/adapters/memory/audit-store.memory.ts'
import { InMemorySessionStore } from '../../src/adapters/memory/session-store.memory.ts'
import { InMemorySnapshotStore } from '../../src/adapters/memory/snapshot-store.memory.ts'
import { ActivitySimulator, isJourney } from '../../src/application/rm/simulator.ts'
import type { SimulationReport } from '../../src/application/rm/simulator.ts'
import { silentLogger } from '../../src/infra/logger.ts'
import type { AuditStore, SessionStore, SnapshotStore } from '../../src/ports/index.ts'
import {
  KARAN_CIF,
  MEERA,
  PRIYA_CIF,
  ROHAN_CIF,
  bearer,
  createSession,
  makeRoot,
  signInRm,
} from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const cifOf = (slug: string): string => {
  const persona = RM_BOOK.find((p) => p.slug === slug)
  assert.ok(persona, slug)
  return persona.customer.cif
}

/** Two enquiries and a recent request; one enquiry; one recent request and a ULIP. */
const SAMPLE = ['sneha', 'farhan', 'imran'].map(cifOf)

function simulator(root: TestRoot, only: readonly string[]): ActivitySimulator {
  return new ActivitySimulator({
    bank: root.deps.bank,
    desk: root.deps.rmDesk,
    sessionStore: root.deps.sessions,
    sessions: root.services.sessions,
    advisory: root.services.advisory,
    decisions: root.services.decisions,
    conversation: root.services.conversation,
    book: root.rm.book,
    activity: new Map(Object.entries(BOOK_ACTIVITY)),
    only,
    clock: root.clock,
    log: silentLogger,
  })
}

async function run(sim: ActivitySimulator): Promise<SimulationReport> {
  sim.start()
  await sim.ready()
  const report = sim.report()
  assert.ok(report)
  return report
}

/** A journey with everything a second process would mint differently taken out. */
async function comparable(root: TestRoot, cif: string): Promise<unknown> {
  const { token } = await signInRm(root.app, MEERA)
  const res = await root.app.inject({
    method: 'GET',
    url: `/api/v1/rm/customers/${cif}/journey`,
    headers: bearer(token),
  })
  assert.equal(res.statusCode, 200, res.body)
  const journey = res.json<RmJourney>().events.map(({ id: _id, ...event }) => event)
  assert.ok(journey.length > 12, `${cif}: a year of journey to compare`)
  const records = []
  for (const s of (await root.deps.sessions.listByCif(cif)).filter(isJourney)) {
    for (const r of (await root.deps.audit.listForSession(s.id)).adviceRecords) {
      const {
        id: _id,
        seq: _seq,
        sessionId: _session,
        snapshotId: _snapshot,
        prevHash: _prev,
        recordHash: _hash,
        createdAt: _created,
        ...rest
      } = r
      records.push(rest)
    }
  }
  return { journey, records }
}

describe('the activity simulator', () => {
  it('lays the same journey down in two processes', async () => {
    const roots = [await makeRoot(), await makeRoot()]
    try {
      const seen = []
      for (const root of roots) {
        const report = await run(simulator(root, [KARAN_CIF, ...SAMPLE]))
        assert.equal(report.simulated, SAMPLE.length + 1)
        seen.push(await Promise.all([KARAN_CIF, ...SAMPLE].map((cif) => comparable(root, cif))))
      }
      assert.deepEqual(seen[0], seen[1])
    } finally {
      await Promise.all(roots.map((r) => r.close()))
    }
  })

  describe('beside a reviewer', () => {
    const clock = new FixedClock('2026-09-03T09:00:00.000Z')
    /** Which session every write to a customer-side store was for, by method. */
    const writes: { method: string; sessionId: string }[] = []
    let root: TestRoot

    /** The store as it is, with the session of every write it receives noted down. */
    function noted<T extends object>(
      store: T,
      sessionOf: Record<string, (args: unknown[]) => string>,
    ): T {
      return new Proxy(store, {
        get(target, prop, receiver) {
          const value: unknown = Reflect.get(target, prop, receiver)
          if (typeof value !== 'function') return value
          const which = typeof prop === 'string' ? sessionOf[prop] : undefined
          if (!which) return value.bind(target)
          return (...args: unknown[]) => {
            writes.push({ method: prop as string, sessionId: which(args) })
            return (value as (...a: unknown[]) => unknown).apply(target, args)
          }
        },
      })
    }

    before(async () => {
      const first = (args: unknown[]): string => String(args[0])
      const field = (args: unknown[]): string =>
        String((args[0] as { sessionId: string }).sessionId)
      root = await makeRoot({
        // Reviewer sessions with a past of their own, so there is a record to leave alone.
        env: { SEED_HISTORY_MONTHS: '2' },
        deps: {
          clock,
          sessions: noted<SessionStore>(new InMemorySessionStore(clock), {
            patch: first,
            touch: first,
            erase: first,
          }),
          snapshots: noted<SnapshotStore>(new InMemorySnapshotStore(clock), {
            put: field,
            putRoadmap: field,
          }),
          audit: noted<AuditStore>(new InMemoryAuditStore(clock), {
            appendAdvice: field,
            appendDecision: field,
          }),
        },
      })
    })
    after(() => root.close())

    it('never writes to a session it did not open, and leaves a reviewed hero alone', async () => {
      const karan = await createSession(root.app, KARAN_CIF)
      const rohan = await createSession(root.app, ROHAN_CIF)
      const reviewers = [karan.session.id, rohan.session.id]
      const snapshot = async (id: string) => ({
        session: await root.deps.sessions.getById(id),
        trail: await root.deps.audit.listForSession(id),
        versions: await root.deps.snapshots.listRoadmaps(id),
      })
      const before = await Promise.all(reviewers.map(snapshot))
      writes.length = 0

      const report = await run(simulator(root, [KARAN_CIF, ROHAN_CIF, PRIYA_CIF, SAMPLE[0]!]))
      assert.deepEqual([report.simulated, report.skipped, report.failed], [2, 2, 0])

      assert.ok(writes.length > 0, 'the counter saw the simulator write')
      const journeys = new Set<string>()
      for (const cif of [PRIYA_CIF, SAMPLE[0]!]) {
        for (const s of (await root.deps.sessions.listByCif(cif)).filter(isJourney))
          journeys.add(s.id)
      }
      assert.equal(journeys.size, 2)
      for (const w of writes) assert.ok(journeys.has(w.sessionId), `${w.method} on ${w.sessionId}`)

      // The reviewed heroes: no journey beside the reviewer's session, and theirs untouched.
      for (const cif of [KARAN_CIF, ROHAN_CIF]) {
        assert.equal((await root.deps.sessions.listByCif(cif)).filter(isJourney).length, 0, cif)
      }
      assert.deepEqual(await Promise.all(reviewers.map(snapshot)), before)
    })

    it('adds nothing on a second run', async () => {
      const cifs = [KARAN_CIF, ROHAN_CIF, PRIYA_CIF, SAMPLE[0]!]
      writes.length = 0
      const report = await run(simulator(root, cifs))
      assert.deepEqual([report.simulated, report.skipped], [0, cifs.length])
      assert.deepEqual(writes, [])
    })
  })

  it('keeps the process answering while it lays journeys down', async () => {
    const root = await makeRoot({ env: { RM_SIMULATE: '1' } })
    const CEILING_MS = 1_000
    let worstLagMs = 0
    let last = performance.now()
    const sampler = setInterval(() => {
      const now = performance.now()
      worstLagMs = Math.max(worstLagMs, now - last - 10)
      last = now
    }, 10)
    try {
      const slowest: number[] = []
      // Three seconds into the run, several customers in: a health check every quarter second.
      for (let i = 0; i < 12; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250))
        const asked = performance.now()
        const res = await root.app.inject({ method: 'GET', url: '/api/v1/health' })
        assert.equal(res.statusCode, 200)
        slowest.push(performance.now() - asked)
      }
      assert.equal(root.rm.simulator.report(), null, 'still simulating while it was asked')
      assert.ok(
        Math.max(...slowest) < CEILING_MS,
        `health took ${Math.round(Math.max(...slowest))} ms`,
      )
      assert.ok(worstLagMs < CEILING_MS, `the event loop stalled for ${Math.round(worstLagMs)} ms`)
    } finally {
      clearInterval(sampler)
      // Between customers, not mid-journey: the run ends at the next customer boundary.
      root.rm.simulator.stop()
      await root.rm.simulator.ready()
      await root.close()
    }
    const report = root.rm.simulator.report()
    assert.ok(report && report.simulated > 0 && report.simulated < 50, JSON.stringify(report))
  })
})

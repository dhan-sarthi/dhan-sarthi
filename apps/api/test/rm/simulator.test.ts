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
import { createHash } from 'node:crypto'
import { addDays } from '@dhan/core'
import { ALL_PERSONAS, BOOK_ACTIVITY, PERSONAS, RM_BOOK } from '@dhan/fixtures'
import type { RmJourney } from '@dhan/contracts'
import { FixedClock } from '../../src/adapters/clock/fixed-clock.ts'
import { InMemoryAuditStore } from '../../src/adapters/memory/audit-store.memory.ts'
import { InMemorySessionStore } from '../../src/adapters/memory/session-store.memory.ts'
import { InMemorySnapshotStore } from '../../src/adapters/memory/snapshot-store.memory.ts'
import {
  ActivitySimulator,
  FIRST_DAY,
  LAST_DAY,
  isJourney,
  journeyDay,
  journeyFinished,
  journeyPlan,
} from '../../src/application/rm/simulator.ts'
import type { SimulationReport } from '../../src/application/rm/simulator.ts'
import { silentLogger } from '../../src/infra/logger.ts'
import type { AuditStore, SessionStore, SnapshotStore } from '../../src/ports/index.ts'
import {
  ANCHOR,
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

/**
 * The four heroes' reviewer sessions as `HistoryService` seeds them over eight months, hashed
 * with ids and wall-clock stamps taken out. Taken from commit 9c83556, before the simulator's
 * days moved: a change here is a change to what the mobile app shows, and needs its own reason.
 */
const REVIEWER_SEEDING_SHA256 = '1191f0647419388262b34f00fbdf51e2831fd8f2f549ecf70b6dfa1a1243eae5'

function simulator(
  root: TestRoot,
  only: readonly string[],
  sessionStore: SessionStore = root.deps.sessions,
): ActivitySimulator {
  return new ActivitySimulator({
    bank: root.deps.bank,
    desk: root.deps.rmDesk,
    sessionStore,
    audit: root.deps.audit,
    snapshots: root.deps.snapshots,
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

  describe('cut off part way', () => {
    /** The store, dead after `alive` clock moves: a process killed in the middle of a journey. */
    function killedAfter(store: SessionStore, alive: number): SessionStore {
      let moves = 0
      return new Proxy(store, {
        get(target, prop, receiver) {
          const value: unknown = Reflect.get(target, prop, receiver)
          if (typeof value !== 'function') return value
          if (prop !== 'patch') return value.bind(target)
          return (...args: unknown[]) => {
            moves += 1
            if (moves > alive) return Promise.reject(new Error('process killed'))
            return (value as (...a: unknown[]) => unknown).apply(target, args)
          }
        },
      })
    }

    it('finishes an unfinished journey on the next boot, exactly as one run would have laid it', async () => {
      const cif = SAMPLE[0]!
      const clean = await makeRoot()
      const cut = await makeRoot()
      try {
        assert.equal((await run(simulator(clean, [cif]))).simulated, 1)
        const expected = await comparable(clean, cif)

        // Killed at three different points: early in the first stretch, around an enquiry, and
        // in the last months. Each is resumed over the same stores by a fresh simulator.
        for (const alive of [4, 9, 14]) {
          for (const s of await cut.deps.sessions.listByCif(cif))
            await cut.deps.sessions.erase(s.id)
          const killed = await run(simulator(cut, [cif], killedAfter(cut.deps.sessions, alive)))
          assert.deepEqual([killed.simulated, killed.failed], [0, 1], `killed after ${alive}`)
          const [partial] = (await cut.deps.sessions.listByCif(cif)).filter(isJourney)
          assert.ok(partial, 'the cut journey is on the record')
          const plan = journeyPlan(cif, BOOK_ACTIVITY[cif] ?? null, ANCHOR, ANCHOR)
          assert.equal(journeyFinished(partial, plan), false, 'and not marked done')

          const resumed = await run(simulator(cut, [cif]))
          assert.deepEqual([resumed.simulated, resumed.resumed, resumed.failed], [1, 1, 0])
          const [done] = (await cut.deps.sessions.listByCif(cif)).filter(isJourney)
          assert.ok(done && journeyFinished(done, plan))
          assert.deepEqual(await comparable(cut, cif), expected, `killed after ${alive}`)
          assert.ok((await cut.deps.audit.verifyChain(done.id)).ok)

          // And a third boot finds it done.
          const again = await run(simulator(cut, [cif]))
          assert.deepEqual([again.simulated, again.skipped], [0, 1])
        }
      } finally {
        await Promise.all([clean.close(), cut.close()])
      }
    })

    it('lets the customer in hand finish when stopped, and gives up on one that hangs', async () => {
      const root = await makeRoot()
      try {
        const [first, second] = SAMPLE
        const sim = simulator(root, [first!, second!])
        sim.start()
        // Wait for the first journey to be under way, then stop.
        while ((await root.deps.sessions.listByCif(first!)).filter(isJourney).length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 5))
        }
        await sim.stop()
        await sim.ready()
        const [journey] = (await root.deps.sessions.listByCif(first!)).filter(isJourney)
        const plan = journeyPlan(first!, BOOK_ACTIVITY[first!] ?? null, ANCHOR, ANCHOR)
        assert.ok(journey && journeyFinished(journey, plan), 'the customer in hand finished')
        assert.equal(
          (await root.deps.sessions.listByCif(second!)).length,
          0,
          'the next never began',
        )
        assert.equal(sim.report()?.simulated, 1)

        // A store that never answers: stop() returns within its bound rather than hang the close.
        const hung = new Proxy(root.deps.sessions, {
          get(target, prop, receiver) {
            const value: unknown = Reflect.get(target, prop, receiver)
            if (typeof value !== 'function') return value
            if (prop === 'patch') return () => new Promise(() => {})
            return value.bind(target)
          },
        })
        const stuck = simulator(root, [second!], hung)
        stuck.start()
        while ((await root.deps.sessions.listByCif(second!)).filter(isJourney).length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 5))
        }
        // The bound's timer does not hold a process open on its own (nothing could finish the
        // customer then), so this test holds the loop open while it waits.
        const hold = setTimeout(() => undefined, 5_000)
        const asked = performance.now()
        await stuck.stop(50)
        clearTimeout(hold)
        assert.ok(performance.now() - asked < 1_000, 'stop() was bounded')
      } finally {
        await root.close()
      }
    })
  })

  it('lands each customer’s last months on their own day, the same day every run', () => {
    const days = ALL_PERSONAS.map((p) => journeyDay(p.customer.cif))
    assert.deepEqual(
      days,
      ALL_PERSONAS.map((p) => journeyDay(p.customer.cif)),
    )
    assert.ok(days.every((d) => d >= FIRST_DAY && d <= LAST_DAY))
    assert.ok(new Set(days).size >= 15, `${new Set(days).size} different days`)

    for (const [cif, activity] of Object.entries(BOOK_ACTIVITY)) {
      const plan = journeyPlan(cif, activity, ANCHOR, ANCHOR)
      // The walk ends in August, before the clock and before a recent request to talk.
      assert.equal(plan.lastDay.slice(0, 7), '2026-08', cif)
      const handoff = plan.steps.find((s) => s.kind === 'handoff')
      if (handoff?.kind === 'handoff') assert.ok(plan.lastDay < handoff.on, cif)
      if (!activity.recentHandoff) {
        assert.equal(Number(plan.lastDay.slice(8, 10)), journeyDay(cif), cif)
      }
      const months = plan.steps.reduce((n, s) => n + (s.kind === 'months' ? s.months : 0), 0)
      assert.equal(months, 12, cif)
    }
    // A request three days old pulls the last month to before it.
    const late = journeyPlan(
      'X',
      { enquiries: [], recentHandoff: true, handoffDaysAgo: 30 },
      ANCHOR,
      ANCHOR,
    )
    assert.ok(late.lastDay < addDays(ANCHOR, -30))
  })

  it('leaves a reviewer’s seeded history byte for byte as it was, simulator or not', async () => {
    /*
     * The mobile app's history is `HistoryService` over a reviewer's session, and the simulator
     * now lands its own months on a day of each customer's own. The seeding itself must not
     * move: the hash below was taken from the code before the simulator's days changed (commit
     * 9c83556), and it holds whether or not a journey was laid down beside the session first.
     */
    async function seeded(root: TestRoot): Promise<string> {
      const out: unknown[] = []
      for (const persona of PERSONAS) {
        const { session } = await createSession(root.app, persona.customer.cif)
        const stored = await root.deps.sessions.getById(session.id)
        const trail = await root.deps.audit.listForSession(session.id)
        const versions = await root.deps.snapshots.listRoadmaps(session.id)
        const strip = <T extends object>(row: T, keys: readonly string[]): Partial<T> =>
          Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k))) as Partial<T>
        const VOLATILE = [
          'id',
          'sessionId',
          'subjectId',
          'snapshotId',
          'consentId',
          'adviceRecordId',
          'prevHash',
          'recordHash',
          'tokenHash',
          'createdAt',
          'expiresAt',
          'lastActiveAt',
          // The memory store numbers rows across every session: a journey written first moves it.
          'seq',
        ]
        out.push({
          cif: persona.customer.cif,
          session: stored && strip(stored, VOLATILE),
          decisions: trail.decisions.map((d) => strip(d, VOLATILE)),
          advice: trail.adviceRecords.map((a) => strip(a, VOLATILE)),
          versions: versions.map((v) => strip(v, VOLATILE)),
        })
      }
      return createHash('sha256').update(JSON.stringify(out)).digest('hex')
    }

    const plain = await makeRoot({ env: { SEED_HISTORY_MONTHS: '8' } })
    const beside = await makeRoot({ env: { SEED_HISTORY_MONTHS: '8' } })
    try {
      const alone = await seeded(plain)
      // The heroes walked by the simulator first, as on a memory boot, then opened by reviewers.
      const heroes = PERSONAS.map((p) => p.customer.cif)
      assert.equal((await run(simulator(beside, heroes))).simulated, heroes.length)
      assert.equal(await seeded(beside), alone)
      assert.equal(alone, REVIEWER_SEEDING_SHA256)
    } finally {
      await Promise.all([plain.close(), beside.close()])
    }
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
      await root.rm.simulator.stop()
      await root.rm.simulator.ready()
      await root.close()
    }
    const report = root.rm.simulator.report()
    assert.ok(report && report.simulated > 0 && report.simulated < 50, JSON.stringify(report))
  })
})

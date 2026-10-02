/**
 * The RM console over Postgres: migration 0015's tables, the two adapters that read and write
 * them, the seed that fills the desk, and the console end to end across a restart.
 *
 * The adapter assertions are written once and run twice, over the memory adapters always and over
 * Postgres as the runtime role when DATABASE_URL is set, so the two cannot drift apart: the
 * console reads the same answers whichever source is running. Everything those assertions and
 * the guard probes write happens inside transactions that are rolled back.
 *
 * The end-to-end half boots the real app with BANK_SOURCE=postgres and the activity simulator on,
 * lets it lay down every book customer's journey, signs in, writes a note, a handoff's status
 * and a reveal, then boots again over the same database as a restarted process would. What it
 * leaves behind is what the API itself leaves on any boot with RM_SIMULATE on: one journey per
 * customer, and the append-only access entries and note the run wrote, labelled as the suite's.
 *
 *   cd apps/api && DATABASE_URL=… node --test --experimental-strip-types \
 *     test/integration/rm-console.test.ts
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import type pg from 'pg'
import { AccessActionSchema } from '@dhan/contracts'
import type {
  ErrorBody,
  RmAccessLog,
  RmBook,
  RmBookVerification,
  RmHandoffResponse,
  RmJourney,
  RmMe,
  RmNoteResponse,
  RmRefusals,
  RmToday,
} from '@dhan/contracts'
import { BOOK_ACTIVITY, PERSONAS, RM_ASSIGNMENTS, RM_USERS } from '@dhan/fixtures'
import { FixedClock } from '../../src/adapters/clock/fixed-clock.ts'
import { generatedRmDesk } from '../../src/adapters/memory/generated-source.ts'
import { BankBackedHoldings } from '../../src/adapters/memory/holdings.memory.ts'
import { InMemoryRmActivity } from '../../src/adapters/memory/rm-activity.memory.ts'
import {
  PostgresAuditStore,
  PostgresBankData,
  PostgresLeaseStore,
  PostgresProductShelf,
  PostgresRmActivity,
  PostgresRmDesk,
  PostgresSeedInfo,
  PostgresSessionStore,
  PostgresSnapshotStore,
} from '../../src/adapters/postgres/index.ts'
import { HISTORY_WINDOW_MONTHS } from '../../src/application/advisory.service.ts'
import { sha256Hex } from '../../src/application/hash.ts'
import { verifyPassword } from '../../src/application/rm/password.ts'
import { JOURNEY_HINT, isJourney } from '../../src/application/rm/simulator.ts'
import { checkSeed, seed, seedVersions } from '../../src/cli/seed.ts'
import { bankAdapters, resolveProfile } from '../../src/composition/profiles.ts'
import { loadConfig } from '../../src/config.ts'
import type { Config } from '../../src/config.ts'
import { PG, createPool, pgCode } from '../../src/db/pool.ts'
import { silentLogger } from '../../src/infra/logger.ts'
import type { Db } from '../../src/db/pool.ts'
import type { RmActivityPort, RmDeskPort } from '../../src/ports/index.ts'
import { ARJUN, MEERA, bearer, makeRoot, signInRm } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const T0 = '2026-09-03T09:00:00.000Z'
const HOUR = 3_600_000
const MEERA_ID = 'rm-204117'
const ARJUN_ID = 'rm-204388'
const FOREIGN_KEY_VIOLATION = '23503'

const HEROES = new Set(PERSONAS.map((p) => p.customer.cif))
const BOOK_CUSTOMERS = Object.keys(BOOK_ACTIVITY)
const ASSIGNED = Object.entries(RM_ASSIGNMENTS)
const bookOf = (rmId: string): string[] =>
  ASSIGNED.filter(([, owner]) => owner === rmId)
    .map(([cif]) => cif)
    .sort()

const at = (ms: number): string => new Date(Date.parse(T0) + ms).toISOString()

function readConfig(): Config | null {
  try {
    return loadConfig({ ...process.env, BANK_SOURCE: 'postgres', DB_ROLE: 'dhan_app' })
  } catch {
    return null
  }
}

const config = readConfig()
const DATABASE_URL = config?.DATABASE_URL
const NO_DATABASE = DATABASE_URL ? false : 'DATABASE_URL is not set'

/** The pool the API runs on: every connection takes the runtime role first. */
const appPool = (name: string): pg.Pool =>
  createPool({
    connectionString: DATABASE_URL as string,
    applicationName: name,
    max: 4,
    statementTimeoutMs: 60_000,
    role: 'dhan_app',
  })

/** The pool the seed and the migrator run on: the owner. */
const ownerPool = (name: string): pg.Pool =>
  createPool({
    connectionString: DATABASE_URL as string,
    applicationName: name,
    max: 2,
    statementTimeoutMs: 120_000,
  })

/** A statement that must fail with one SQLSTATE, under a savepoint so the transaction survives. */
async function expectPgError(
  client: pg.PoolClient,
  code: string,
  run: () => Promise<unknown>,
): Promise<void> {
  await client.query('SAVEPOINT probe')
  try {
    await run()
    assert.fail(`expected SQLSTATE ${code}`)
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err
    assert.equal(pgCode(err), code, (err as Error).message)
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT probe')
  }
}

const sql =
  (client: Db, text: string, values: unknown[] = []): (() => Promise<unknown>) =>
  () =>
    client.query(text, values)

/* ------------------------------------------------------------------ *
 * The ports, over both adapters
 * ------------------------------------------------------------------ */

interface Opened<T> {
  port: T
  clock: FixedClock
  close: () => Promise<void>
}

/** A transaction on one of the pools, rolled back on close (once, however often it is asked). */
async function inRolledBackTransaction(
  pool: pg.Pool,
): Promise<{ client: pg.PoolClient; close: () => Promise<void> }> {
  const client = await pool.connect()
  await client.query('BEGIN')
  let closed = false
  return {
    client,
    close: async () => {
      if (closed) return
      closed = true
      await client.query('ROLLBACK').catch(() => {})
      client.release()
    },
  }
}

function deskContract(name: string, open: () => Promise<Opened<RmDeskPort>>, skip: string | false) {
  describe(`RmDeskPort over ${name}`, { skip }, () => {
    let o: Opened<RmDeskPort>
    before(async () => {
      o = await open()
    })
    after(() => o?.close())

    it('finds each RM by exact employee number and by id, with a hash and never the password', async () => {
      for (const user of RM_USERS) {
        const found = await o.port.userByEmployeeNo(user.employeeNo)
        assert.ok(found, user.employeeNo)
        assert.deepEqual(
          { ...found, passwordHash: '' },
          {
            rmId: user.rmId,
            employeeNo: user.employeeNo,
            name: user.name,
            desk: user.desk,
            city: user.city,
            passwordHash: '',
          },
        )
        assert.notEqual(found.passwordHash, user.demoPassword)
        assert.equal(await verifyPassword(user.demoPassword, found.passwordHash), true)
        assert.equal(await verifyPassword(`${user.demoPassword}x`, found.passwordHash), false)
        assert.deepEqual(await o.port.userById(user.rmId), found)
      }
      // Exact match only: no prefix, no padding, no guess.
      for (const miss of ['20411', ' 204117', '204117 ', '000000', '']) {
        assert.equal(await o.port.userByEmployeeNo(miss), null, JSON.stringify(miss))
      }
      assert.equal(await o.port.userById('rm-000000'), null)
    })

    it('puts every customer in exactly one book, in cif order', async () => {
      assert.deepEqual(await o.port.bookOf(MEERA_ID), bookOf(MEERA_ID))
      assert.deepEqual(await o.port.bookOf(ARJUN_ID), bookOf(ARJUN_ID))
      assert.equal((await o.port.bookOf(MEERA_ID)).length, 38)
      assert.equal((await o.port.bookOf(ARJUN_ID)).length, 12)
      assert.deepEqual(await o.port.bookOf('rm-000000'), [])
      for (const [cif, rmId] of ASSIGNED) assert.equal(await o.port.assignmentOf(cif), rmId, cif)
      assert.equal(await o.port.assignmentOf('IDBI0000000000'), null)
    })

    it('keeps a sign-in through touch, expiry and revocation, and still returns it afterwards', async () => {
      const tokenHash = sha256Hex(`rm-contract-${randomUUID()}`)
      const created = await o.port.createSession({
        rmId: MEERA_ID,
        tokenHash,
        expiresAt: at(8 * HOUR),
      })
      assert.match(created.id, /\S/)
      assert.deepEqual(
        { ...created, id: '' },
        {
          id: '',
          rmId: MEERA_ID,
          tokenHash,
          createdAt: T0,
          lastActiveAt: T0,
          expiresAt: at(8 * HOUR),
          revokedAt: null,
        },
      )
      assert.deepEqual(await o.port.sessionByTokenHash(tokenHash), created)
      assert.equal(await o.port.sessionByTokenHash(sha256Hex('nobody')), null)

      await o.port.touchSession(created.id, { lastActiveAt: at(HOUR), expiresAt: at(9 * HOUR) })
      const touched = await o.port.sessionByTokenHash(tokenHash)
      assert.equal(touched?.lastActiveAt, at(HOUR))
      assert.equal(touched?.expiresAt, at(9 * HOUR))
      assert.equal(touched?.createdAt, T0)

      // Past its expiry the row is still there: whether it opens anything is the service's call.
      o.clock.set(at(10 * HOUR))
      assert.equal((await o.port.sessionByTokenHash(tokenHash))?.id, created.id)

      await o.port.revokeSession(created.id, at(10 * HOUR))
      await o.port.revokeSession(created.id, at(11 * HOUR))
      const revoked = await o.port.sessionByTokenHash(tokenHash)
      assert.equal(revoked?.revokedAt, at(10 * HOUR), 'the first sign-out stands')

      const second = await o.port.createSession({
        rmId: ARJUN_ID,
        tokenHash: sha256Hex(`rm-contract-${randomUUID()}`),
        expiresAt: at(18 * HOUR),
      })
      assert.notEqual(second.id, created.id)
      assert.equal(second.createdAt, at(10 * HOUR))
      assert.equal(second.rmId, ARJUN_ID)
    })
  })
}

function activityContract(
  name: string,
  open: () => Promise<Opened<RmActivityPort>>,
  skip: string | false,
) {
  describe(`RmActivityPort over ${name}`, { skip }, () => {
    let o: Opened<RmActivityPort>
    // Customers nobody else writes about, so a shared database's own rows never get in the way.
    const cifA = `TEST${randomUUID().slice(0, 8)}`
    const cifB = `TEST${randomUUID().slice(0, 8)}`
    before(async () => {
      o = await open()
    })
    after(() => o?.close())

    it('lists notes oldest first, in the order written even when the clock does not move', async () => {
      const first = await o.port.appendNote({
        rmId: MEERA_ID,
        cif: cifA,
        kind: 'call',
        text: 'Called about the card.',
        atSim: '2026-09-01',
      })
      assert.match(first.id, /\S/)
      assert.deepEqual(
        { ...first, id: '' },
        {
          id: '',
          rmId: MEERA_ID,
          cif: cifA,
          kind: 'call',
          text: 'Called about the card.',
          atSim: '2026-09-01',
          createdAt: T0,
        },
      )
      const second = await o.port.appendNote({
        rmId: ARJUN_ID,
        cif: cifB,
        kind: 'note',
        text: 'Prefers mornings.',
        atSim: '2026-09-01',
      })
      const third = await o.port.appendNote({
        rmId: MEERA_ID,
        cif: cifA,
        kind: 'note',
        text: 'Wants the ELSS question answered in writing.',
        atSim: '2026-08-28',
      })
      assert.deepEqual(await o.port.listNotes([cifA]), [first, third])
      assert.deepEqual(await o.port.listNotes([cifB, cifA]), [first, second, third])
      assert.deepEqual(await o.port.listNotes([]), [])
      assert.deepEqual(await o.port.listNotes(['TEST-nobody']), [])
    })

    it("lists a handoff's changes oldest first, so its status is the last", async () => {
      const handoffId = randomUUID()
      const contacted = await o.port.appendHandoffStatus({
        handoffId,
        cif: cifA,
        rmId: MEERA_ID,
        status: 'contacted',
        note: 'Left a voicemail.',
        atSim: '2026-09-01',
      })
      assert.deepEqual(
        { ...contacted, id: '' },
        {
          id: '',
          handoffId,
          cif: cifA,
          rmId: MEERA_ID,
          status: 'contacted',
          note: 'Left a voicemail.',
          atSim: '2026-09-01',
          createdAt: T0,
        },
      )
      const resolved = await o.port.appendHandoffStatus({
        handoffId,
        cif: cifA,
        rmId: MEERA_ID,
        status: 'resolved',
        note: null,
        atSim: '2026-09-02',
      })
      assert.deepEqual(await o.port.listHandoffStatuses([cifA]), [contacted, resolved])
      assert.deepEqual(await o.port.listHandoffStatuses([cifB]), [])
      assert.deepEqual(await o.port.listHandoffStatuses([]), [])
    })

    it("lists one RM's access entries newest first, at most the limit, every action accepted", async () => {
      const written = []
      for (const action of AccessActionSchema.options) {
        written.push(
          await o.port.appendAccess({
            rmId: MEERA_ID,
            cif: cifA,
            action,
            purpose: `Integration suite: ${action}`,
            detail: action === 'revealed' ? 'dateOfBirth' : null,
          }),
        )
      }
      const arjuns = await o.port.appendAccess({
        rmId: ARJUN_ID,
        cif: cifB,
        action: 'viewed',
        purpose: 'Integration suite',
        detail: null,
      })
      assert.deepEqual(
        { ...arjuns, id: '' },
        {
          id: '',
          rmId: ARJUN_ID,
          cif: cifB,
          action: 'viewed',
          purpose: 'Integration suite',
          detail: null,
          at: T0,
        },
      )
      const newestFirst = [...written].reverse()
      const mine = (await o.port.listAccess(MEERA_ID, 1_000)).filter((e) => e.cif === cifA)
      assert.deepEqual(mine, newestFirst)
      assert.deepEqual(await o.port.listAccess(MEERA_ID, 2), newestFirst.slice(0, 2))
      assert.deepEqual(await o.port.listAccess(MEERA_ID, 0), [])
      assert.deepEqual(
        (await o.port.listAccess(ARJUN_ID, 1_000)).filter((e) => e.cif === cifB),
        [arjuns],
      )
    })
  })
}

deskContract(
  'memory',
  async () => {
    const clock = new FixedClock(T0)
    return { port: generatedRmDesk(clock), clock, close: async () => {} }
  },
  false,
)

activityContract(
  'memory',
  async () => {
    const clock = new FixedClock(T0)
    return { port: new InMemoryRmActivity(clock), clock, close: async () => {} }
  },
  false,
)

/* ------------------------------------------------------------------ *
 * Postgres: seed, adapters, guards, and the console across a restart
 * ------------------------------------------------------------------ */

describe('rm console on postgres', { skip: NO_DATABASE }, () => {
  const cfg = config as Config
  const options = {
    anchor: cfg.SEED_ANCHOR,
    historyMonths: HISTORY_WINDOW_MONTHS,
    forwardMonths: cfg.SEED_FORWARD_MONTHS,
    generatorVersion: seedVersions(cfg.GIT_SHA).generator,
  }
  let owner: pg.Pool
  let app: pg.Pool

  before(async () => {
    owner = ownerPool('dhan-integration-rm-owner')
    app = appPool('dhan-integration-rm')
    // Idempotent: migrates, then writes the desk whether or not the bank rows needed reseeding.
    await seed(owner, options)
  })
  after(async () => {
    await app?.end()
    await owner?.end()
  })

  describe('the seed', () => {
    it('writes the desk once: a second run changes no row and keeps each hash', async () => {
      const read = () =>
        owner.query<{ rm_id: string; password_hash: string; row_version: number }>(
          `SELECT rm_id, password_hash, row_version FROM app.rm_users ORDER BY rm_id`,
        )
      const before = (await read()).rows
      await seed(owner, options)
      assert.deepEqual((await read()).rows, before)
      assert.deepEqual(
        before.map((r) => r.rm_id),
        RM_USERS.map((u) => u.rmId).sort(),
      )
      const book = await owner.query<{ cif: string; rm_id: string }>(
        `SELECT cif, rm_id FROM app.rm_book ORDER BY cif`,
      )
      assert.deepEqual(
        book.rows.map((r) => [r.cif, r.rm_id]),
        [...ASSIGNED].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      )
    })

    it('--check reports the desk current, and the bank data still matches its hash', async () => {
      const check = await checkSeed(owner, options)
      assert.equal(check.deskCurrent, true)
      assert.equal(check.ok, true, JSON.stringify({ ...check, liveRowCounts: undefined }))
    })

    it('wires the postgres profile to the RM tables, not to memory', () => {
      const adapters = bankAdapters(
        resolveProfile(cfg),
        cfg,
        new FixedClock(T0),
        { fixtures: '0.0.0' },
        silentLogger,
      )
      assert.ok(adapters.rmDesk instanceof PostgresRmDesk)
      assert.ok(adapters.rmActivity instanceof PostgresRmActivity)
    })
  })

  deskContract(
    'postgres as dhan_app',
    async () => {
      const tx = await inRolledBackTransaction(app)
      const clock = new FixedClock(T0)
      return { port: new PostgresRmDesk(tx.client, clock), clock, close: tx.close }
    },
    false,
  )

  activityContract(
    'postgres as dhan_app',
    async () => {
      const tx = await inRolledBackTransaction(app)
      const clock = new FixedClock(T0)
      return { port: new PostgresRmActivity(tx.client, clock), clock, close: tx.close }
    },
    false,
  )

  describe("0015's guards", () => {
    it('gives the runtime role no way to edit the desk, the book or what an RM did', async () => {
      const tx = await inRolledBackTransaction(app)
      const c = tx.client
      try {
        const denied = PG.insufficientPrivilege
        await expectPgError(
          c,
          denied,
          sql(
            c,
            `INSERT INTO app.rm_users (rm_id, employee_no, name, desk, city, password_hash)
             VALUES ('rm-999999', '999999', 'X', 'X', 'X', 'scrypt$1$1$1$a$b')`,
          ),
        )
        await expectPgError(c, denied, sql(c, `UPDATE app.rm_users SET name = 'X'`))
        await expectPgError(c, denied, sql(c, `DELETE FROM app.rm_users`))
        await expectPgError(c, denied, sql(c, `UPDATE app.rm_book SET rm_id = $1`, [ARJUN_ID]))
        await expectPgError(c, denied, sql(c, `DELETE FROM app.rm_book`))
        await expectPgError(c, denied, sql(c, `DELETE FROM app.rm_sessions`))
        for (const table of ['rm_notes', 'rm_handoff_status', 'rm_access_log']) {
          await expectPgError(c, denied, sql(c, `UPDATE app.${table} SET cif = cif`))
          await expectPgError(c, denied, sql(c, `DELETE FROM app.${table}`))
          await expectPgError(c, denied, sql(c, `TRUNCATE app.${table}`))
        }
      } finally {
        await tx.close()
      }
    })

    it('refuses UPDATE, DELETE and TRUNCATE on what an RM did even from the owner', async () => {
      const tx = await inRolledBackTransaction(owner)
      const c = tx.client
      try {
        const activity = new PostgresRmActivity(c, new FixedClock(T0))
        const cif = `TEST${randomUUID().slice(0, 8)}`
        await activity.appendNote({
          rmId: MEERA_ID,
          cif,
          kind: 'note',
          text: 'x',
          atSim: '2026-09-01',
        })
        await activity.appendHandoffStatus({
          handoffId: randomUUID(),
          cif,
          rmId: MEERA_ID,
          status: 'contacted',
          note: null,
          atSim: '2026-09-01',
        })
        await activity.appendAccess({
          rmId: MEERA_ID,
          cif,
          action: 'viewed',
          purpose: 'x',
          detail: null,
        })
        const blocked = PG.integrityViolation
        for (const table of ['rm_notes', 'rm_handoff_status', 'rm_access_log']) {
          await expectPgError(
            c,
            blocked,
            sql(c, `UPDATE app.${table} SET rm_id = rm_id WHERE cif = $1`, [cif]),
          )
          await expectPgError(c, blocked, sql(c, `DELETE FROM app.${table} WHERE cif = $1`, [cif]))
          await expectPgError(c, blocked, sql(c, `TRUNCATE app.${table}`))
        }
      } finally {
        await tx.close()
      }
    })

    it('keeps a revoked sign-in revoked, and lets only its expiry and activity move', async () => {
      const tx = await inRolledBackTransaction(app)
      const c = tx.client
      try {
        const desk = new PostgresRmDesk(c, new FixedClock(T0))
        const session = await desk.createSession({
          rmId: MEERA_ID,
          tokenHash: sha256Hex(`guard-${randomUUID()}`),
          expiresAt: at(8 * HOUR),
        })
        const blocked = PG.integrityViolation
        await expectPgError(
          c,
          blocked,
          sql(c, `UPDATE app.rm_sessions SET rm_id = $2 WHERE id = $1`, [session.id, ARJUN_ID]),
        )
        await expectPgError(
          c,
          blocked,
          sql(c, `UPDATE app.rm_sessions SET token_hash = $2 WHERE id = $1`, [
            session.id,
            sha256Hex('another'),
          ]),
        )
        await desk.revokeSession(session.id, at(HOUR))
        await expectPgError(
          c,
          blocked,
          sql(c, `UPDATE app.rm_sessions SET revoked_at = NULL WHERE id = $1`, [session.id]),
        )
        await expectPgError(
          c,
          blocked,
          sql(c, `UPDATE app.rm_sessions SET revoked_at = $2 WHERE id = $1`, [
            session.id,
            new Date(at(2 * HOUR)),
          ]),
        )
        // Sliding a revoked row is harmless and allowed: the service refuses it on the revocation.
        await desk.touchSession(session.id, { lastActiveAt: at(2 * HOUR), expiresAt: at(9 * HOUR) })
        assert.equal((await desk.sessionByTokenHash(session.tokenHash))?.revokedAt, at(HOUR))
      } finally {
        await tx.close()
      }
    })

    it('holds the columns to what the code can write', async () => {
      const tx = await inRolledBackTransaction(owner)
      const c = tx.client
      try {
        // A plain password can never land in the desk, whoever writes it.
        await expectPgError(
          c,
          PG.checkViolation,
          sql(
            c,
            `INSERT INTO app.rm_users (rm_id, employee_no, name, desk, city, password_hash)
             VALUES ('rm-999999', '999999', 'X', 'X', 'X', 'desk-999999')`,
          ),
        )
        await expectPgError(
          c,
          PG.checkViolation,
          sql(
            c,
            `INSERT INTO app.rm_access_log (rm_id, cif, action, purpose, at)
             VALUES ($1, 'TEST', 'exported', 'x', now())`,
            [MEERA_ID],
          ),
        )
        await expectPgError(
          c,
          PG.checkViolation,
          sql(
            c,
            `INSERT INTO app.rm_sessions (rm_id, token_hash, created_at, last_active_at, expires_at)
             VALUES ($1, 'not-a-hash', now(), now(), now() + interval '1 hour')`,
            [MEERA_ID],
          ),
        )
        // One book per customer, and only customers that exist.
        const [cif] = bookOf(MEERA_ID)
        await expectPgError(
          c,
          PG.uniqueViolation,
          sql(c, `INSERT INTO app.rm_book (cif, rm_id) VALUES ($1, $2)`, [cif, ARJUN_ID]),
        )
        await expectPgError(
          c,
          FOREIGN_KEY_VIOLATION,
          sql(c, `INSERT INTO app.rm_book (cif, rm_id) VALUES ('IDBI0000000000', $1)`, [MEERA_ID]),
        )
        await expectPgError(
          c,
          FOREIGN_KEY_VIOLATION,
          sql(
            c,
            `INSERT INTO app.rm_notes (rm_id, cif, kind, body, at_sim, created_at)
             VALUES ('rm-000000', 'TEST', 'note', 'x', '2026-09-01', now())`,
          ),
        )
      } finally {
        await tx.close()
      }
    })

    it('lets a customer have one simulated journey, and makes a second process wait for the first', async () => {
      const clock = new FixedClock(T0)
      const journey = (store: PostgresSessionStore, cif: string, hint = JOURNEY_HINT) =>
        store.create({
          cif,
          tokenHash: sha256Hex(`journey-${randomUUID()}`),
          asOf: '2026-09-01',
          lastSeen: '2026-08-26',
          expiresAt: at(30 * 24 * HOUR),
          clientHint: hint,
        })
      // A book customer the simulator has not reached, where there is one: on a fresh database
      // that is all of them, and this runs before the end-to-end half below lays any down.
      const live = new PostgresSessionStore(app, clock)
      let cif = BOOK_CUSTOMERS[0] as string
      let committed = true
      for (const candidate of BOOK_CUSTOMERS) {
        if (!(await live.listByCif(candidate)).some(isJourney)) {
          cif = candidate
          committed = false
          break
        }
      }
      const a = await inRolledBackTransaction(app)
      const b = await inRolledBackTransaction(app)
      try {
        const storeA = new PostgresSessionStore(a.client, clock)
        const storeB = new PostgresSessionStore(b.client, clock)
        if (!committed) await journey(storeA, cif)
        // Whether it was there already or written just now, a second one is refused.
        await expectPgError(a.client, PG.uniqueViolation, () => journey(storeA, cif))
        // A reviewer's own session for the same customer is none of this guard's business.
        await journey(storeA, cif, 'ua:0123456789abcdef')

        if (!committed) {
          // B asks while A holds the customer: it waits rather than reading past A, and once A
          // goes away without committing it finds what was committed before either began.
          const pending = journey(storeB, cif).then(
            () => 'created',
            (err: unknown) => pgCode(err) ?? String(err),
          )
          const early = await Promise.race([
            pending,
            new Promise((resolve) => setTimeout(() => resolve('waiting'), 400)),
          ])
          assert.equal(early, 'waiting')
          await a.close()
          assert.equal(await pending, 'created')
        }
      } finally {
        await a.close()
        await b.close()
      }
    })
  })

  describe('the console end to end, across a restart', () => {
    const clock = new FixedClock(T0)
    const label = `Integration suite ${randomUUID().slice(0, 8)}`
    let pool: pg.Pool
    let root: TestRoot
    let token: string
    let journeysAfterFirstBoot: Map<string, string[]>

    /** The app as profiles.ts builds it for Postgres, over a pool this suite can close. */
    async function boot(name: string): Promise<{ root: TestRoot; pool: pg.Pool }> {
      const p = appPool(name)
      const bank = await PostgresBankData.connect(p)
      const r = await makeRoot({
        env: {
          BANK_SOURCE: 'postgres',
          DATABASE_URL: DATABASE_URL as string,
          DB_ROLE: 'dhan_app',
          RM_SIMULATE: '1',
        },
        deps: {
          clock,
          bank,
          holdings: new BankBackedHoldings(bank, clock),
          shelf: new PostgresProductShelf(p),
          sessions: new PostgresSessionStore(p, clock),
          snapshots: new PostgresSnapshotStore(p, clock),
          audit: new PostgresAuditStore(p, clock),
          leases: new PostgresLeaseStore(p, clock),
          seed: new PostgresSeedInfo(p, options),
          rmDesk: new PostgresRmDesk(p, clock),
          rmActivity: new PostgresRmActivity(p, clock),
        },
      })
      return { root: r, pool: p }
    }

    /** Every journey session in the database, by customer. */
    async function journeys(): Promise<Map<string, string[]>> {
      const { rows } = await owner.query<{ cif: string; id: string }>(
        `SELECT sub.cif, s.id FROM app.sessions s JOIN app.subjects sub ON sub.subject_id = s.subject_id
         WHERE s.client_hint = $1 ORDER BY sub.cif, s.created_at, s.id`,
        [JOURNEY_HINT],
      )
      const out = new Map<string, string[]>()
      for (const r of rows) out.set(r.cif, [...(out.get(r.cif) ?? []), r.id])
      return out
    }

    const get = (url: string, bearerToken = token) =>
      root.app.inject({ method: 'GET', url, headers: bearer(bearerToken) })
    const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
      root.app.inject({
        method,
        url,
        headers: bearer(token),
        ...(payload === undefined ? {} : { payload }),
      })

    before(async () => {
      ;({ root, pool } = await boot('dhan-integration-rm-first'))
      await root.rm.simulator.ready()
    })
    after(async () => {
      await root?.close()
      await pool?.end()
    })

    it('lays a journey down for every customer in a book, through the real services', async () => {
      const report = root.rm.simulator.report()
      assert.ok(report, 'the simulator finished a run')
      assert.equal(report.failed, 0, JSON.stringify(report))
      assert.equal(report.simulated + report.skipped, ASSIGNED.length)

      journeysAfterFirstBoot = await journeys()
      for (const cif of BOOK_CUSTOMERS) {
        assert.equal(journeysAfterFirstBoot.get(cif)?.length, 1, `${cif} has one journey`)
      }
      // A hero gets one only while nobody has opened them; never more than one.
      for (const cif of HEROES) assert.ok((journeysAfterFirstBoot.get(cif)?.length ?? 0) <= 1)

      // Each journey is a real record: decisions and advice rows in a chain that verifies.
      const sample = BOOK_CUSTOMERS.find((cif) => BOOK_ACTIVITY[cif]?.recentHandoff)
      assert.ok(sample)
      const [sessionId] = journeysAfterFirstBoot.get(sample) ?? []
      const audit = new PostgresAuditStore(owner, clock)
      const trail = await audit.listForSession(sessionId as string)
      assert.ok(trail.decisions.some((d) => d.actionKind === 'talk_to_rm' && d.kind === 'did_it'))
      assert.ok(trail.adviceRecords.length > 0)
      assert.equal((await audit.verifyChain(sessionId as string)).ok, true)
    })

    it('signs Meera in from the desk table and serves her book of 38 and her inbox', async () => {
      token = (await signInRm(root.app, MEERA)).token
      const book = await get('/api/v1/rm/book')
      assert.equal(book.statusCode, 200, book.body)
      assert.deepEqual(
        book
          .json<RmBook>()
          .rows.map((r) => r.cif)
          .sort(),
        bookOf(MEERA_ID),
      )
      assert.equal(book.json<RmBook>().rows.length, 38)

      const arjun = (await signInRm(root.app, ARJUN)).token
      const theirs = await get('/api/v1/rm/book', arjun)
      assert.equal(theirs.json<RmBook>().rows.length, 12)
      const [meeras] = bookOf(MEERA_ID)
      const refused = await get(`/api/v1/rm/customers/${meeras}/journey`, arjun)
      assert.equal(refused.statusCode, 403, refused.body)
      assert.equal(refused.json<ErrorBody>().code, 'FORBIDDEN')

      const today = await get('/api/v1/rm/today')
      assert.equal(today.statusCode, 200, today.body)
      const asked = BOOK_CUSTOMERS.filter(
        (cif) => BOOK_ACTIVITY[cif]?.recentHandoff && RM_ASSIGNMENTS[cif] === MEERA_ID,
      )
      const inbox = today.json<RmToday>().handoffs.map((h) => h.cif)
      for (const cif of asked) assert.ok(inbox.includes(cif), `${cif} is in the inbox`)

      const refusals = await get('/api/v1/rm/refusals')
      assert.equal(refusals.statusCode, 200, refusals.body)
      assert.ok(refusals.json<RmRefusals>().total > 0)
      const verified = await send('POST', '/api/v1/rm/refusals/verify')
      assert.equal(verified.statusCode, 200, verified.body)
      assert.equal(verified.json<RmBookVerification>().valid, true)
    })

    it('writes the open, the note, the contact and the reveal to the tables', async () => {
      const today = (await get('/api/v1/rm/today')).json<RmToday>()
      const handoff = today.handoffs.find((h) => BOOK_ACTIVITY[h.cif]?.recentHandoff)
      assert.ok(handoff, 'a simulated handoff is in the inbox')
      const cif = handoff.cif

      const opened = await get(`/api/v1/rm/customers/${cif}?purpose=${encodeURIComponent(label)}`)
      assert.equal(opened.statusCode, 200, opened.body)
      const note = await send('POST', `/api/v1/rm/customers/${cif}/notes`, {
        kind: 'call',
        text: `${label}: called back`,
      })
      assert.equal(note.statusCode, 200, note.body)
      assert.equal(note.json<RmNoteResponse>().event.kind, 'call')
      const contacted = await send('PATCH', `/api/v1/rm/handoffs/${handoff.id}`, {
        status: 'contacted',
        note: label,
      })
      assert.equal(contacted.statusCode, 200, contacted.body)
      assert.equal(contacted.json<RmHandoffResponse>().handoff.status, 'contacted')
      const revealed = await send('POST', `/api/v1/rm/customers/${cif}/reveal`, {
        field: 'dateOfBirth',
        reason: `${label} KYC`,
      })
      assert.equal(revealed.statusCode, 200, revealed.body)

      const rows = await owner.query<{ action: string; purpose: string; detail: string | null }>(
        `SELECT action, purpose, detail FROM app.rm_access_log
         WHERE rm_id = $1 AND cif = $2 ORDER BY ordinal DESC LIMIT 4`,
        [MEERA_ID, cif],
      )
      assert.deepEqual(
        rows.rows.map((r) => r.action),
        ['revealed', 'contacted', 'noted', 'viewed'],
      )
      assert.equal(rows.rows[3]?.purpose, label)
      assert.equal(rows.rows[1]?.detail, label)
      assert.equal(rows.rows[0]?.purpose, `${label} KYC`)
    })

    it('comes back after a restart: the same journeys, the same sign-in, the same log', async () => {
      const handoffCif = (await get('/api/v1/rm/today'))
        .json<RmToday>()
        .handoffs.find((h) => h.note === label)?.cif
      assert.ok(handoffCif)

      await root.close()
      await pool.end()
      ;({ root, pool } = await boot('dhan-integration-rm-second'))
      await root.rm.simulator.ready()

      const report = root.rm.simulator.report()
      assert.ok(report)
      assert.equal(report.failed, 0, JSON.stringify(report))
      const again = await journeys()
      for (const cif of BOOK_CUSTOMERS) {
        assert.deepEqual(again.get(cif), journeysAfterFirstBoot.get(cif), `${cif} is unchanged`)
      }
      for (const cif of HEROES) assert.ok((again.get(cif)?.length ?? 0) <= 1)
      // Only a hero nobody had opened by the second boot can be new; no book customer is.
      assert.ok(report.simulated <= HEROES.size, JSON.stringify(report))

      // The bearer the first process issued opens the book in the second.
      const me = await get('/api/v1/rm/me')
      assert.equal(me.statusCode, 200, me.body)
      assert.equal(me.json<RmMe>().bookSize, 38)

      const log = await get('/api/v1/rm/access-log')
      assert.equal(log.statusCode, 200, log.body)
      const entries = log.json<RmAccessLog>().entries.filter((e) => e.cif === handoffCif)
      assert.deepEqual(
        entries.slice(0, 4).map((e) => e.action),
        ['revealed', 'contacted', 'noted', 'viewed'],
      )
      assert.equal(entries[3]?.purpose, label)

      const journey = await get(`/api/v1/rm/customers/${handoffCif}/journey`)
      assert.equal(journey.statusCode, 200, journey.body)
      assert.ok(
        journey
          .json<RmJourney>()
          .events.some(
            (e) =>
              e.title.includes(`${label}: called back`) ||
              e.detail?.includes(`${label}: called back`),
          ),
        'the note is on the journey',
      )
      const inbox = (await get('/api/v1/rm/today')).json<RmToday>().handoffs
      const handoff = inbox.find((h) => h.cif === handoffCif && h.note === label)
      assert.equal(handoff?.status, 'contacted')
    })

    it('signs out for good: the revocation is a row, and the bearer stops working', async () => {
      const out = await send('DELETE', '/api/v1/rm/sessions/current')
      assert.ok(out.statusCode === 200 || out.statusCode === 204, out.body)
      const after = await get('/api/v1/rm/me')
      assert.equal(after.statusCode, 401, after.body)
      const row = await owner.query<{ revoked_at: Date | null }>(
        `SELECT revoked_at FROM app.rm_sessions WHERE token_hash = $1`,
        [sha256Hex(token)],
      )
      assert.ok(row.rows[0]?.revoked_at instanceof Date)
    })
  })
})

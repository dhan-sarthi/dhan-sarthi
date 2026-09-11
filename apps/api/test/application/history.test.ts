/**
 * The months behind a new session.
 *
 * `HistoryService` is the one thing in this app that writes advice rows nobody pressed a button
 * for, so it is also the one thing that could quietly turn the record into fiction. These tests
 * hold it to the three claims its own header makes: the rows go through the real gate and chain,
 * the clock comes home, and today's card is still there to be pressed.
 *
 * The rest of the suite runs with `SEED_HISTORY_MONTHS=0` — see `helpers/app.ts` — so this file
 * turns it on explicitly and is the only place the seeder is exercised.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RecordView, SessionState, View } from '@dhan/contracts'
import { ROHAN_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'

const MONTHS = '6'

describe('the months behind a new session', () => {
  it('lays a decision a month, all of them before today and none of them today', async () => {
    const { app, close } = await makeRoot({ env: { SEED_HISTORY_MONTHS: MONTHS } })
    try {
      const { token, session } = await createSession(app)
      const record = await app
        .inject({ method: 'GET', url: '/api/v1/record', headers: bearer(token) })
        .then((r) => r.json<RecordView>())

      assert.equal(record.decisions.length, Number(MONTHS))
      const months = record.decisions.map((d) => d.atSim)
      assert.deepEqual([...months].sort(), months, 'the trail is not in date order')
      assert.equal(new Set(months).size, months.length, 'two decisions landed in one month')
      for (const at of months) {
        assert.ok(at < session.asOf, `${at} is not behind today`)
      }

      // Every row is the engine's: a decision on a product carries the advice record the gate
      // wrote, and the chain over the lot walks.
      const verify = await app
        .inject({ method: 'GET', url: '/api/v1/record/verify', headers: bearer(token) })
        .then((r) => r.json<{ ok: boolean; length: number }>())
      assert.equal(verify.ok, true)
      assert.equal(verify.length, record.adviceRecords.length)
      assert.ok(record.adviceRecords.length > 0, 'not one recommendation went through the gate')
      for (const advice of record.adviceRecords) {
        assert.ok(advice.snapshotId.length > 0)
        assert.ok(advice.rulesPassed.length > 0 || advice.ruleId !== null)
      }

      // And the plan learned from each of them, which is what Plan's version number reads.
      assert.ok(
        record.roadmapVersions.length > Number(MONTHS),
        'a decision every month should have re-cut the plan more often than the clock did',
      )
    } finally {
      await close()
    }
  })

  it('brings the clock home, so the session is the one the caller asked for', async () => {
    const withPast = await makeRoot({ env: { SEED_HISTORY_MONTHS: MONTHS } })
    const without = await makeRoot({ env: { SEED_HISTORY_MONTHS: '0' } })
    try {
      const seeded = await createSession(withPast.app)
      const fresh = await createSession(without.app)

      assert.equal(seeded.session.asOf, fresh.session.asOf)
      assert.equal(seeded.session.lastSeen, fresh.session.lastSeen)

      // The state route agrees, so nothing is only true of the creation response.
      const state = await withPast.app
        .inject({ method: 'GET', url: '/api/v1/session', headers: bearer(seeded.token) })
        .then((r) => r.json<SessionState>())
      assert.equal(state.asOf, fresh.session.asOf)
    } finally {
      await withPast.close()
      await without.close()
    }
  })

  it("leaves today's card undecided, so the button still works", async () => {
    const { app, close } = await makeRoot({ env: { SEED_HISTORY_MONTHS: MONTHS } })
    try {
      const { token } = await createSession(app, ROHAN_CIF)
      const view = await app
        .inject({ method: 'GET', url: '/api/v1/view', headers: bearer(token) })
        .then((r) => r.json<View>())
      const primary = view.plan.primary
      assert.ok(primary, 'no action on today')

      const decided = await app.inject({
        method: 'POST',
        url: `/api/v1/actions/${encodeURIComponent(primary.id)}/decision`,
        headers: { ...bearer(token), 'idempotency-key': 'history-test-primary' },
        payload: { kind: 'did_it' },
      })
      assert.equal(decided.statusCode, 200, decided.body)
    } finally {
      await close()
    }
  })

  it('writes nothing at all when the months are off', async () => {
    const { app, close } = await makeRoot({ env: { SEED_HISTORY_MONTHS: '0' } })
    try {
      const { token } = await createSession(app)
      const record = await app
        .inject({ method: 'GET', url: '/api/v1/record', headers: bearer(token) })
        .then((r) => r.json<RecordView>())
      assert.equal(record.decisions.length, 0)
      assert.equal(record.adviceRecords.length, 0)
    } finally {
      await close()
    }
  })
})

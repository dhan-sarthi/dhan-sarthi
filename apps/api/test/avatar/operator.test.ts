/**
 * The operator routes stay behind X-Operator-Key — 404 when no key is configured, 401 on a
 * wrong one — while /avatar/availability stays public and tells the truth.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AvatarAvailability, OperatorAvatarStatus } from '@dhan/contracts'
import { FakeAvatarProvider } from '../fakes/avatar-provider.fake.ts'
import { FakeRpcHost } from '../fakes/rpc-host.fake.ts'
import { bearer, createSession, makeRoot } from '../helpers/app.ts'

const OPERATOR_KEY = 'test-operator-key-not-real-0123456789'

const RUNWAY_ENV = {
  AVATAR_PROVIDER: 'runway',
  RUNWAY_API_KEY: 'test-key-not-real',
  RUNWAY_CHARACTER_ID: 'test-character',
  RUNWAY_MAX_SESSION_SECONDS: '600',
}

describe('operator routes and public availability', () => {
  it('answers 404 for operator routes when no key is configured', async () => {
    const root = await makeRoot()
    try {
      const res = await root.app.inject({
        method: 'GET',
        url: '/api/v1/operator/avatar/status',
        headers: { 'x-operator-key': OPERATOR_KEY },
      })
      assert.equal(res.statusCode, 404)
    } finally {
      await root.close()
    }
  })

  it('requires the exact key, and reports leases, queue, minutes and breaker', async () => {
    const provider = new FakeAvatarProvider()
    const root = await makeRoot({
      env: { ...RUNWAY_ENV, OPERATOR_KEY },
      deps: { avatar: provider, rpc: new FakeRpcHost() },
      transcriptDelaysMs: [],
    })
    try {
      const missing = await root.app.inject({
        method: 'GET',
        url: '/api/v1/operator/avatar/status',
      })
      assert.equal(missing.statusCode, 401)

      const wrong = await root.app.inject({
        method: 'GET',
        url: '/api/v1/operator/avatar/status',
        headers: { 'x-operator-key': `${OPERATOR_KEY}x` },
      })
      assert.equal(wrong.statusCode, 401)

      // A session bearer is not an operator key.
      const { token } = await createSession(root.app)
      const asSession = await root.app.inject({
        method: 'GET',
        url: '/api/v1/operator/avatar/status',
        headers: bearer(token),
      })
      assert.equal(asSession.statusCode, 401)

      const granted = await root.app.inject({
        method: 'POST',
        url: '/api/v1/avatar/session',
        headers: { ...bearer(token), 'idempotency-key': 'idem-operator-1' },
        payload: {},
      })
      assert.equal(granted.statusCode, 200, granted.body)

      const ok = await root.app.inject({
        method: 'GET',
        url: '/api/v1/operator/avatar/status',
        headers: { 'x-operator-key': OPERATOR_KEY },
      })
      assert.equal(ok.statusCode, 200)
      const body = ok.json<OperatorAvatarStatus>()
      assert.deepEqual(body.credentials, [{ label: 'runway-1', held: true }])
      assert.equal(body.leases.length, 1)
      assert.equal(body.leases[0]?.runwaySessionId, 'fake-session-1')
      assert.equal(body.breaker, 'closed')
      assert.equal(body.rpcOpen, 1)
      assert.equal(body.minutesLeftToday, 240)

      // Availability is public, and truthful while the slot is held.
      const availability = await root.app.inject({
        method: 'GET',
        url: '/api/v1/avatar/availability',
      })
      assert.equal(availability.statusCode, 200)
      const avail = availability.json<AvatarAvailability>()
      assert.equal(avail.enabled, true)
      assert.equal(avail.available, false)
      assert.equal(avail.queueLength, 0)
      assert.equal(avail.breaker, 'closed')

      const released = await root.app.inject({
        method: 'POST',
        url: '/api/v1/operator/avatar/release-all',
        headers: { 'x-operator-key': OPERATOR_KEY },
      })
      assert.equal(released.statusCode, 200)
      assert.deepEqual(released.json<{ released: string[] }>().released, ['fake-session-1'])
      assert.deepEqual(provider.cancelled, ['fake-session-1'])

      const afterRelease = await root.app.inject({
        method: 'GET',
        url: '/api/v1/avatar/availability',
      })
      assert.equal(afterRelease.json<AvatarAvailability>().available, true)
    } finally {
      await root.close()
    }
  })
})

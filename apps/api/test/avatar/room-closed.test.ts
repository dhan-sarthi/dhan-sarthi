/**
 * A room that closes under a live call — Runway ending the session because the customer's tab
 * vanished, or the worker dying — frees the slot within seconds and charges the minutes actually
 * run, rather than holding the credential until the lease expires at the cap. Reproduces what
 * the third live call showed (docs/engineering/avatar-live-call.md).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AvatarAvailability, AvatarCallRecord, AvatarGrant } from '@dhan/contracts'
import { FakeAvatarProvider } from '../fakes/avatar-provider.fake.ts'
import { FakeRpcHost } from '../fakes/rpc-host.fake.ts'
import { bearer, createSession, makeRoot } from '../helpers/app.ts'

const RUNWAY_ENV = {
  AVATAR_PROVIDER: 'runway',
  RUNWAY_API_KEY: 'test-key-not-real',
  RUNWAY_CHARACTER_ID: 'test-character',
  RUNWAY_MAX_SESSION_SECONDS: '600',
}

describe('a room that closes under a live call', () => {
  it('releases the slot after a short grace and charges the elapsed minutes', async () => {
    const provider = new FakeAvatarProvider()
    const rpc = new FakeRpcHost()
    const root = await makeRoot({
      env: RUNWAY_ENV,
      deps: { avatar: provider, rpc },
      transcriptDelaysMs: [],
    })
    try {
      const { token } = await createSession(root.app)
      const res = await root.app.inject({
        method: 'POST',
        url: '/api/v1/avatar/session',
        headers: { ...bearer(token), 'idempotency-key': 'idem-room-closed-1' },
        payload: {},
      })
      assert.equal(res.statusCode, 200, res.body)
      const grant = res.json<AvatarGrant>()

      // Connected: the sweep leaves it alone.
      root.clock.advance(90_000)
      await root.services.avatar.sweepDisconnected()
      assert.equal(rpc.openCount(), 1)
      assert.equal(provider.cancelled.length, 0)

      // The room closes. One sweep starts the grace; a LiveKit reconnect must not read as the end.
      rpc.disconnect(grant.runwaySessionId)
      await root.services.avatar.sweepDisconnected()
      assert.equal(rpc.openCount(), 1)
      assert.equal(provider.cancelled.length, 0)

      root.clock.advance(6_000)
      await root.services.avatar.sweepDisconnected()
      assert.deepEqual(provider.cancelled, [grant.runwaySessionId])
      assert.equal(rpc.openCount(), 0)

      const availability = await root.app.inject({
        method: 'GET',
        url: '/api/v1/avatar/availability',
      })
      assert.equal(availability.json<AvatarAvailability>().available, true)

      const record = await root.app.inject({
        method: 'GET',
        url: `/api/v1/avatar/session/${grant.runwaySessionId}/record`,
        headers: bearer(token),
      })
      const { session } = record.json<AvatarCallRecord>()
      assert.equal(session.endReason, 'reaped')
      // 96 s of call, not the 600 s cap.
      assert.equal(session.minutesCharged, 1.6)

      // Ending from the browser afterwards is harmless.
      const end = await root.app.inject({
        method: 'POST',
        url: `/api/v1/avatar/session/${grant.runwaySessionId}/end`,
        headers: bearer(token),
      })
      assert.equal(end.statusCode, 204)
      assert.equal(provider.cancelled.length, 1)
    } finally {
      await root.close()
    }
  })
})

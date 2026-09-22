/**
 * Readying a call before the tap. Measured on Runway, 22 September 2026: a created, READY,
 * gated session that is never handed over costs nothing, and dies about 21 s after READY. So the
 * call screen readies one while the customer is looking, and the tap hands it over in one round
 * trip — or, if it has gone stale, builds a fresh one exactly as before.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AvatarGrant, AvatarPrepared } from '@dhan/contracts'
import { FakeAvatarProvider } from '../fakes/avatar-provider.fake.ts'
import { FakeRpcHost } from '../fakes/rpc-host.fake.ts'
import { PRIYA_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const ONE_RUNWAY = {
  AVATAR_PROVIDER: 'runway',
  RUNWAY_API_KEY_1: 'key-one-not-real',
  RUNWAY_CHARACTER_ID_1: 'character-one',
  RUNWAY_MAX_SESSION_SECONDS: '600',
}

async function rootWith(
  opts: { usableMs?: number } = {},
): Promise<{ root: TestRoot; provider: FakeAvatarProvider; events: string[] }> {
  const events: string[] = []
  const provider = new FakeAvatarProvider(events)
  const root = await makeRoot({
    env: ONE_RUNWAY,
    deps: { avatar: provider, rpc: new FakeRpcHost(events) },
    transcriptDelaysMs: [],
    ...(opts.usableMs === undefined ? {} : { preparedUsableMs: opts.usableMs }),
  })
  return { root, provider, events }
}

async function prepare(root: TestRoot, token: string, topic?: string): Promise<AvatarPrepared> {
  const res = await root.app.inject({
    method: 'POST',
    url: '/api/v1/avatar/session/prepare',
    headers: bearer(token),
    payload: topic ? { topic } : {},
  })
  assert.equal(res.statusCode, 200, res.body)
  return res.json<AvatarPrepared>()
}

async function start(root: TestRoot, token: string, topic?: string) {
  return root.app.inject({
    method: 'POST',
    url: '/api/v1/avatar/session',
    headers: { ...bearer(token), 'idempotency-key': `idem-${Math.random()}` },
    payload: topic ? { topic } : {},
  })
}

describe('a call readied before the tap', () => {
  it('is created, made ready and gated, and handed nothing', async () => {
    const { root, provider, events } = await rootWith()
    try {
      const { token } = await createSession(root.app)
      const ready = await prepare(root, token)
      assert.equal(ready.prepared, true)
      assert.ok(ready.usableForSeconds !== null && ready.usableForSeconds > 10)
      assert.deepEqual(events, ['create', 'ready', 'open'])
      assert.equal(provider.consumed.length, 0)

      // Asking again while it is fresh readies nothing new.
      const again = await prepare(root, token)
      assert.equal(again.prepared, true)
      assert.equal(provider.created.length, 1)

      // And the call button stays up: the one account is holding a call readied for a tap.
      const availability = await root.app.inject({
        method: 'GET',
        url: '/api/v1/avatar/availability',
      })
      assert.equal(availability.json<{ available: boolean }>().available, true)
    } finally {
      await root.close()
    }
  })

  it('is handed over on the tap, without creating another', async () => {
    const { root, provider, events } = await rootWith()
    try {
      const { token } = await createSession(root.app)
      await prepare(root, token)
      const res = await start(root, token)
      assert.equal(res.statusCode, 200, res.body)
      assert.equal(res.json<AvatarGrant>().runwaySessionId, 'fake-session-1')
      // The gate was open before anything was handed over, and only one session ever existed.
      assert.deepEqual(events, ['create', 'ready', 'open', 'consume'])
      assert.equal(provider.created.length, 1)
    } finally {
      await root.close()
    }
  })

  it('is let go, uncharged, once it is too old to hand over', async () => {
    const { root, provider } = await rootWith({ usableMs: 40 })
    try {
      const { token } = await createSession(root.app)
      await prepare(root, token)
      await new Promise((r) => setTimeout(r, 120))
      assert.deepEqual(provider.cancelled, ['fake-session-1'])
      assert.equal((await root.deps.leases.listHeld()).length, 0)
      assert.equal(await root.deps.leases.minutesUsed(root.clock.today()), 0)

      // The tap after that builds a fresh call, as it always did.
      const res = await start(root, token)
      assert.equal(res.statusCode, 200, res.body)
      assert.equal(res.json<AvatarGrant>().runwaySessionId, 'fake-session-2')
    } finally {
      await root.close()
    }
  })

  it('is not handed over for a different topic', async () => {
    const { root, provider } = await rootWith()
    try {
      const { token } = await createSession(root.app)
      await prepare(root, token)
      const res = await start(root, token, 'You paid 34.8% on the card last month.')
      assert.equal(res.statusCode, 200, res.body)
      assert.deepEqual(provider.cancelled, ['fake-session-1'])
      assert.equal(res.json<AvatarGrant>().runwaySessionId, 'fake-session-2')
    } finally {
      await root.close()
    }
  })

  it('gives its account up to a customer who actually asks for a call', async () => {
    const { root, provider } = await rootWith()
    try {
      const viewer = await createSession(root.app)
      const caller = await createSession(root.app, PRIYA_CIF)
      await prepare(root, viewer.token)

      const res = await start(root, caller.token)
      assert.equal(res.statusCode, 200, res.body)
      assert.deepEqual(provider.cancelled, ['fake-session-1'])
      assert.equal(res.json<AvatarGrant>().runwaySessionId, 'fake-session-2')

      // And the viewer, with the only account taken, is told nothing was readied — not queued.
      const again = await prepare(root, viewer.token)
      assert.equal(again.prepared, false)
      assert.equal(again.usableForSeconds, null)
    } finally {
      await root.close()
    }
  })
})

describe('the daily session cap', () => {
  it('leaves the last sessions of the day to real taps', async () => {
    const events: string[] = []
    const provider = new FakeAvatarProvider(events)
    provider.sessionsLeftByLabel['runway-1'] = 10
    const root = await makeRoot({
      env: ONE_RUNWAY,
      deps: { avatar: provider, rpc: new FakeRpcHost(events) },
      transcriptDelaysMs: [],
    })
    try {
      await new Promise((r) => setTimeout(r, 5))
      const { token } = await createSession(root.app)
      const ready = await prepare(root, token)
      assert.equal(ready.prepared, false)
      assert.equal(provider.created.length, 0)

      // A tap still gets its call: the reserve is kept for exactly this.
      const res = await start(root, token)
      assert.equal(res.statusCode, 200, res.body)
    } finally {
      await root.close()
    }
  })
})

describe('hanging up', () => {
  it('gives the session time to end by itself, where a failed grant cancels at once', async () => {
    const { root, provider } = await rootWith()
    try {
      const { token } = await createSession(root.app)
      const grant = (await start(root, token)).json<AvatarGrant>()
      const end = await root.app.inject({
        method: 'POST',
        url: `/api/v1/avatar/session/${grant.runwaySessionId}/end`,
        headers: { ...bearer(token), 'idempotency-key': `idem-${Math.random()}` },
      })
      assert.ok(end.statusCode < 300, end.body)
      assert.equal(provider.cancelGraces.length, 1)
      assert.ok((provider.cancelGraces[0] ?? 0) >= 5_000)

      provider.script = { ready: 'failed' }
      await start(root, token)
      assert.equal(provider.cancelGraces.at(-1), undefined)
    } finally {
      await root.close()
    }
  })
})

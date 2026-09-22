/**
 * The chain: Runway's accounts in slot order, then Anam's. A grant takes the first account that
 * is free and able; a refusal moves it to the next inside the same request; an account that is
 * out of credit or busy is benched so the next grant does not pay to be refused again.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AvatarAvailability, AvatarGrant, AvatarUnavailableBody } from '@dhan/contracts'
import {
  AvatarProviderRouter,
  AvatarRpcRouter,
} from '../../src/application/avatar/provider-router.ts'
import { FakeAvatarProvider } from '../fakes/avatar-provider.fake.ts'
import { FakeRpcHost } from '../fakes/rpc-host.fake.ts'
import { PRIYA_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const THREE_RUNWAY = {
  AVATAR_PROVIDER: 'runway,anam',
  RUNWAY_API_KEY_1: 'key-one-not-real',
  RUNWAY_CHARACTER_ID_1: 'character-one',
  RUNWAY_API_KEY_2: 'key-two-not-real',
  RUNWAY_CHARACTER_ID_2: 'character-two',
  RUNWAY_API_KEY_3: 'key-three-not-real',
  RUNWAY_CHARACTER_ID_3: 'character-three',
  ANAM_API_KEY_1: 'anam-key-not-real',
  ANAM_AVATAR_ID_1: 'anam-avatar',
  ANAM_VOICE_ID: 'voice',
  ANAM_LLM_ID: 'llm',
  ANAM_PUBLIC_BASE_URL: 'https://gate.example.test',
  RUNWAY_MAX_SESSION_SECONDS: '600',
}

interface Chain {
  root: TestRoot
  runway: FakeAvatarProvider
  anam: FakeAvatarProvider
}

async function chain(
  env: Record<string, string> = {},
  before: (fakes: { runway: FakeAvatarProvider; anam: FakeAvatarProvider }) => void = () => {},
): Promise<Chain> {
  const runway = new FakeAvatarProvider()
  const anam = new FakeAvatarProvider()
  anam.transport = 'anam'
  before({ runway, anam })
  const root = await makeRoot({
    env: { ...THREE_RUNWAY, ...env },
    deps: {
      avatar: new AvatarProviderRouter({ runway, anam }),
      rpc: new AvatarRpcRouter({ runway: new FakeRpcHost(), anam: new FakeRpcHost() }),
    },
    transcriptDelaysMs: [],
  })
  // The boot-time balance sweep is fire-and-forget; let it land before a test reads the pool.
  await new Promise((r) => setImmediate(r))
  return { root, runway, anam }
}

async function call(root: TestRoot, token: string) {
  return root.app.inject({
    method: 'POST',
    url: '/api/v1/avatar/session',
    headers: { ...bearer(token), 'idempotency-key': `idem-${Math.random()}` },
    payload: {},
  })
}

async function hangUp(root: TestRoot, token: string, grant: AvatarGrant) {
  const res = await root.app.inject({
    method: 'POST',
    url: `/api/v1/avatar/session/${grant.runwaySessionId}/end`,
    headers: { ...bearer(token), 'idempotency-key': `idem-${Math.random()}` },
  })
  assert.ok(res.statusCode < 300, res.body)
}

describe('the account chain', () => {
  it('reads the numbered slots in order and puts Anam last', async () => {
    const { root } = await chain()
    try {
      const labels = root.deps.credentials.map((c) => `${c.provider}:${c.label}`)
      assert.deepEqual(labels, [
        'runway:runway-1',
        'runway:runway-2',
        'runway:runway-3',
        'anam:anam-1',
      ])
    } finally {
      await root.close()
    }
  })

  it('gives a second customer the second account while the first is on a call', async () => {
    const { root, runway, anam } = await chain()
    try {
      const a = await createSession(root.app)
      const b = await createSession(root.app, PRIYA_CIF)
      const first = await call(root, a.token)
      const second = await call(root, b.token)
      assert.equal(first.statusCode, 200, first.body)
      assert.equal(second.statusCode, 200, second.body)
      assert.deepEqual(runway.createdOn, ['runway-1', 'runway-2'])
      assert.equal(anam.createdOn.length, 0)
      assert.equal(second.json<AvatarGrant>().transport, 'livekit')
    } finally {
      await root.close()
    }
  })

  it('moves past an account that is out of credits, and does not ask it again', async () => {
    const { root, runway } = await chain()
    try {
      runway.scriptByLabel['runway-1'] = { outOfCredits: true }
      const { token } = await createSession(root.app)

      const first = await call(root, token)
      assert.equal(first.statusCode, 200, first.body)
      assert.deepEqual(runway.createdOn, ['runway-1', 'runway-2'])
      // The refused create never produced a session, so there was nothing to cancel.
      assert.equal(runway.cancelled.length, 0)

      await hangUp(root, token, first.json<AvatarGrant>())
      const again = await call(root, token)
      assert.equal(again.statusCode, 200, again.body)
      assert.deepEqual(runway.createdOn, ['runway-1', 'runway-2', 'runway-2'])
    } finally {
      await root.close()
    }
  })

  it('treats an account stuck in the queue as busy, cancels it, and uses the next', async () => {
    const { root, runway } = await chain()
    try {
      runway.scriptByLabel['runway-1'] = { ready: 'queued' }
      const { token } = await createSession(root.app)
      const res = await call(root, token)
      assert.equal(res.statusCode, 200, res.body)
      assert.deepEqual(runway.createdOn, ['runway-1', 'runway-2'])
      assert.deepEqual(runway.cancelled, ['fake-session-1'])
      assert.equal(res.json<AvatarGrant>().runwaySessionId, 'fake-session-2')
    } finally {
      await root.close()
    }
  })

  it('falls back to Anam when every Runway account is refused', async () => {
    const { root, runway, anam } = await chain()
    try {
      runway.script = { outOfCredits: true }
      const { token } = await createSession(root.app)
      const res = await call(root, token)
      assert.equal(res.statusCode, 200, res.body)
      assert.deepEqual(runway.createdOn, ['runway-1', 'runway-2', 'runway-3'])
      assert.deepEqual(anam.createdOn, ['anam-1'])
      assert.equal(res.json<AvatarGrant>().transport, 'anam')
    } finally {
      await root.close()
    }
  })

  it("skips a provider's other accounts when the provider itself is failing", async () => {
    const { root, runway, anam } = await chain()
    try {
      runway.script = { failCreate: true }
      const { token } = await createSession(root.app)
      const res = await call(root, token)
      assert.equal(res.statusCode, 200, res.body)
      // A 500 is Runway's, not account one's: accounts two and three would only prove it again.
      assert.deepEqual(runway.createdOn, ['runway-1'])
      assert.deepEqual(anam.createdOn, ['anam-1'])
    } finally {
      await root.close()
    }
  })

  it('lets go of the lease when a half-open provider fails its probe', async () => {
    const { root, runway, anam } = await chain()
    try {
      runway.breaker = 'half-open'
      runway.probeOk = false
      const { token } = await createSession(root.app)
      const res = await call(root, token)
      assert.equal(res.statusCode, 200, res.body)
      assert.equal(runway.createdOn.length, 0)
      assert.deepEqual(anam.createdOn, ['anam-1'])
      // Only the call that went through holds anything; the probed Runway account is free.
      const held = await root.deps.leases.listHeld()
      assert.deepEqual(
        held.map((l) => l.credentialLabel),
        ['anam-1'],
      )
    } finally {
      await root.close()
    }
  })

  it('leaves a stuck queue early only when another account is there to take the call', async () => {
    const { root, runway } = await chain()
    try {
      const { token } = await createSession(root.app)
      const res = await call(root, token)
      assert.equal(res.statusCode, 200, res.body)
      assert.equal(runway.readyOpts[0]?.queuedGiveUpMs, 6_000)
    } finally {
      await root.close()
    }
    const single = await chain({
      AVATAR_PROVIDER: 'runway',
      RUNWAY_API_KEY_2: '',
      RUNWAY_CHARACTER_ID_2: '',
      RUNWAY_API_KEY_3: '',
      RUNWAY_CHARACTER_ID_3: '',
    })
    try {
      const { token } = await createSession(single.root.app)
      const res = await call(single.root, token)
      assert.equal(res.statusCode, 200, res.body)
      // The last account in the chain waits a queue out: a slow start beats a refusal.
      assert.equal(single.runway.readyOpts[0]?.queuedGiveUpMs, 20_000)
    } finally {
      await single.root.close()
    }
  })

  it('still tries an account benched as busy when it is the only one left', async () => {
    const { root, runway } = await chain({
      AVATAR_PROVIDER: 'runway',
      RUNWAY_API_KEY_2: '',
      RUNWAY_CHARACTER_ID_2: '',
      RUNWAY_API_KEY_3: '',
      RUNWAY_CHARACTER_ID_3: '',
    })
    try {
      runway.script = { ready: 'queued' }
      const { token } = await createSession(root.app)
      const first = await call(root, token)
      assert.equal(first.statusCode, 409, first.body)

      // A minute's bench for being busy is a guess. With nowhere else to go, the next tap tries.
      runway.script = {}
      const second = await call(root, token)
      assert.equal(second.statusCode, 200, second.body)
      assert.deepEqual(runway.createdOn, ['runway-1', 'runway-1'])
    } finally {
      await root.close()
    }
  })

  it('skips an account whose balance is under the minimum without asking it', async () => {
    // Read at boot, the way a restart with an emptied account would find it.
    const { root, runway } = await chain({ AVATAR_MIN_CREDITS: '42' }, ({ runway }) => {
      runway.balanceByLabel['runway-1'] = 10
      runway.balanceByLabel['runway-2'] = 400
    })
    try {
      const { token } = await createSession(root.app)
      const res = await call(root, token)
      assert.equal(res.statusCode, 200, res.body)
      assert.ok(!runway.createdOn.includes('runway-1'), `tried ${runway.createdOn.join(',')}`)
    } finally {
      await root.close()
    }
  })

  it('caps the call at what the account can pay for', async () => {
    const runway = new FakeAvatarProvider()
    runway.balance = 60
    const root = await makeRoot({
      env: { ...THREE_RUNWAY, AVATAR_PROVIDER: 'runway', AVATAR_MIN_CREDITS: '0' },
      deps: {
        avatar: new AvatarProviderRouter({ runway }),
        rpc: new AvatarRpcRouter({ runway: new FakeRpcHost() }),
      },
      transcriptDelaysMs: [],
    })
    try {
      await new Promise((r) => setTimeout(r, 5))
      const { token } = await createSession(root.app)
      const res = await call(root, token)
      assert.equal(res.statusCode, 200, res.body)
      // 60 credits: 2 up front, then 2 per six seconds — 29 blocks, 174 seconds.
      assert.equal(res.json<AvatarGrant>().expiresInSeconds, 174)
    } finally {
      await root.close()
    }
  })

  it('answers an honest 502, not a queue ticket, when every account is refused', async () => {
    const { root, runway, anam } = await chain({ AVATAR_PROVIDER: 'runway' })
    try {
      runway.script = { outOfCredits: true }
      const { token } = await createSession(root.app)
      const first = await call(root, token)
      assert.equal(first.statusCode, 502, first.body)
      assert.equal(first.json<AvatarUnavailableBody>().cause, 'provider_error')

      // Every account is now benched: nothing is tried, and nothing is queued for.
      const before = runway.createdOn.length
      const second = await call(root, token)
      assert.equal(second.statusCode, 502, second.body)
      assert.equal(runway.createdOn.length, before)
      assert.equal(anam.createdOn.length, 0)

      const availability = await root.app.inject({
        method: 'GET',
        url: '/api/v1/avatar/availability',
      })
      assert.equal(availability.json<AvatarAvailability>().available, false)
    } finally {
      await root.close()
    }
  })
})

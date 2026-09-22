/**
 * The sweep under Anam, which used to be a no-op.
 *
 * `AnamToolGate` answered `connected: true` unconditionally, so `sweepDisconnected` skipped
 * every Anam call in `live.all()` and the slot was only ever freed by the client's `/end`
 * beacon or, failing that, by the lease reaper at the cap — which charges the FULL cap against
 * the daily minute budget. A customer who hung up at thirty seconds cost ten minutes of budget.
 *
 * The signal is `GET /v1/sessions`, matched on our own `clientLabel`, and the rule that keeps
 * it safe is that `gone` is only ever read off evidence this build recognises. A listed row
 * with no reported outcome is `connected`; no row at all, a transport failure, and an
 * `exitStatus` spelling nobody has observed are all `unknown`. Every one of those lands on the
 * old behaviour — the beacon, then the reaper — rather than on a torn-down live call.
 *
 * The read is also off the customer-facing circuit breaker, because it is housekeeping: see
 * the third describe below.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { AvatarAvailability, AvatarCallRecord, AvatarGrant } from '@dhan/contracts'
import { AnamCallRegistry } from '../../src/adapters/anam/call-registry.ts'
import { AnamAvatarProvider } from '../../src/adapters/anam/provider.ts'
import { AnamToolGate } from '../../src/adapters/anam/tool-gate.ts'
import { AnamToolWebhook } from '../../src/adapters/anam/tool-webhook.ts'
import { AnamTransport } from '../../src/adapters/anam/transport.ts'
import { CircuitBreaker } from '../../src/infra/circuit.ts'
import { bearer, createSession, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'
import type { AvatarCredential, RpcHandle, ToolHandlers } from '../../src/ports/index.ts'

const PUBLIC_BASE = 'https://gate.example.test'
const SESSION_TOKEN = 'header.payload.signature'
const CRED: AvatarCredential = {
  provider: 'anam',
  key: 'test-key-not-real',
  characterId: 'test-avatar',
  label: 'anam-1',
}
const NO_TOOLS = {} as ToolHandlers

/** One row of `GET /v1/sessions`, as the test owns and mutates it. */
interface Row {
  id: string
  clientLabel: string
  exitStatus?: string
  sessionLengthMs?: number
}

/**
 * Anam's HTTP surface. The branch ORDER is load-bearing: `/v1/sessions/concurrency`,
 * `/transcript` and `/stop` all contain `/v1/sessions` and must be matched before the bare
 * list endpoint.
 */
function stubAnam(rows: Row[], onList?: () => void): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    const json = (body: unknown): Response =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })

    if (url.includes('/v1/auth/session-token')) return json({ sessionToken: SESSION_TOKEN })
    if (url.includes('/v1/avatars/')) return json({ displayName: 'Priya' })
    if (url.includes('/v1/sessions/concurrency')) {
      return json({ limit: 1, active: 0, canStartSession: true, estimatedWaitSeconds: 0 })
    }
    if (url.includes('/transcript')) return json({ messages: [] })
    if (url.includes('/stop')) return json({})
    if (url.includes('/v1/sessions')) {
      onList?.()
      return json({ data: rows })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
}

function transportOver(rows: Row[], onList?: () => void): AnamTransport {
  return new AnamTransport({
    baseUrl: 'https://api.anam.test',
    voiceId: 'voice-1',
    llmId: 'llm-1',
    videoWidth: 768,
    videoHeight: 1152,
    // Zero, so the page cache cannot hide a mutation the test makes between sweeps.
    sessionListTtlMs: 0,
    fetch: stubAnam(rows, onList),
  })
}

async function rootWithAnam(rows: Row[]): Promise<TestRoot> {
  const registry = new AnamCallRegistry()
  const transport = transportOver(rows)
  return makeRoot({
    env: {
      AVATAR_PROVIDER: 'anam',
      ANAM_API_KEY: 'test-key-not-real',
      ANAM_AVATAR_ID: 'test-avatar',
      ANAM_VOICE_ID: 'voice-1',
      ANAM_LLM_ID: 'llm-1',
      ANAM_PUBLIC_BASE_URL: PUBLIC_BASE,
    },
    deps: {
      avatar: new AnamAvatarProvider({ transport, registry, publicBaseUrl: PUBLIC_BASE }),
      rpc: new AnamToolGate({ registry, transport }),
      toolWebhook: new AnamToolWebhook(registry),
    },
    transcriptDelaysMs: [],
  })
}

describe('the sweep under Anam', () => {
  const rows: Row[] = []
  let root: TestRoot
  let grant: AvatarGrant
  let token: string

  const available = async (): Promise<boolean> => {
    const res = await root.app.inject({ method: 'GET', url: '/api/v1/avatar/availability' })
    return res.json<AvatarAvailability>().available
  }

  before(async () => {
    root = await rootWithAnam(rows)
    const session = await createSession(root.app)
    token = session.token
    const res = await root.app.inject({
      method: 'POST',
      url: '/api/v1/avatar/session',
      headers: { ...bearer(token), 'idempotency-key': 'idem-anam-liveness-1' },
      payload: {},
    })
    assert.equal(res.statusCode, 200, res.body)
    grant = res.json<AvatarGrant>()
  })

  after(async () => {
    await root.close()
  })

  it('leaves a listed call with no reported outcome alone', async () => {
    rows.push({ id: 'anam-sess-0', clientLabel: grant.runwaySessionId })
    root.clock.advance(90_000)
    await root.services.avatar.sweepDisconnected()
    assert.equal(await available(), false)
  })

  it('leaves a call Anam has not listed alone, however long it goes unlisted', async () => {
    rows.length = 0
    await root.services.avatar.sweepDisconnected()
    root.clock.advance(20_000)
    await root.services.avatar.sweepDisconnected()
    assert.equal(await available(), false)
  })

  it('frees the slot once the outcome is sustained, and charges the elapsed minutes', async () => {
    rows.push({ id: 'anam-sess-0', clientLabel: grant.runwaySessionId, exitStatus: 'USER_ENDED' })

    // The first `gone` only starts the grace.
    await root.services.avatar.sweepDisconnected()
    assert.equal(await available(), false)

    root.clock.advance(16_000)
    await root.services.avatar.sweepDisconnected()
    assert.equal(await available(), true)

    const record = await root.app.inject({
      method: 'GET',
      url: `/api/v1/avatar/session/${grant.runwaySessionId}/record`,
      headers: bearer(token),
    })
    const { session } = record.json<AvatarCallRecord>()
    assert.equal(session.endReason, 'reaped')
    // 126 s of call — 90 + 20 + 16 — not the ten minutes the reaper would have charged.
    assert.equal(session.minutesCharged, 2.1)
  })
})

describe('what the Anam gate will and will not call gone', () => {
  /** The registry refuses handlers for a call it never minted, so mint one first. */
  const gateOver = async (
    transport: AnamTransport,
    id = 'call-1',
  ): Promise<{ gate: AnamToolGate; handle: RpcHandle }> => {
    const registry = new AnamCallRegistry()
    registry.mint(id)
    const gate = new AnamToolGate({ registry, transport })
    return { gate, handle: await gate.open(id, CRED, NO_TOOLS) }
  }

  const handleFor = (rows: Row[]): Promise<{ gate: AnamToolGate; handle: RpcHandle }> =>
    gateOver(transportOver(rows))

  it('is unknown when the transport cannot answer', async () => {
    const transport = new AnamTransport({
      baseUrl: 'https://api.anam.test',
      voiceId: 'voice-1',
      llmId: 'llm-1',
      videoWidth: 768,
      videoHeight: 1152,
      sessionListTtlMs: 0,
      fetch: (() => {
        throw new Error('the network is down')
      }) as unknown as typeof fetch,
    })
    const { gate, handle } = await gateOver(transport)
    assert.equal(await gate.liveness(handle), 'unknown')
  })

  it('is unknown when no row carries our clientLabel', async () => {
    const { gate, handle } = await handleFor([{ id: 'other', clientLabel: 'someone-else' }])
    assert.equal(await gate.liveness(handle), 'unknown')
  })

  it('is connected for a listed row with neither exitStatus nor sessionLengthMs', async () => {
    const { gate, handle } = await handleFor([{ id: 'anam-1', clientLabel: 'call-1' }])
    assert.equal(await gate.liveness(handle), 'connected')
  })

  it('is connected for an empty exitStatus, which is not an outcome', async () => {
    const { gate, handle } = await handleFor([
      { id: 'anam-1', clientLabel: 'call-1', exitStatus: '' },
    ])
    assert.equal(await gate.liveness(handle), 'connected')
  })

  it('is gone for an exitStatus this build recognises as an outcome', async () => {
    for (const exitStatus of ['USER_ENDED', 'completed', 'max_duration', 'ERROR']) {
      const { gate, handle } = await handleFor([
        { id: 'anam-1', clientLabel: 'call-1', exitStatus },
      ])
      assert.equal(await gate.liveness(handle), 'gone', exitStatus)
    }
  })

  /**
   * The direction ADR-0013's first cut did not guard. `sessionLengthMs` is documented on a list
   * of PAST sessions and has never been seen on a live row; if it is elapsed-so-far, reading it
   * as an outcome tears the call down about seventeen seconds after the customer connects.
   */
  it('is not gone for sessionLengthMs alone, whose meaning on a live row is unverified', async () => {
    const { gate, handle } = await handleFor([
      { id: 'anam-1', clientLabel: 'call-1', sessionLengthMs: 30_000 },
    ])
    assert.equal(await gate.liveness(handle), 'connected')
  })

  /** Same direction: an in-progress spelling must never be mistaken for an outcome. */
  it('is connected for an exitStatus that says the call is still running', async () => {
    for (const exitStatus of ['IN_PROGRESS', 'ACTIVE', 'running']) {
      const { gate, handle } = await handleFor([
        { id: 'anam-1', clientLabel: 'call-1', exitStatus },
      ])
      assert.equal(await gate.liveness(handle), 'connected', exitStatus)
    }
  })

  /** And a spelling in neither set is evidence of nothing, rather than a guess either way. */
  it('is unknown for an exitStatus nobody has seen before', async () => {
    const { gate, handle } = await handleFor([
      { id: 'anam-1', clientLabel: 'call-1', exitStatus: 'WHATEVER_ANAM_ACTUALLY_SENDS' },
    ])
    assert.equal(await gate.liveness(handle), 'unknown')
  })

  it('is unknown for a handle this gate has closed', async () => {
    const { gate, handle } = await handleFor([{ id: 'anam-1', clientLabel: 'call-1' }])
    await gate.close(handle)
    assert.equal(await gate.liveness(handle), 'unknown')
  })
})

/**
 * Liveness is housekeeping. The sweep polls it every two seconds whether or not anyone is on a
 * call, so if it answers to the same circuit breaker as minting a token then Anam degrading on
 * `GET /v1/sessions` alone takes avatar grants offline for every customer — `availability`
 * reads that breaker, and `assertUsable` refuses on it.
 */
describe('the liveness read is off the customer-facing line', () => {
  const listOnlyBroken = (count: { lists: number }): typeof fetch =>
    (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      const json = (body: unknown): Response =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      if (url.includes('/v1/auth/session-token')) return json({ sessionToken: SESSION_TOKEN })
      if (url.includes('/v1/avatars/')) return json({ displayName: 'Priya' })
      if (url.includes('/v1/sessions/concurrency')) {
        return json({ limit: 1, active: 0, canStartSession: true, estimatedWaitSeconds: 0 })
      }
      if (url.includes('/v1/sessions')) {
        count.lists += 1
        return new Response(JSON.stringify({ error: 'upstream is unwell' }), { status: 503 })
      }
      return new Response('{}', { status: 404 })
    }) as typeof fetch

  const MINT = {
    systemPrompt: 'be brief',
    initialMessage: 'hello',
    tools: [],
    maxSeconds: 600,
    clientLabel: 'call-1',
  }

  it('trips only its own breaker, and tokens keep minting', async () => {
    const count = { lists: 0 }
    const transport = new AnamTransport({
      baseUrl: 'https://api.anam.test',
      voiceId: 'voice-1',
      llmId: 'llm-1',
      videoWidth: 768,
      videoHeight: 1152,
      sessionListTtlMs: 0,
      fetch: listOnlyBroken(count),
    })
    const registry = new AnamCallRegistry()
    registry.mint('call-1')
    const gate = new AnamToolGate({ registry, transport })
    const handle = await gate.open('call-1', CRED, NO_TOOLS)

    // Well past the breaker's threshold of three.
    for (let i = 0; i < 6; i += 1) assert.equal(await gate.liveness(handle), 'unknown')

    assert.ok(count.lists >= 3, `expected the list endpoint to be tried, saw ${count.lists}`)
    assert.equal(transport.listBreaker.state(), 'open')
    assert.equal(transport.breaker.state(), 'closed')
    assert.equal(await transport.createSessionToken(CRED, MINT), SESSION_TOKEN)
  })

  /**
   * And it closes itself again. The list read is flagged `probe`, because otherwise a
   * half-open list breaker refuses every call without running one — so it never records a
   * success, never closes, and liveness stays dead for the life of the process.
   */
  it('recovers on its own once the endpoint comes back', async () => {
    const count = { lists: 0 }
    let broken = true
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/v1/sessions') && !url.includes('concurrency')) {
        count.lists += 1
        if (broken) return new Response('{"error":"unwell"}', { status: 503 })
        return new Response(JSON.stringify({ data: [{ id: 'a', clientLabel: 'call-1' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    let millis = 0
    const transport = new AnamTransport({
      baseUrl: 'https://api.anam.test',
      voiceId: 'voice-1',
      llmId: 'llm-1',
      videoWidth: 768,
      videoHeight: 1152,
      sessionListTtlMs: 0,
      listBreaker: new CircuitBreaker({ now: () => millis }),
      fetch: fetchImpl,
    })
    const registry = new AnamCallRegistry()
    registry.mint('call-1')
    const gate = new AnamToolGate({ registry, transport })
    const handle = await gate.open('call-1', CRED, NO_TOOLS)

    for (let i = 0; i < 4; i += 1) assert.equal(await gate.liveness(handle), 'unknown')
    assert.equal(transport.listBreaker.state(), 'open')

    broken = false
    millis = 30_000
    assert.equal(await gate.liveness(handle), 'connected')
    assert.equal(transport.listBreaker.state(), 'closed')
  })
})

/**
 * `ANAM_API_KEY` is a list, and the page cache is what keeps a 2 s sweep off a rate-limited
 * endpoint. Held in one slot it missed on every read the moment a second key was configured —
 * two live calls on two keys evicted each other, turning the cache into overhead.
 */
describe('the session page cache', () => {
  it('holds one page per credential rather than one page', async () => {
    const count = { lists: 0 }
    const transport = new AnamTransport({
      baseUrl: 'https://api.anam.test',
      voiceId: 'voice-1',
      llmId: 'llm-1',
      videoWidth: 768,
      videoHeight: 1152,
      sessionListTtlMs: 60_000,
      fetch: stubAnam([{ id: 'anam-1', clientLabel: 'call-1' }], () => {
        count.lists += 1
      }),
    })
    const one: AvatarCredential = { ...CRED, key: 'key-one', label: 'anam-1' }
    const two: AvatarCredential = { ...CRED, key: 'key-two', label: 'anam-2' }

    await transport.listSessions(one)
    await transport.listSessions(two)
    assert.equal(count.lists, 2, 'a cold read per key')

    await transport.listSessions(one)
    await transport.listSessions(two)
    assert.equal(count.lists, 2, 'both keys still cached; one slot would have missed twice')
  })
})

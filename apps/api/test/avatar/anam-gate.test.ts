/**
 * The Anam path, end to end inside the process, with Anam's HTTP surface stubbed.
 *
 * Two things are being pinned here, and only the first is obvious.
 *
 * **The swap is real.** The same route, the same lease, the same budget and the same tool
 * handlers produce a grant whose only Anam-shaped difference is `transport: 'anam'` and an
 * empty `url`. If this test and `rpc-before-consume.test.ts` both pass, the client is telling
 * the truth when it says it does not care which provider ran the call.
 *
 * **The gate did not get weaker by moving onto the public internet.** Runway's tools were
 * answered inside a room nobody else could reach. Anam's are answered by a URL anyone can
 * find, so the per-call secret is the whole of the defence, and every way of getting it wrong
 * has to be a refusal to answer: a stale call id, a wrong secret, and — the one that matters —
 * a tool call that arrives before the gate is open. None of them may return a verdict.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { AvatarGrant, GetPlanResult } from '@dhan/contracts'
import { AnamCallRegistry } from '../../src/adapters/anam/call-registry.ts'
import { AnamAvatarProvider } from '../../src/adapters/anam/provider.ts'
import { AnamToolGate } from '../../src/adapters/anam/tool-gate.ts'
import { AnamToolWebhook } from '../../src/adapters/anam/tool-webhook.ts'
import { AnamTransport } from '../../src/adapters/anam/transport.ts'
import { bearer, createSession, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const PUBLIC_BASE = 'https://gate.example.test'
const SESSION_TOKEN = 'header.payload.signature'

interface Minted {
  clientLabel: string
  tools: { name: string; url: string; headers: Record<string, string> }[]
}

/** Anam's HTTP surface, as much of it as a grant and a teardown touch. */
function stubAnam(minted: Minted[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const json = (body: unknown): Response =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })

    if (url.includes('/v1/auth/session-token')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        clientLabel: string
        personaConfig: { tools?: Minted['tools'] }
      }
      minted.push({ clientLabel: body.clientLabel, tools: body.personaConfig.tools ?? [] })
      return json({ sessionToken: SESSION_TOKEN })
    }
    if (url.includes('/v1/avatars/')) return json({ displayName: 'Priya' })
    if (url.includes('/v1/sessions/concurrency')) {
      return json({ limit: 1, active: 0, canStartSession: true, estimatedWaitSeconds: 0 })
    }
    if (url.includes('/transcript')) {
      return json({ messages: [{ role: 'persona', message: 'Rohan, that SIP suits you.' }] })
    }
    if (url.includes('/stop')) return json({})
    if (url.includes('/v1/sessions')) {
      return json({
        data: minted.map((m, i) => ({ id: `anam-sess-${i}`, clientLabel: m.clientLabel })),
      })
    }
    return new Response('{}', { status: 404 })
  }) as typeof fetch
}

async function rootWithAnam(): Promise<{ root: TestRoot; minted: Minted[] }> {
  const minted: Minted[] = []
  const registry = new AnamCallRegistry()
  const transport = new AnamTransport({
    baseUrl: 'https://api.anam.test',
    voiceId: 'voice-1',
    llmId: 'llm-1',
    videoWidth: 768,
    videoHeight: 1152,
    fetch: stubAnam(minted),
  })
  const root = await makeRoot({
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
  return { root, minted }
}

describe('the Anam provider grants the same call Runway does', () => {
  let ctx: Awaited<ReturnType<typeof rootWithAnam>>
  let grant: AvatarGrant
  let token: string
  let secret: string

  before(async () => {
    ctx = await rootWithAnam()
    const session = await createSession(ctx.root.app)
    token = session.token
    const res = await ctx.root.app.inject({
      method: 'POST',
      url: '/api/v1/avatar/session',
      headers: { ...bearer(token), 'idempotency-key': 'idem-anam-1' },
      payload: {},
    })
    assert.equal(res.statusCode, 200, res.body)
    grant = res.json<AvatarGrant>()
    secret = ctx.minted[0]?.tools[0]?.headers['X-Avatar-Call'] ?? ''
  })
  after(() => ctx.root.close())

  it('answers with an Anam grant the client can tell apart from a LiveKit one', () => {
    assert.equal(grant.transport, 'anam')
    assert.equal(grant.token, SESSION_TOKEN)
    // There is no room to join, and saying so is better than inventing a URL.
    assert.equal(grant.url, '')
    assert.ok(grant.runwaySessionId.startsWith('anam_'), grant.runwaySessionId)
    assert.equal(grant.expiresInSeconds, 600)
  })

  it('declares every tool as a webhook back to this API, carrying the call and a secret', () => {
    const tools = ctx.minted[0]?.tools ?? []
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'check_suitability',
      'get_plan',
      'query_spend',
    ])
    for (const tool of tools) {
      assert.equal(
        tool.url,
        `${PUBLIC_BASE}/api/v1/avatar/tool/${grant.runwaySessionId}/${tool.name}`,
      )
      // One secret for the whole call, and never the API key.
      assert.equal(tool.headers['X-Avatar-Call'], secret)
      assert.ok(secret.length >= 16, `secret too short: ${secret.length}`)
    }
  })

  it('answers a tool call that proves it is the provider, with the real handler', async () => {
    const res = await ctx.root.app.inject({
      method: 'POST',
      url: `/api/v1/avatar/tool/${grant.runwaySessionId}/get_plan`,
      headers: { 'x-avatar-call': secret, 'content-type': 'application/json' },
      payload: {},
    })
    assert.equal(res.statusCode, 200, res.body)
    const plan = res.json<GetPlanResult>()
    // The same figures the screens show, not something the model could have made up.
    assert.equal(typeof plan.monthly_commitment, 'number')
    assert.equal(typeof plan.safe_to_spend_per_day, 'number')
    assert.ok(plan.goal)
  })

  it('refuses a caller with the URL and not the secret', async () => {
    const res = await ctx.root.app.inject({
      method: 'POST',
      url: `/api/v1/avatar/tool/${grant.runwaySessionId}/get_plan`,
      headers: { 'x-avatar-call': 'x'.repeat(secret.length), 'content-type': 'application/json' },
      payload: {},
    })
    assert.equal(res.statusCode, 403)
  })

  it('refuses a call this process is not hosting', async () => {
    const res = await ctx.root.app.inject({
      method: 'POST',
      url: '/api/v1/avatar/tool/anam_00000000-0000-0000-0000-000000000000/get_plan',
      headers: { 'x-avatar-call': secret, 'content-type': 'application/json' },
      payload: {},
    })
    assert.equal(res.statusCode, 404)
  })

  it('stops answering the moment the call ends', async () => {
    const ended = await ctx.root.app.inject({
      method: 'POST',
      url: `/api/v1/avatar/session/${grant.runwaySessionId}/end`,
      headers: bearer(token),
    })
    assert.equal(ended.statusCode, 204)

    const res = await ctx.root.app.inject({
      method: 'POST',
      url: `/api/v1/avatar/tool/${grant.runwaySessionId}/get_plan`,
      headers: { 'x-avatar-call': secret, 'content-type': 'application/json' },
      payload: {},
    })
    assert.equal(res.statusCode, 404)
  })
})

describe('the Anam gate is shut until it is open', () => {
  it('never answers a tool call that arrives before the handlers are attached', async () => {
    const registry = new AnamCallRegistry()
    const webhook = new AnamToolWebhook(registry)
    // What the provider does at session-create time, and nothing more: the secret exists,
    // because it has to be baked into the persona config, but the gate has not opened.
    const secret = registry.mint('anam_pending')

    assert.deepEqual(
      await webhook.dispatch({
        runwaySessionId: 'anam_pending',
        tool: 'get_plan',
        secret,
        args: {},
      }),
      { status: 'not_gated' },
    )
    assert.equal(registry.openCount(), 0)

    // And once the gate is open, the same request is answered.
    registry.attach('anam_pending', {
      get_plan: async () => ({ ok: true }),
      check_suitability: async () => ({}),
      query_spend: async () => ({}),
    })
    assert.deepEqual(
      await webhook.dispatch({
        runwaySessionId: 'anam_pending',
        tool: 'get_plan',
        secret,
        args: {},
      }),
      { status: 'ok', result: { ok: true } },
    )
    assert.equal(registry.openCount(), 1)
  })
})

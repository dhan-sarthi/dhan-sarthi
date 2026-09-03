/**
 * The grant sequence with a fake provider and a fake RPC host: the gate opens before the
 * session is consumed; a refused gate produces one cancel and no consume; the single slot
 * queues a second reviewer; the tool writes the record before it answers.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type {
  AvatarAvailability,
  AvatarBusyBody,
  AvatarGrant,
  AvatarUnavailableBody,
  CheckSuitabilityResult,
  RecordView,
  WaitlistStatus,
} from '@dhan/contracts'
import { FakeAvatarProvider } from '../fakes/avatar-provider.fake.ts'
import { FakeRpcHost } from '../fakes/rpc-host.fake.ts'
import { PRIYA_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const RUNWAY_ENV = {
  AVATAR_PROVIDER: 'runway',
  RUNWAY_API_KEY: 'test-key-not-real',
  RUNWAY_CHARACTER_ID: 'test-character',
  RUNWAY_MAX_SESSION_SECONDS: '600',
}

async function rootWithFakes(
  env: Record<string, string> = {},
): Promise<{ root: TestRoot; provider: FakeAvatarProvider; rpc: FakeRpcHost; events: string[] }> {
  const events: string[] = []
  const provider = new FakeAvatarProvider(events)
  const rpc = new FakeRpcHost(events)
  const root = await makeRoot({
    env: { ...RUNWAY_ENV, ...env },
    deps: { avatar: provider, rpc },
    transcriptDelaysMs: [],
  })
  return { root, provider, rpc, events }
}

async function start(root: TestRoot, token: string, headers: Record<string, string> = {}) {
  return root.app.inject({
    method: 'POST',
    url: '/api/v1/avatar/session',
    headers: { ...bearer(token), 'idempotency-key': `idem-${Math.random()}`, ...headers },
    payload: {},
  })
}

describe('the grant opens the gate before it consumes', () => {
  let ctx: Awaited<ReturnType<typeof rootWithFakes>>

  before(async () => {
    ctx = await rootWithFakes()
  })
  after(() => ctx.root.close())

  it('grants a call in the right order and holds the single slot', async () => {
    const { root, provider, rpc, events } = ctx
    const { token } = await createSession(root.app)

    const before = await root.app.inject({ method: 'GET', url: '/api/v1/avatar/availability' })
    assert.equal(before.json<AvatarAvailability>().available, true)

    const res = await start(root, token)
    assert.equal(res.statusCode, 200, res.body)
    const grant = res.json<AvatarGrant>()
    assert.equal(grant.runwaySessionId, 'fake-session-1')
    assert.equal(grant.expiresInSeconds, 600)
    assert.equal(grant.expectVideoAfterMs, 5000)

    assert.deepEqual(events, ['create', 'ready', 'open', 'consume'])
    assert.ok(events.indexOf('open') < events.indexOf('consume'))
    assert.equal(rpc.openCount(), 1)

    // The brief was built server-side and the tools were registered.
    const created = provider.created[0]
    assert.ok(created)
    assert.ok(created.opts.personality.includes('check_suitability'))
    assert.ok(created.opts.personality.length <= 10_000)
    assert.ok(created.opts.startScript.length <= 2_000)
    assert.deepEqual(
      created.opts.tools.map((t) => t.name),
      ['check_suitability', 'query_spend', 'get_plan'],
    )

    const during = await root.app.inject({ method: 'GET', url: '/api/v1/avatar/availability' })
    assert.equal(during.json<AvatarAvailability>().available, false)

    // A second reviewer queues rather than waits on a spinner.
    const other = await createSession(root.app, PRIYA_CIF)
    const busy = await start(root, other.token)
    assert.equal(busy.statusCode, 409)
    const body = busy.json<AvatarBusyBody>()
    assert.equal(body.code, 'AVATAR_BUSY')
    assert.equal(body.cause, 'pool_busy')
    assert.ok(body.ticket)
    assert.equal(body.position, 1)

    // The tool the worker would call: the ULIP is refused, and the record exists before the
    // sentence is returned.
    const handlers = rpc.handlers(grant.runwaySessionId)
    assert.ok(handlers)
    const verdict = (await handlers.check_suitability({
      product_name: 'LIC ULIP',
      monthly_amount: 5000,
    })) as CheckSuitabilityResult
    assert.equal(verdict.verdict, 'BLOCKED')
    assert.equal(verdict.rule_id, 'BUNDLED_PROTECTION')
    assert.equal(verdict.product, 'LIC Market Plus ULIP')
    assert.ok(verdict.alternative)
    assert.match(verdict.spoken, /term/i)

    const record = await root.app.inject({
      method: 'GET',
      url: '/api/v1/record',
      headers: bearer(token),
    })
    const trail = record.json<RecordView>()
    const advice = trail.adviceRecords.find((r) => r.source === 'avatar_tool')
    assert.ok(advice)
    assert.equal(advice.verdict, 'BLOCKED')
    assert.equal(advice.ruleId, 'BUNDLED_PROTECTION')
    assert.equal(advice.runwaySessionId, grant.runwaySessionId)
    assert.equal(advice.spoken, verdict.spoken)
    assert.equal(trail.chainVerified, true)

    const unknown = (await handlers.check_suitability({
      product_name: "my cousin's crypto scheme",
    })) as CheckSuitabilityResult
    assert.equal(unknown.verdict, 'UNKNOWN_PRODUCT')
    assert.equal(unknown.product, null)

    // End: the lease frees, the queued reviewer is promoted, and the gate is closed.
    const end = await root.app.inject({
      method: 'POST',
      url: `/api/v1/avatar/session/${grant.runwaySessionId}/end`,
      headers: bearer(token),
    })
    assert.equal(end.statusCode, 204)
    assert.deepEqual(provider.cancelled, [grant.runwaySessionId])
    assert.equal(rpc.openCount(), 0)

    const status = await root.app.inject({
      method: 'GET',
      url: `/api/v1/avatar/waitlist/${body.ticket}`,
      headers: bearer(other.token),
    })
    assert.equal(status.statusCode, 200)
    const wl = status.json<WaitlistStatus>()
    assert.equal(wl.claimable, true)
    assert.ok(wl.holdUntil)

    // The promoted reviewer claims with the ticket; a stranger is still refused meanwhile.
    const claimed = await start(root, other.token, { 'x-waitlist-ticket': body.ticket ?? '' })
    assert.equal(claimed.statusCode, 200, claimed.body)

    const callRecord = await root.app.inject({
      method: 'GET',
      url: `/api/v1/avatar/session/${grant.runwaySessionId}/record`,
      headers: bearer(token),
    })
    assert.equal(callRecord.statusCode, 200)
    assert.equal(callRecord.json<{ toolCalls: unknown[] }>().toolCalls.length, 2)

    // Ownership: the other session may not read or end this call.
    const foreign = await root.app.inject({
      method: 'GET',
      url: `/api/v1/avatar/session/${grant.runwaySessionId}/record`,
      headers: bearer(other.token),
    })
    assert.equal(foreign.statusCode, 403)
  })
})

describe('a refused gate never issues a session', () => {
  it('cancels exactly once, consumes never, and frees the lease', async () => {
    const { root, provider, rpc, events } = await rootWithFakes()
    try {
      rpc.rejectOpen = true
      const { token } = await createSession(root.app)
      const res = await start(root, token)
      assert.equal(res.statusCode, 502, res.body)
      const body = res.json<AvatarUnavailableBody>()
      assert.equal(body.code, 'AVATAR_GATE_UNAVAILABLE')
      assert.equal(body.cause, 'gate_unavailable')

      assert.deepEqual(events, ['create', 'ready', 'open', 'cancel'])
      assert.equal(provider.consumed.length, 0)
      assert.equal(provider.cancelled.length, 1)

      const after = await root.app.inject({ method: 'GET', url: '/api/v1/avatar/availability' })
      assert.equal(after.json<AvatarAvailability>().available, true)
    } finally {
      await root.close()
    }
  })

  it('reports provider concurrency when Runway stays queued for the whole window', async () => {
    const { root, provider } = await rootWithFakes()
    try {
      provider.script = { ready: 'queued' }
      const { token } = await createSession(root.app)
      const res = await start(root, token)
      assert.equal(res.statusCode, 409)
      const body = res.json<AvatarBusyBody>()
      assert.equal(body.cause, 'provider_concurrency')
      assert.equal(provider.consumed.length, 0)
      assert.equal(provider.cancelled.length, 1)
    } finally {
      await root.close()
    }
  })

  it('refuses under two minutes of budget without creating anything', async () => {
    const { root, provider } = await rootWithFakes({ RUNWAY_DAILY_MINUTE_BUDGET: '1' })
    try {
      const { token } = await createSession(root.app)
      const res = await start(root, token)
      assert.equal(res.statusCode, 429)
      assert.equal(res.json<AvatarUnavailableBody>().cause, 'budget_exhausted')
      assert.equal(provider.created.length, 0)
    } finally {
      await root.close()
    }
  })

  it('answers 503 with the text tier when the avatar is not configured', async () => {
    const root = await makeRoot()
    try {
      const { token } = await createSession(root.app)
      const res = await start(root, token)
      assert.equal(res.statusCode, 503)
      assert.equal(res.json<AvatarUnavailableBody>().cause, 'not_configured')
      const availability = await root.app.inject({
        method: 'GET',
        url: '/api/v1/avatar/availability',
      })
      assert.equal(availability.json<AvatarAvailability>().enabled, false)
    } finally {
      await root.close()
    }
  })

  it('demands an Idempotency-Key', async () => {
    const root = await makeRoot()
    try {
      const { token } = await createSession(root.app)
      const res = await root.app.inject({
        method: 'POST',
        url: '/api/v1/avatar/session',
        headers: bearer(token),
        payload: {},
      })
      assert.equal(res.statusCode, 400)
      assert.equal(res.json<AvatarUnavailableBody>().code, 'IDEMPOTENCY_KEY_REQUIRED')
    } finally {
      await root.close()
    }
  })
})

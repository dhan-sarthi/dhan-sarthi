/**
 * The live sandbox failing must not take the product with it.
 *
 * The sandbox allow-lists IP addresses, so AWS is refused at the edge the day it is not on the
 * list, and a POC gateway promises no uptime. Each case below is one way the line fails; in
 * every one the adapter still answers with IDBI's own figures — the same ones
 * `idbi-adapter.test.ts` asserts to the paisa — because the replay answers in its place. And
 * the one case that is *not* an outage, a 400 from a bank that is up, must reach the adapter
 * untouched.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { InMemoryDeclaredProfiles } from '../../src/adapters/memory/declared-profile.memory.ts'
import { IdbiSandboxBankData } from '../../src/adapters/idbi-sandbox/bank-data.idbi-sandbox.ts'
import { IdbiGateway } from '../../src/adapters/idbi-sandbox/api/gateway.ts'
import { IdbiTransport } from '../../src/adapters/idbi-sandbox/api/transport.ts'
import type { FetchLike } from '../../src/adapters/idbi-sandbox/api/transport.ts'
import { createReplayTransport } from '../../src/adapters/idbi-sandbox/api/replay.ts'
import { loadCapturedCalls } from '../../src/adapters/idbi-sandbox/api/captured.ts'
import { createFailoverFetch } from '../../src/adapters/idbi-sandbox/api/failover.ts'
import { DECLARED_SEEDS } from '../../src/adapters/idbi-sandbox/api/customers.ts'
import { silentLogger } from '../../src/infra/logger.ts'
import type { Clock } from '../../src/ports/index.ts'

const PRIYA = '98655854'
const LIVE_BASE = 'https://sandbox.example.test'
const clock: Clock = {
  now: () => new Date('2026-09-08T00:00:00.000Z'),
  today: () => '2026-09-08',
}

const awselb403: FetchLike = async () =>
  new Response('<html><body><center><h1>403 Forbidden</h1></center></body></html>', {
    status: 403,
    headers: { 'content-type': 'text/html', server: 'awselb/2.0' },
  })

function build(live: FetchLike, opts: { liveTimeoutMs?: number; now?: () => number } = {}) {
  const replay = createReplayTransport({ captures: loadCapturedCalls() })
  const failover = createFailoverFetch({ live, fallback: replay.fetch, ...opts })
  const transport = new IdbiTransport({
    baseUrl: LIVE_BASE,
    fetch: failover.fetch,
    logger: silentLogger,
    readCacheMs: 0,
  })
  const bank = new IdbiSandboxBankData({
    gateway: new IdbiGateway({ transport, logger: silentLogger }),
    profiles: new InMemoryDeclaredProfiles(DECLARED_SEEDS, clock),
    logger: silentLogger,
  })
  return { bank, failover, transport }
}

describe('the IDBI line failing over to our own implementation', () => {
  it('answers with IDBI’s figures when the edge refuses this network', async () => {
    const { bank, failover } = build(awselb403)
    const [account] = await bank.getAccounts(PRIYA, '2025-05-20')
    assert.equal(account?.currentBalance, 56780.25)
    assert.equal(account?.effectiveAvailableBalance, 50780.25)
    assert.equal(failover.mode(), 'fallback')
    assert.match(failover.lastFailure() ?? '', /403/)
  })

  it('keeps health green, so a load balancer does not kill the task', async () => {
    const { bank } = build(awselb403)
    assert.equal((await bank.health()).ok, true)
  })

  it('answers when the connection cannot be made at all', async () => {
    const { bank, failover } = build(async () => {
      throw new TypeError('fetch failed')
    })
    const [account] = await bank.getAccounts(PRIYA, '2025-05-20')
    assert.equal(account?.currentBalance, 56780.25)
    assert.match(failover.lastFailure() ?? '', /connection failed/)
  })

  it('answers when the sandbox is down', async () => {
    const { bank } = build(async () => new Response('Bad Gateway', { status: 502 }))
    const [account] = await bank.getAccounts(PRIYA, '2025-05-20')
    assert.equal(account?.currentBalance, 56780.25)
  })

  it('does not wait on a sandbox that never answers', async () => {
    const hang: FetchLike = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })
    const { bank, failover } = build(hang, { liveTimeoutMs: 50 })
    const started = Date.now()
    const [account] = await bank.getAccounts(PRIYA, '2025-05-20')
    assert.equal(account?.currentBalance, 56780.25)
    assert.match(failover.lastFailure() ?? '', /no answer within 50 ms/)
    // One timed-out probe, then the cooldown sends every other call straight to the fallback.
    assert.ok(Date.now() - started < 2_000)
  })

  it('passes a refusal from a bank that is up straight through', async () => {
    // "Data not found" is the truth about that key. Serving a capture over it would be
    // inventing a customer the bank says it does not hold.
    const refusal = { message: 'Data not found', sentKey: 'acctId#660100100003' }
    const { transport, failover } = build(
      async () =>
        new Response(JSON.stringify(refusal), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    )
    const { operationByPath } = await import('../../src/adapters/idbi-sandbox/api/operations.ts')
    const op = operationByPath('performAccountEnquirytest')
    assert.ok(op)
    await assert.rejects(transport.call(op, { acctId: '660100100003' }), /refused/)
    assert.equal(failover.mode(), 'live')
  })

  it('stays on the fallback through the cooldown, then asks live again', async () => {
    let t = 0
    let liveCalls = 0
    let liveUp = false
    const live: FetchLike = async (input, init) => {
      liveCalls++
      if (!liveUp) return awselb403(input, init)
      return new Response(JSON.stringify({ message: 'Data not found', sentKey: 'x#1' }), {
        status: 400,
      })
    }
    const { failover } = build(live, { now: () => t })
    const call = () =>
      failover.fetch(`${LIVE_BASE}/Development/performAccountEnquirytest`, {
        method: 'POST',
        body: JSON.stringify({ acctId: '660100100003' }),
      })

    await call()
    assert.equal(liveCalls, 1)
    await call()
    await call()
    assert.equal(liveCalls, 1, 'the cooldown should keep calls off the dead line')
    assert.equal(failover.mode(), 'fallback')

    liveUp = true
    t += 61_000
    const res = await call()
    assert.equal(liveCalls, 2)
    assert.equal(res.status, 400)
    assert.equal(failover.mode(), 'live')
  })
})

/**
 * The waitlist for the single Tier-1 slot, driven through HTTP with a fake provider and a fake
 * RPC host: a second reviewer is told where they stand and for how long; the head of the line
 * is handed the slot for a 20-second window; an unclaimed window passes the slot on; a stale
 * ticket cannot jump the queue.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type {
  AvatarAvailability,
  AvatarBusyBody,
  AvatarGrant,
  WaitlistStatus,
} from '@dhan/contracts'
import { FakeAvatarProvider } from '../fakes/avatar-provider.fake.ts'
import { FakeRpcHost } from '../fakes/rpc-host.fake.ts'
import { PRIYA_CIF, SUNIL_CIF, bearer, createSession, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

const RUNWAY_ENV = {
  AVATAR_PROVIDER: 'runway',
  RUNWAY_API_KEY: 'test-key-not-real',
  RUNWAY_CHARACTER_ID: 'test-character',
  RUNWAY_MAX_SESSION_SECONDS: '600',
}

const HOLD_SECONDS = 20

async function start(root: TestRoot, token: string, ticket?: string) {
  return root.app.inject({
    method: 'POST',
    url: '/api/v1/avatar/session',
    headers: {
      ...bearer(token),
      'idempotency-key': `idem-${Math.random()}`,
      ...(ticket ? { 'x-waitlist-ticket': ticket } : {}),
    },
    payload: {},
  })
}

async function status(root: TestRoot, token: string, ticket: string) {
  return root.app.inject({
    method: 'GET',
    url: `/api/v1/avatar/waitlist/${ticket}`,
    headers: bearer(token),
  })
}

describe('the waitlist for the single slot', () => {
  let root: TestRoot
  let provider: FakeAvatarProvider

  before(async () => {
    provider = new FakeAvatarProvider()
    root = await makeRoot({
      env: RUNWAY_ENV,
      deps: { avatar: provider, rpc: new FakeRpcHost() },
      transcriptDelaysMs: [],
    })
  })
  after(() => root.close())

  it('queues, holds the slot for the head for 20 s, then passes it on', async () => {
    const a = await createSession(root.app)
    const b = await createSession(root.app, PRIYA_CIF)
    const c = await createSession(root.app, SUNIL_CIF)

    const granted = await start(root, a.token)
    assert.equal(granted.statusCode, 200, granted.body)
    const grant = granted.json<AvatarGrant>()

    // Second and third reviewers: position, and an estimate from the live call's remaining cap.
    const busyB = await start(root, b.token)
    assert.equal(busyB.statusCode, 409)
    const ticketB = busyB.json<AvatarBusyBody>()
    assert.equal(ticketB.cause, 'pool_busy')
    assert.equal(ticketB.position, 1)
    assert.equal(ticketB.estimatedWaitSeconds, 600)
    assert.ok(ticketB.ticket)

    const busyC = await start(root, c.token)
    assert.equal(busyC.statusCode, 409)
    const ticketC = busyC.json<AvatarBusyBody>()
    assert.equal(ticketC.position, 2)
    assert.equal(ticketC.estimatedWaitSeconds, 1200)
    assert.notEqual(ticketC.ticket, ticketB.ticket)

    // Asking again does not issue a second ticket to the same session.
    const again = await start(root, b.token)
    assert.equal(again.json<AvatarBusyBody>().ticket, ticketB.ticket)

    const availability = await root.app.inject({
      method: 'GET',
      url: '/api/v1/avatar/availability',
    })
    const avail = availability.json<AvatarAvailability>()
    assert.equal(avail.available, false)
    assert.equal(avail.queueLength, 2)
    assert.equal(avail.estimatedWaitSeconds, 1800)

    const waitingB = (await status(root, b.token, ticketB.ticket ?? '')).json<WaitlistStatus>()
    assert.equal(waitingB.state, 'waiting')
    assert.equal(waitingB.position, 1)
    assert.equal(waitingB.claimable, false)
    assert.equal(waitingB.holdUntil, null)

    // A ticket is the holder's business only.
    const foreign = await status(root, a.token, ticketC.ticket ?? '')
    assert.equal(foreign.statusCode, 403)

    // The call ends: the head of the line is promoted and the hold window starts now.
    const end = await root.app.inject({
      method: 'POST',
      url: `/api/v1/avatar/session/${grant.runwaySessionId}/end`,
      headers: bearer(a.token),
    })
    assert.equal(end.statusCode, 204)

    const claimableB = (await status(root, b.token, ticketB.ticket ?? '')).json<WaitlistStatus>()
    assert.equal(claimableB.state, 'claimable')
    assert.equal(claimableB.claimable, true)
    assert.equal(
      claimableB.holdUntil,
      new Date(root.clock.now().getTime() + HOLD_SECONDS * 1000).toISOString(),
    )

    // While B holds the window nobody else gets through, ticket or not.
    const cDuringHold = await start(root, c.token, ticketC.ticket ?? '')
    assert.equal(cDuringHold.statusCode, 409)
    assert.equal(cDuringHold.json<AvatarBusyBody>().position, 2)

    // B never claims. After the window the ticket is spent and C is promoted in turn.
    root.clock.advance((HOLD_SECONDS + 1) * 1000)
    const expiredB = (await status(root, b.token, ticketB.ticket ?? '')).json<WaitlistStatus>()
    assert.equal(expiredB.state, 'expired')
    assert.equal(expiredB.claimable, false)
    assert.equal(expiredB.position, 0)

    const stale = await start(root, b.token, ticketB.ticket ?? '')
    assert.equal(stale.statusCode, 409)
    const rejoined = stale.json<AvatarBusyBody>()
    assert.notEqual(rejoined.ticket, ticketB.ticket)
    assert.equal(rejoined.position, 2)

    const claimableC = (await status(root, c.token, ticketC.ticket ?? '')).json<WaitlistStatus>()
    assert.equal(claimableC.state, 'claimable')

    const claimed = await start(root, c.token, ticketC.ticket ?? '')
    assert.equal(claimed.statusCode, 200, claimed.body)
    assert.equal(provider.consumed.length, 2)

    // C's ticket is gone; B is now first in line behind C's call.
    const gone = await status(root, c.token, ticketC.ticket ?? '')
    assert.equal(gone.statusCode, 404)
    const nextB = (await status(root, b.token, rejoined.ticket ?? '')).json<WaitlistStatus>()
    assert.equal(nextB.state, 'waiting')
    assert.equal(nextB.position, 1)

    // Leaving the line frees the position.
    const leave = await root.app.inject({
      method: 'DELETE',
      url: `/api/v1/avatar/waitlist/${rejoined.ticket}`,
      headers: bearer(b.token),
    })
    assert.equal(leave.statusCode, 204)
    const after = await root.app.inject({ method: 'GET', url: '/api/v1/avatar/availability' })
    assert.equal(after.json<AvatarAvailability>().queueLength, 0)
  })
})

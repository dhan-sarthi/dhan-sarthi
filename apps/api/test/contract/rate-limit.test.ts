/**
 * A throttled caller is refused, not crashed.
 *
 * `errorResponseBuilder` hands Fastify a body rather than a reply, and Fastify *throws* it — so
 * it reaches `setErrorHandler` as an unknown error with whatever shape it was given. It carried
 * `code` and `message` and no `statusCode`, so the handler could not tell a rate-limit rejection
 * from a crash: it fell through to the 500 branch and answered
 *
 *   > Something went wrong on our side. Nothing you did caused it.
 *
 * with a 500. Both halves wrong. A 500 for a client error is a lie a monitoring dashboard
 * believes, and "nothing you did caused it" is the opposite of the truth — slowing down is
 * precisely the thing the caller can do about it.
 *
 * Found on 18 September 2026 by pressing *Start call* six times while the avatar provider was out
 * of credits; `startAvatarSession` allows five an hour.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ErrorBody } from '@dhan/contracts'
import { makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

describe('rate limiting answers with 429, not 500', () => {
  let root: TestRoot

  before(async () => {
    root = await makeRoot({ rateLimits: true })
  })
  after(() => root.close())

  it('refuses a flood on its own terms', async () => {
    /*
     * `/customers` is unauthenticated and carries the global limit, so this needs no session and
     * cannot be confused with a per-route cap. The global window is large; the loop simply has to
     * outrun it.
     */
    let limited: Awaited<ReturnType<typeof root.app.inject>> | null = null
    for (let i = 0; i < 400; i += 1) {
      const res = await root.app.inject({ method: 'GET', url: '/api/v1/customers' })
      if (res.statusCode !== 200) {
        limited = res
        break
      }
    }

    assert.ok(limited, 'the global limit should be reachable inside 400 requests')
    assert.equal(limited.statusCode, 429, 'a throttled caller is refused, never 500')

    const body = limited.json<ErrorBody>()
    assert.equal(body.code, 'RATE_LIMITED')
    assert.match(body.message, /slow down/i, 'the message says what the caller can do about it')
    assert.ok(
      !/nothing you did caused it/i.test(body.message),
      'the internal-error sentence must not reach a client error',
    )
  })

  it('keeps the retry hint, which is the only thing that makes it answerable', async () => {
    let limited: Awaited<ReturnType<typeof root.app.inject>> | null = null
    for (let i = 0; i < 400; i += 1) {
      const res = await root.app.inject({ method: 'GET', url: '/api/v1/customers' })
      if (res.statusCode === 429) {
        limited = res
        break
      }
    }
    assert.ok(limited)

    const body = limited.json<ErrorBody & { details?: { retryAfterMs?: number; limit?: number } }>()
    assert.ok(body.details, 'the limiter computes a retry window; dropping it refuses blindly')
    assert.equal(typeof body.details.retryAfterMs, 'number')
    assert.ok((body.details.retryAfterMs ?? 0) > 0)
  })
})

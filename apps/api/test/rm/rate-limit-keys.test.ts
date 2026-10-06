/**
 * What a session-keyed limit counts: the caller, however they spell the header, and never more
 * than an address's worth of requests, however many bearers it invents.
 *
 * Both were open. The bucket was keyed on the raw `Authorization` header, so `bearer X` and
 * `Bearer  X` were fresh buckets for the same principal; and a row with its own limit replaces
 * the global per-address one, so a caller sending a new random bearer every time was never
 * refused at all, each 401 costing a store lookup.
 */
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ErrorBody } from '@dhan/contracts'
import { MEERA, makeRoot, signInRm } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

/** A session-keyed RM row: 10 a minute per bearer. */
const VERIFY = '/api/v1/rm/refusals/verify'

describe('session-keyed rate limits', () => {
  describe('one principal, however the header is spelled', () => {
    let root: TestRoot
    before(async () => {
      root = await makeRoot({ rateLimits: true })
    })
    after(() => root.close())

    it('counts case and whitespace variants of one bearer in one bucket', async () => {
      const { token } = await signInRm(root.app, MEERA)
      const call = (authorization: string) =>
        root.app.inject({ method: 'POST', url: VERIFY, headers: { authorization } })

      for (let i = 0; i < 10; i += 1) {
        const res = await call(`Bearer ${token}`)
        assert.notEqual(res.statusCode, 429, `call ${i + 1} of the allowance`)
      }
      for (const authorization of [
        `bearer ${token}`,
        `BEARER ${token}`,
        `Bearer  ${token}`,
        `Bearer\t${token}`,
      ]) {
        const res = await call(authorization)
        assert.equal(res.statusCode, 429, JSON.stringify(authorization))
      }
    })
  })

  describe('an address that invents bearers', () => {
    let root: TestRoot
    before(async () => {
      root = await makeRoot({ rateLimits: true })
    })
    after(() => root.close())

    it('is refused at the per-address ceiling, without spending the global allowance', async () => {
      const statuses: number[] = []
      let refused: ErrorBody | null = null
      for (let i = 0; i < 125; i += 1) {
        const res = await root.app.inject({
          method: 'POST',
          url: VERIFY,
          headers: { authorization: `Bearer rm_${randomBytes(32).toString('base64url')}` },
        })
        statuses.push(res.statusCode)
        if (res.statusCode === 429) refused ??= res.json<ErrorBody>()
      }
      assert.deepEqual(new Set(statuses.slice(0, 120)), new Set([401]))
      assert.deepEqual(new Set(statuses.slice(120)), new Set([429]))
      assert.equal(refused?.code, 'RATE_LIMITED')
      assert.deepEqual(Object.keys((refused?.details ?? {}) as object).sort(), [
        'limit',
        'retryAfterMs',
      ])

      // Its own bucket: the customer app's ordinary reads from the same address still answer.
      const picker = await root.app.inject({ method: 'GET', url: '/api/v1/customers' })
      assert.equal(picker.statusCode, 200)
    })
  })
})

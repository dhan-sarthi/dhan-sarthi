/**
 * Guessing an RM's password: limited per employee number, whatever address the guesses claim,
 * and an unknown number never takes longer to refuse than a wrong password.
 *
 * The route's limit is per address, and with every proxy hop trusted the client writes the
 * address: forty guesses under rotating `X-Forwarded-For` values were all answered, and the
 * right password after them signed in. Counting failures per number holds however the address
 * is read. Only failures count, so an RM signing in and out to show book scoping is never
 * refused, and a number nobody holds is counted the same as one somebody does.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ErrorBody } from '@dhan/contracts'
import { decoyHash } from '../../src/application/rm/password.ts'
import { SIGN_IN_FAILURES } from '../../src/application/rm/sign-in-guard.ts'
import { ARJUN, MEERA, makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

describe('RM sign-in guessing', () => {
  let root: TestRoot

  before(async () => {
    root = await makeRoot()
  })
  after(() => root.close())

  const signIn = (employeeNo: string, password: string, forwardedFor?: string) =>
    root.app.inject({
      method: 'POST',
      url: '/api/v1/rm/sessions',
      payload: { employeeNo, password },
      ...(forwardedFor === undefined ? {} : { headers: { 'x-forwarded-for': forwardedFor } }),
    })

  it('has the decoy hash ready before the first unknown number arrives', () => {
    // Made lazily, the first unknown number paid a synchronous scrypt on top of the verify
    // (about 40 ms) and so stood out from a wrong password. Built with the service, it is a
    // lookup by the time a request could ask for it.
    const started = performance.now()
    decoyHash()
    assert.ok(performance.now() - started < 5, 'the decoy was made on demand, not at boot')
  })

  it('never counts a success, so switching RMs is never refused', async () => {
    for (let i = 0; i < SIGN_IN_FAILURES.max + 2; i += 1) {
      const rm = i % 2 === 0 ? MEERA : ARJUN
      const res = await signIn(rm.employeeNo, rm.password)
      assert.equal(res.statusCode, 200, res.body)
    }
  })

  it('refuses a number after ten failures, the right password included, whatever the address', async () => {
    for (let i = 0; i < SIGN_IN_FAILURES.max; i += 1) {
      const res = await signIn(MEERA.employeeNo, `wrong-${i}`, `10.0.${i}.1, 203.0.113.7`)
      assert.equal(res.statusCode, 401, `guess ${i + 1}`)
    }
    const locked = await signIn(MEERA.employeeNo, MEERA.password, '10.9.9.9')
    assert.equal(locked.statusCode, 429, locked.body)
    const body = locked.json<ErrorBody & { details?: { retryAfterMs?: number } }>()
    assert.equal(body.code, 'RATE_LIMITED')
    assert.ok((body.details?.retryAfterMs ?? 0) > 0)

    // Another RM is untouched.
    assert.equal((await signIn(ARJUN.employeeNo, ARJUN.password)).statusCode, 200)

    // The window closes and the right password works again.
    root.clock.advance(15 * 60_000)
    assert.equal((await signIn(MEERA.employeeNo, MEERA.password)).statusCode, 200)
  })

  it('lets no more than ten of a burst sent together through to the password check', async () => {
    // Counted only after the asynchronous check, all of a burst passed the test at once.
    const burst = await Promise.all(
      Array.from({ length: SIGN_IN_FAILURES.max + 5 }, (_, i) => signIn('777777', `wrong-${i}`)),
    )
    const statuses = burst.map((r) => r.statusCode)
    assert.equal(statuses.filter((s) => s === 401).length, SIGN_IN_FAILURES.max)
    assert.equal(statuses.filter((s) => s === 429).length, 5)
  })

  it('treats a number nobody holds exactly as one somebody does', async () => {
    for (let i = 0; i < SIGN_IN_FAILURES.max; i += 1) {
      assert.equal((await signIn('999999', `wrong-${i}`)).statusCode, 401)
    }
    assert.equal((await signIn('999999', 'anything')).statusCode, 429)
  })
})

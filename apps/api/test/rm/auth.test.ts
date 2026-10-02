/**
 * RM sign-in over HTTP: the right password opens the desk, anything else is the same 401, and
 * the two bearers never stand in for each other.
 *
 * The last point is the one with consequences. A customer's `ds_` bearer opens one customer and
 * an RM's `rm_` bearer opens a book of them; each kind of route refuses the other's token before
 * any store is asked, so neither can be mistaken for the other by a lookup that happens to hit.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ErrorBody, OpenApiDocument, RmMe, RmSignInResponse } from '@dhan/contracts'
import { RM_TOKEN_PREFIX, SIGN_IN_REFUSED } from '../../src/application/rm/rm-auth.service.ts'
import { verifyPassword, hashPassword } from '../../src/application/rm/password.ts'
import {
  ARJUN,
  MEERA,
  ROHAN_CIF,
  bearer,
  createSession,
  makeRoot,
  signInRm,
} from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

describe('RM passwords', () => {
  it('verifies the password a hash was made from, and nothing else', async () => {
    const stored = hashPassword('desk-204117')
    assert.match(stored, /^scrypt\$16384\$8\$1\$[\w-]+\$[\w-]+$/)
    assert.equal(await verifyPassword('desk-204117', stored), true)
    assert.equal(await verifyPassword('desk-204118', stored), false)
    assert.equal(await verifyPassword('desk-204117', 'not-a-hash'), false)
  })

  it('salts every hash, so one password never hashes the same twice', () => {
    assert.notEqual(hashPassword('same'), hashPassword('same'))
  })
})

describe('RM sign-in', () => {
  let root: TestRoot

  before(async () => {
    root = await makeRoot()
  })
  after(() => root.close())

  const signIn = (employeeNo: string, password: string) =>
    root.app.inject({
      method: 'POST',
      url: '/api/v1/rm/sessions',
      payload: { employeeNo, password },
    })

  it('signs Meera in with her demo password and returns an rm_ bearer once', async () => {
    const res = await signIn(MEERA.employeeNo, MEERA.password)
    assert.equal(res.statusCode, 200, res.body)
    const body = res.json<RmSignInResponse>()
    assert.ok(body.token.startsWith(RM_TOKEN_PREFIX))
    assert.ok(body.token.length > 40)
    assert.deepEqual(body.rm, {
      rmId: 'rm-204117',
      employeeNo: '204117',
      name: 'Meera Joshi',
      initials: 'MJ',
      desk: 'Digital Wealth Desk',
      city: 'Mumbai',
    })
    // Twelve hours from the pinned clock: a desk shift, not thirty days.
    assert.equal(body.expiresAt, '2026-09-03T21:00:00.000Z')
  })

  it('answers a wrong password and an unknown employee with the same 401', async () => {
    const wrong = await signIn(MEERA.employeeNo, 'desk-000000')
    const nobody = await signIn('999999', MEERA.password)
    for (const res of [wrong, nobody]) {
      assert.equal(res.statusCode, 401)
      const body = res.json<ErrorBody>()
      assert.equal(body.code, 'UNAUTHORIZED')
      assert.equal(body.message, SIGN_IN_REFUSED)
    }
  })

  it('refuses a malformed body before it reaches the desk', async () => {
    const res = await root.app.inject({
      method: 'POST',
      url: '/api/v1/rm/sessions',
      payload: { employeeNo: '204117' },
    })
    assert.equal(res.statusCode, 400)
  })

  it('answers /rm/me with the RM, the RM clock and the size of their book', async () => {
    const meera = await signInRm(root.app, MEERA)
    const arjun = await signInRm(root.app, ARJUN)
    const me = async (token: string): Promise<RmMe> => {
      const res = await root.app.inject({
        method: 'GET',
        url: '/api/v1/rm/me',
        headers: bearer(token),
      })
      assert.equal(res.statusCode, 200, res.body)
      return res.json<RmMe>()
    }
    const m = await me(meera.token)
    assert.equal(m.rm.name, 'Meera Joshi')
    assert.equal(m.asOf, '2026-09-01')
    assert.equal(m.bookSize, 38)
    assert.equal(m.demo, true)
    assert.equal((await me(arjun.token)).bookSize, 12)
  })

  it('refuses an RM route with no bearer, a customer bearer, or a garbled one', async () => {
    const customer = await createSession(root.app, ROHAN_CIF)
    for (const headers of [{}, bearer(customer.token), bearer('rm_not-a-real-token')]) {
      const res = await root.app.inject({ method: 'GET', url: '/api/v1/rm/me', headers })
      assert.equal(res.statusCode, 401)
      assert.equal(res.json<ErrorBody>().code, 'UNAUTHORIZED')
    }
  })

  it('refuses a customer route with an RM bearer', async () => {
    const { token } = await signInRm(root.app)
    for (const url of ['/api/v1/session', '/api/v1/view', '/api/v1/record']) {
      const res = await root.app.inject({ method: 'GET', url, headers: bearer(token) })
      assert.equal(res.statusCode, 401, url)
    }
  })

  it('signs out: 204, and the bearer is refused after', async () => {
    const { token } = await signInRm(root.app)
    const out = await root.app.inject({
      method: 'DELETE',
      url: '/api/v1/rm/sessions/current',
      headers: bearer(token),
    })
    assert.equal(out.statusCode, 204)
    const after = await root.app.inject({
      method: 'GET',
      url: '/api/v1/rm/me',
      headers: bearer(token),
    })
    assert.equal(after.statusCode, 401)
  })

  it('expires a bearer left unused past its twelve hours, and slides one in use', async () => {
    const idle = await signInRm(root.app)
    const used = await signInRm(root.app)
    const me = (token: string) =>
      root.app.inject({ method: 'GET', url: '/api/v1/rm/me', headers: bearer(token) })
    root.clock.advance(11 * 60 * 60 * 1000)
    assert.equal((await me(used.token)).statusCode, 200)
    root.clock.advance(2 * 60 * 60 * 1000)
    assert.equal((await me(idle.token)).statusCode, 401)
    assert.equal((await me(used.token)).statusCode, 200)
    root.clock.set('2026-09-03T09:00:00.000Z')
  })

  it('declares the RM bearer in the OpenAPI document', async () => {
    const res = await root.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })
    const doc = res.json<OpenApiDocument>()
    const schemes = (doc.components as { securitySchemes: Record<string, unknown> }).securitySchemes
    assert.ok(schemes.rmBearer)
    const book = doc.paths['/api/v1/rm/book'] as { get: { security?: unknown } }
    assert.deepEqual(book.get.security, [{ rmBearer: [] }])
    const signIn = doc.paths['/api/v1/rm/sessions'] as { post: { security?: unknown } }
    assert.equal(signIn.post.security, undefined)
  })
})

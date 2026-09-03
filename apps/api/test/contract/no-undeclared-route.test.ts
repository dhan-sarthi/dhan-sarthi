/**
 * The registry is the only way a route exists. Walk Fastify's route table and fail on any
 * (method, path) the registry does not declare — and on any registry row nobody registered.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ROUTES } from '@dhan/contracts'
import type { ErrorBody, OpenApiDocument } from '@dhan/contracts'
import { makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

describe('no undeclared route', () => {
  let root: TestRoot

  before(async () => {
    root = await makeRoot()
  })
  after(() => root.close())

  it('registers exactly the registry, no more and no less', () => {
    const declared = new Set(ROUTES.map((r) => `${r.method} ${r.path}`))
    // HEAD and OPTIONS are Fastify's and the CORS plugin's; neither is an API surface.
    const registered = new Set(
      [...root.app.routeTable].filter((k) => !k.startsWith('HEAD ') && !k.startsWith('OPTIONS ')),
    )

    const undeclared = [...registered].filter((k) => !declared.has(k))
    const unregistered = [...declared].filter((k) => !registered.has(k))
    assert.deepEqual(undeclared, [], 'routes registered but not in the registry')
    assert.deepEqual(unregistered, [], 'registry rows nobody registered')
    assert.equal(registered.size, 28)
  })

  it('answers an undeclared path with the declared error body', async () => {
    const res = await root.app.inject({ method: 'GET', url: '/api/v1/nope' })
    assert.equal(res.statusCode, 404)
    const body = res.json<ErrorBody>()
    assert.equal(body.code, 'NOT_FOUND')
    assert.ok(res.headers['x-request-id'])
  })

  it('serves an OpenAPI document with every registry path', async () => {
    const res = await root.app.inject({ method: 'GET', url: '/api/v1/openapi.json' })
    assert.equal(res.statusCode, 200)
    const doc = res.json<OpenApiDocument>()
    assert.equal(doc.openapi, '3.1.0')
    for (const r of ROUTES) {
      const path = r.path.replace(/:(\w+)/g, '{$1}')
      const item = doc.paths[path] as Record<string, { operationId: string }> | undefined
      assert.ok(item, path)
      assert.equal(item[r.method.toLowerCase()]?.operationId, r.id)
    }
  })

  it('keeps operator routes dark without an operator key', async () => {
    const res = await root.app.inject({ method: 'GET', url: '/api/v1/operator/seed' })
    assert.equal(res.statusCode, 404)
  })
})

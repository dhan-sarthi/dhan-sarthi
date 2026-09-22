/**
 * The registry's own invariants. Cheap, and the first thing to fail when a route is added by
 * hand in the wrong place.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { z } from 'zod'
import { ROUTES, routeById } from './registry.ts'
import { TOOLS, TOOL_LIST, jsonSchemaOf, toolJsonSchemas } from './tools/index.ts'

describe('the route registry', () => {
  it('has a unique id on every row', () => {
    const ids = ROUTES.map((r) => r.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  it('has a unique (method, path) on every row', () => {
    const keys = ROUTES.map((r) => `${r.method} ${r.path}`)
    assert.equal(new Set(keys).size, keys.length)
  })

  it('versions every path under /api/v1/', () => {
    for (const r of ROUTES) assert.ok(r.path.startsWith('/api/v1/'), r.id)
  })

  it('declares a success schema on every route', () => {
    for (const r of ROUTES) {
      const codes = Object.keys(r.response).map(Number)
      const success = codes.filter((c) => c === 200 || c === 204)
      assert.equal(success.length, 1, `${r.id} must declare exactly one of 200 or 204`)
      assert.ok(
        codes.every((c) => c >= 200 && c < 600),
        r.id,
      )
    }
  })

  it('types every path parameter it names', () => {
    for (const r of ROUTES) {
      const named = [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1])
      const params = r.request?.params
      if (named.length === 0) {
        assert.equal(params, undefined, `${r.id} declares params it does not use`)
        continue
      }
      assert.ok(params instanceof z.ZodObject, `${r.id} needs a params schema`)
      assert.deepEqual(Object.keys(params.shape).sort(), [...named].sort(), r.id)
    }
  })

  it('keeps operator routes behind the operator key and off the session bearer', () => {
    for (const r of ROUTES) {
      const isOperatorPath = r.path.startsWith('/api/v1/operator/')
      assert.equal(r.auth === 'operator', isOperatorPath, r.id)
    }
  })

  it('requires an Idempotency-Key wherever a replay would double-write', () => {
    for (const id of ['decideAction', 'startAvatarSession'] as const) {
      const r = routeById(id)
      assert.equal(r.idempotent, true, id)
      assert.ok(r.request.headers instanceof z.ZodObject)
      assert.ok('idempotency-key' in r.request.headers.shape, id)
    }
  })

  it('finds a route by id and refuses an unknown one', () => {
    assert.equal(routeById('getView').path, '/api/v1/view')
    assert.equal(routeById('getView').cache.etag, true)
    assert.throws(() => routeById('nope' as never), /no route/)
  })

  it('has the 52 routes of the API surface', () => {
    // 28 before the IDBI integration; six for the two blocks no bank endpoint carries, and
    // six for the Account Aggregator consent flow — four the app drives and two the bank
    // posts at us.
    // `/profile` holds the declared facts — income, employment, dependents, risk profile —
    // and `/holdings` holds what the customer already owns, because IDBI's catalogue has no
    // operation for either and advice cannot be given without them.
    // The forty-second is the category cap, which is a decision about the future: no bank
    // endpoint anywhere carries what somebody meant to spend. The forty-fourth is the limit
    // on everything, for the same reason — a budget is a thing a customer chooses, and no
    // statement records a choice.
    // The last seven are the savings pot and the spending challenge, which sit on the session
    // for exactly that reason: a hack that rounds every purchase up, and a ceiling somebody
    // put on their own takeaway for four weeks, are both decisions, and a bank records the
    // spending rather than the intention behind it. Three carry the pot — read it, set one
    // hack, put money in by hand — and four carry the challenge: the view, a quote for the
    // limits on offer that writes nothing at all, the start, and the surrender.
    // The fifty-second readies an avatar call before the customer taps for one: Runway bills
    // nothing until a call is handed over, so the slow part can happen while they look.
    assert.equal(ROUTES.length, 52)
  })
})

describe('the tool definitions', () => {
  // Nothing here asserts a provider's wire shape: no discriminator, no parameter flattening,
  // no webhook url. Those live with the adapter that invents them — Runway's `backend_rpc` is
  // pinned in `apps/api/test/avatar/runway-tool-body.test.ts`.
  it('serialises every tool to a definition with an object schema', () => {
    const defs = toolJsonSchemas()
    assert.deepEqual(
      defs.map((d) => d.name),
      ['check_suitability', 'query_spend', 'get_plan'],
    )
    for (const d of defs) {
      assert.equal(d.parameters['type'], 'object')
      assert.equal(d.parameters['additionalProperties'], false)
      assert.equal('$schema' in d.parameters, false)
      assert.ok(d.timeoutSeconds >= 1 && d.timeoutSeconds <= 8, d.name)
      assert.ok(d.description.length > 40, d.name)
    }
  })

  it('marks the product name required and the amount optional', () => {
    const schema = jsonSchemaOf(TOOLS.check_suitability.args)
    assert.deepEqual(schema['required'], ['product_name'])
    const properties = schema['properties'] as Record<string, unknown>
    assert.ok('monthly_amount' in properties)
  })

  it('parses arguments the model sends and rejects what it must not', () => {
    const { args, result } = TOOLS.check_suitability
    assert.equal(args.safeParse({ product_name: 'LIC ULIP', monthly_amount: 5000 }).success, true)
    assert.equal(args.safeParse({ product_name: '' }).success, false)
    assert.equal(args.safeParse({ product_name: 'x', extra: 1 }).success, false)
    assert.equal(
      result.safeParse({
        verdict: 'UNKNOWN_PRODUCT',
        product: null,
        rule_id: null,
        spoken: "I don't have that product on IDBI's shelf, so I can't check it.",
        alternative: null,
      }).success,
      true,
    )
    assert.equal(TOOL_LIST.length, 3)
  })
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ROUTES, type RouteEntry } from '@dhan/contracts'
import { ROUTE_TABLE } from './routes.generated.ts'

test('the generated route table is the registry, for every route the console can call', () => {
  const routes: readonly RouteEntry[] = ROUTES
  const expected = routes
    .filter((r) => r.auth === 'none' || r.auth === 'rm')
    .map((r) => ({
      id: r.id,
      method: r.method,
      path: r.path,
      auth: r.auth,
      ...(r.cache?.etag ? { etag: true } : {}),
    }))
  // Regenerate with `node scripts/routes-table.mjs` when this fails.
  assert.deepEqual(
    ROUTE_TABLE.map((r) => ({ ...r })),
    expected,
  )
})

test('no customer or operator route is reachable from the console', () => {
  for (const route of ROUTE_TABLE) assert.ok(route.auth === 'none' || route.auth === 'rm', route.id)
  assert.ok(ROUTE_TABLE.some((r) => r.id === 'rmCustomer'))
})

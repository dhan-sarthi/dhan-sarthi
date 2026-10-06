/**
 * The book's warm-up: with `RM_WARM` on, every customer in somebody's book is derived in the
 * background after boot, so the first Book page is a read and not six seconds of `derive`.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ALL_PERSONAS } from '@dhan/fixtures'
import { MEERA, bearer, makeRoot, signInRm } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

describe('the RM warm-up', () => {
  let root: TestRoot

  before(async () => {
    root = await makeRoot({ env: { RM_WARM: '1' } })
  })
  after(() => root.close())

  it('derives every assigned customer after boot, without a request asking', async () => {
    await root.rm.book.warmed()
    for (const p of ALL_PERSONAS) assert.ok(root.rm.book.isWarm(p.customer.cif), p.slug)
  })

  it('serves the book from the memo once warm', async () => {
    const { token } = await signInRm(root.app, MEERA)
    const started = performance.now()
    const res = await root.app.inject({
      method: 'GET',
      url: '/api/v1/rm/book',
      headers: bearer(token),
    })
    assert.equal(res.statusCode, 200)
    // Generous: a cold book is seconds; a warm one is milliseconds even on a slow runner.
    assert.ok(performance.now() - started < 1_000)
  })
})

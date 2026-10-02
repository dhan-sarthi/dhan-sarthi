/**
 * A cold book read shares the process.
 *
 * `derive` is about 120 ms of synchronous CPU a customer. The book's states used to be started
 * together, so a cold Book, Today or Insights page ran every missing customer back to back and
 * nothing else in the process, health checks, the customer app, the avatar's RPC host, ran for
 * four and a half seconds. The derives now take turns with a yield between each, so the page
 * costs the same and everything else gets in between.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { makeRoot } from '../helpers/app.ts'
import type { TestRoot } from '../helpers/app.ts'

/** Enough customers that running them back to back holds the loop for well over a second. */
const CUSTOMERS = 30
/** Generous for a loaded runner: one derive between yields, not thirty. */
const CEILING_MS = 1_000

describe('a cold book read', () => {
  let root: TestRoot

  before(async () => {
    root = await makeRoot()
  })
  after(() => root.close())

  it('lets a health check and the event loop in while it derives', async () => {
    const cifs = (await root.deps.bank.listPopulation()).slice(0, CUSTOMERS).map((c) => c.cif)

    let worstLagMs = 0
    let last = performance.now()
    const sampler = setInterval(() => {
      const now = performance.now()
      worstLagMs = Math.max(worstLagMs, now - last - 10)
      last = now
    }, 10)

    try {
      const reading = root.rm.book.states(cifs)
      // Asked for while the book is deriving; timed from the moment it was asked for.
      const asked = performance.now()
      const health = await new Promise<{ status: number; ms: number }>((resolve, reject) => {
        setTimeout(() => {
          root.app
            .inject({ method: 'GET', url: '/api/v1/health' })
            .then((res) => resolve({ status: res.statusCode, ms: performance.now() - asked }))
            .catch(reject)
        }, 20)
      })
      const states = await reading

      assert.equal(states.length, CUSTOMERS)
      assert.equal(health.status, 200)
      assert.ok(health.ms < CEILING_MS, `health answered after ${Math.round(health.ms)} ms`)
      assert.ok(worstLagMs < CEILING_MS, `the event loop stalled for ${Math.round(worstLagMs)} ms`)
    } finally {
      clearInterval(sampler)
    }
  })
})

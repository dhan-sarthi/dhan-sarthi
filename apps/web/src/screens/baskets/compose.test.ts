/**
 * The composition rules, against the real shelf.
 *
 * Three things are worth proving and none of them is about React: that a basket's rule is true of
 * every scheme in it, that the split never puts a scheme in below its own minimum, and that the
 * plan-precedence read agrees with the roadmap it is given. The first is what makes the sentence
 * on the tab honest; the second is what stops a basket placing an order the AMC would reject; the
 * third is the whole of how this surface stays out of `Plan`'s way.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PRODUCT_SHELF } from '@dhan/fixtures'
import type { Roadmap, ShelfProduct, Stage } from '@dhan/contracts'
import {
  BASKETS,
  basketFloor,
  composeBasket,
  constituentsOf,
  eligible,
  planStance,
  shapeOf,
  shareOut,
} from './compose.ts'

const SHELF: ShelfProduct[] = PRODUCT_SHELF.map((p) => ({
  ...p,
  aliases: [],
  source: 'fixture' as const,
  verified: true,
}))

const ASOF = '2026-09-01'

test('a basket never holds cover, a bundled product, or anything untradeable', () => {
  for (const spec of BASKETS) {
    for (const p of constituentsOf(spec, SHELF)) {
      assert.equal(p.insuranceProduct, undefined, `${p.productId} is an insurance product`)
      assert.equal(p.transactable, true)
      assert.notEqual(shapeOf(p), null)
    }
  }
})

test("each basket's rule is true of every scheme in it", () => {
  for (const spec of BASKETS) {
    const picks = constituentsOf(spec, SHELF)
    assert.ok(picks.length > 0, `${spec.id} composed nothing`)
    for (const p of picks) assert.ok(spec.holds(p), `${p.productId} breaks ${spec.id}`)
  }
})

test('"nothing locked" holds nothing with a lock-in and "no equity" holds no equity', () => {
  const open = BASKETS.find((b) => b.id === 'open')
  const noeq = BASKETS.find((b) => b.id === 'noeq')
  assert.ok(open && noeq)
  for (const p of constituentsOf(open, SHELF)) assert.equal(p.lockInYears, 0)
  for (const p of constituentsOf(noeq, SHELF)) assert.notEqual(shapeOf(p), 'equity')
})

test('"locked away" holds only schemes with a lock-in, shortest first', () => {
  const locked = BASKETS.find((b) => b.id === 'locked')
  assert.ok(locked)
  const picks = constituentsOf(locked, SHELF)
  assert.ok(picks.length > 1)
  for (const p of picks) assert.ok(p.lockInYears > 0, `${p.productId} is not locked`)
  const years = picks.map((p) => p.lockInYears)
  assert.deepEqual(
    years,
    [...years].sort((a, b) => a - b),
  )
})

test('the three baskets are three different sets of schemes', () => {
  const sets = BASKETS.map((b) =>
    constituentsOf(b, SHELF)
      .map((p) => p.productId)
      .join(),
  )
  assert.equal(new Set(sets).size, BASKETS.length)
})

test('within a basket the least encumbered scheme is reached for first', () => {
  const open = BASKETS.find((b) => b.id === 'open')
  assert.ok(open)
  /* Four shelf minimums tie at ₹500, so price alone put a 15-year PPF in front of a recurring
     deposit at the same money. Lock-in leads the sort now, and that is what this holds. */
  const picks = constituentsOf(open, SHELF)
  assert.ok(picks.some((p) => p.productId === 'IDBI_SSP_002'))
  assert.ok(!picks.some((p) => p.productId === 'GOI_PPF_302'))
})

test('a basket never holds two of one category', () => {
  for (const spec of BASKETS) {
    const cats = constituentsOf(spec, SHELF).map((p) => p.category)
    assert.equal(new Set(cats).size, cats.length, `${spec.id} doubled a category`)
  }
})

test('the split is equal, rounded to 100, and the remainder lands on the first line', () => {
  assert.deepEqual(shareOut(10_000, [500, 500, 500]), [3400, 3300, 3300])
  assert.deepEqual(shareOut(9_000, [500, 500, 500]), [3000, 3000, 3000])
})

test('the split refuses rather than putting a scheme in below its own minimum', () => {
  assert.equal(shareOut(1_200, [500, 500, 1000]), null)
  assert.equal(shareOut(0, [500]), null)
})

test('no line is ever below its own minimum, at any amount a basket accepts', () => {
  const floor = basketFloor(SHELF)
  for (const total of [floor, floor + 350, 20_000, 5_00_000]) {
    for (const spec of BASKETS) {
      const basket = composeBasket(spec, SHELF, { sip: total, lumpsum: 0 }, ASOF)
      for (const g of basket.groups) {
        for (const line of g.lines) {
          const p = SHELF.find((s) => s.productId === line.productId)
          assert.ok(p)
          assert.ok(line.amount >= p.minInvestment, `${line.productId} at ${line.amount}`)
        }
      }
    }
  }
})

test('the lines of a group add up to exactly what was asked for', () => {
  for (const spec of BASKETS) {
    const basket = composeBasket(spec, SHELF, { sip: 12_345, lumpsum: 40_000 }, ASOF)
    for (const g of basket.groups) {
      if (g.lines.length === 0) continue
      assert.equal(
        g.lines.reduce((n, l) => n + l.amount, 0),
        g.asked,
      )
    }
  }
})

test('an amount too small for three schemes drops schemes and says how many', () => {
  const spec = BASKETS.find((b) => b.id === 'locked')
  assert.ok(spec)
  const wide = composeBasket(spec, SHELF, { sip: 60_000, lumpsum: 0 }, ASOF)
  const tight = composeBasket(spec, SHELF, { sip: 1_000, lumpsum: 0 }, ASOF)
  const [w] = wide.groups
  const [t] = tight.groups
  assert.ok(w && t)
  assert.ok(t.lines.length < w.lines.length)
  assert.equal(t.dropped, w.lines.length - t.lines.length)
})

test('both amounts produce two groups, one per mode, in SIP-then-lump-sum order', () => {
  const spec = BASKETS[0]
  assert.ok(spec)
  const basket = composeBasket(spec, SHELF, { sip: 9_000, lumpsum: 30_000 }, ASOF)
  assert.deepEqual(
    basket.groups.map((g) => g.mode),
    ['sip', 'lumpsum'],
  )
  for (const l of basket.groups[0]?.lines ?? []) assert.ok(l.startDate !== null)
  for (const l of basket.groups[1]?.lines ?? []) assert.equal(l.startDate, null)
})

test('line ids are unique across the whole basket, so the gate can name one', () => {
  const spec = BASKETS[0]
  assert.ok(spec)
  const basket = composeBasket(spec, SHELF, { sip: 9_000, lumpsum: 30_000 }, ASOF)
  const ids = basket.groups.flatMap((g) => g.lines.map((l) => l.id))
  assert.equal(new Set(ids).size, ids.length)
})

test('the floor is the smallest amount that fills a basket above every minimum', () => {
  const floor = basketFloor(SHELF)
  assert.ok(floor > 0)
  const spec = BASKETS.find((b) => b.id === 'open')
  assert.ok(spec)
  const at = composeBasket(spec, SHELF, { sip: floor, lumpsum: 0 }, ASOF)
  assert.equal(at.groups[0]?.dropped, 0)
})

test('eligibility keeps cover and bundled products out', () => {
  const term = SHELF.find((p) => p.productId === 'LIC_TERM_201')
  const ulip = SHELF.find((p) => p.productId === 'LIC_ULIP_401')
  const index = SHELF.find((p) => p.productId === 'MF_INDEX_103')
  assert.ok(term && ulip && index)
  assert.equal(eligible(term), false)
  assert.equal(eligible(ulip), false)
  assert.equal(eligible(index), true)
})

/* ---------------------------------------------------------------- Plan precedence */

const stage = (index: number, kind: Stage['kind']): Stage => ({
  index,
  kind,
  label: kind,
  why: '',
  productId: null,
  productName: null,
  monthly: 1000,
  targetAmount: 0,
  monthsToComplete: 1,
  startsOn: ASOF,
  completesOn: ASOF,
  cadence: 'ongoing',
  verdict: null,
  isGoal: false,
})

const roadmapOf = (stages: Stage[]): Roadmap => ({ stages }) as unknown as Roadmap

test('a roadmap with no growing stage says investing is not reached yet', () => {
  const s = planStance(roadmapOf([stage(1, 'free_up'), stage(2, 'clear_debt')]))
  assert.equal(s?.kind, 'not_yet')
  assert.equal(s?.kind === 'not_yet' ? s.first.kind : null, 'free_up')
})

test('a roadmap that puts something before growing names that thing', () => {
  const s = planStance(roadmapOf([stage(1, 'get_cover'), stage(2, 'grow')]))
  assert.equal(s?.kind, 'after')
  assert.equal(s?.kind === 'after' ? s.before.kind : null, 'get_cover')
})

test('a roadmap that leads with growing says so', () => {
  const s = planStance(roadmapOf([stage(1, 'grow')]))
  assert.equal(s?.kind, 'now')
})

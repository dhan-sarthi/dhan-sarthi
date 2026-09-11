/**
 * The projection curve.
 *
 * The claim this file has to defend is the one that makes the chart honest: **the curve ends where
 * the figure says it does**. A projection chart drawn from its own arithmetic, beside a scenario
 * list drawn from the server's, is two answers to one question — and it is the sort of difference
 * that shows up in a screenshot on a compliance review rather than in a test run, unless the test
 * is written.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { band, futureValue } from '../../lib/projection.ts'
import { earnedShare, growthOf, marksFor } from './growth.ts'

/** The sentence the engine attaches to every projection. Its content is irrelevant here. */
const DISCLAIMER = 'Illustration only, on the assumed rate shown.'

const RATES = [
  { label: 'Cautious', ratePct: 6 },
  { label: 'Expected', ratePct: 10 },
  { label: 'Optimistic', ratePct: 12 },
]

const projection = band(20_000, 30, 7_20_000, RATES, 5.5, DISCLAIMER)

describe('the marks', () => {
  it('samples a long horizon once a year, ending exactly on it', () => {
    const marks = marksFor(30)
    assert.equal(marks.length, 31)
    assert.equal(marks[0], 0)
    assert.equal(marks[30], 30)
  })

  it('samples a short horizon more often, so four years is a curve and not a triangle', () => {
    assert.equal(marksFor(3).length, 5)
    assert.deepEqual(marksFor(2), [0, 0.5, 1, 1.5, 2])
  })

  it('has no marks for no horizon', () => {
    assert.deepEqual(marksFor(0), [])
    assert.deepEqual(marksFor(Number.NaN), [])
  })
})

describe('growthOf', () => {
  const g = growthOf(projection)

  it('ends every line exactly on the scenario the card prints', () => {
    for (const s of projection.scenarios) {
      assert.equal(
        futureValue(20_000, 30, s.ratePct, 7_20_000),
        s.corpus,
        `${s.label} would draw somewhere other than the figure beside it`,
      )
    }
    assert.equal(g.mid.values[g.mid.values.length - 1], projection.scenarios[1]?.corpus)
    assert.equal(g.low.values[g.low.values.length - 1], projection.scenarios[0]?.corpus)
    assert.equal(g.high.values[g.high.values.length - 1], projection.scenarios[2]?.corpus)
  })

  it('starts every line at what is already there, not at zero', () => {
    assert.equal(g.mid.values[0], 7_20_000)
    assert.equal(g.contributed[0], 7_20_000)
  })

  it('takes the band from the lowest and highest rate, whatever order they arrive in', () => {
    const shuffled = growthOf({ ...projection, scenarios: [...projection.scenarios].reverse() })
    assert.equal(shuffled.low.ratePct, 6)
    assert.equal(shuffled.high.ratePct, 12)
    assert.equal(shuffled.mid.ratePct, 10)
  })

  it('never crosses its own band', () => {
    g.mid.values.forEach((v, i) => {
      assert.ok(v >= (g.low.values[i] ?? 0), `mid below cautious at year ${g.years[i]}`)
      assert.ok(v <= (g.high.values[i] ?? 0), `mid above optimistic at year ${g.years[i]}`)
    })
  })

  it('rises the whole way, which is what makes the bend the reading', () => {
    g.mid.values.forEach((v, i) => {
      if (i > 0) assert.ok(v > (g.mid.values[i - 1] ?? 0), `flat or falling at year ${g.years[i]}`)
    })
  })

  it('keeps the money-in line under the corpus, and straight', () => {
    const steps = g.contributed.slice(1).map((v, i) => v - (g.contributed[i] ?? 0))
    const first = steps[0] ?? 0
    for (const step of steps) assert.ok(Math.abs(step - first) <= 20_000, 'contribution is level')
    assert.ok((g.contributed[30] ?? 0) < (g.mid.values[30] ?? 0))
  })

  it('scales to the top of the picture', () => {
    assert.equal(g.ceiling, Math.max(...g.high.values))
  })

  it('says how much of the corpus was never contributed', () => {
    const share = earnedShare(g)
    assert.ok(share !== null && share > 0.5 && share < 1, `${share}`)
  })

  it('draws nothing where there is nothing going in and nothing already there', () => {
    assert.equal(growthOf(band(0, 30, 0, RATES, 5.5, DISCLAIMER)).empty, true)
    assert.equal(growthOf(band(20_000, 0, 0, RATES, 5.5, DISCLAIMER)).empty, true)
    assert.equal(growthOf({ ...projection, scenarios: [] }).empty, true)
  })

  it('draws a line and no band for a single scenario', () => {
    const one = growthOf(band(20_000, 10, 0, [{ label: 'Expected', ratePct: 10 }], 5.5, DISCLAIMER))
    assert.equal(one.empty, false)
    assert.deepEqual(one.low.values, one.high.values)
    assert.equal(one.mid.ratePct, 10)
  })

  it('does not fall over on a lump sum with no monthly going in', () => {
    const lump = growthOf(band(0, 20, 10_00_000, RATES, 5.5, DISCLAIMER))
    assert.equal(lump.empty, false)
    assert.deepEqual(
      lump.contributed,
      lump.contributed.map(() => 10_00_000),
    )
  })
})

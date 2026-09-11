/**
 * The chart arithmetic, which is the half of a chart that can be wrong invisibly.
 *
 * Every case below is either a rule the family promises (colour by position, grey for Others,
 * five and no more) or a shape of data the source's own demo build got wrong (a legend summing to
 * 95 drawn as a closed ring, bar widths that do not match their printed figures).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { align, arcs, collapse, pct, ring, sector, series, type Slice } from './series.ts'

const caps: Slice[] = [
  { label: 'Large Cap', value: 60 },
  { label: 'Mid Cap', value: 20 },
  { label: 'Small Cap', value: 10 },
  { label: 'Others', value: 5 },
]

const tones = (s: Slice[], total?: number) => series(s, total).portions.map((p) => p.tone)

describe('colour is positional', () => {
  it('hands out the ramp in order and reserves the grey for Others', () => {
    assert.deepEqual(tones(caps), [1, 2, 3, 5])
  })

  it('keeps Others grey wherever it sits, without reordering the named slices', () => {
    const mixed: Slice[] = [
      { label: 'Equity', value: 40 },
      { label: 'Others', value: 10 },
      { label: 'Debt', value: 50 },
    ]
    // Others holds the grey in the middle; the two named slices take the ramp in their given
    // order, spread to 1 and 3 because a short series does not crowd the dark end.
    assert.deepEqual(tones(mixed), [1, 5, 3])
  })

  /*
   * The reason the spread exists. The ramp is one hue, so rungs separate by lightness alone and
   * neighbours sit at about 1.8:1 — fine across four slices, useless across two. Two named slices
   * are the common case for a real portfolio here, so they take the ends rather than the first
   * two rungs. These assert the arrangement; the ratios behind it are in `tokens.css`.
   */
  it('spreads a two-slice series to the ends of the ramp', () => {
    assert.deepEqual(
      tones([
        { label: 'Debt', value: 70 },
        { label: 'Hybrid', value: 30 },
      ]),
      [1, 4],
    )
  })

  it('shortens the spread when Others already holds the pale rung', () => {
    assert.deepEqual(
      tones([
        { label: 'Debt', value: 70 },
        { label: 'Hybrid', value: 25 },
        { label: 'Others', value: 5 },
      ]),
      [1, 3, 5],
    )
  })

  it('leaves three and four named slices on the plain walk, which is already the best available', () => {
    assert.deepEqual(
      tones([
        { label: 'A', value: 1 },
        { label: 'B', value: 1 },
        { label: 'C', value: 1 },
      ]),
      [1, 2, 3],
    )
    assert.deepEqual(
      tones([
        { label: 'A', value: 1 },
        { label: 'B', value: 1 },
        { label: 'C', value: 1 },
        { label: 'D', value: 1 },
      ]),
      [1, 2, 3, 4],
    )
  })

  it('uses all five when nothing is Others', () => {
    const five = [1, 2, 3, 4, 5].map((n) => ({ label: `C${n}`, value: 10 }))
    assert.deepEqual(tones(five), [1, 2, 3, 4, 5])
  })

  it('does not care what a category is called', () => {
    const a = tones([
      { label: 'Equity', value: 1 },
      { label: 'Debt', value: 1 },
    ])
    const b = tones([
      { label: 'Debt', value: 1 },
      { label: 'Equity', value: 1 },
    ])
    assert.deepEqual(a, b)
  })
})

describe('a series that does not fill its whole', () => {
  it('leaves a hole rather than restating the figures', () => {
    const s = series(caps, 100)
    assert.equal(s.whole, 100)
    assert.equal(Math.round(s.filled * 100), 95)
    assert.deepEqual(
      s.portions.map((p) => p.display),
      ['60%', '20%', '10%', '5%'],
    )
  })

  it('draws the shortfall as one idle wedge after the slices', () => {
    const drawn = arcs(series(caps, 100), 2)
    assert.equal(drawn.length, 5)
    assert.equal(drawn[4]?.tone, 'idle')
    assert.ok(Math.abs((drawn[4]?.sweep ?? 0) - (18 - 2)) < 0.01)
  })

  it('treats the sum as the whole when no total is given', () => {
    const s = series(caps)
    assert.equal(s.whole, 95)
    assert.equal(s.filled, 1)
  })

  it('never overdraws a series that sums past its total', () => {
    const s = series(
      [
        { label: 'A', value: 70 },
        { label: 'B', value: 60 },
      ],
      100,
    )
    assert.equal(s.whole, 130)
    assert.equal(s.filled, 1)
    const total = s.portions.reduce((n, p) => n + p.share, 0)
    assert.ok(Math.abs(total - 1) < 1e-9)
  })

  it('reads a negative or broken value as zero', () => {
    const s = series([
      { label: 'A', value: -5 },
      { label: 'B', value: Number.NaN },
      { label: 'C', value: 10 },
    ])
    assert.deepEqual(
      s.portions.map((p) => p.value),
      [0, 0, 10],
    )
    assert.equal(s.empty, false)
  })

  it('is empty when there is nothing, or nothing above zero', () => {
    assert.equal(series([]).empty, true)
    assert.equal(series([{ label: 'A', value: 0 }]).empty, true)
  })
})

describe('collapse', () => {
  it('leaves a series that fits alone, in the order it was given', () => {
    assert.deepEqual(collapse(caps), caps)
  })

  it('folds the tail into one Others at the end, keeping the survivors in place', () => {
    const long: Slice[] = [
      { label: 'A', value: 5 },
      { label: 'B', value: 30 },
      { label: 'C', value: 2 },
      { label: 'D', value: 25 },
      { label: 'E', value: 1 },
      { label: 'F', value: 20 },
    ]
    const out = collapse(long)
    assert.deepEqual(
      out.map((s) => s.label),
      ['A', 'B', 'D', 'F', 'Others'],
    )
    assert.equal(out[4]?.value, 3)
  })

  it('folds an existing Others in rather than making a second one', () => {
    const long: Slice[] = [
      { label: 'A', value: 30 },
      { label: 'Others', value: 4 },
      { label: 'B', value: 25 },
      { label: 'C', value: 20 },
      { label: 'D', value: 15 },
      { label: 'E', value: 1 },
    ]
    const out = collapse(long)
    assert.equal(out.filter((s) => s.label === 'Others').length, 1)
    assert.equal(out[4]?.value, 5)
    assert.deepEqual(tones(out), [1, 2, 3, 4, 5])
  })
})

describe('align', () => {
  it('leaves a matching pair exactly as it is', () => {
    const a: Slice[] = [
      { label: 'Equity', value: 85 },
      { label: 'Commodities', value: 10 },
      { label: 'Debt', value: 5 },
    ]
    const b: Slice[] = [
      { label: 'Equity', value: 75 },
      { label: 'Commodities', value: 15 },
      { label: 'Debt', value: 10 },
    ]
    const [top, bottom] = align(a, b)
    assert.deepEqual(top, a)
    assert.deepEqual(bottom, b)
  })

  it('gives a category the same colour in both charts however the second is ordered', () => {
    const a: Slice[] = [
      { label: 'Equity', value: 85 },
      { label: 'Debt', value: 15 },
    ]
    const b: Slice[] = [
      { label: 'debt', value: 40 },
      { label: 'Equity', value: 60 },
    ]
    const [top, bottom] = align(a, b)
    assert.deepEqual(
      bottom.map((s) => s.label),
      ['Equity', 'Debt'],
    )
    assert.deepEqual(tones(top), tones(bottom))
    assert.equal(bottom[1]?.value, 40)
  })

  it('keeps a category one side does not hold, as a zero', () => {
    const [top, bottom] = align([{ label: 'Gold', value: 10 }], [{ label: 'Equity', value: 90 }])
    assert.deepEqual(
      top.map((s) => [s.label, s.value]),
      [
        ['Gold', 10],
        ['Equity', 0],
      ],
    )
    assert.equal(bottom[0]?.value, 0)
  })

  it('folds the same categories on both sides when the union is too long', () => {
    const a = [1, 2, 3, 4, 5, 6].map((n) => ({ label: `C${n}`, value: n }))
    const b = [1, 2, 3, 4, 5, 6].map((n) => ({ label: `C${n}`, value: 7 - n }))
    const [top, bottom] = align(a, b)
    assert.deepEqual(
      top.map((s) => s.label),
      bottom.map((s) => s.label),
    )
    assert.equal(top.length, 5)
    assert.equal(top[4]?.label, 'Others')
  })
})

describe('arcs', () => {
  it("starts at 3 o'clock and runs clockwise", () => {
    const drawn = arcs(
      series([
        { label: 'A', value: 50 },
        { label: 'B', value: 50 },
      ]),
      2,
    )
    assert.ok((drawn[0]?.from ?? -1) >= 0 && (drawn[0]?.from ?? 0) < 2)
    assert.ok((drawn[1]?.from ?? 0) > 180)
  })

  it('never inverts a slice narrower than the gap', () => {
    const drawn = arcs(
      series(
        [
          { label: 'A', value: 999 },
          { label: 'B', value: 1 },
        ],
        1000,
      ),
      12,
    )
    for (const a of drawn) assert.ok(a.sweep > 0, `${a.key} swept ${a.sweep}`)
  })

  it('does not cut a gap into a ring that has only one region', () => {
    const drawn = arcs(series([{ label: 'A', value: 1 }]), 2)
    assert.equal(drawn.length, 1)
    assert.equal(drawn[0]?.sweep, 360)
  })

  it('draws an empty series as one full idle ring', () => {
    const drawn = arcs(series([]), 2)
    assert.deepEqual(drawn, [{ key: 'idle', tone: 'idle', from: 0, sweep: 360 }])
  })
})

describe('paths', () => {
  const finite = (d: string) => !/NaN|Infinity|undefined/.test(d)

  it('are finite for every wedge of a real series', () => {
    for (const a of arcs(series(caps, 100), 2)) {
      assert.ok(finite(sector(69, 69, 69, 34, a.from, a.sweep)), a.key)
    }
    assert.ok(finite(ring(69, 69, 69, 34)))
  })

  it('flag the long way round only past a half turn', () => {
    assert.match(sector(50, 50, 50, 25, 0, 214), /A50 50 0 1 1/)
    assert.match(sector(50, 50, 50, 25, 0, 71), /A50 50 0 0 1/)
  })
})

describe('pct', () => {
  it('trims to two decimals and drops the noise', () => {
    assert.equal(pct(0.6), '60%')
    assert.equal(pct(0.0758), '7.58%')
    assert.equal(pct(0.1928), '19.28%')
    assert.equal(pct(1 / 3), '33.33%')
    assert.equal(pct(Number.NaN), '0%')
  })
})

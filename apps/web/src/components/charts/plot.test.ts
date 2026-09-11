/**
 * The scale and the path builders, which are the half of a line chart that can be wrong in a way
 * that still looks like a chart.
 *
 * Every case here is either a rule `plot.ts` promises — a magnitude drawn from zero, a flat series
 * on the centre line, the extremes inside the box — or a shape of data that produces `NaN` in the
 * path and an empty card in the browser.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  areaPath,
  bandPath,
  bounds,
  columnHeight,
  columns,
  deltaShare,
  linePath,
  median,
  project,
  xOf,
  yOf,
  type Box,
} from './plot.ts'

const box: Box = { w: 100, h: 100, padX: 0, padY: 10 }

describe('bounds', () => {
  it('draws a magnitude from zero, however far from zero the series sits', () => {
    // 8,000 to 9,000 cropped to its own range is a mountain; from zero it is a nudge, which is
    // what a 12% month-on-month move in a spending category actually is.
    assert.deepEqual(bounds([8000, 8600, 9000]), { min: 0, max: 9000 })
  })

  it('takes the series own floor only when the caller asks for it', () => {
    assert.deepEqual(bounds([8000, 8600, 9000], 'range'), { min: 8000, max: 9000 })
  })

  it('keeps a negative low even on a zero baseline, so a refund month stays on the card', () => {
    assert.deepEqual(bounds([-500, 200, 900]), { min: -500, max: 900 })
  })

  it('pads a flat series rather than dividing by zero', () => {
    const b = bounds([5000, 5000, 5000], 'range')
    assert.equal(b.max - b.min, 2)
    assert.equal(yOf(5000, b, box), 50, 'a flat series sits on the centre line')
  })

  it('has a range for an empty series, because an empty chart still has to draw a box', () => {
    assert.deepEqual(bounds([]), { min: 0, max: 1 })
  })
})

describe('the extremes stay inside the box', () => {
  const b = bounds([0, 100])

  it('puts the top of the range on the padding, not on the edge', () => {
    assert.equal(yOf(100, b, box), 10)
    assert.equal(yOf(0, b, box), 90)
  })

  it('clamps anything outside the bounds to the edge of the box', () => {
    assert.equal(yOf(999, b, box), 10)
    assert.equal(yOf(-999, b, box), 90)
  })

  it('spreads a series from the left inset to the right inset', () => {
    assert.equal(xOf(0, 12, box), 0)
    assert.equal(xOf(11, 12, box), 100)
    assert.equal(xOf(0, 12, { ...box, padX: 4 }), 4)
    assert.equal(xOf(11, 12, { ...box, padX: 4 }), 96)
  })

  it('centres a series of one instead of pinning it to the left edge', () => {
    assert.equal(xOf(0, 1, box), 50)
  })

  it('never runs off the end when the index is out of range', () => {
    assert.equal(xOf(99, 12, box), 100)
    assert.equal(xOf(-3, 12, box), 0)
  })
})

describe('paths', () => {
  const points = project([0, 50, 100], bounds([0, 50, 100]), box)

  it('draws straight segments between the months and invents nothing in between', () => {
    assert.equal(linePath(points), 'M0 90L50 50L100 10')
  })

  it('closes the wash down to the floor and back', () => {
    assert.equal(areaPath(points, 95), 'M0 90L50 50L100 10L100 95L0 95Z')
  })

  it('will not draw a wash under a single point', () => {
    assert.equal(areaPath(points.slice(0, 1), 95), '')
    assert.equal(linePath([]), '')
  })

  it('closes the band by running the lower line back the other way', () => {
    const upper = project([100, 100], bounds([0, 100]), box)
    const lower = project([0, 50], bounds([0, 100]), box)
    assert.equal(bandPath(upper, lower), 'M0 10L100 10L100 50L0 90Z')
  })

  it('refuses a band whose two sides are different lengths', () => {
    const upper = project([1, 2, 3], bounds([0, 3]), box)
    const lower = project([1, 2], bounds([0, 3]), box)
    assert.equal(bandPath(upper, lower), '')
  })

  it('survives a series with a hole in it rather than emitting NaN into the path', () => {
    const values = [10, Number.NaN, 30]
    const path = linePath(project(values, bounds(values), box))
    assert.ok(!path.includes('NaN'), path)
  })
})

describe('the rule the line is read against', () => {
  it('is the median and not the mean, so one hospital bill does not move it', () => {
    assert.equal(median([1000, 1100, 1200, 90000]), 1150)
  })

  it('takes the middle of an odd run', () => {
    assert.equal(median([5, 1, 3]), 3)
  })

  it('is zero for nothing at all', () => {
    assert.equal(median([]), 0)
  })

  it('reports a change as a signed share of the rule', () => {
    assert.equal(deltaShare(120, 100), 0.2)
    assert.equal(deltaShare(80, 100), -0.2)
  })

  it('refuses a share of nothing rather than returning Infinity', () => {
    assert.equal(deltaShare(120, 0), null)
    assert.equal(deltaShare(Number.NaN, 100), null)
  })
})

describe('columns', () => {
  it('pitches every column the same and leaves a gap between them', () => {
    const bars = columns(4, box)
    assert.deepEqual(
      bars.map((c) => c.x),
      [4.25, 29.25, 54.25, 79.25],
    )
    for (const bar of bars) assert.equal(bar.w, 16.5)
    const lastEdge = (bars[3]?.x ?? 0) + (bars[3]?.w ?? 0)
    assert.ok(lastEdge <= 100, `${lastEdge} runs off the right edge`)
  })

  it('honours the horizontal inset', () => {
    const bars = columns(2, { ...box, padX: 10 })
    assert.equal(bars[0]?.x, 16.8)
    assert.ok((bars[1]?.x ?? 0) + (bars[1]?.w ?? 0) <= 90)
  })

  it('never lets a column get thinner than a third of its pitch', () => {
    const wide = columns(3, box, 0.95)
    assert.ok((wide[0]?.w ?? 0) >= (100 / 3) * 0.35)
  })

  it('draws nothing for no months', () => {
    assert.deepEqual(columns(0, box), [])
  })

  it('measures a column from the baseline, so twice the money is twice the bar', () => {
    const b = bounds([5000, 10_000])
    assert.equal(columnHeight(10_000, b, box), 80)
    assert.equal(columnHeight(5000, b, box), 40)
  })

  it('leaves a stub on a zero month, which is a fact and not a hole in the data', () => {
    assert.equal(columnHeight(0, bounds([0, 9000]), box), 1.5)
  })
})

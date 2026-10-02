import assert from 'node:assert/strict'
import { test } from 'node:test'
import { endLabelSide, isLabelledMonth, lineY, monthShare } from './months.ts'

test('months spread from 0 to 1, and a single month sits in the middle', () => {
  assert.equal(monthShare(0, 12), 0)
  assert.equal(monthShare(11, 12), 1)
  assert.equal(monthShare(0, 1), 0.5)
})

test('labels count back from the latest month, so it is always named', () => {
  const labelled = Array.from({ length: 12 }, (_, i) => isLabelledMonth(i, 12))
  assert.equal(labelled[11], true)
  assert.equal(labelled[10], false)
  assert.equal(labelled[0], false)
  assert.equal(labelled.filter(Boolean).length, 6)
})

test('a line spans the plot between its pads, and a flat one runs through the middle', () => {
  const y = lineY([10, 20], 100, 10)
  assert.equal(y(20), 10)
  assert.equal(y(10), 90)
  assert.equal(lineY([5, 5, 5], 80, 6)(5), 40)
})

test('an end label goes on the side the line leaves clear', () => {
  assert.equal(endLabelSide([1, 2, 3], 'first'), 'below')
  assert.equal(endLabelSide([1, 2, 3], 'last'), 'above')
  assert.equal(endLabelSide([3, 2, 1], 'first'), 'above')
  assert.equal(endLabelSide([3, 2, 1], 'last'), 'below')
  assert.equal(endLabelSide([2, 2], 'last'), 'above')
})

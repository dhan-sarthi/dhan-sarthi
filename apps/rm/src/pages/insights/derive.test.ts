import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  earliest,
  lastStep,
  latest,
  lowerFirst,
  moverBase,
  pctChange,
  shareLabel,
  sharePct,
  stepSentence,
  sum,
  toRows,
} from './derive.ts'

test('latest and earliest read the ends of a series, and null an empty one', () => {
  assert.equal(latest([3, 4, 5]), 5)
  assert.equal(earliest([3, 4, 5]), 3)
  assert.equal(latest([]), null)
  assert.equal(earliest([]), null)
})

test('a percentage change runs from the first point to the last, to one decimal', () => {
  assert.equal(pctChange([42602814, 53511319]), 25.6)
  assert.equal(pctChange([200, 150]), -25)
})

test('a change from zero, or from nothing, has no percentage', () => {
  assert.equal(pctChange([0, 4, 9]), null)
  assert.equal(pctChange([]), null)
})

test('a monthly count compares with the month before, and needs two months to', () => {
  assert.equal(lastStep([3, 9, 6]), -3)
  assert.equal(lastStep([0, 0]), 0)
  assert.equal(lastStep([4]), null)
})

test('a share of nothing is zero, never NaN', () => {
  assert.equal(sharePct(25, 100), 25)
  assert.equal(sharePct(5, 0), 0)
  assert.equal(sum([1, 2, 3.5]), 6.5)
})

test('a share label never calls a visible part 0%', () => {
  assert.equal(shareLabel(53.4), '53%')
  assert.equal(shareLabel(0.2), '<1%')
  assert.equal(shareLabel(0), '0%')
  assert.equal(shareLabel(99.6), '100%')
})

test('a mover is measured from the month-end three months before the latest', () => {
  // The same window the API's changePct uses: 89,379 at the end of May to 55,152 in August.
  const series = [
    165326, 125618, 121867, 109937, 108323, 100338, 92473, 84941, 89379, 92544, 86243, 55152,
  ]
  assert.equal(moverBase(series), 89379)
  assert.equal(Math.round(((55152 - 89379) / 89379) * 1000) / 10, -38.3)
  assert.equal(moverBase([1, 2, 3]), null)
})

test('chart rows align every series to the months and leave a missing point as a gap', () => {
  assert.deepEqual(toRows(['2026-07', '2026-08'], { a: [1, 2], b: [9] }), [
    { month: '2026-07', a: 1, b: 9 },
    { month: '2026-08', a: 2, b: null },
  ])
})

test("a month's count is said against the month before, in words with no judgement", () => {
  const refusals = [0, 1, 3, 4, 3, 2, 5, 4, 4, 3, 4, 1]
  assert.equal(stepSentence(refusals, 'Aug', 'Jul'), '1 in Aug, 3 fewer than Jul')
  assert.equal(stepSentence([2, 5], 'Aug', 'Jul'), '5 in Aug, 3 more than Jul')
  assert.equal(stepSentence([4, 4], 'Aug', 'Jul'), '4 in Aug, the same as Jul')
  assert.equal(stepSentence([4], 'Aug', null), '4 in Aug')
  assert.equal(stepSentence([], 'Aug', 'Jul'), null)
})

test('an API label reads mid-sentence with only its first letter lowered', () => {
  assert.equal(lowerFirst('As at 1 Sep 2026'), 'as at 1 Sep 2026')
  assert.equal(lowerFirst(''), '')
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decimalsOf,
  distinctLabels,
  formatInrTick,
  formatPctTick,
  niceScale,
  niceStep,
} from './scale.ts'

test('steps are 1, 2, 2.5 or 5 times a power of ten', () => {
  assert.equal(niceStep(100, 4), 25)
  assert.equal(niceStep(6e5, 4), 2e5)
  assert.equal(niceStep(0.9, 4), 0.25)
  assert.equal(niceStep(7, 4), 2)
  // Whole-number steps skip 2.5 below ten and never drop under one.
  assert.equal(niceStep(10, 4, true), 5)
  assert.equal(niceStep(1, 4, true), 1)
  assert.equal(niceStep(100, 4, true), 25)
})

test('ticks bracket the data and are evenly spaced', () => {
  const scale = niceScale([9_600_000, 9_850_000, 10_200_000])
  assert.ok(scale)
  assert.deepEqual(scale.ticks, [9_600_000, 9_800_000, 10_000_000, 10_200_000])
  assert.equal(scale.step, 200_000)

  const zero = niceScale([120, 380, 410], { zero: true, integer: true })
  assert.ok(zero)
  assert.equal(zero.ticks[0], 0)
  assert.ok((zero.ticks.at(-1) ?? 0) >= 410)
})

test('a flat series gets a band around it, and nothing to scale gives null', () => {
  const flat = niceScale([482_448, 482_448])
  assert.ok(flat)
  assert.ok(flat.ticks.length >= 2)
  assert.ok((flat.ticks[0] ?? Infinity) <= 482_448 && (flat.ticks.at(-1) ?? 0) >= 482_448)
  const zeros = niceScale([0, 0], { zero: true, integer: true })
  assert.deepEqual(zeros?.ticks, [0, 1])
  assert.equal(niceScale([]), null)
  assert.equal(niceScale([Number.NaN]), null)
})

test('rupee ticks near a unit boundary never repeat a label', () => {
  // The case from the walk: ₹0.96Cr and ₹1.02Cr both printed "₹1Cr".
  const scale = niceScale([9_600_000, 10_200_000])
  assert.ok(scale)
  const labels = scale.ticks.map(formatInrTick)
  assert.deepEqual(labels, ['₹96L', '₹98L', '₹1Cr', '₹1.02Cr'])
  assert.equal(new Set(labels).size, labels.length)

  for (const [lo, hi] of [
    [99_000, 101_000],
    [9_950_000, 10_050_000],
    [480_000, 482_000],
    [-200_000, 300_000],
    [0, 12_345],
  ] as const) {
    const s = niceScale([lo, hi], { integer: true })
    assert.ok(s)
    const text = s.ticks.map(formatInrTick)
    assert.equal(new Set(text).size, text.length, `${lo}..${hi}: ${text.join(', ')}`)
  }
})

test('rupee and percentage ticks are exact and trimmed', () => {
  assert.equal(formatInrTick(0), '₹0')
  assert.equal(formatInrTick(10_000_000), '₹1Cr')
  assert.equal(formatInrTick(10_250_000), '₹1.025Cr')
  assert.equal(formatInrTick(250_000), '₹2.5L')
  assert.equal(formatInrTick(48_000), '₹48k')
  assert.equal(formatInrTick(950), '₹950')
  assert.equal(formatInrTick(-200_000), '−₹2L')
  assert.equal(formatPctTick(62.5), '62.5%')
  assert.equal(formatPctTick(60), '60%')
  assert.equal(decimalsOf(0.25), 2)
  assert.equal(decimalsOf(40), 0)
})

test('distinct labels never repeat, even from a lossy formatter', () => {
  const labels = distinctLabels([1, 1.2, 1.4], (v) => `${Math.round(v)}`)
  assert.equal(new Set(labels).size, 3)
})

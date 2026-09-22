import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { WIDTH_SHOWN, frameFor } from './frame.ts'

const RUNWAY = 1088 / 704
const ANAM = 768 / 1152

describe('the call frame', () => {
  it('fills most of a phone from the top, a little wider than a full-screen crop', () => {
    const f = frameFor(390, 774, RUNWAY)
    assert.equal(f.fills, false)
    assert.equal(f.top, 0)
    assert.equal(f.height, Math.round(390 / (WIDTH_SHOWN * RUNWAY)))
    // About nine-tenths of the stage is him; the rest is where the call's one button sits.
    assert.ok(f.height / 774 > 0.85 && f.height < 774, `${f.height}`)
  })

  it('fills the stage with a portrait track', () => {
    assert.deepEqual(frameFor(390, 774, ANAM), { top: 0, height: 774, fills: true })
  })

  it('fills the stage when the screen is wider than the band would be tall', () => {
    assert.equal(frameFor(1280, 720, RUNWAY).fills, true)
  })

  it('never produces a frame taller than the stage, even for a nonsense aspect', () => {
    for (const aspect of [0, Number.NaN, 0.1, 10]) {
      const f = frameFor(390, 774, aspect)
      assert.ok(f.height <= 774, `aspect ${aspect}`)
    }
  })
})

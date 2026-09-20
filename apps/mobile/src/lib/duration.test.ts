import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { duration } from './duration.ts'

describe('duration', () => {
  it('names this month rather than counting it', () => {
    assert.equal(duration(1), 'This month')
  })

  it('counts months up to two years', () => {
    assert.equal(duration(2), '2 months')
    assert.equal(duration(23), '23 months')
  })

  it('rounds to years past two, because 372 months is not a number anyone holds', () => {
    assert.equal(duration(24), '2 years')
    assert.equal(duration(372), '31 years')
  })

  // The only caller guards on `monthsToComplete > 0`, so this is unreachable from the screen.
  // Pinned anyway: if that guard ever goes, the answer changes visibly rather than silently.
  it('answers 0 months for zero', () => {
    assert.equal(duration(0), '0 months')
  })
})

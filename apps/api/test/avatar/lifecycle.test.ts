/**
 * consume() is legal from `gated` and nowhere else. Everything else in the state machine
 * follows from that being a thrown error rather than a convention.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  IllegalTransition,
  Lifecycle,
  TRANSITIONS,
} from '../../src/application/avatar/lifecycle.ts'
import type { AvatarState } from '../../src/application/avatar/lifecycle.ts'

const STATES = Object.keys(TRANSITIONS) as AvatarState[]

describe('the avatar lifecycle', () => {
  it('walks the happy path in order', () => {
    const l = new Lifecycle()
    for (const next of ['creating', 'ready', 'gated', 'granted', 'live', 'ended'] as const) {
      l.to(next)
      assert.equal(l.state, next)
    }
    assert.equal(l.isTerminal, true)
  })

  it('permits consuming only from gated', () => {
    for (const state of STATES) {
      const l = new Lifecycle(state)
      if (state === 'gated') {
        assert.doesNotThrow(() => l.assertConsumable())
      } else {
        assert.throws(() => l.assertConsumable(), IllegalTransition, state)
      }
    }
  })

  it('refuses to skip the gate', () => {
    const l = new Lifecycle('ready')
    assert.throws(() => l.to('granted'), IllegalTransition)
    assert.equal(l.state, 'ready')
  })

  it('refuses to leave a terminal state', () => {
    for (const state of ['ended', 'reaped', 'failed'] as const) {
      const l = new Lifecycle(state)
      for (const next of STATES) assert.throws(() => l.to(next), IllegalTransition)
      assert.equal(l.tryTo('live'), false)
    }
  })

  it('can fail from every non-terminal state before the call is live', () => {
    for (const state of ['claimed', 'creating', 'ready', 'gated', 'granted'] as const) {
      const l = new Lifecycle(state)
      l.to('failed')
      assert.equal(l.state, 'failed')
    }
    assert.equal(new Lifecycle('live').canGo('failed'), false)
  })

  it('names the transition it refused', () => {
    try {
      new Lifecycle('claimed').to('live')
      assert.fail('should have thrown')
    } catch (err) {
      assert.ok(err instanceof IllegalTransition)
      assert.equal(err.from, 'claimed')
      assert.equal(err.to, 'live')
    }
  })
})

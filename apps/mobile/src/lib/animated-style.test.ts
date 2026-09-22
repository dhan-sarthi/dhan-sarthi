import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAnimatedStyle, liftAnimated } from './animated-style.ts'

// The shape `useAnimatedStyle` returns, as far as the check cares.
const handle = (name: string) => ({ viewDescriptors: { name }, initial: { value: {} } })

describe('isAnimatedStyle', () => {
  it('knows a handle by its viewDescriptors key', () => {
    assert.equal(isAnimatedStyle(handle('press')), true)
  })

  it('does not mistake a style for one', () => {
    assert.equal(isAnimatedStyle({ opacity: 0.5 }), false)
    assert.equal(isAnimatedStyle(null), false)
    assert.equal(isAnimatedStyle(undefined), false)
    assert.equal(isAnimatedStyle(false), false)
  })
})

describe('liftAnimated', () => {
  it("lifts Tap's press handle off the style it arrives with", () => {
    const base = { marginTop: 8 }
    const press = handle('press')
    assert.deepEqual(liftAnimated([base, press]), { plain: [base], animated: [press] })
  })

  it('keeps the plain styles in their order, so a later one still wins', () => {
    const a = { padding: 4 }
    const b = { padding: 8 }
    assert.deepEqual(liftAnimated([a, handle('x'), b]).plain, [a, b])
  })

  it('flattens nested arrays the way React Native does', () => {
    const a = { flex: 1 }
    const h = handle('fill')
    const b = { width: 10 }
    assert.deepEqual(liftAnimated([[a, [h]], b]), { plain: [a, b], animated: [h] })
  })

  it('drops what a conditional style leaves behind', () => {
    assert.deepEqual(liftAnimated([null, undefined, false, { opacity: 1 }]).plain, [{ opacity: 1 }])
  })

  it('takes a lone style or a lone handle as well as an array', () => {
    const s = { opacity: 1 }
    const h = handle('word')
    assert.deepEqual(liftAnimated(s), { plain: [s], animated: [] })
    assert.deepEqual(liftAnimated(h), { plain: [], animated: [h] })
    assert.deepEqual(liftAnimated(undefined), { plain: [], animated: [] })
  })
})

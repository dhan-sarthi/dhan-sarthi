import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PHONE_WIDEST, wantsPhoneFrame } from './phone-frame.ts'

const size = (width: number, height: number) => ({ width, height })

describe('wantsPhoneFrame', () => {
  it('frames the app on a desktop', () => {
    assert.equal(wantsPhoneFrame(size(1440, 820), size(1440, 900)), true)
  })

  it('frames it in a laptop window that is short as well as wide', () => {
    assert.equal(wantsPhoneFrame(size(1366, 620), size(1366, 768)), true)
  })

  it('frames it on a tablet, which iOS would run the app on in an iPhone-sized window anyway', () => {
    assert.equal(wantsPhoneFrame(size(820, 1180), size(820, 1180)), true)
  })

  it('leaves a phone held upright alone', () => {
    assert.equal(wantsPhoneFrame(size(390, 844), size(390, 844)), false)
  })

  // The screen reports its sides either way round depending on the browser; neither should matter.
  it('leaves a phone on its side alone, though its window is wide', () => {
    assert.equal(wantsPhoneFrame(size(844, 390), size(390, 844)), false)
    assert.equal(wantsPhoneFrame(size(844, 390), size(844, 390)), false)
  })

  it('leaves a phone asking for the desktop site alone, though its page is 980 wide', () => {
    assert.equal(wantsPhoneFrame(size(980, 1800), size(390, 844)), false)
  })

  it('leaves a desktop window already narrowed to a phone alone: it is already the phone view', () => {
    assert.equal(wantsPhoneFrame(size(420, 900), size(1920, 1080)), false)
  })

  it('frames only a window wider than the widest phone', () => {
    assert.equal(wantsPhoneFrame(size(PHONE_WIDEST, 900), size(1920, 1080)), false)
    assert.equal(wantsPhoneFrame(size(PHONE_WIDEST + 1, 900), size(1920, 1080)), true)
  })
})

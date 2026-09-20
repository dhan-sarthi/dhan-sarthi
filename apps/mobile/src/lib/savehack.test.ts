import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isEnabled, isValid, patchFor, withEnabled, type ValidityFacts } from './savehack.ts'
import type { SaveHacks } from '@dhan/contracts'

const HACKS: SaveHacks = {
  roundups: { enabled: true, toNearest: 10 },
  setForget: { enabled: true, weekly: 500 },
  smartSave: { enabled: true, level: 'normal' },
  swearJar: { enabled: true, merchant: 'Swiggy', perSpend: 50 },
  paydaySaver: { enabled: true, percent: 5 },
}

const REGULAR: ValidityFacts = {
  payday: { monthly: 90_000, stability: 'regular', nextPayDate: '2026-10-01', payDay: 1 },
}
const VARIABLE: ValidityFacts = {
  payday: { monthly: 90_000, stability: 'variable', nextPayDate: '2026-10-01', payDay: 1 },
}

describe('patchFor', () => {
  it('sends the whole branch, not just the switch', () => {
    assert.deepEqual(patchFor('swear_jar', HACKS), {
      id: 'swear_jar',
      enabled: true,
      merchant: 'Swiggy',
      perSpend: 50,
    })
  })

  it('builds the same keys in the same order for two states, so a string compare is a field compare', () => {
    const moved: SaveHacks = { ...HACKS, setForget: { enabled: true, weekly: 750 } }
    assert.equal(
      Object.keys(patchFor('set_forget', HACKS)).join(),
      Object.keys(patchFor('set_forget', moved)).join(),
    )
    assert.notEqual(
      JSON.stringify(patchFor('set_forget', HACKS)),
      JSON.stringify(patchFor('set_forget', moved)),
    )
  })

  it('carries a null merchant through rather than dropping the field', () => {
    const none: SaveHacks = { ...HACKS, swearJar: { ...HACKS.swearJar, merchant: null } }
    assert.deepEqual(patchFor('swear_jar', none), {
      id: 'swear_jar',
      enabled: true,
      merchant: null,
      perSpend: 50,
    })
  })
})

describe('isValid', () => {
  it('accepts every hack as configured above', () => {
    for (const id of ['roundups', 'set_forget', 'smart_save', 'swear_jar', 'payday_saver'] as const)
      assert.equal(isValid(id, HACKS, REGULAR), true, id)
  })

  it('lets a hack be switched off whatever its configuration says', () => {
    // The case that was broken: roundups did not short-circuit on `enabled`, so a rounding
    // step of zero left Save dead and the switch could not be turned back off.
    const off: SaveHacks = {
      roundups: { enabled: false, toNearest: 0 },
      setForget: { enabled: false, weekly: 0 },
      smartSave: { enabled: false, level: 'normal' },
      swearJar: { enabled: false, merchant: null, perSpend: 0 },
      paydaySaver: { enabled: false, percent: 0 },
    }
    for (const id of ['roundups', 'set_forget', 'smart_save', 'swear_jar', 'payday_saver'] as const)
      assert.equal(isValid(id, off, VARIABLE), true, id)
  })

  it('refuses a live hack with nothing set on it', () => {
    assert.equal(
      isValid('roundups', { ...HACKS, roundups: { enabled: true, toNearest: 0 } }, REGULAR),
      false,
    )
    assert.equal(
      isValid('set_forget', { ...HACKS, setForget: { enabled: true, weekly: 0 } }, REGULAR),
      false,
    )
    assert.equal(
      isValid(
        'swear_jar',
        { ...HACKS, swearJar: { enabled: true, merchant: null, perSpend: 50 } },
        REGULAR,
      ),
      false,
    )
    assert.equal(
      isValid(
        'swear_jar',
        { ...HACKS, swearJar: { enabled: true, merchant: 'Swiggy', perSpend: 0 } },
        REGULAR,
      ),
      false,
    )
  })

  it('refuses a live payday saver on an income with no payday to ride', () => {
    assert.equal(isValid('payday_saver', HACKS, VARIABLE), false)
    assert.equal(isValid('payday_saver', HACKS, REGULAR), true)
  })
})

describe('isEnabled / withEnabled', () => {
  it('reads and moves one switch only', () => {
    const next = withEnabled('smart_save', HACKS, false)
    assert.equal(isEnabled('smart_save', next), false)
    assert.equal(isEnabled('roundups', next), true)
    assert.equal(isEnabled('payday_saver', next), true)
  })

  it('keeps every configured value while the switch moves', () => {
    const off = withEnabled('swear_jar', HACKS, false)
    const backOn = withEnabled('swear_jar', off, true)
    assert.deepEqual(backOn.swearJar, HACKS.swearJar)
  })

  it('does not mutate what it is given', () => {
    withEnabled('roundups', HACKS, false)
    assert.equal(HACKS.roundups.enabled, true)
  })
})

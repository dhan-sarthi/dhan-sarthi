import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  HACK_GLYPH,
  HACK_NAME,
  hackToast,
  invalidReason,
  isEnabled,
  isValid,
  ordinal,
  patchFor,
  withEnabled,
  type ValidityFacts,
} from './savehack.ts'
import { rupees } from './money.ts'
import type { SaveHackId, SaveHacks } from '@dhan/contracts'

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

const IDS: readonly SaveHackId[] = [
  'roundups',
  'set_forget',
  'smart_save',
  'swear_jar',
  'payday_saver',
]

const OFF: SaveHacks = {
  roundups: { enabled: false, toNearest: 10 },
  setForget: { enabled: false, weekly: 500 },
  smartSave: { enabled: false, level: 'normal' },
  swearJar: { enabled: false, merchant: null, perSpend: 50 },
  paydaySaver: { enabled: false, percent: 5 },
}

describe('ordinal', () => {
  it('writes the day the way a person reads it', () => {
    // The payday row printed `${payDay}th`, which made the 1st of the month the "1th".
    assert.equal(ordinal(1), '1st')
    assert.equal(ordinal(2), '2nd')
    assert.equal(ordinal(3), '3rd')
    assert.equal(ordinal(4), '4th')
    assert.equal(ordinal(21), '21st')
    assert.equal(ordinal(22), '22nd')
    assert.equal(ordinal(23), '23rd')
    assert.equal(ordinal(31), '31st')
  })

  it('keeps the teens on th, including past a hundred', () => {
    assert.equal(ordinal(11), '11th')
    assert.equal(ordinal(12), '12th')
    assert.equal(ordinal(13), '13th')
    assert.equal(ordinal(111), '111th')
    assert.equal(ordinal(101), '101st')
  })
})

describe('invalidReason', () => {
  it('names what is missing from a live hack', () => {
    assert.equal(
      invalidReason('set_forget', { ...HACKS, setForget: { enabled: true, weekly: 0 } }, REGULAR),
      'Pick an amount',
    )
    assert.equal(
      invalidReason(
        'swear_jar',
        { ...HACKS, swearJar: { enabled: true, merchant: null, perSpend: 50 } },
        REGULAR,
      ),
      'Pick a place',
    )
    assert.equal(
      invalidReason(
        'payday_saver',
        { ...HACKS, paydaySaver: { enabled: true, percent: 0 } },
        REGULAR,
      ),
      'Pick how much',
    )
    assert.equal(invalidReason('payday_saver', HACKS, VARIABLE), 'Needs a steady payday')
  })

  it('has nothing to say about a hack being switched off', () => {
    const broken: SaveHacks = {
      roundups: { enabled: false, toNearest: 0 },
      setForget: { enabled: false, weekly: 0 },
      smartSave: { enabled: false, level: 'normal' },
      swearJar: { enabled: false, merchant: null, perSpend: 0 },
      paydaySaver: { enabled: false, percent: 0 },
    }
    for (const id of IDS) assert.equal(invalidReason(id, broken, VARIABLE), null, id)
  })

  it('agrees with isValid on every hack, on and off', () => {
    const cases: SaveHacks[] = [
      HACKS,
      OFF,
      { ...HACKS, swearJar: { enabled: true, merchant: 'Swiggy', perSpend: 0 } },
      { ...HACKS, roundups: { enabled: true, toNearest: 0 } },
    ]
    for (const h of cases)
      for (const facts of [REGULAR, VARIABLE])
        for (const id of IDS)
          assert.equal(isValid(id, h, facts), invalidReason(id, h, facts) === null, id)
  })
})

describe('hackToast', () => {
  it('says the hack and the figure that was agreed', () => {
    assert.equal(hackToast('roundups', HACKS, rupees, REGULAR), 'Round-ups on')
    assert.equal(hackToast('smart_save', HACKS, rupees, REGULAR), 'Smart save on')
    assert.equal(hackToast('set_forget', HACKS, rupees, REGULAR), 'Set & forget: ₹500 every Monday')
    assert.equal(hackToast('swear_jar', HACKS, rupees, REGULAR), 'Swear jar: ₹50 a spend at Swiggy')
    // 5% of a ₹90,000 salary, on the day it lands.
    assert.equal(
      hackToast('payday_saver', HACKS, rupees, REGULAR),
      'Payday saver: ₹4,500 on the 1st',
    )
  })

  it('says off when the switch went off, whatever is configured', () => {
    for (const id of IDS) assert.equal(hackToast(id, OFF, rupees, REGULAR), `${HACK_NAME[id]} off`)
  })
})

describe('HACK_GLYPH', () => {
  it('draws every hack, and the payday saver as a paycheck', () => {
    assert.equal(HACK_GLYPH.payday_saver, 'paycheck')
    assert.deepEqual(Object.keys(HACK_GLYPH).sort(), [...IDS].sort())
    assert.equal(new Set(Object.values(HACK_GLYPH)).size, IDS.length)
  })
})

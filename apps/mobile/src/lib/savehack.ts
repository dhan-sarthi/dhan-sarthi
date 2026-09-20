// The four rules the save-hack editor runs on, out of the render file.
//
// They decide what gets written to `POST /api/v1/save/hacks` and whether the Save button is
// live at all, for each of five hacks — which is a domain rule wearing a screen's clothes,
// and it was sitting in a 700-line route file where nothing could reach it. Nothing here
// knows about React.
import type { SaveHackId, SaveHackPatch, SaveHacks, SaveView } from '@dhan/contracts'

/**
 * The body of POST /api/v1/save/hacks for one hack, built whole.
 *
 * Whole rather than sparse: the wire allows `{ id, enabled }` on its own, and sending only
 * that would be right if this screen were a switch. It is not — the customer may have moved
 * the amount and left the switch alone, and a patch that omitted the amount would silently
 * discard the only thing they came here to change.
 */
export function patchFor(id: SaveHackId, h: SaveHacks): SaveHackPatch {
  switch (id) {
    case 'roundups':
      return { id, enabled: h.roundups.enabled, toNearest: h.roundups.toNearest }
    case 'set_forget':
      return { id, enabled: h.setForget.enabled, weekly: h.setForget.weekly }
    case 'smart_save':
      return { id, enabled: h.smartSave.enabled, level: h.smartSave.level }
    case 'swear_jar':
      return {
        id,
        enabled: h.swearJar.enabled,
        merchant: h.swearJar.merchant,
        perSpend: h.swearJar.perSpend,
      }
    case 'payday_saver':
      return { id, enabled: h.paydaySaver.enabled, percent: h.paydaySaver.percent }
  }
}

/** Only the part of the save view a validity question can turn on. */
export type ValidityFacts = Pick<SaveView, 'payday'>

/**
 * Whether the configuration is complete enough to send.
 *
 * A hack being turned *off* is always valid whatever its configuration says, which is why
 * every case short-circuits on `enabled`. Refusing to let someone switch off a swear jar
 * because the merchant it was watching has gone from their statement would be the screen
 * holding them to a choice they are in the middle of undoing.
 *
 * `roundups` did not short-circuit, against what this doc said and against every other
 * case: a rounding step of zero — which a customer reaches by typing into "Other" — left
 * Save dead, so the switch could not be turned back off from the screen that turned it on.
 */
export function isValid(id: SaveHackId, h: SaveHacks, facts: ValidityFacts): boolean {
  switch (id) {
    case 'roundups':
      return !h.roundups.enabled || h.roundups.toNearest > 0
    case 'set_forget':
      return !h.setForget.enabled || h.setForget.weekly > 0
    case 'smart_save':
      // Nothing to get wrong: the three levels are a closed union and the engine picks the
      // amount. On or off, it is always sendable.
      return true
    case 'swear_jar':
      return !h.swearJar.enabled || (h.swearJar.merchant !== null && h.swearJar.perSpend > 0)
    case 'payday_saver':
      return (
        !h.paydaySaver.enabled ||
        (h.paydaySaver.percent > 0 && facts.payday.stability === 'regular')
      )
  }
}

/** Whether this hack's branch is currently switched on. */
export function isEnabled(id: SaveHackId, h: SaveHacks): boolean {
  switch (id) {
    case 'roundups':
      return h.roundups.enabled
    case 'set_forget':
      return h.setForget.enabled
    case 'smart_save':
      return h.smartSave.enabled
    case 'swear_jar':
      return h.swearJar.enabled
    case 'payday_saver':
      return h.paydaySaver.enabled
  }
}

/** The same branch again, with the switch moved and every configured value left alone. */
export function withEnabled(id: SaveHackId, h: SaveHacks, enabled: boolean): SaveHacks {
  switch (id) {
    case 'roundups':
      return { ...h, roundups: { ...h.roundups, enabled } }
    case 'set_forget':
      return { ...h, setForget: { ...h.setForget, enabled } }
    case 'smart_save':
      return { ...h, smartSave: { ...h.smartSave, enabled } }
    case 'swear_jar':
      return { ...h, swearJar: { ...h.swearJar, enabled } }
    case 'payday_saver':
      return { ...h, paydaySaver: { ...h.paydaySaver, enabled } }
  }
}

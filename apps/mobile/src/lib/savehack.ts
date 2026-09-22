// The rules the save-hack editor runs on, and the words and marks it shares with the lists.
//
// They decide what gets written to `POST /api/v1/save/hacks`, whether the Save button is live,
// what the screen says when it is not, and what the toast says when it was — for each of five
// hacks, which is a domain rule wearing a screen's clothes. It sat in a 700-line route file
// where nothing could reach it, and three screens now need the same answers: the editor, the
// hacks list and the Save pane. Nothing here knows about React; the one import from the UI is a
// type, so the tests run on plain Node.
import type { GlyphName } from '~/ui/Glyph'
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
 * Why the configuration cannot be sent yet, in the words the screen shows over the dead Save
 * button — or null when it can.
 *
 * A hack being switched *off* is always sendable whatever its configuration says, so every case
 * asks `enabled` first. Refusing to let someone switch off a swear jar because the place it was
 * watching has gone from their statement would be the screen holding them to a choice they are
 * in the middle of undoing — and a Save that stayed dead with the switch on is a switch the
 * screen that turned it on cannot turn off.
 *
 * The payday case mirrors the server's own 422: a salary that does not land on a steady day
 * has no payday for the hack to ride, and the API refuses to store an instruction the account
 * cannot honour. Saying so here costs the customer a round trip less.
 */
export function invalidReason(id: SaveHackId, h: SaveHacks, facts: ValidityFacts): string | null {
  switch (id) {
    case 'roundups':
      return h.roundups.enabled && h.roundups.toNearest <= 0 ? 'Pick an amount to round to' : null
    case 'set_forget':
      return h.setForget.enabled && h.setForget.weekly <= 0 ? 'Pick an amount' : null
    case 'smart_save':
      // Nothing to get wrong: the three levels are a closed union and the engine picks the
      // amount. On or off, it is always sendable.
      return null
    case 'swear_jar':
      if (!h.swearJar.enabled) return null
      if (h.swearJar.merchant === null) return 'Pick a place'
      return h.swearJar.perSpend > 0 ? null : 'Pick an amount'
    case 'payday_saver':
      if (!h.paydaySaver.enabled) return null
      if (facts.payday.stability !== 'regular') return 'Needs a steady payday'
      return h.paydaySaver.percent > 0 ? null : 'Pick how much'
  }
}

/** Whether the configuration is complete enough to send. `invalidReason`, as a yes or no. */
export function isValid(id: SaveHackId, h: SaveHacks, facts: ValidityFacts): boolean {
  return invalidReason(id, h, facts) === null
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

/**
 * The mark each hack carries, on the list, the Save pane and the editor alike.
 *
 * Keyed by the wire id and not by the list index, so the marks cannot slide out of step with the
 * rows if the server reorders them — and a `Record` over the literal union is the only version of
 * this the compiler holds to five: a sixth hack in `SaveHackId` breaks the build until someone
 * draws it a glyph. It lived twice, in two route files that could not import from each other.
 */
export const HACK_GLYPH: Record<SaveHackId, GlyphName> = {
  roundups: 'coins',
  set_forget: 'clock',
  smart_save: 'star',
  swear_jar: 'moneybag',
  payday_saver: 'paycheck',
}

/**
 * Each hack's name in the app's own sentence case. The server's card titles are its own copy
 * ("Smart Save"); the hacks list, the editor's title and the toast that confirms a save print
 * these instead, so a hack has one name from the row to the receipt — and the editor's title has
 * to exist before the payload has arrived.
 */
export const HACK_NAME: Record<SaveHackId, string> = {
  roundups: 'Round-ups',
  set_forget: 'Set & forget',
  smart_save: 'Smart save',
  swear_jar: 'Swear jar',
  payday_saver: 'Payday saver',
}

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "111th". */
export function ordinal(n: number): string {
  const tens = Math.abs(n) % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  switch (Math.abs(n) % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/**
 * The toast a save ends on, read on the list it lands on.
 *
 * It names the hack and the figure the customer just agreed to rather than saying "Saved": the
 * list underneath shows the chip flip but not the amount, and a confirmation that repeats the
 * number is the one place they see it said back. Set & forget says Monday because that is the
 * day the engine moves it — there is no day to choose — and the payday saver prints rupees, not
 * the percentage, because the rupees are what leaves the salary.
 */
export function hackToast(
  id: SaveHackId,
  h: SaveHacks,
  format: (n: number) => string,
  facts: ValidityFacts,
): string {
  const name = HACK_NAME[id]
  if (!isEnabled(id, h)) return `${name} off`
  switch (id) {
    case 'roundups':
    case 'smart_save':
      return `${name} on`
    case 'set_forget':
      return `${name}: ${format(h.setForget.weekly)} every Monday`
    case 'swear_jar':
      return h.swearJar.merchant === null
        ? `${name}: ${format(h.swearJar.perSpend)} a spend`
        : `${name}: ${format(h.swearJar.perSpend)} a spend at ${h.swearJar.merchant}`
    case 'payday_saver':
      return `${name}: ${format(
        Math.round((facts.payday.monthly * h.paydaySaver.percent) / 100),
      )} on the ${ordinal(facts.payday.payDay)}`
  }
}

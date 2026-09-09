/**
 * Narrations are written for reconciliation, not for people. These helpers turn one into a name.
 *
 * They got harder when the generator started emitting the forms the real rails produce. A line
 * is no longer `UPI/SWIGGY/412683940281` with the merchant in a predictable position: it is
 * `UPI/DR/824112340987/SWIGGY/ICIC/swiggy.rzp@icici/ORDER`, or a masked PAN followed by a
 * merchant and a city, or a NACH creditor followed by a twenty-character mandate reference and a
 * date. Reading the second field of whatever arrived put "Dr", "Bil" and "Hdfcn262130004411" on
 * the screen.
 *
 * So the reference numbers come off first — `seriesKey` in `@dhan/core` already knows exactly
 * which parts of a narration are variable, and reusing it means the display and the recurring
 * detector cannot disagree about what a line is — and then the first part that is a name rather
 * than a rail wins.
 */
import { seriesKey } from '@dhan/core'
import type { Transaction } from '@dhan/contracts'

/** Tokens that identify the rail rather than the counterparty. */
const RAIL: ReadonlySet<string> = new Set([
  'UPI',
  'POS',
  'ECOM',
  'NEFT',
  'IMPS',
  'ACH',
  'ATW',
  'CDM',
  'NFS',
  'BIL',
  'BBPS',
  'P2A',
  'P2P',
  'AUTOPAY',
  'CASH',
  'WDL',
  'DEP',
  /*
   * Not rails, but not counterparties either. IDBI's own sandbox statement narrates every line
   * as `S1 TXN 20`, and the first rule below happily read "Txn" out of that and printed it as a
   * merchant name twenty times down the screen. A word that means "a transaction" is not the
   * name of who was paid.
   */
  'TXN',
  'TRF',
  'TRANSFER',
  'MISC',
])

/**
 * The lines the bank writes itself, which have no counterparty at all.
 *
 * A customer looking at "Sb Int Cr 01" learns nothing. Longest prefix first, so a specific
 * charge beats the general one.
 */
const BANK_LINES: readonly [string, string][] = [
  ['SB INT CR', 'Savings interest'],
  ['SMS ALERT CHGS', 'SMS alert charges'],
  ['MIN BAL CHGS', 'Minimum balance charge'],
  ['NACH RETURN CHGS', 'Mandate return charge'],
  ['GST @18%', 'GST on charges'],
  ['CREDITCARD PAYMENT', 'Credit card payment'],
  ['NFS/CASH WDL', 'Cash withdrawal'],
  ['ATW/ATM CASH', 'Cash withdrawal'],
  ['CDM/CASH DEP', 'Cash deposit'],
]

const titleCase = (text: string): string =>
  text
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

/**
 * The counterparty in a narration, or null when there is not one.
 *
 * Null is the important half. IDBI's own statement carries no narration worth the name — every
 * line is `S1 TXN <n>` — and a function that must return a string turns that into a screen of
 * identical merchants called "Txn", which looks like a bug in us rather than a gap in the feed.
 */
export function narratedName(narration: string): string | null {
  const upper = narration.toUpperCase()
  for (const [prefix, label] of BANK_LINES) {
    if (upper.startsWith(prefix)) return label
  }

  // References, dates, masked PANs and mandate ids are gone after this; what is left is the rail
  // and the counterparty.
  const stripped = seriesKey(narration)
  const parts = (stripped.includes('/') ? stripped.split('/') : stripped.split(' ')).map((p) =>
    p.trim(),
  )

  const named = parts.find((p) => p.length > 2 && !RAIL.has(p) && !p.includes('@'))
  return named === undefined ? null : titleCase(named)
}

/**
 * `UPI/DR/824112340987/SWIGGY/ICIC/swiggy.rzp@icici/ORDER` reads as "Swiggy" to a person.
 *
 * Falls back to the whole line, which is what the callers that have nowhere else to go want.
 */
export function prettyMerchant(narration: string): string {
  return narratedName(narration) ?? titleCase(narration)
}

/**
 * What to call this transaction on screen.
 *
 * The bank's own merchant name where it sent one, because that is the acquirer's registered
 * name and it beats anything recovered from a narration; the narration otherwise, which is the
 * usual case since the name arrives on every card line and only some UPI lines; and the
 * direction of the money when the line names nobody at all.
 */
export function merchantOf(txn: Transaction): string {
  return (
    txn.merchantName ??
    narratedName(txn.narration) ??
    // Nothing in the line names anybody. The direction is the only true thing left to say.
    (txn.txnType === 'CREDIT' ? 'Money in' : 'Money out')
  )
}

/** Whether anything on the row actually names a counterparty. Drives the note above the list. */
export function isNamed(txn: Transaction): boolean {
  return txn.merchantName !== undefined || narratedName(txn.narration) !== null
}

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

/** `UPI/DR/824112340987/SWIGGY/ICIC/swiggy.rzp@icici/ORDER` reads as "Swiggy" to a person. */
export function prettyMerchant(narration: string): string {
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
  return titleCase(named ?? parts[0] ?? narration)
}

/**
 * What to call this transaction on screen.
 *
 * The bank's own merchant name where it sent one — that is the acquirer's registered name, and
 * it beats anything recovered from a narration — and the narration otherwise. It arrives on
 * every card line and on only some UPI lines, which is why the fallback still has to be good.
 */
export function merchantOf(txn: Transaction): string {
  return txn.merchantName ?? prettyMerchant(txn.narration)
}

// Narrations are written for reconciliation, not for people.
//
// This started as the web app's `lib/merchant.ts`, which had already been through the forms
// the real rails produce; that copy went with `apps/web` on 20 September 2026
// (docs/architecture/adr/ADR-0001.md) and this is the only one left. `merchant.test.ts`
// beside it is what holds it now. It leans on `seriesKey` from the engine to strip the
// variable parts — references, dates, masked PANs, mandate ids — so that what the row
// says and what the recurring detector thinks a line is can never disagree.
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
  // Not rails, but not counterparties either. IDBI's sandbox narrates every line as
  // `S1 TXN 20`, and a word meaning "a transaction" is not the name of who was paid.
  'TXN',
  'TRF',
  'TRANSFER',
  'MISC',
  // Direction and role words: the plumbing of a payment, where its counterparty should be.
  'OUTWARD',
  'INWARD',
  'SENDER',
  'RECEIVER',
  'REMITTER',
  'BENEFICIARY',
  'PAYER',
  'PAYEE',
])

/**
 * The counterparty's bank, named by the first four characters of its IFSC.
 *
 * Position is what identifies it, not shape. The UPI grammar is
 * `UPI/DR/<ref>/<MERCHANT>/<BANK>/<vpa@bank>/<PURPOSE>`, so the bank code is the field
 * immediately before the VPA — and nothing else is. Testing shape alone (four capitals)
 * also swallows every four-letter merchant: UBER, ZARA, IKEA, OYO2 and BATA all vanished
 * and came back as "Money out". The web app carried the same test with the same bug and was
 * frozen, so it was never fixed there; that copy has since been deleted, which leaves this
 * the only implementation and this the fix (docs/slices/02-spend.md, "Bugs found and fixed").
 */
const isBankCode = (token: string, index: number, parts: readonly string[]): boolean =>
  /^[A-Z]{4}$/.test(token) && (parts[index + 1]?.includes('@') ?? false)

/** The lines the bank writes itself, which have no counterparty at all. Longest prefix first. */
const BANK_LINES: ReadonlyArray<readonly [string, string]> = [
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
 * Null is the important half: a function that must return a string turns a feed with no
 * real narration into a screen of identical merchants, which looks like our bug rather
 * than a gap in the data.
 */
export function narratedName(narration: string): string | null {
  const upper = narration.toUpperCase()
  for (const [prefix, label] of BANK_LINES) {
    if (upper.startsWith(prefix)) return label
  }

  const stripped = seriesKey(narration)
  const parts = (stripped.includes('/') ? stripped.split('/') : stripped.split(' ')).map((p) =>
    p.trim(),
  )
  const named = parts.find(
    (p, i) => p.length > 2 && !RAIL.has(p) && !p.includes('@') && !isBankCode(p, i, parts),
  )
  return named === undefined ? null : titleCase(named)
}

/** What to call this transaction on screen. The direction of the money is the last resort. */
export function merchantOf(txn: Pick<Transaction, 'narration' | 'txnType'>): string {
  return narratedName(txn.narration) ?? (txn.txnType === 'CREDIT' ? 'Money in' : 'Money out')
}

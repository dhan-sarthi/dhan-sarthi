// Narrations are written for reconciliation, not for people.
//
// This started as the web app's `lib/merchant.ts`, which had already been through the forms
// the real rails produce; that copy went with `apps/web` on 20 September 2026
// (docs/architecture/adr/ADR-0001.md) and this is the only one left. `merchant.test.ts`
// beside it is what holds it now. It leans on `seriesKey` from the engine to strip the
// variable parts — references, dates, masked PANs, mandate ids — so that what the row
// says and what the recurring detector thinks a line is can never disagree.
//
// The name is read in one place for every surface that shows a line — the row, the detail
// sheet, the question handed to Uday — so a merchant cannot be "Pizza Hut" in the list and
// "Pizza" in the sheet that opens from it.
import { seriesKey } from '@dhan/core'
import type { SpendCategory, Transaction } from '@dhan/contracts'

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

/**
 * Names the rails write in capitals because they are initials. Title-casing them turned IDBI's
 * own EMI line into "Idbi Bank Retail Assets", in IDBI's own app, and the train ticket into
 * "Irctc". The state utilities and schemes are the ones these feeds actually carry.
 */
const INITIALS: ReadonlySet<string> = new Set([
  'IDBI',
  'HDFC',
  'ICICI',
  'SBI',
  'LIC',
  'NPCI',
  'NACH',
  'IRCTC',
  'PPF',
  'KSEB',
  'MSEDCL',
  'MPPKVVCL',
  'MSRTC',
  'MNGL',
  'IOAGPL',
  'PMSBY',
  'PMJJBY',
])

/**
 * The legal form a company's name ends in. Nobody calls their employer "Northwind Systems India
 * Pvt Ltd", and the row, at two lines, cut it to "Northwind Systems India P…". The sheet's "On
 * your statement" line still carries the narration whole.
 */
const LEGAL_FORM: ReadonlySet<string> = new Set(['PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP'])

const titleCase = (text: string): string =>
  text
    .split(' ')
    .filter(Boolean)
    .map((w, i) => {
      const upper = w.toUpperCase()
      if (INITIALS.has(upper)) return upper
      // "LIC of India", not "LIC Of India".
      if (i > 0 && upper === 'OF') return 'of'
      return upper.charAt(0) + w.slice(1).toLowerCase()
    })
    .join(' ')

/** The name without the legal form it ends in, and never cut down to nothing. */
function withoutLegalForm(name: string): string {
  const words = name.split(' ').filter(Boolean)
  const last = (): string => (words[words.length - 1] ?? '').replace(/\.$/, '').toUpperCase()
  while (words.length > 1 && LEGAL_FORM.has(last())) words.pop()
  return words.join(' ')
}

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
  return named === undefined ? null : titleCase(withoutLegalForm(named))
}

/**
 * What to call this transaction on screen.
 *
 * The bank's own merchant name first, where the line carries one. The acquirer names every card
 * line, and its "Pizza Hut" beats "Pizza", the first word `POS 4XXX PIZZA HUT PUNE` offers up.
 * The narration next, for the UPI and NEFT lines that arrive without a name. The direction of
 * the money is the last resort.
 */
export function merchantOf(
  txn: Pick<Transaction, 'narration' | 'txnType'> & { merchantName?: string | undefined },
): string {
  const named = txn.merchantName?.trim()
  if (named) return named
  return narratedName(txn.narration) ?? (txn.txnType === 'CREDIT' ? 'Money in' : 'Money out')
}

/**
 * The categories a spending limit cannot hold.
 *
 * The engine's six that are never discretionary — investing, insurance, school fees, EMIs, bank
 * charges and income — and three more a limit would only insult: rent and bills, which are owed
 * before the month starts; transfers, the one line whose purpose the bank genuinely does not
 * know; and health, which nobody should be told to spend less on. The engine keeps its own
 * copies (`derive.ts`, `challenge.ts`) for its own questions; this one answers only "may this
 * line offer 'Set a limit for…'", and a limit offered on an EMI or a SIP is a button that leads
 * to a screen with no row for it.
 */
export const NON_DISCRETIONARY: ReadonlySet<SpendCategory> = new Set<SpendCategory>([
  'Income',
  'Investment',
  'Insurance',
  'Education',
  'Loan EMI',
  'Fees & charges',
  'Rent & bills',
  'Transfers',
  'Health',
])

/** Spending the customer chooses again each month, and so the only kind a limit can steer. */
export const isDiscretionary = (category: SpendCategory): boolean =>
  !NON_DISCRETIONARY.has(category)

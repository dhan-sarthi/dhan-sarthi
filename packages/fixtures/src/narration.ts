/**
 * Statement narrations, one builder per payment rail.
 *
 * A narration is the only field on an Indian statement that is written by the rail rather than
 * by the bank's UI, which is why it is the thing a banker reads first and the thing that gives a
 * synthetic ledger away fastest. `UPI/SWIGGY/412683940281` — what this generator used to emit —
 * is not a form any switch produces: NPCI's line carries a direction, a retrieval reference
 * number, the payee, the payee's bank, the VPA and the remark, and a real statement carries all
 * six.
 *
 * Every builder here is a form quoted in `docs/engineering/data-calibration.md` with a verbatim
 * example beside it. Where no IDBI line could be obtained, the NPCI form with `IBKL` in the bank
 * position is the defensible default and is marked as an inference in that document.
 *
 * The reference numbers are shaped, not random. An RRN is the last digit of the year, the
 * three-digit day of the year and an eight-digit switch trace; a NEFT UTR is the remitting
 * bank's four letters, a channel letter, the year, the day of the year and a sequence. Getting
 * the shape right costs nothing and it is the second thing anybody checks.
 */
import { dayOfYear, ymd } from './calendar.ts'
import type { Rng } from './random.ts'

/* ------------------------------------------------------------------ *
 * Reference numbers
 * ------------------------------------------------------------------ */

const digits = (r: Rng, n: number): string => {
  let out = ''
  for (let i = 0; i < n; i += 1) out += String(r.int(0, 9))
  return out
}

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const alnum = (r: Rng, n: number): string => {
  let out = ''
  for (let i = 0; i < n; i += 1) out += ALNUM.charAt(r.int(0, ALNUM.length - 1))
  return out
}

/**
 * A 12-digit UPI/IMPS retrieval reference number.
 *
 * NPCI's documented composition: the last digit of the year, the day of the year, then an
 * eight-digit switch trace. So an RRN carries its own date, and a reviewer who decomposes one
 * finds the transaction's date staring back — which is exactly why a bare random twelve digits
 * would not survive being looked at.
 */
export function rrn(r: Rng, date: string): string {
  const { year } = ymd(date)
  return `${String(year % 10)}${String(dayOfYear(date)).padStart(3, '0')}${digits(r, 8)}`
}

/** A 16-character NEFT UTR: bank, channel letter, year, day of year, sequence. */
export function neftUtr(r: Rng, bank4: string, date: string): string {
  const { year } = ymd(date)
  const yy = String(year % 100).padStart(2, '0')
  const ddd = String(dayOfYear(date)).padStart(3, '0')
  return `${bank4}N${yy}${ddd}${digits(r, 6)}`
}

/** A 20-character NACH unique mandate reference. Stable per mandate, not per debit. */
export function umrn(r: Rng, bank4: string): string {
  return `${bank4}${alnum(r, 16)}`
}

/** An ATM's own identifier, as it is printed on an NFS line. */
export function atmId(r: Rng, bank4: string): string {
  return `${bank4.slice(0, 4)}${digits(r, 4)}`
}

/** The reference a card-bill payment carries back to the card system. */
export function cardPaymentRef(r: Rng): string {
  return alnum(r, 13)
}

/* ------------------------------------------------------------------ *
 * Dates, as the rails print them
 * ------------------------------------------------------------------ */

/** `07-09-2026`. The form NACH puts on a mandate line. */
export const ddmmyyyy = (iso: string): string => {
  const { year, month, day } = ymd(iso)
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`
}

/** `05-04-26`. The form the NFS ATM switch puts on a withdrawal. */
export const ddmmyy = (iso: string): string => {
  const { year, month, day } = ymd(iso)
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${String(year % 100).padStart(2, '0')}`
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** `AUG 2026`. What a salary credit names as its pay period. */
export const monthYear = (iso: string): string => {
  const { year, month } = ymd(iso)
  return `${MONTHS[month - 1] ?? 'JAN'} ${year}`
}

/* ------------------------------------------------------------------ *
 * UPI
 * ------------------------------------------------------------------ */

export interface UpiLine {
  date: string
  /** The name the payee registered with their PSP, uppercased by the switch. */
  payee: string
  /** The payee's bank, four letters. */
  bank4: string
  /** `brand.rzp@icici`, `9812345678@ybl`. Lower case, as the handle is registered. */
  vpa: string
  /** The remark the payer's app attached. Short — the field is narrow. */
  remark: string
}

/**
 * `UPI/DR/800412179072/SWIGGY/ICIC/swiggy.rzp@icici/ORDER`
 *
 * The direction token is the first thing a parser reads and the first thing our own enrichment
 * has to survive: `DR` and `CR` sit where a merchant name used to, so anything matching on
 * position rather than on content breaks here, on purpose.
 */
export function upiDebit(r: Rng, line: UpiLine): string {
  return `UPI/DR/${rrn(r, line.date)}/${line.payee.toUpperCase()}/${line.bank4}/${line.vpa}/${line.remark.toUpperCase()}`
}

/** `UPI/CR/800412179072/RAMESH TRADERS/HDFC/ramesh@okhdfcbank/SHOP SALE` */
export function upiCredit(r: Rng, line: UpiLine): string {
  return `UPI/CR/${rrn(r, line.date)}/${line.payee.toUpperCase()}/${line.bank4}/${line.vpa}/${line.remark.toUpperCase()}`
}

/* ------------------------------------------------------------------ *
 * IMPS and NEFT
 * ------------------------------------------------------------------ */

/**
 * `IMPS/P2A/626181509069/SUDHIR PATEL/HDFC0000123/RENT`
 *
 * Account-to-account, so the line carries the beneficiary's full eleven-character IFSC rather
 * than a four-letter bank code. Rent, family support and school fees move on this rail.
 */
export function impsDebit(
  r: Rng,
  line: { date: string; beneficiary: string; ifsc: string; remark: string },
): string {
  return `IMPS/P2A/${rrn(r, line.date)}/${line.beneficiary.toUpperCase()}/${line.ifsc}/${line.remark.toUpperCase()}`
}

/**
 * `NEFT/HDFCN262440001234/ACME TECHNOLOGIES PVT LTD/HDFC0000123/SALARY AUG 2026`
 *
 * The remitter is the **employer's** bank, never IDBI: an inward NEFT is stamped by the bank
 * that sent it. The line this replaced carried `IDIB000M###`, which is Indian Bank's prefix and
 * was wrong twice over — wrong bank, and the receiving bank's code on an inward credit.
 */
export function neftSalary(r: Rng, line: { date: string; employer: string; ifsc: string }): string {
  const bank4 = line.ifsc.slice(0, 4)
  return `NEFT/${neftUtr(r, bank4, line.date)}/${line.employer.toUpperCase()}/${line.ifsc}/SALARY ${monthYear(line.date)}`
}

/** `NEFT/HDFCN262440001234/RAZORPAY SOFTWARE PVT LTD/HDFC0000060/SETTLEMENT` */
export function neftSettlement(
  r: Rng,
  line: { date: string; remitter: string; ifsc: string },
): string {
  const bank4 = line.ifsc.slice(0, 4)
  return `NEFT/${neftUtr(r, bank4, line.date)}/${line.remitter.toUpperCase()}/${line.ifsc}/SETTLEMENT`
}

/* ------------------------------------------------------------------ *
 * NACH mandates
 * ------------------------------------------------------------------ */

/**
 * `ACH-DR-IDBI BANK-IBKLA1B2C3D4E5F6G7H8-07-09-2026`
 *
 * A loan instalment presented against a signed mandate. The date is the presentation date, so
 * it moves every month — which is precisely why `seriesKey` in `@dhan/core` has to strip dates
 * before grouping, and why leaving it in would have hidden every EMI from recurring detection.
 */
export function achLoan(line: { lender: string; mandateRef: string; date: string }): string {
  return `ACH-DR-${line.lender.toUpperCase()}-${line.mandateRef}-${ddmmyyyy(line.date)}`
}

/**
 * `ACH-DR-INDIAN CLEARING CORP-IBKLA1B2C3D4E5F6G7H8-05-09-2026`
 *
 * A mutual-fund SIP does not debit in the fund's name: the mandate is held by the exchange's
 * clearing corporation, and the scheme appears nowhere on the line. That is a genuinely hard
 * case for enrichment and the reason this form is worth generating rather than a tidy
 * `ACH-D/AXIS MUTUAL FUND/SIP`.
 */
export function achSip(line: { clearer: string; mandateRef: string; date: string }): string {
  return `ACH-DR-${line.clearer}-${line.mandateRef}-${ddmmyyyy(line.date)}`
}

/** `ACH/D/PMJJBY LIC OF INDIA/PREMIUM/500110042882` — a premium collected by direct debit. */
export function achPremium(line: { insurer: string; reference: string }): string {
  return `ACH/D/${line.insurer.toUpperCase()}/PREMIUM/${line.reference}`
}

/** `SI/NETFLIX/AUTOPAY` — the shape a forgotten subscription hides in. */
export const siAutopay = (merchant: string): string => `SI/${merchant.toUpperCase()}/AUTOPAY`

/* ------------------------------------------------------------------ *
 * Bill payments
 * ------------------------------------------------------------------ */

/**
 * `BIL/BBPS/MPPKVVCL/1408123456/BBPS0026734512`
 *
 * The biller, the customer's consumer number with that biller, and the BBPS reference. The
 * consumer number is the field that makes a bill a bill: it is stable across months while the
 * amount is not, which is exactly the pattern recurring detection has to tell apart from a
 * subscription.
 */
export function bbps(r: Rng, line: { biller: string; consumerNo: string }): string {
  return `BIL/BBPS/${line.biller.toUpperCase()}/${line.consumerNo}/BBPS${digits(r, 10)}`
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

/**
 * `POS 4XXXXXXXXXXX7412 DMART INDORE`
 *
 * The masked PAN, the merchant as the acquirer registered it, and the city. Card lines are the
 * only ones that carry an MCC on the real rails.
 */
export function pos(line: { cardLast4: string; merchant: string; city: string }): string {
  return `POS 4XXXXXXXXXXX${line.cardLast4} ${line.merchant.toUpperCase()} ${line.city.toUpperCase()}`
}

/** `ECOM 4XXXXXXXXXXX7412 AMAZON PAY INDIA` — card-not-present, so no city. */
export function ecom(line: { cardLast4: string; merchant: string }): string {
  return `ECOM 4XXXXXXXXXXX${line.cardLast4} ${line.merchant.toUpperCase()}`
}

/**
 * `CreditCard Payment XX 1184 Ref#O2S96OJ4SZUMI8`
 *
 * A card bill is **not** an EMI and must not be generated as one. It is a variable payment the
 * customer chooses the size of, somewhere between the minimum due and the full balance, and
 * that variability is the whole reason a revolving balance never clears.
 */
export function creditCardPayment(r: Rng, cardLast4: string): string {
  return `CreditCard Payment XX ${cardLast4} Ref#${cardPaymentRef(r)}`
}

/* ------------------------------------------------------------------ *
 * Cash
 * ------------------------------------------------------------------ */

/**
 * `NFS/CASH WDL/609519430140/HDFC1774/VIJAY NAGAR/05-04-26`
 *
 * A withdrawal at somebody else's ATM, routed through NPCI's National Financial Switch. The
 * acquiring bank's terminal and the locality are both on the line, which is how a statement
 * tells you where its holder was standing.
 */
export function nfsCashWithdrawal(
  r: Rng,
  line: { date: string; acquirerBank4: string; locality: string },
): string {
  return `NFS/CASH WDL/${rrn(r, line.date)}/${atmId(r, line.acquirerBank4)}/${line.locality.toUpperCase()}/${ddmmyy(line.date)}`
}

/** `ATW/ATM CASH/IDBI ATM VIJAY NAGAR/500110038440` — the bank's own ATM, its own form. */
export function idbiCashWithdrawal(r: Rng, locality: string): string {
  return `ATW/ATM CASH/IDBI ATM ${locality.toUpperCase()}/${digits(r, 12)}`
}

/** `CDM/CASH DEP/SITABULDI/500110038440` — a shop's takings, banked at a deposit machine. */
export function cashDeposit(r: Rng, locality: string): string {
  return `CDM/CASH DEP/${locality.toUpperCase()}/${digits(r, 12)}`
}

/* ------------------------------------------------------------------ *
 * Lines the bank writes itself
 * ------------------------------------------------------------------ */

/** `SB INT CR 01-07-2026 TO 30-09-2026` — the quarterly savings interest credit. */
export function savingsInterest(from: string, to: string): string {
  return `SB INT CR ${ddmmyyyy(from)} TO ${ddmmyyyy(to)}`
}

/** `SMS ALERT CHGS 152 MSG 30-09-2026` — billed on the count, at the end of the quarter. */
export function smsAlertCharge(messages: number, on: string): string {
  return `SMS ALERT CHGS ${messages} MSG ${ddmmyyyy(on)}`
}

/** `MIN BAL CHGS AUG 2026` — the month that fell short, not the month it was collected. */
export function minBalanceCharge(forMonth: string): string {
  return `MIN BAL CHGS ${monthYear(forMonth)}`
}

/** `NACH RETURN CHGS 15-05-2026` — levied when a mandate is presented and comes back unpaid. */
export function nachReturnCharge(on: string): string {
  return `NACH RETURN CHGS ${ddmmyyyy(on)}`
}

/**
 * `GST @18% ON SMS ALERT CHGS 30-09-2026`
 *
 * Its own line, always. IDBI's schedule of fees says "charges are exclusive of GST", so a
 * statement shows the fee and the tax separately — and a ledger that folds them together is one
 * a reviewer can spot without adding anything up.
 */
export function gstOn(what: string, on: string): string {
  return `GST @18% ON ${what.toUpperCase()} ${ddmmyyyy(on)}`
}

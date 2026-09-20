/**
 * The lines the bank writes, rather than the customer.
 *
 * Every real savings statement carries them and this generator carried none: a quarterly
 * interest credit, an SMS alert charge with its GST on a separate line, a minimum-balance charge
 * in the months the account ran thin, the two government micro-covers auto-debited each May, and
 * a return charge when a mandate is presented against an empty account. They are small — an
 * interest credit is four figures at most — but their *absence* is not small. A twenty-four
 * month statement with no interest line on it is not a bank statement.
 *
 * Two properties this module has to hold.
 *
 * **It computes from balances, so it runs second.** Interest is the daily product of the closing
 * balance and a minimum-balance charge is a monthly average, so neither can be known until the
 * behavioural ledger exists. The caller seals the behavioural drafts first and hands the rows
 * in. The bank does exactly the same thing, one quarter in arrears.
 *
 * **It is a function of the persona and the anchor, never of the caller's window.** The balances
 * it reads always start at the persona's own ledger start, so the interest credited in March is
 * the same number whether the ledger was generated as history or revealed live by the clock.
 * Compute it from a caller's window instead and advancing the clock silently rewrites the
 * interest a customer already read.
 */
import type { SpendCategory, TxnMode } from '@dhan/core'
import { addDays, addMonths, daysInMonth, fromYmd, monthKey, ymd } from './calendar.ts'
import {
  BANK_CHARGES,
  GOVT_COVER,
  INTEREST_DAY_COUNT,
  SAVINGS_INTEREST_SLABS,
} from './calibration.ts'
import {
  achPremium,
  gstOn,
  minBalanceCharge,
  nachReturnCharge,
  savingsInterest,
  smsAlertCharge,
} from './narration.ts'

/** One row of the sealed behavioural ledger, which is all this module needs to read. */
export interface LedgerRow {
  date: string
  amount: number
  type: 'CREDIT' | 'DEBIT'
}

/** The shape `generate.ts` collects. Kept structural so the two files share no runtime import. */
export interface BankDraft {
  date: string
  valueDate: string
  amount: number
  type: 'CREDIT' | 'DEBIT'
  mode: TxnMode
  narration: string
  category: SpendCategory
  isSalaryCredit: boolean
  isRecurring: boolean
  rank: number
}

export interface BankLineOptions {
  /** First day the account has a balance in this ledger. */
  from: string
  /** Last day to produce lines for. */
  to: string
  openingBalance: number
  /** Which government covers this persona's mandate carries, and the reference on the line. */
  govtCover: readonly ('pmjjby' | 'pmsby')[]
  /** Policy reference printed on the premium line. Stable per persona. */
  coverReference: string
  /** The date a NACH mandate came back unpaid, if one ever did. */
  nachReturnOn: string | null
  /**
   * A flat annual savings rate, for an account held at another bank.
   *
   * Absent means IDBI's own marginal slabs, which is what every persona's primary account
   * uses. A satellite cannot: the slabs are IDBI's published card, and crediting HDFC's
   * balance at IDBI's rates would put a number on the aggregation screen that HDFC's own
   * statement would contradict.
   */
  savingsRatePa?: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/* ------------------------------------------------------------------ *
 * Daily balances
 * ------------------------------------------------------------------ */

/**
 * The closing balance on every day between `from` and `to`.
 *
 * A day with no transaction still has a balance — it is yesterday's — and interest is earned on
 * it. Summing only the days that happen to carry a transaction understates the quarter by
 * roughly the share of empty days, which for a normal account is most of them.
 */
function dailyClosingBalances(
  rows: readonly LedgerRow[],
  options: BankLineOptions,
): Map<string, number> {
  const byDate = new Map<string, number>()
  let balance = options.openingBalance

  for (const row of rows) {
    if (row.date > options.to) break
    balance += row.type === 'CREDIT' ? row.amount : -row.amount
    byDate.set(row.date, balance)
  }

  const out = new Map<string, number>()
  let carried = options.openingBalance
  for (let day = options.from; day <= options.to; day = addDays(day, 1)) {
    const close = byDate.get(day)
    if (close !== undefined) carried = close
    out.set(day, carried)
  }
  return out
}

/**
 * A day's interest at IDBI's slab rates, applied marginally.
 *
 * Marginally rather than as a single rate on the whole balance: the first lakh earns 2.50%
 * whatever sits above it. Applying the top slab to the entire balance would overpay every
 * customer with more than ₹1 lakh, which all four personas are at some point in the ledger
 * (peak balances: Karan ₹8,57,003, Rohan ₹4,92,820, Sunil ₹2,47,677, Priya ₹1,92,239).
 */
function dailyInterest(balance: number, flatRatePa?: number): number {
  if (balance <= 0) return 0
  if (flatRatePa !== undefined) return (balance * flatRatePa) / 100 / INTEREST_DAY_COUNT
  let remaining = balance
  let floor = 0
  let interest = 0

  for (const slab of SAVINGS_INTEREST_SLABS) {
    const width = slab.upTo - floor
    const inSlab = Math.min(remaining, width)
    if (inSlab <= 0) break
    interest += (inSlab * slab.ratePct) / 100 / INTEREST_DAY_COUNT
    remaining -= inSlab
    floor = slab.upTo
  }
  return interest
}

/** The last day of the quarter a date falls in: 30 Jun, 30 Sep, 31 Dec or 31 Mar. */
function quarterEnd(iso: string): string {
  const { year, month } = ymd(iso)
  const end = month <= 3 ? 3 : month <= 6 ? 6 : month <= 9 ? 9 : 12
  return fromYmd(year, end, daysInMonth(year, end))
}

/* ------------------------------------------------------------------ *
 * The lines
 * ------------------------------------------------------------------ */

const RANK = { credit: 0, mandate: 1, charge: 4 } as const

/**
 * Everything the bank posts to this account of its own accord, in the window.
 *
 * `rows` is the sealed behavioural ledger from the persona's own ledger start — not from the
 * caller's window — which is what makes these lines identical whichever way the ledger was
 * asked for.
 */
export function bankGeneratedLines(
  rows: readonly LedgerRow[],
  options: BankLineOptions,
): BankDraft[] {
  const out: BankDraft[] = []
  const balances = dailyClosingBalances(rows, options)

  const charge = (
    date: string,
    valueDate: string,
    amount: number,
    narration: string,
    gstLabel: string,
  ): void => {
    if (amount <= 0) return
    out.push({
      date,
      valueDate,
      amount: round2(amount),
      type: 'DEBIT',
      mode: 'ACH-D',
      narration,
      category: 'Fees & charges',
      isSalaryCredit: false,
      isRecurring: false,
      rank: RANK.charge,
    })
    // Always its own line. IDBI's schedule of fees says charges are exclusive of GST, so a
    // statement that folds the tax into the fee is one a reviewer can catch without a
    // calculator.
    out.push({
      date,
      valueDate,
      amount: round2((amount * BANK_CHARGES.gstPct) / 100),
      type: 'DEBIT',
      mode: 'ACH-D',
      narration: gstOn(gstLabel, date),
      category: 'Fees & charges',
      isSalaryCredit: false,
      isRecurring: false,
      rank: RANK.charge,
    })
  }

  /* Quarterly interest, and the alert charge billed with it -------------- */

  let quarter = quarterEnd(options.from)
  while (quarter <= options.to) {
    const quarterStart = addDays(quarterEnd(addMonths(quarter, -3)), 1)
    const from = quarterStart > options.from ? quarterStart : options.from

    let interest = 0
    let days = 0
    for (let day = from; day <= quarter; day = addDays(day, 1)) {
      interest += dailyInterest(balances.get(day) ?? 0, options.savingsRatePa)
      days += 1
    }

    if (days > 0 && interest >= 1) {
      out.push({
        date: quarter,
        // Back-valued to the period it was earned over, which is what the value-date column is
        // there to show.
        valueDate: quarter,
        // RBI's Master Direction requires interest to be rounded to the nearest rupee, which is
        // why this is the one line in the ledger that never carries paise.
        amount: Math.round(interest),
        type: 'CREDIT',
        mode: 'NEFT',
        narration: savingsInterest(from, quarter),
        category: 'Income',
        isSalaryCredit: false,
        // Four times a year, without fail, for as long as the account is open. The labelled
        // dataset has to say so or the detector is marked wrong for finding it.
        isRecurring: true,
        rank: RANK.credit,
      })
    }

    const alerts = rows.filter((r) => r.date >= from && r.date <= quarter).length
    charge(
      quarter,
      quarter,
      alerts * BANK_CHARGES.smsAlertPerMessage,
      smsAlertCharge(alerts, quarter),
      'SMS ALERT CHGS',
    )

    quarter = quarterEnd(addMonths(quarter, 3))
  }

  /* Minimum average balance ---------------------------------------------- */

  // The charge is on the *average* of the month's closing balances, not on a moment. A customer
  // whose balance dips to zero on the 28th and is refilled on the 1st owes nothing; a customer
  // who lived below ₹10,000 all month does. Getting that wrong charges the wrong persona.
  const monthlyAverage = new Map<string, { sum: number; days: number }>()
  for (const [day, balance] of balances) {
    const key = monthKey(day)
    const seen = monthlyAverage.get(key) ?? { sum: 0, days: 0 }
    monthlyAverage.set(key, { sum: seen.sum + balance, days: seen.days + 1 })
  }

  const months = [...monthlyAverage.keys()].sort()
  months.forEach((key, index) => {
    // One month's grace, as the schedule of fees allows, and never on the first month of the
    // ledger — the account did not open that day, we simply cannot see further back.
    if (index < BANK_CHARGES.mabGraceMonths + 1) return
    const stats = monthlyAverage.get(key)
    if (!stats || stats.days < 20) return

    const average = stats.sum / stats.days
    const shortfall = BANK_CHARGES.minAverageBalance - average
    if (shortfall <= 0) return

    const amount = Math.min(
      BANK_CHARGES.mabShortfallCap,
      (shortfall * BANK_CHARGES.mabShortfallPct) / 100,
    )
    const lastDay = `${key}-${String(daysInMonth(ymd(`${key}-01`).year, ymd(`${key}-01`).month)).padStart(2, '0')}`
    const collectedOn = addDays(lastDay, 5)
    if (collectedOn > options.to) return

    charge(collectedOn, lastDay, amount, minBalanceCharge(`${key}-01`), 'MIN BAL CHGS')
  })

  /* Government micro-cover ------------------------------------------------ */

  // PMJJBY and PMSBY renew on 1 June, so the mandate is presented in the last days of May. Two
  // lines and two insurers, because they are two schemes.
  for (let year = ymd(options.from).year; year <= ymd(options.to).year; year += 1) {
    const on = fromYmd(year, 5, GOVT_COVER.debitDay)
    if (on < options.from || on > options.to) continue

    for (const cover of options.govtCover) {
      out.push({
        date: on,
        valueDate: on,
        amount: cover === 'pmjjby' ? GOVT_COVER.pmjjbyAnnual : GOVT_COVER.pmsbyAnnual,
        type: 'DEBIT',
        mode: 'ACH-D',
        narration: achPremium({
          insurer: cover === 'pmjjby' ? 'PMJJBY LIC OF INDIA' : 'PMSBY NEW INDIA ASSURANCE',
          reference: options.coverReference,
        }),
        category: 'Insurance',
        isSalaryCredit: false,
        isRecurring: true,
        rank: RANK.mandate,
      })
    }
  }

  /* The returned mandate --------------------------------------------------- */

  if (
    options.nachReturnOn &&
    options.nachReturnOn >= options.from &&
    options.nachReturnOn <= options.to
  ) {
    charge(
      options.nachReturnOn,
      options.nachReturnOn,
      BANK_CHARGES.nachReturn,
      nachReturnCharge(options.nachReturnOn),
      'NACH RETURN CHGS',
    )
  }

  return out
}

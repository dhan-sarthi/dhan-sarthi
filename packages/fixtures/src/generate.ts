/**
 * The ledger generator: behaviour in, transactions out.
 *
 * Two design choices carry the weight here.
 *
 * **One RNG stream per month, keyed on a fixed anchor.** Every month forks its own generator
 * from a label (`rohan:2026-08`), and every window in a `PersonaSpec` is measured back from an
 * anchor date that never moves. That is not tidiness — it is what makes the demo's time
 * machine possible. A month has to produce the same transactions whether it was generated as
 * history or generated live when the judge advances the clock. Share one stream, or measure
 * from a moving "today", and the history somebody already read rewrites itself underneath them.
 *
 * **Nothing is asserted, everything is derived.** Balances, monthly outflow, the surplus and
 * the account aggregates all fall out of the transaction list. If a number reaches a screen it
 * is arithmetic over the ledger, so a judge who adds up the statement gets our answer.
 */
import { accountFactsAsOf, liabilityAsOf, sipHoldingAsOf } from '@dhan/core'
import type {
  Account,
  CustomerFile,
  Holding,
  Liability,
  LiabilityContract,
  SipContract,
  SpendCategory,
  Transaction,
  TxnMode,
} from '@dhan/core'
import { addMonths, daysInMonth, festivalMultiplier, fromYmd, payDay, ymd } from './calendar.ts'
import {
  DISCRETIONARY,
  UTILITIES,
  atmNarration,
  emiNarration,
  narrate,
  rentNarration,
  salaryNarration,
} from './merchants.ts'
import type { Merchant } from './merchants.ts'
import { rng } from './random.ts'
import type { Rng } from './random.ts'
import type { EmiSpec, PersonaSpec, SipSpec } from './personas.ts'

export interface GenerateOptions {
  /**
   * The persona's fixed reference date. Every window in a `PersonaSpec` — months a loan has
   * left, when a subscription started, which months a category is drifting in — is measured
   * back from here, and this **never moves**.
   */
  anchor: string
  /** Where the ledger is truncated. This is the only thing the time machine moves. */
  asOf: string
  /** How much history to produce. Cleo's pitch is "years of your financial history". */
  months: number
}

const DEFAULTS: GenerateOptions = { anchor: '2026-09-01', asOf: '2026-09-01', months: 24 }

/**
 * Intra-day ordering. Statements are day-granular, so a running balance needs a tiebreak or it
 * renders in an order no bank would produce — a card swipe before the salary that funded it.
 */
const RANK = { credit: 0, mandate: 1, bill: 2, spend: 3 } as const

interface Draft {
  date: string
  amount: number
  type: Transaction['txnType']
  mode: TxnMode
  narration: string
  category: SpendCategory
  isSalaryCredit: boolean
  isRecurring: boolean
  rank: number
}

/* ------------------------------------------------------------------ *
 * One month
 * ------------------------------------------------------------------ */

/**
 * Every transaction for one calendar month.
 *
 * Pure in `(spec, year, month, monthsAgo)`: same inputs, same output, regardless of what else
 * has been generated. `monthsAgo` is the distance back from the anchor — positive is history,
 * negative is the future — and it decides whether a loan, a subscription or a SIP was live.
 */
export function monthTransactions(
  spec: PersonaSpec,
  year: number,
  month: number,
  monthsAgo: number,
): Draft[] {
  const r = rng(spec.seed).fork(`${spec.slug}:${year}-${String(month).padStart(2, '0')}`)
  const out: Draft[] = []
  const dim = daysInMonth(year, month)
  const day = (d: number): string => fromYmd(year, month, Math.min(Math.max(d, 1), dim))

  /* Income ------------------------------------------------------------- */

  const { amount, day: incomeDay, variancePct, splits } = spec.income

  if (splits <= 1) {
    // Salaried: one credit, on the last working day at or before the nominal day.
    out.push({
      date: payDay(year, month, incomeDay),
      amount: variancePct > 0 ? r.jitter(amount, variancePct) : amount,
      type: 'CREDIT',
      mode: 'NEFT',
      narration: salaryNarration(r, spec.employer),
      category: 'Income',
      isSalaryCredit: true,
      isRecurring: true,
      rank: RANK.credit,
    })
  } else {
    // A trader collects several times a month, in amounts nobody can predict. Note that
    // isSalaryCredit stays false throughout: there is no payroll flag to lean on, which is
    // what makes deriving a stable income for this customer real work rather than a field read.
    const monthTotal = r.jitter(amount, variancePct)
    let allocated = 0

    for (let i = 0; i < splits; i += 1) {
      const isLast = i === splits - 1
      const share = isLast
        ? monthTotal - allocated
        : Math.round((monthTotal / splits) * (0.6 + r.next() * 0.8))
      const value = Math.max(2_000, share)
      allocated += value

      out.push({
        date: day(Math.round(((i + 0.5) * dim) / splits) + r.int(-3, 3)),
        amount: value,
        type: 'CREDIT',
        mode: r.chance(0.6) ? 'UPI' : 'NEFT',
        narration: r.chance(0.5)
          ? `UPI/COLLECTION/${String(r.int(100_000_000_000, 999_999_999_999))}`
          : salaryNarration(r, spec.employer),
        category: 'Income',
        isSalaryCredit: false,
        isRecurring: false,
        rank: RANK.credit,
      })
    }
  }

  /* Fixed commitments -------------------------------------------------- */

  if (spec.rent) {
    out.push({
      date: day(spec.rent.day),
      amount: spec.rent.amount,
      type: 'DEBIT',
      mode: 'IMPS',
      narration: rentNarration(r),
      category: 'Rent & bills',
      isSalaryCredit: false,
      isRecurring: true,
      rank: RANK.mandate,
    })
  }

  for (const o of spec.obligations) {
    out.push({
      date: day(o.day),
      amount: o.amount,
      type: 'DEBIT',
      mode: 'IMPS',
      narration: o.narration,
      category: o.category,
      isSalaryCredit: false,
      isRecurring: true,
      rank: RANK.mandate,
    })
  }

  for (const emi of spec.emis) {
    // Live only while the loan was actually running. It started `elapsedMonths` before the
    // anchor, and it stops when it is paid off — which is what makes "your EMI ends in five
    // months" true rather than merely said: advance the clock and the debit really disappears.
    if (monthsAgo >= emi.elapsedMonths) continue
    if (monthsAgo <= -emi.remainingMonths) continue

    out.push({
      date: day(emi.day),
      amount: emi.isRevolving ? r.jitter(emi.amount, 0.18) : emi.amount,
      type: 'DEBIT',
      mode: 'ACH-D',
      narration: emiNarration(r, emi.lender),
      category: 'Loan EMI',
      isSalaryCredit: false,
      isRecurring: true,
      rank: RANK.mandate,
    })
  }

  for (const sip of spec.sips) {
    if (monthsAgo >= sip.startsMonthsAgo) continue

    out.push({
      date: day(sip.day),
      amount: sip.amount,
      type: 'DEBIT',
      mode: 'ACH-D',
      narration: narrate.ach(r, sip.scheme),
      category: 'Investment',
      isSalaryCredit: false,
      isRecurring: true,
      rank: RANK.mandate,
    })
  }

  for (const sub of spec.subscriptions) {
    if (monthsAgo >= sub.startsMonthsAgo) continue
    if (sub.endsMonthsAgo !== undefined && monthsAgo < sub.endsMonthsAgo) continue

    // The price in force for this month. History is oldest-first, so the last entry whose
    // window has opened wins.
    let price = sub.amount
    for (const step of sub.priceHistory ?? []) {
      if (monthsAgo <= step.fromMonthsAgo) price = step.amount
    }

    out.push({
      date: day(sub.day),
      amount: price,
      type: 'DEBIT',
      mode: 'SI',
      narration: narrate.si(r, sub.merchant),
      category: sub.category,
      isSalaryCredit: false,
      isRecurring: true,
      rank: RANK.mandate,
    })
  }

  if (spec.utilities) {
    UTILITIES.forEach((u, i) => {
      const [lo, hi] = u.amount
      out.push({
        date: day(14 + i * 4 + r.int(-1, 1)),
        amount: lo === hi ? lo : r.int(lo, hi),
        type: 'DEBIT',
        mode: 'UPI',
        narration: u.narration(r, u.name),
        category: 'Rent & bills',
        isSalaryCredit: false,
        // Recurring but variable. That difference is what separates a bill from a
        // subscription, and telling them apart is the whole job of recurring analysis.
        isRecurring: true,
        rank: RANK.bill,
      })
    })
  }

  /* Lump sums ---------------------------------------------------------- */

  for (const lump of spec.lumps) {
    if (lump.monthsAgo !== monthsAgo) continue

    out.push({
      date: day(lump.day),
      amount: lump.amount,
      type: 'DEBIT',
      mode: 'CARD',
      narration: lump.narration,
      category: lump.category,
      isSalaryCredit: false,
      isRecurring: false,
      rank: RANK.spend,
    })
  }

  /* Discretionary ------------------------------------------------------ */

  out.push(...discretionary(spec, r, year, month, monthsAgo))

  // A little cash, because an Indian statement has ATM withdrawals on it, and money that
  // leaves as cash is money no categoriser can ever explain. Worth being honest about.
  if (r.chance(0.55)) {
    out.push({
      date: day(r.int(2, 26)),
      amount: r.pick([500, 1_000, 2_000, 2_000, 3_000, 5_000]),
      type: 'DEBIT',
      mode: 'CASH',
      narration: atmNarration(r, spec.customer.city),
      category: 'Cash',
      isSalaryCredit: false,
      isRecurring: false,
      rank: RANK.spend,
    })
  }

  return out
}

/**
 * Discretionary spending for the month.
 *
 * Three effects, all of which a banker recognises and none of which a flat random walk
 * produces: spending clusters after payday, one category drifts upward over recent months, and
 * festivals move real money.
 */
function discretionary(
  spec: PersonaSpec,
  r: Rng,
  year: number,
  month: number,
  monthsAgo: number,
): Draft[] {
  const dim = daysInMonth(year, month)
  const pay = ymd(payDay(year, month, spec.income.day)).day

  // Day weights. The half-life shortens as payday bias rises: at 0.8 the month is effectively
  // over by the 12th, which is Cleo's finding about the second half of the paycheck.
  const bias = spec.discretionary.paydayBias
  const halfLife = 14 - 10 * bias
  const dayWeight: [number, number][] = []

  for (let d = 1; d <= dim; d += 1) {
    const since = (d - pay + dim) % dim
    const decay = Math.pow(0.5, since / halfLife)
    dayWeight.push([d, (0.15 + 0.85 * decay) * festivalMultiplier(fromYmd(year, month, d))])
  }

  // The month's envelope, lifted by any festival falling inside it.
  const festivalLift =
    dayWeight.reduce((sum, [d]) => sum + festivalMultiplier(fromYmd(year, month, d)), 0) / dim
  const budget = r.jitter(spec.discretionary.monthlyBudget, 0.12) * (1 + (festivalLift - 1) * 0.7)

  // Category shares, with the drift applied to whichever category is quietly climbing.
  const shares: [string, number][] = []

  for (const [category, weight] of Object.entries(spec.discretionary.mix)) {
    if (!weight) continue
    let w = weight
    const drift = spec.drift

    if (drift && drift.category === category && monthsAgo < drift.overMonths) {
      // monthsAgo 0 is the anchor month, so the multiplier is strongest there. Clamped so that
      // months past the anchor plateau rather than drifting upward forever.
      const raw = (drift.overMonths - monthsAgo) / drift.overMonths
      w *= 1 + (drift.endMultiplier - 1) * Math.min(1, Math.max(0, raw))
    }

    shares.push([category, w])
  }

  // Allocate rupees to categories *first*, then fill each allocation with draws from its own
  // pool. Drawing a category per transaction instead lets ticket size decide the split — a
  // single ₹9,000 electronics draw eats half the month, and a mix weight of 18 for Shopping
  // ends up outspending a weight of 30 for food by six to one. The weights have to mean
  // rupees, because that is what they mean on the screen.
  const totalWeight = shares.reduce((sum, [, w]) => sum + w, 0)
  const out: Draft[] = []

  for (const [category, weight] of shares) {
    const pool = DISCRETIONARY[category]
    if (!pool || pool.length === 0 || totalWeight === 0) continue

    let allocation = (budget * weight) / totalWeight

    // Draw until the allocation is used up. Two details keep this honest.
    //
    // Only merchants whose *cheapest* ticket still fits are eligible, and the draw is capped
    // at what is left — so a ₹6,500 electronics ticket cannot overshoot a ₹900 remainder, and
    // the loop cannot stall by repeatedly rolling something unaffordable. Earlier versions
    // skipped or broke out instead, which left a random slice of every category's envelope
    // unspent; the leftover varied month to month and put a ±₹150,000 swing into a balance
    // that should drift smoothly. A budget knob has to mean what it says, or every persona
    // needs hand-tuning and none of them stays coherent after an edit.
    while (allocation > 0) {
      const affordable = pool.filter((m) => m.amount[0] <= allocation)
      if (affordable.length === 0) break

      const merchant = r.weighted(affordable.map((m): [Merchant, number] => [m, m.weight]))
      const [lo, hi] = merchant.amount
      const cap = Math.min(hi, Math.max(lo, allocation))
      const amount = Math.max(lo, Math.round(lo + (cap - lo) * r.normalish()))

      allocation -= amount

      out.push({
        date: fromYmd(year, month, r.weighted(dayWeight)),
        amount,
        type: 'DEBIT',
        mode: merchant.mode,
        narration: merchant.narration(r, merchant.name),
        category: merchant.category,
        isSalaryCredit: false,
        isRecurring: false,
        rank: RANK.spend,
      })
    }
  }

  return out
}

/* ------------------------------------------------------------------ *
 * The ledger
 * ------------------------------------------------------------------ */

function seal(drafts: Draft[], openingBalance: number, slug: string): Transaction[] {
  const sorted = [...drafts].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.rank - b.rank,
  )
  let balance = openingBalance

  return sorted.map((d, i) => {
    balance += d.type === 'CREDIT' ? d.amount : -d.amount

    return {
      txnId: `TXN${slug.toUpperCase()}${d.date.replace(/-/g, '')}${String(i).padStart(4, '0')}`,
      txnDate: d.date,
      txnAmount: d.amount,
      txnType: d.type,
      txnMode: d.mode,
      narration: d.narration,
      spendCategory: d.category,
      balanceAfterTxn: Math.round(balance),
      isSalaryCredit: d.isSalaryCredit,
      isRecurring: d.isRecurring,
    }
  })
}

/** Months between the anchor and a date. Positive is the past, negative the future. */
function monthsFromAnchor(anchor: string, date: string): number {
  const a = ymd(anchor)
  const b = ymd(date)
  return (a.year - b.year) * 12 + (a.month - b.month)
}

/** Drafts for every month the window touches. Anchor-relative, so independent of `asOf`. */
function draftWindow(spec: PersonaSpec, anchor: string, from: string, to: string): Draft[] {
  const drafts: Draft[] = []
  let cursor = fromYmd(ymd(from).year, ymd(from).month, 1)
  const end = fromYmd(ymd(to).year, ymd(to).month, 1)

  while (cursor <= end) {
    const { year, month } = ymd(cursor)
    drafts.push(...monthTransactions(spec, year, month, monthsFromAnchor(anchor, cursor)))
    cursor = addMonths(cursor, 1)
  }

  return drafts
}

/** Every transaction in the window, oldest first, with a running balance. */
export function generateLedger(
  spec: PersonaSpec,
  options?: Partial<GenerateOptions>,
): Transaction[] {
  const { anchor, asOf, months } = { ...DEFAULTS, ...options }
  const start = addMonths(anchor, -(months - 1))

  // The ledger ends at asOf. Anything a month would have produced later than that has not
  // happened yet — it is what the time machine reveals.
  return seal(
    draftWindow(spec, anchor, start, asOf).filter((d) => d.date <= asOf),
    spec.openingBalance,
    spec.slug,
  )
}

/**
 * The transactions between two dates, for the demo's time machine.
 *
 * Because each month draws from its own anchor-keyed stream, the days this returns are
 * identical to the days the same month produces as history. A judge advancing the clock sees
 * the future the ledger always had, not a second ledger invented on the spot.
 */
export function generateForward(
  spec: PersonaSpec,
  from: string,
  to: string,
  openingBalance: number,
  options?: Partial<GenerateOptions>,
): Transaction[] {
  const { anchor } = { ...DEFAULTS, ...options }

  return seal(
    draftWindow(spec, anchor, from, to).filter((d) => d.date > from && d.date <= to),
    openingBalance,
    spec.slug,
  )
}

/* ------------------------------------------------------------------ *
 * Derived account state
 * ------------------------------------------------------------------ */

/** A persona's loan, in the anchor-relative shape core's as-of arithmetic rolls forward. */
export function liabilityContract(emi: EmiSpec): LiabilityContract {
  return {
    loanType: emi.loanType,
    emiAmount: emi.amount,
    rate: emi.rate,
    tenureRemainingAtAnchor: emi.remainingMonths,
    ...(emi.dpd === undefined ? {} : { dpdStatus: emi.dpd }),
    ...(emi.isRevolving === undefined ? {} : { isRevolving: emi.isRevolving }),
  }
}

/** A persona's SIP, in the anchor-relative shape core's as-of arithmetic rolls forward. */
export function sipContract(sip: SipSpec): SipContract {
  return {
    scheme: sip.scheme,
    amount: sip.amount,
    day: sip.day,
    startsMonthsBeforeAnchor: sip.startsMonthsAgo,
    assetClass: sip.assetClass,
    ...(sip.heldOutsideIdbi === undefined ? {} : { heldOutsideIdbi: sip.heldOutsideIdbi }),
  }
}

/**
 * The full customer file.
 *
 * Account aggregates are computed from the ledger rather than declared. `minBalance12m` in
 * particular is the number the whole pitch rests on: a floor the balance never went below is
 * money that was never needed, sitting in a savings account earning less than inflation.
 *
 * The as-of arithmetic itself lives in `@dhan/core` so that the seeded database and this
 * generator cannot disagree: a loan shortens by the months the clock has advanced, a cleared
 * loan leaves the file, and a SIP gains an instalment a month, from one implementation.
 */
export function generateCustomerFile(
  spec: PersonaSpec,
  options?: Partial<GenerateOptions>,
): CustomerFile {
  const { anchor, asOf, months } = { ...DEFAULTS, ...options }
  const transactions = generateLedger(spec, { anchor, asOf, months })

  const savings: Account = {
    accountNumberMasked: 'XXXXXX7412',
    accountType: 'Savings',
    accountOpeningDate: spec.customer.customerSince,
    ...accountFactsAsOf(transactions, asOf, { openingBalance: spec.openingBalance }),
  }

  const liabilities: Liability[] = spec.emis
    .map((emi) => liabilityAsOf(liabilityContract(emi), anchor, asOf))
    // A cleared loan leaves the liability list, which is what frees up the EMI.
    .filter((l): l is Liability => l !== null)

  const sipHoldings: Holding[] = spec.sips.map((sip) =>
    sipHoldingAsOf(sipContract(sip), anchor, asOf, months),
  )

  return {
    customer: spec.customer,
    accounts: [savings, ...spec.extraAccounts],
    transactions,
    liabilities,
    holdings: [...sipHoldings, ...spec.holdings],
    policies: spec.policies,
  }
}

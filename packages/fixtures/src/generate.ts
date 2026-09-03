/**
 * The ledger generator: behaviour in, transactions out.
 *
 * Three design choices carry the weight here.
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
 *
 * **The lines the bank writes are a second pass.** Interest is the daily product of the closing
 * balance and a minimum-balance charge is a monthly average, so neither exists until the
 * behavioural ledger does. The behavioural drafts are sealed once from the persona's own ledger
 * start, the bank's lines are computed from those balances, and the two are sealed together.
 * The bank does exactly this, one quarter in arrears.
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
import { bankGeneratedLines } from './bank-lines.ts'
import type { LedgerRow } from './bank-lines.ts'
import {
  addDays,
  addMonths,
  daysInMonth,
  festivalMultiplier,
  fromYmd,
  payDay,
  ymd,
} from './calendar.ts'
import { cityProfile } from './calibration.ts'
import { billersFor, merchantsFor } from './merchants.ts'
import type { Merchant } from './merchants.ts'
import {
  achLoan,
  achSip,
  bbps,
  cashDeposit,
  creditCardPayment,
  ecom,
  idbiCashWithdrawal,
  impsDebit,
  neftSalary,
  neftSettlement,
  nfsCashWithdrawal,
  pos,
  siAutopay,
  umrn,
  upiCredit,
  upiDebit,
} from './narration.ts'
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

/**
 * How far back a persona's account history goes, as a fact about the persona rather than a
 * question the caller asks.
 *
 * The bank's own lines are computed from balances, and balances depend on where the ledger
 * starts. Pin that to the persona and the interest credited in March is the same number
 * whatever window was requested; let a caller's `months` decide it and asking for two extra
 * months of history silently rewrites the interest inside months somebody already read.
 */
export const LEDGER_MONTHS = 24

const DEFAULTS: GenerateOptions = {
  anchor: '2026-09-01',
  asOf: '2026-09-01',
  months: LEDGER_MONTHS,
}

/**
 * Intra-day ordering. Statements are day-granular, so a running balance needs a tiebreak or it
 * renders in an order no bank would produce — a card swipe before the salary that funded it.
 */
const RANK = { credit: 0, mandate: 1, bill: 2, spend: 3, charge: 4 } as const

interface Draft {
  date: string
  /** When the money counted, which on a card line is the day before it posted. */
  valueDate: string
  amount: number
  type: Transaction['txnType']
  mode: TxnMode
  narration: string
  category: SpendCategory
  isSalaryCredit: boolean
  isRecurring: boolean
  rank: number
  mcc?: string
  merchantName?: string
  vpa?: string
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** A few paise on a bill, because a real electricity bill is never a round number. */
const withPaise = (r: Rng, rupees: number): number => round2(rupees + r.int(0, 99) / 100)

/**
 * A stable reference for one mandate, drawn outside the month's stream.
 *
 * A UMRN identifies the *mandate*, not the debit, so it has to be the same string every month
 * or the twelve instalments of one loan look like twelve different loans.
 */
const mandateRef = (spec: PersonaSpec, label: string, bank4: string): string =>
  umrn(rng(spec.seed).fork(`mandate:${label}`), bank4)

/** A consumer number with a biller. Fixed for the life of the connection, like the real one. */
const consumerNumber = (spec: PersonaSpec, biller: string): string =>
  String(rng(spec.seed).fork(`biller:${spec.slug}:${biller}`).int(100_000_000, 999_999_999))

/* ------------------------------------------------------------------ *
 * One month
 * ------------------------------------------------------------------ */

/**
 * Every transaction for one calendar month, excluding the lines the bank writes itself.
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
  const city = spec.customer.city
  const day = (d: number): string => fromYmd(year, month, Math.min(Math.max(d, 1), dim))

  /** A line whose value date is its posting date, which is every rail but the card. */
  const line = (
    on: string,
    over: Partial<Draft> & Pick<Draft, 'amount' | 'narration' | 'category'>,
  ): Draft => ({
    date: on,
    valueDate: on,
    type: 'DEBIT',
    mode: 'UPI',
    isSalaryCredit: false,
    isRecurring: false,
    rank: RANK.spend,
    ...over,
  })

  /* Income ------------------------------------------------------------- */

  const { amount, day: incomeDay, variancePct, splits } = spec.income

  if (splits <= 1) {
    // Salaried: one inward NEFT, on the last working day at or before the nominal day. The
    // remitter is the employer's own bank, so the IFSC on this line is never IDBI's.
    const on = payDay(year, month, incomeDay)
    out.push(
      line(on, {
        amount: variancePct > 0 ? r.jitter(amount, variancePct) : amount,
        type: 'CREDIT',
        mode: 'NEFT',
        narration: neftSalary(r, {
          date: on,
          employer: spec.employer.name,
          ifsc: spec.employer.ifsc,
        }),
        category: 'Income',
        isSalaryCredit: true,
        isRecurring: true,
        rank: RANK.credit,
      }),
    )
  } else {
    // A trader collects several times a month, in amounts nobody can predict, across three
    // different rails. Note that isSalaryCredit stays false throughout: there is no payroll
    // flag to lean on, which is what makes deriving a stable income for this customer real
    // work rather than a field read.
    const monthTotal = r.jitter(amount, variancePct)
    const payers = spec.income.payers ?? []
    let allocated = 0

    for (let i = 0; i < splits; i += 1) {
      const isLast = i === splits - 1
      const share = isLast
        ? monthTotal - allocated
        : Math.round((monthTotal / splits) * (0.6 + r.next() * 0.8))
      const value = Math.max(2_000, share)
      allocated += value

      const on = day(Math.round(((i + 0.5) * dim) / splits) + r.int(-3, 3))
      const rail = r.weighted([
        ['upi', 5],
        ['settlement', 3],
        ['cash', 2],
      ] as const)
      const agent = spec.income.settlementAgent

      if (rail === 'settlement' && agent?.ifsc) {
        out.push(
          line(on, {
            amount: value,
            type: 'CREDIT',
            mode: 'NEFT',
            narration: neftSettlement(r, { date: on, remitter: agent.name, ifsc: agent.ifsc }),
            category: 'Income',
            rank: RANK.credit,
          }),
        )
      } else if (rail === 'cash') {
        // The day's takings, banked at a deposit machine. The part of a shop's income that
        // leaves no trace anywhere until it arrives.
        out.push(
          line(on, {
            amount: value,
            type: 'CREDIT',
            mode: 'CASH',
            narration: cashDeposit(r, r.pick(cityProfile(city).localities)),
            category: 'Income',
            rank: RANK.credit,
          }),
        )
      } else {
        const payer = payers.length > 0 ? r.pick(payers) : { name: 'Customer', remark: 'SHOP SALE' }
        const first = payer.name.split(' ')[0]?.toLowerCase() ?? 'customer'
        out.push(
          line(on, {
            amount: value,
            type: 'CREDIT',
            mode: 'UPI',
            narration: upiCredit(r, {
              date: on,
              payee: payer.name,
              bank4: (payer.ifsc ?? 'SBIN0011045').slice(0, 4),
              vpa: `${first}@okaxis`,
              remark: payer.remark ?? 'SHOP SALE',
            }),
            category: 'Income',
            rank: RANK.credit,
          }),
        )
      }
    }
  }

  /* Fixed commitments -------------------------------------------------- */

  if (spec.rent) {
    const on = day(spec.rent.day)
    out.push(
      line(on, {
        amount: spec.rent.amount,
        mode: 'IMPS',
        narration: impsDebit(r, {
          date: on,
          beneficiary: spec.rent.payee.name,
          ifsc: spec.rent.payee.ifsc ?? 'SBIN0000001',
          remark: spec.rent.payee.remark ?? 'RENT',
        }),
        category: 'Rent & bills',
        isRecurring: true,
        rank: RANK.mandate,
      }),
    )
  }

  for (const o of spec.obligations) {
    const on = day(o.day)
    out.push(
      line(on, {
        amount: o.amount,
        mode: 'IMPS',
        narration: impsDebit(r, {
          date: on,
          beneficiary: o.payee.name,
          ifsc: o.payee.ifsc ?? 'SBIN0000001',
          remark: o.payee.remark ?? 'TRANSFER',
        }),
        category: o.category,
        isRecurring: true,
        rank: RANK.mandate,
      }),
    )
  }

  for (const emi of spec.emis) {
    // Live only while the loan was actually running. It started `elapsedMonths` before the
    // anchor, and it stops when it is paid off — which is what makes "your EMI ends in five
    // months" true rather than merely said: advance the clock and the debit really disappears.
    if (monthsAgo >= emi.elapsedMonths) continue
    if (monthsAgo <= -emi.remainingMonths) continue

    if (emi.isRevolving) {
      // A card bill, not an instalment. The customer picks an amount somewhere between the
      // minimum due and the balance, and that choice is exactly why the balance never clears.
      const on = day(emi.day)
      out.push(
        line(on, {
          amount: r.jitter(emi.amount, 0.3),
          mode: 'SI',
          narration: creditCardPayment(r, emi.cardLast4 ?? spec.cardLast4),
          category: 'Loan EMI',
          isRecurring: true,
          rank: RANK.mandate,
        }),
      )
      continue
    }

    if (emi.returnedMonthsAgo === monthsAgo) {
      // The mandate was presented against an account that could not pay it. The instalment is
      // settled by hand twelve days later, which is what a DPD of 12 looks like on a statement
      // rather than only on a liability record. The return charge itself is a bank line.
      const late = day(emi.day + 12)
      out.push(
        line(late, {
          amount: emi.amount,
          mode: 'IMPS',
          narration: impsDebit(r, {
            date: late,
            beneficiary: emi.creditor,
            ifsc: cityProfile(city).branchIfsc,
            remark: 'LATE EMI',
          }),
          category: 'Loan EMI',
          rank: RANK.mandate,
        }),
      )
      continue
    }

    const on = day(emi.day)
    out.push(
      line(on, {
        amount: emi.amount,
        mode: 'ACH-D',
        narration: achLoan({
          lender: emi.creditor,
          mandateRef: mandateRef(spec, `${spec.slug}:${emi.creditor}`, emi.mandateBank4),
          date: on,
        }),
        category: 'Loan EMI',
        isRecurring: true,
        rank: RANK.mandate,
      }),
    )
  }

  for (const sip of spec.sips) {
    if (monthsAgo >= sip.startsMonthsAgo) continue
    const on = day(sip.day)

    out.push(
      line(on, {
        amount: sip.amount,
        mode: 'ACH-D',
        narration: achSip({
          clearer: sip.clearer,
          mandateRef: mandateRef(spec, `${spec.slug}:${sip.scheme}`, 'IBKL'),
          date: on,
        }),
        category: 'Investment',
        isRecurring: true,
        rank: RANK.mandate,
      }),
    )
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

    out.push(
      line(day(sub.day), {
        amount: price,
        mode: 'SI',
        narration: siAutopay(sub.merchant),
        category: sub.category,
        isRecurring: true,
        rank: RANK.mandate,
      }),
    )
  }

  if (spec.utilities) {
    for (const bill of billersFor(city)) {
      // A cylinder is not a monthly bill. Keyed on the absolute month so the every-other-month
      // pattern does not slide when the year turns.
      if (bill.everyMonths > 1 && (year * 12 + month) % bill.everyMonths !== 0) continue

      const [lo, hi] = bill.amount
      const on = day(bill.day + r.int(-1, 1))
      out.push(
        line(on, {
          // A metered bill carries paise; a prepaid pack does not. Both are true, and the
          // difference is visible on any statement.
          amount: lo === hi ? lo : withPaise(r, r.int(lo, hi)),
          mode: 'UPI',
          narration: bbps(r, {
            biller: bill.biller,
            consumerNo: consumerNumber(spec, bill.biller),
          }),
          category: bill.category,
          // Recurring but variable. That difference is what separates a bill from a
          // subscription, and telling them apart is the whole job of recurring analysis.
          isRecurring: true,
          rank: RANK.bill,
          mcc: bill.mcc,
        }),
      )
    }
  }

  /* Lump sums ---------------------------------------------------------- */

  for (const lump of spec.lumps) {
    if (lump.monthsAgo !== monthsAgo) continue

    const on = day(lump.day)
    const isCard = lump.rail === 'pos' || lump.rail === 'ecom'
    const narration =
      lump.rail === 'pos'
        ? pos({ cardLast4: spec.cardLast4, merchant: lump.payee.name, city })
        : lump.rail === 'ecom'
          ? ecom({ cardLast4: spec.cardLast4, merchant: lump.payee.name })
          : lump.rail === 'neft'
            ? `NEFT/DR/${lump.payee.name.toUpperCase()}/${lump.payee.ifsc ?? 'SBIN0000001'}/${(lump.payee.remark ?? 'PAYMENT').toUpperCase()}`
            : impsDebit(r, {
                date: on,
                beneficiary: lump.payee.name,
                ifsc: lump.payee.ifsc ?? 'SBIN0000001',
                remark: lump.payee.remark ?? 'PAYMENT',
              })

    out.push(
      line(on, {
        // A card line posts the day after the purchase and is value-dated back to it. That is
        // the ordinary case of the two-date column an auditor reads, and it costs nothing.
        valueDate: isCard ? addDays(on, -1) : on,
        amount: lump.amount,
        mode: isCard ? 'CARD' : lump.rail === 'neft' ? 'NEFT' : 'IMPS',
        narration,
        category: lump.category,
        rank: RANK.spend,
        ...(lump.mcc === undefined ? {} : { mcc: lump.mcc }),
        ...(isCard ? { merchantName: lump.payee.name } : {}),
      }),
    )
  }

  /* Discretionary ------------------------------------------------------ */

  out.push(...discretionary(spec, r, year, month, monthsAgo))

  // A little cash, because an Indian statement has ATM withdrawals on it, and money that
  // leaves as cash is money no categoriser can ever explain. Worth being honest about.
  if (r.chance(0.55)) {
    const on = day(r.int(2, 26))
    const locality = r.pick(cityProfile(city).localities)
    const atOwnBank = r.chance(0.4)
    out.push(
      line(on, {
        amount: r.pick([500, 1_000, 2_000, 2_000, 3_000, 5_000]),
        mode: 'CASH',
        narration: atOwnBank
          ? idbiCashWithdrawal(r, locality)
          : nfsCashWithdrawal(r, {
              date: on,
              acquirerBank4: r.pick(['HDFC', 'SBIN', 'ICIC']),
              locality,
            }),
        category: 'Cash',
        rank: RANK.spend,
      }),
    )
  }

  return out
}

/**
 * Discretionary spending for the month.
 *
 * Four effects, none of which a flat random walk produces: spending clusters after payday, one
 * category drifts upward over recent months, festivals move real money on the dates they
 * actually fall on in that year and that city, and the split between card and UPI is a
 * property of the person rather than of the merchant.
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
  const city = spec.customer.city

  // Day weights. The half-life shortens as payday bias rises: at 0.8 the month is effectively
  // over by the 12th, which is Cleo's finding about the second half of the paycheck.
  const bias = spec.discretionary.paydayBias
  const halfLife = 14 - 10 * bias
  const dayWeight: [number, number][] = []

  for (let d = 1; d <= dim; d += 1) {
    const since = (d - pay + dim) % dim
    const decay = Math.pow(0.5, since / halfLife)
    dayWeight.push([d, (0.15 + 0.85 * decay) * festivalMultiplier(fromYmd(year, month, d), city)])
  }

  // The month's envelope, lifted by any festival falling inside it.
  const festivalLift =
    dayWeight.reduce((sum, [d]) => sum + festivalMultiplier(fromYmd(year, month, d), city), 0) / dim
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
    const pool = merchantsFor(category, city)
    if (pool.length === 0 || totalWeight === 0) continue

    const allocation = (budget * weight) / totalWeight
    const byCard = pool.filter((x) => x.mode === 'CARD')
    const byUpi = pool.filter((x) => x.mode === 'UPI')

    // The card share is a property of the person, not of the category — but a category with
    // nothing to swipe at spends its whole allocation on UPI rather than losing it.
    let cardBudget = byCard.length === 0 ? 0 : allocation * spec.discretionary.cardShare
    let upiBudget = allocation - cardBudget
    if (byUpi.length === 0) {
      cardBudget = allocation
      upiBudget = 0
    }

    out.push(...fill(spec, r, byCard, cardBudget, dayWeight, year, month))
    out.push(...fill(spec, r, byUpi, upiBudget, dayWeight, year, month))
  }

  return out
}

/**
 * Spend an envelope down, one ticket at a time.
 *
 * The ticket is a Gamma draw around the merchant's own mean, clamped into its band. That is
 * what produces a mean of about ₹600 and 85% of payments under ₹500 at the same time — a
 * uniform draw makes those two facts contradictory, and they are both published.
 *
 * Two details keep the loop honest. Only merchants whose *cheapest* ticket still fits are
 * eligible, and the draw is capped at what is left — so a ₹6,500 electronics ticket cannot
 * overshoot a ₹900 remainder, and the loop cannot stall by repeatedly rolling something
 * unaffordable. Earlier versions skipped or broke out instead, which left a random slice of
 * every category's envelope unspent; the leftover varied month to month and put a ±₹150,000
 * swing into a balance that should drift smoothly.
 */
function fill(
  spec: PersonaSpec,
  r: Rng,
  pool: readonly Merchant[],
  envelope: number,
  dayWeight: readonly [number, number][],
  year: number,
  month: number,
): Draft[] {
  const out: Draft[] = []
  const city = spec.customer.city
  let allocation = envelope

  while (allocation > 0) {
    const affordable = pool.filter((x) => x.amount[0] <= allocation)
    if (affordable.length === 0) break

    const merchant = r.weighted(affordable.map((x): [Merchant, number] => [x, x.weight]))
    const [lo, hi] = merchant.amount
    const drawn = r.gamma(merchant.shape, merchant.ticketMean / merchant.shape)
    // Rounded, because the cap is whatever is left of a fractional envelope and a UPI payment
    // of ₹203.34 is not a thing anybody has ever seen on a statement.
    const cap = Math.round(Math.min(hi, Math.max(lo, allocation)))
    const amount = Math.max(lo, Math.min(cap, Math.round(drawn)))

    allocation -= amount

    const on = fromYmd(year, month, r.weighted(dayWeight))
    const isCard = merchant.mode === 'CARD'
    const named = isCard || r.chance(0.4)

    out.push({
      date: on,
      // Card lines post the day after the purchase, value-dated back to it.
      valueDate: isCard ? addDays(on, -1) : on,
      amount,
      type: 'DEBIT',
      mode: merchant.mode,
      narration: isCard
        ? merchant.cardPresent
          ? pos({ cardLast4: spec.cardLast4, merchant: merchant.name, city })
          : ecom({ cardLast4: spec.cardLast4, merchant: merchant.name })
        : upiDebit(r, {
            date: on,
            payee: merchant.name,
            bank4: merchant.bank4 ?? 'ICIC',
            vpa: merchant.vpa ?? `${merchant.name.toLowerCase().replace(/\s+/g, '')}@ybl`,
            remark: merchant.remark ?? 'PAYMENT',
          }),
      category: merchant.category,
      isSalaryCredit: false,
      isRecurring: false,
      rank: RANK.spend,
      mcc: merchant.mcc,
      // The acquirer always sends a merchant name on a card line. On UPI the bank sends one
      // only sometimes, which is why enrichment has to work without it — and why this is a
      // coin flip rather than a constant.
      ...(named ? { merchantName: merchant.name } : {}),
      ...(isCard || merchant.vpa === undefined ? {} : { vpa: merchant.vpa }),
    })
  }

  return out
}

/* ------------------------------------------------------------------ *
 * The ledger
 * ------------------------------------------------------------------ */

/**
 * The bank's own reference for a line.
 *
 * Where the rail carries a number, the statement quotes it — the RRN on a UPI or IMPS line, the
 * UTR on a NEFT — and that is the string a customer reads out to the call centre. Everything
 * else gets Finacle's own sequential id.
 */
function railReference(narration: string): string | null {
  return (
    /^UPI\/(?:DR|CR)\/(\d{12})\//.exec(narration)?.[1] ??
    /^IMPS\/P2A\/(\d{12})\//.exec(narration)?.[1] ??
    /^NEFT\/([A-Z0-9]{16})\//.exec(narration)?.[1] ??
    /^NFS\/CASH WDL\/(\d{12})\//.exec(narration)?.[1] ??
    null
  )
}

function seal(drafts: Draft[], openingBalance: number): Transaction[] {
  const sorted = [...drafts].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.rank - b.rank,
  )
  // Balances are carried in paise. Utilities, charges and GST land on real statements with
  // paise on them, and a running balance accumulated as floating-point rupees drifts over two
  // thousand rows — enough for "the balance is the previous one plus the movement" to stop
  // being exactly true, which is the one property the whole ledger rests on.
  let paise = Math.round(openingBalance * 100)
  const used = new Set<string>()

  return sorted.map((d, i) => {
    paise += (d.type === 'CREDIT' ? 1 : -1) * Math.round(d.amount * 100)

    const finacle = `S${String(i + 1).padStart(8, '0')}`
    const rail = railReference(d.narration)
    // Two switch traces can collide across a long ledger. Deterministic either way, but a
    // statement cannot carry the same reference twice.
    const txnId = rail !== null && !used.has(rail) ? rail : finacle
    used.add(txnId)

    return {
      txnId,
      txnDate: d.date,
      valueDate: d.valueDate,
      txnAmount: d.amount,
      txnType: d.type,
      txnMode: d.mode,
      narration: d.narration,
      spendCategory: d.category,
      balanceAfterTxn: paise / 100,
      isSalaryCredit: d.isSalaryCredit,
      isRecurring: d.isRecurring,
      ...(d.mcc === undefined ? {} : { mccCode: d.mcc }),
      ...(d.merchantName === undefined ? {} : { merchantName: d.merchantName }),
      ...(d.vpa === undefined ? {} : { counterpartyVpa: d.vpa }),
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
  // One month of lead-in, because a card purchase on the 31st posts on the 1st and would
  // otherwise be produced only by a month that no longer starts the window.
  let cursor = addMonths(fromYmd(ymd(from).year, ymd(from).month, 1), -1)
  const end = fromYmd(ymd(to).year, ymd(to).month, 1)

  while (cursor <= end) {
    const { year, month } = ymd(cursor)
    drafts.push(...monthTransactions(spec, year, month, monthsFromAnchor(anchor, cursor)))
    cursor = addMonths(cursor, 1)
  }

  return drafts
}

/**
 * The bank's own lines for a persona, computed once per `(anchor, to)` and cached.
 *
 * Cached because it costs a full behavioural pass over the persona's history and the port
 * contract suite alone asks for eighteen ledgers. Caching is safe precisely because the answer
 * is a pure function of the persona and the two dates: the balances it reads always begin at
 * the persona's own ledger start, never at the caller's window.
 */
const bankLineCache = new Map<string, Draft[]>()

function bankDrafts(spec: PersonaSpec, anchor: string, to: string): Draft[] {
  const key = `${spec.slug}|${anchor}|${to}`
  const hit = bankLineCache.get(key)
  if (hit) return hit

  const from = addMonths(anchor, -(LEDGER_MONTHS - 1))
  const rows: LedgerRow[] = draftWindow(spec, anchor, from, to)
    .filter((d) => d.date >= from && d.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.rank - b.rank))
    .map((d) => ({ date: d.date, amount: d.amount, type: d.type }))

  const returned = spec.emis.find((e) => e.returnedMonthsAgo !== undefined)
  let returnedOn: string | null = null
  if (returned?.returnedMonthsAgo !== undefined) {
    const { year, month } = ymd(addMonths(anchor, -returned.returnedMonthsAgo))
    returnedOn = fromYmd(year, month, Math.min(returned.day, daysInMonth(year, month)))
  }

  const lines: Draft[] = bankGeneratedLines(rows, {
    from,
    to,
    openingBalance: spec.openingBalance,
    govtCover: spec.govtCover,
    coverReference: spec.coverReference,
    nachReturnOn: returnedOn,
  })

  bankLineCache.set(key, lines)
  return lines
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
  const drafts = [...draftWindow(spec, anchor, start, asOf), ...bankDrafts(spec, anchor, asOf)]

  return seal(
    drafts.filter((d) => d.date >= start && d.date <= asOf),
    spec.openingBalance,
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
  const drafts = [...draftWindow(spec, anchor, from, to), ...bankDrafts(spec, anchor, to)]

  return seal(
    drafts.filter((d) => d.date > from && d.date <= to),
    openingBalance,
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
    accountNumberMasked: spec.accountNumberMasked,
    accountType: 'Savings',
    accountOpeningDate: spec.customer.customerSince,
    branchIfsc: cityProfile(spec.customer.city).branchIfsc,
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

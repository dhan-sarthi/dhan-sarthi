/**
 * The order, and the gate in front of it.
 *
 * `07-DECISIONS.md` §3: the transaction spine runs *behind* `packages/core/src/suitability.ts`.
 * Suitability is evaluated before checkout can proceed, on the same snapshot the order is built
 * from; a `BLOCKED` verdict stops the sale and cannot be dismissed. This module is the part of
 * that which is not a screen — the basket, the arithmetic, and the walk through the gate — kept
 * out of the components so it can be tested with `node --test` and read without React.
 *
 * It deliberately does **not** import `@dhan/core`. ADR-0001 keeps the engine out of the main
 * bundle, so the verdict arrives through an injected `evaluate` — `POST /suitability/evaluate` on
 * the server tier, which also writes the advice record, and the lazy offline chunk otherwise.
 * Both run the same `evaluate()`; neither of them is here.
 *
 * ## Three decisions the rules file does not make for you
 *
 * **1. A basket is checked line by line, and the first refusal is the answer.** That mirrors the
 * rule ordering inside `evaluate()` — "the earliest failing rule is the one reported, so the most
 * fundamental objection wins" — one level up. A customer who is told about three problems at once
 * is told about none of them.
 *
 * **2. The amount a SIP line is judged on is the basket's running monthly total, not the line's
 * own figure.** `AFFORDABILITY` is the only rule that reads `amount`, and it asks what the
 * customer can commit each month. Three ₹5,000 SIPs authorised under one OTP commit ₹15,000 a
 * month, so checking each against ₹5,000 would wave through an order none of them could fund
 * alone. On a single-line basket — the common case, and the one the source shows — the running
 * total *is* the line's own amount, so nothing changes.
 *
 * **3. A lump sum is judged at zero.** `SuitabilityInput.amount` is documented as "monthly amount
 * proposed. Zero where the question is only about the product", and a one-off purchase has no
 * monthly amount. Feeding a ₹50,000 lump sum into a rule that compares against a monthly surplus
 * would refuse almost every lump sum ever placed, for a reason that is not true. Every other rule
 * — risk ceiling, buffer, horizon, tax regime, bundling — still runs on it. Whether a lump sum is
 * affordable *from the balance* is a different question, and an ordinary insufficient-funds
 * check rather than a suitability judgement; `CartReview` does that against the account's
 * effective available balance and says so in those words.
 */
import type { Product, Verdict } from '@dhan/contracts'

/* ---------------------------------------------------------------- Model */

export type InvestMode = 'sip' | 'lumpsum'

/**
 * Which folio the units go into.
 *
 * A number, not a choice, in the reference — but IDBI's feed carries no folio numbers at all
 * (`Holding` has a name, a value and a SIP amount, and no folio), so there is nothing to show and
 * nothing to invent. New against existing is the part of the control that is real.
 */
export type FolioChoice = 'new' | 'existing'

export interface OrderLine {
  /** Stable across edits, so the cart can be re-ordered and re-checked without losing a line. */
  id: string
  productId: string
  name: string
  manufacturer: string
  /**
   * Carried on the line because what happens after the order depends on it and the shelf is not
   * always to hand. A fund is allotted units at a NAV, a policy is issued and starts covering
   * you, a deposit is booked at the day's rate — three different sentences, and a screen that
   * gives a term policy the mutual-fund one is making a false disclosure.
   */
  category: Product['category']
  mode: InvestMode
  /** Rupees. Per month for a SIP, once for a lump sum. */
  amount: number
  /** ISO date of the first debit. SIP only. */
  startDate: string | null
  /**
   * How many debits, or `null` for "until you stop".
   *
   * The source uses `999` as its sentinel and the flow notes say so; a sentinel that is also a
   * plausible number is a bug waiting for the one customer who wants 999 instalments, so this
   * carries the absence directly.
   */
  installments: number | null
  folio: FolioChoice
  /** Unticked lines stay in the cart and out of the order. */
  included: boolean
}

/** Categories priced off a NAV. `settlementOf` is the only thing that reads this. */
const NAV_PRICED: ReadonlySet<Product['category']> = new Set<Product['category']>([
  'Liquid',
  'Debt',
  'Index Fund',
  'Equity',
  'ELSS',
  'ULIP',
])

const PROTECTION: ReadonlySet<Product['category']> = new Set<Product['category']>([
  'Term Insurance',
  'Health Insurance',
  'Government Insurance',
  'Endowment',
])

export type Settlement = 'units' | 'cover' | 'deposit'

/** How this line actually completes, which is what the screens after checkout have to describe. */
export function settlementOf(category: Product['category']): Settlement {
  if (NAV_PRICED.has(category)) return 'units'
  if (PROTECTION.has(category)) return 'cover'
  return 'deposit'
}

/** What this line commits every month. Zero for a lump sum, and zero for an excluded line. */
export function monthlyOf(line: OrderLine): number {
  return line.included && line.mode === 'sip' ? line.amount : 0
}

/** What this line takes today. Zero for a SIP — the first debit is on its start date. */
export function dueTodayOf(line: OrderLine): number {
  return line.included && line.mode === 'lumpsum' ? line.amount : 0
}

export interface OrderTotals {
  /** Lump sums. The figure the account has to carry now. */
  today: number
  /** SIPs. The figure the customer has to carry every month after that. */
  monthly: number
  /** Lines actually in the order. */
  count: number
}

/**
 * Two figures, not one.
 *
 * The source shows a single `Amount Payable` over a basket that mixes both, which cannot be
 * right: a SIP takes nothing today and a lump sum takes nothing next month. Conflating them is
 * how a customer authorises ₹15,000 believing it is a one-off.
 */
export function totals(lines: readonly OrderLine[]): OrderTotals {
  let today = 0
  let monthly = 0
  let count = 0
  for (const line of lines) {
    if (!line.included) continue
    count += 1
    today += dueTodayOf(line)
    monthly += monthlyOf(line)
  }
  return { today, monthly, count }
}

/** What the whole SIP comes to, where it has an end. Null while it is open-ended. */
export function committedTotal(line: OrderLine): number | null {
  if (line.mode !== 'sip' || line.installments === null) return null
  return line.amount * line.installments
}

/* ---------------------------------------------------------------- Dates */

/** ISO `YYYY-MM-DD`, in local terms and with no timezone anywhere near it. */
const iso = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()

/**
 * The same date n months on, clamped to the end of a short month.
 *
 * A SIP that starts on the 31st debits on the 28th of February and back on the 31st in March, so
 * the clamp cannot be allowed to walk the date forward permanently — which is what
 * `Date.setMonth` does, turning 31 January into 3 March.
 */
export function addMonths(isoDate: string, n: number): string {
  const y = Number(isoDate.slice(0, 4))
  const m = Number(isoDate.slice(5, 7))
  const d = Number(isoDate.slice(8, 10))
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return iso(ny, nm, Math.min(d, daysInMonth(ny, nm)))
}

/** The next time the calendar reads `day`, strictly after `after`. Clamped in a short month. */
export function nextOnDay(day: number, after: string): string {
  const y = Number(after.slice(0, 4))
  const m = Number(after.slice(5, 7))
  const thisMonth = iso(y, m, Math.min(day, daysInMonth(y, m)))
  if (thisMonth > after) return thisMonth
  const total = y * 12 + m
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return iso(ny, nm, Math.min(day, daysInMonth(ny, nm)))
}

/**
 * The dates an AMC will debit a SIP on.
 *
 * Not observed anywhere in the source — the date picker is never opened — but a free-text date is
 * not what a SIP mandate takes. These six are the set essentially every AMC offers.
 */
export const SIP_DAYS: readonly number[] = [1, 5, 10, 15, 20, 25]

/** When the last debit falls. Null while the SIP is open-ended. */
export function lastInstalment(line: OrderLine): string | null {
  if (line.mode !== 'sip' || line.startDate === null || line.installments === null) return null
  return addMonths(line.startDate, line.installments - 1)
}

/* ---------------------------------------------------------------- The gate */

/** One line's trip through the rules, kept so the screen can say what *was* checked. */
export interface LineVerdict {
  lineId: string
  productId: string
  /** The monthly figure the rules were asked about. Zero for a lump sum — see the header. */
  amount: number
  verdict: Verdict
}

export interface GateResult {
  outcome: 'PASS' | 'BLOCKED'
  /** Every line evaluated, in order, up to and including the one that failed. */
  checked: readonly LineVerdict[]
  /** Present exactly when `outcome` is `BLOCKED`. */
  blocked: { line: OrderLine; verdict: Verdict } | null
}

/**
 * Run the basket past the gate.
 *
 * Sequential rather than parallel, and that is deliberate twice over: the running monthly total
 * makes each call depend on the one before it, and stopping at the first refusal means the
 * customer is not told to fix four things when fixing the first may resolve the rest.
 */
export async function runGate(
  lines: readonly OrderLine[],
  evaluate: (productId: string, monthly: number) => Promise<Verdict>,
): Promise<GateResult> {
  const checked: LineVerdict[] = []
  let running = 0

  for (const line of lines) {
    if (!line.included) continue
    // A SIP is judged on what the order commits monthly by the time it is added; a lump sum has
    // no monthly figure to judge, so the rule that reads one is given nothing to act on.
    running += monthlyOf(line)
    const amount = line.mode === 'sip' ? running : 0

    const verdict = await evaluate(line.productId, amount)
    checked.push({ lineId: line.id, productId: line.productId, amount, verdict })

    if (verdict.verdict === 'BLOCKED') {
      return { outcome: 'BLOCKED', checked, blocked: { line, verdict } }
    }
  }

  return { outcome: 'PASS', checked, blocked: null }
}

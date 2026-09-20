/**
 * Projections, presented as a band with the assumption on show.
 *
 * The compliance point first, because it shapes the whole module. **Nobody may present a
 * projected corpus as a fact.** There is no assured return on a market-linked product, and a
 * single confident figure — "you will have ₹41 lakh" — is the thing a risk officer marks us down
 * for. So every projection here returns *scenarios*, carries its rate, and carries the sentence
 * that has to appear alongside it. See `docs/product/decisions.md` §B2.
 *
 * Two smaller decisions worth knowing:
 *
 * **The monthly rate is the annual rate divided by twelve**, not the twelfth root of the annual
 * compounding factor. The second is more correct and the first is what every Indian SIP
 * calculator uses. Matching the convention matters more than being marginally righter: a
 * customer who checks our number against Groww and finds a difference stops trusting the app,
 * and is right to.
 *
 * **A real-terms line, always.** ₹41 lakh in 2056 is the number that actually misleads people.
 */

export interface Scenario {
  label: string
  /** Nominal annual return assumed, as a percentage. On screen, and changeable. */
  ratePct: number
  /** Nominal corpus at the horizon. */
  corpus: number
  /** The same corpus in today's money. What the customer can actually reason about. */
  realCorpus: number
  /** Of which, contributed rather than earned. Makes the compounding visible. */
  contributed: number
}

export interface Projection {
  monthlyContribution: number
  /** Anything already invested that keeps compounding alongside the new contributions. */
  existingCorpus: number
  years: number
  inflationPct: number
  scenarios: Scenario[]
  /**
   * Required wherever any of this is shown. Not decoration — it is the difference between an
   * illustration and a promise.
   */
  disclaimer: string
}

export const DISCLAIMER =
  'Illustration only, on the assumed rate shown. Market-linked returns are not guaranteed and ' +
  'past performance is not indicative of future results.'

/** The default band. Deposits use their contractual rate instead; these are for market-linked. */
export const DEFAULT_RATES: readonly { label: string; ratePct: number }[] = [
  { label: 'Cautious', ratePct: 6 },
  { label: 'Expected', ratePct: 10 },
  { label: 'Optimistic', ratePct: 12 },
]

export const DEFAULT_INFLATION_PCT = 5.5

/**
 * Future value of a monthly contribution plus an existing corpus.
 *
 * Contributions are treated as arriving at the start of each month, which is what a SIP mandate
 * on the 5th actually does relative to that month's growth.
 */
export function futureValue(
  monthly: number,
  years: number,
  annualRatePct: number,
  existingCorpus = 0,
): number {
  const n = Math.round(years * 12)
  const i = annualRatePct / 100 / 12

  if (n <= 0) return existingCorpus

  const growthOfExisting = existingCorpus * (1 + i) ** n
  const growthOfContributions = i === 0 ? monthly * n : monthly * (((1 + i) ** n - 1) / i) * (1 + i)

  return Math.round(growthOfExisting + growthOfContributions)
}

/**
 * The monthly contribution needed to reach a target.
 *
 * The inverse of the above, and the number the roadmap is built from: a customer names a
 * destination and a date, and this says what it costs a month.
 */
export function requiredMonthly(
  target: number,
  years: number,
  annualRatePct: number,
  existingCorpus = 0,
): number {
  const n = Math.round(years * 12)
  if (n <= 0) return Math.max(0, target - existingCorpus)

  const i = annualRatePct / 100 / 12
  const fromExisting = existingCorpus * (1 + i) ** n
  const remaining = Math.max(0, target - fromExisting)

  if (i === 0) return Math.ceil(remaining / n)
  return Math.ceil(remaining / ((((1 + i) ** n - 1) / i) * (1 + i)))
}

export interface ProjectOptions {
  rates: readonly { label: string; ratePct: number }[]
  inflationPct: number
}

export function project(
  monthly: number,
  years: number,
  existingCorpus = 0,
  options?: Partial<ProjectOptions>,
): Projection {
  const rates = options?.rates ?? DEFAULT_RATES
  const inflationPct = options?.inflationPct ?? DEFAULT_INFLATION_PCT
  const contributed = Math.round(monthly * Math.round(years * 12)) + existingCorpus

  return {
    monthlyContribution: monthly,
    existingCorpus,
    years,
    inflationPct,
    scenarios: rates.map(({ label, ratePct }) => {
      const corpus = futureValue(monthly, years, ratePct, existingCorpus)
      return {
        label,
        ratePct,
        corpus,
        realCorpus: Math.round(corpus / (1 + inflationPct / 100) ** years),
        contributed,
      }
    }),
    disclaimer: DISCLAIMER,
  }
}

/**
 * What one more rupee a month is worth by the horizon.
 *
 * This is the bridge sentence between the daily loop and the wealth outcome, and it is the one
 * thing Cleo structurally cannot say — their horizon is five days to the next paycheck, ours is
 * thirty years. *"Every ₹500 you do not leak this week is ₹500 that compounds. It becomes
 * ₹8,700."* Without it, a spending intervention is nagging.
 */
export function compoundedValueOf(extraMonthly: number, years: number, annualRatePct = 10): number {
  return futureValue(extraMonthly, years, annualRatePct, 0)
}

/**
 * A one-off amount, compounded. For "that ₹52,900 television, thirty years on".
 *
 * Used carefully: naming what a purchase already made would have become is exactly the cruelty
 * Cleo's rule warns against — money already spent cannot be unspent. This is for *future*
 * choices only.
 */
export function compoundedOneOff(amount: number, years: number, annualRatePct = 10): number {
  return Math.round(amount * (1 + annualRatePct / 100) ** years)
}

/**
 * How many months a debt takes to clear at a given monthly payment.
 *
 * Returns null where it never clears — which is not an edge case on an Indian credit card. At
 * IDBI's own 34.8% a year, ₹5.83 lakh accrues about ₹16,900 a month in interest alone, so a
 * ₹6,898 payment leaves the balance *growing*. Dividing the balance by the payment, as a naive
 * plan does, would have promised a payoff in 85 months that will never arrive.
 *
 * Getting this wrong is not a rounding error. It is a plan that cannot happen, presented to
 * someone who is trusting us, and it is the single easiest way to lose a room of bankers.
 */
export function monthsToClear(
  principal: number,
  annualRatePct: number,
  monthlyPayment: number,
): number | null {
  if (principal <= 0) return 0
  if (monthlyPayment <= 0) return null

  const r = annualRatePct / 100 / 12
  if (r === 0) return Math.ceil(principal / monthlyPayment)

  // The payment has to beat the interest accruing on the balance, or the debt never falls.
  const interestOnly = principal * r
  if (monthlyPayment <= interestOnly) return null

  return Math.ceil(-Math.log(1 - (r * principal) / monthlyPayment) / Math.log(1 + r))
}

/** The smallest payment that actually retires a debt within `months`. */
export function paymentToClear(principal: number, annualRatePct: number, months: number): number {
  if (months <= 0) return principal
  const r = annualRatePct / 100 / 12
  if (r === 0) return Math.ceil(principal / months)
  return Math.ceil((principal * r) / (1 - (1 + r) ** -months))
}

/** Interest accruing each month at the current balance. The number that ends the argument. */
export function monthlyInterest(principal: number, annualRatePct: number): number {
  return Math.round((principal * annualRatePct) / 100 / 12)
}

export interface Payoff {
  /** Months until the balance is retired at this payment. */
  months: number
  /** Every rupee that leaves the account over those months. */
  totalPaid: number
  /** The part of it the lender keeps. */
  totalInterest: number
  /** What the same debt costs if only the interest-plus-1% minimum is paid, for contrast. */
  minimumTotalInterest: number | null
  /** Months the same debt runs on at that minimum. Null where it never retires. */
  minimumMonths: number | null
}

/**
 * What clearing a debt actually costs, month by month, summed.
 *
 * The counterpart of `project` for the other kind of goal. A customer whose plan is "clear the
 * card" has no compounding curve to look at — and the Plan tab's numbers pane, which draws one
 * from `project`, had nothing to show them at all. This is the arithmetic that *is* their plan:
 * how long, how much in total, and how much of it is interest.
 *
 * The minimum-payment comparison is the honest counterfactual and the reason this is worth a
 * screen. Indian issuers set the minimum near 5% of the balance, which on a 34.8% card is
 * barely above the interest — so the same debt runs for years and costs multiples more. That
 * contrast is the argument for the plan, and it is a fact about the customer's own balance
 * rather than a projection of anything.
 *
 * Simulated rather than solved in closed form because the minimum payment is recomputed off a
 * falling balance each month, which has no clean formula. Capped so a minimum that never
 * retires the balance returns null instead of looping.
 */
export function payoffSummary(
  principal: number,
  annualRatePct: number,
  monthlyPayment: number,
): Payoff | null {
  const months = monthsToClear(principal, annualRatePct, monthlyPayment)
  if (months === null || principal <= 0) return null

  const r = annualRatePct / 100 / 12
  let balance = principal
  let paid = 0
  for (let m = 0; m < months; m++) {
    const interest = balance * r
    const pay = Math.min(monthlyPayment, balance + interest)
    balance = balance + interest - pay
    paid += pay
    if (balance <= 0) break
  }

  // 5% of the balance, floored at ₹500 — the shape every Indian issuer uses. 600 months is
  // fifty years: past that the honest answer is "it does not clear", not a bigger number.
  const CAP = 600
  let minBalance = principal
  let minPaid = 0
  let minMonths = 0
  while (minBalance > 0 && minMonths < CAP) {
    const interest = minBalance * r
    const due = Math.max(500, minBalance * 0.05)
    const pay = Math.min(due, minBalance + interest)
    if (pay <= interest) {
      minMonths = CAP
      break
    }
    minBalance = minBalance + interest - pay
    minPaid += pay
    minMonths++
  }
  const minimumClears = minMonths < CAP

  return {
    months,
    totalPaid: Math.round(paid),
    totalInterest: Math.round(paid - principal),
    minimumTotalInterest: minimumClears ? Math.round(minPaid - principal) : null,
    minimumMonths: minimumClears ? minMonths : null,
  }
}

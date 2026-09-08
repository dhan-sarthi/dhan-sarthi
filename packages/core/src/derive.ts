/**
 * The Snapshot: one object, one set of numbers, derived once.
 *
 * This is the engineering guardrail that eliminates a whole
 * class of hallucination for almost no effort. The conversation reads the same object the
 * screens render, so the avatar physically cannot quote a figure the UI does not show. Nothing
 * downstream of here may touch a transaction directly.
 *
 * Two habits worth keeping while reading this file:
 *
 * **Medians, not means.** One Diwali, one hospital bill or one bonus will drag a mean far enough
 * to make the advice wrong. A customer's "normal month" is a median.
 *
 * **Complete months only.** The first and last months of any window are partial, and averaging
 * them in understates every outflow. `asOf` is usually the 1st, so the current month holds a
 * single day.
 */
import { categorize } from './categorize.ts'
import { addMonths, daysBetween, monthKey, nextPayDay, ymd } from './dates.ts'
import { commitments, detectHabits, detectRecurring, seriesKey } from './recurring.ts'
import type { Habit, Series } from './recurring.ts'
import type { CustomerFile, SpendCategory, Transaction } from './types.ts'

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

export interface IncomeFacts {
  /** The month's take-home, as a median. */
  monthly: number
  /**
   * `regular` means a salary credit we can plan against. `variable` means a trader, and every
   * downstream number has to be more conservative — it is why Sunil is a separate persona.
   */
  stability: 'regular' | 'variable'
  /** Coefficient of variation across months. */
  variation: number
  /** Day of month the money lands, where there is one. */
  payDay: number | null
  nextPayDate: string
  daysToNextPay: number
  /** How we worked it out. Recorded because the two paths deserve different confidence. */
  source: 'salary-series' | 'monthly-credits'
}

export interface CommitmentFacts {
  /** Everything that leaves every month whether the customer thinks about it or not. */
  total: number
  rent: number
  emis: number
  bills: number
  /** School fees, supporting parents. Not a leak, and never to be suggested as a cut. */
  obligations: number
  subscriptions: number
  /** Existing SIPs and mandates. Committed, but committed *to the customer's own benefit*. */
  investments: number
  series: Series[]
}

export interface DiscretionaryFacts {
  /** A normal month's discretionary spend. */
  monthly: number
  byCategory: [SpendCategory, number][]
  /** Where a spending cap would go. */
  topHabits: Habit[]
  /** Last three complete months against the three before them. */
  trend: 'rising' | 'flat' | 'falling'
  trendPct: number
  /**
   * Per-category movement, which is where the usable insight lives. Total discretionary can sit
   * flat while one category climbs 40% and another falls to compensate — and "your food spend
   * is up 40%" is actionable in a way that "your spending is unchanged" never is.
   */
  categoryTrends: { category: SpendCategory; recent: number; prior: number; changePct: number }[]
}

/**
 * The lumpy expenses a normal month does not contain.
 *
 * This exists because of a mistake that is very easy to make and very expensive to keep. Every
 * figure in this snapshot is a median, which correctly describes a *normal* month — but a year
 * also contains a hospital bill, a wedding gift and Diwali, and a SIP sized against the median
 * will break the first time one lands. Real planning calls this a sinking fund; the honest
 * version here is to name the one-offs, amortise them, and refuse to treat that money as
 * investable.
 *
 * It also gives the advisor a far better sentence than a ratio: *"you had ₹52,600 of one-off
 * costs last year — a hospital bill and a wedding. That is ₹4,400 a month to keep aside, not
 * to invest."*
 */
export interface IrregularFacts {
  /** The actual expenses, so "why?" can be answered with the transactions themselves. */
  oneOffs: { date: string; narration: string; amount: number; category: SpendCategory }[]
  total: number
  /** The full run rate: one-off costs amortised across all the history available. */
  monthlyRunRate: number
  /**
   * What actually comes off the surplus, after crediting the emergency buffer.
   *
   * A funded buffer is *precisely* the instrument for absorbing a hospital bill, so charging a
   * customer twice — once by holding six months of expenses in reserve and again by shrinking
   * their SIP — is wrong. Scaled by how far the buffer falls short: fully funded means no
   * provision, nothing saved means the whole run rate.
   */
  monthlyProvision: number
}

export interface BalanceFacts {
  savings: number
  deposits: number
  total: number
  /**
   * The lowest the savings balance reached in twelve months. Money that was never needed, and
   * the single number the whole pitch rests on — it is idle by demonstration, not by assumption.
   */
  idleFloor: number
  /** Consecutive recent months whose closing balance held above one month of outflow. */
  idleMonths: number
}

export interface BufferFacts {
  /** Null where the monthly outflow is unknown: an unknown ratio, not a zero one. */
  monthsCovered: number | null
  targetMonths: number
  shortfall: number
}

export interface DebtFacts {
  total: number
  /** Anything above the threshold outranks every product on the shelf. */
  hasHighInterest: boolean
  highestRate: number
  missedRepayment: boolean
  monthlyOutgo: number
  /** A loan about to finish is a raise nobody notices. Deliberately surfaced. */
  endingSoon: { loanType: string; emiAmount: number; monthsLeft: number } | null
}

export interface ProtectionFacts {
  dependents: number
  lifeCoverInForce: number
  healthCoverInForce: number
  /** Ten times annual income, the standard thumb rule. Zero where there are no dependents. */
  lifeCoverNeeded: number
  gap: number
}

export interface QualityFacts {
  transactions: number
  monthsOfHistory: number
  /** Share of transactions we could name a merchant or a mandate for. */
  categorisedShare: number
  /** Share of rupees we could not explain. Reported, never hidden. */
  unexplainedShare: number
}

export interface Snapshot {
  asOf: string
  customer: {
    name: string
    age: number
    dependents: number
    city: string
    riskProfile: CustomerFile['customer']['riskProfile']
    employmentType: CustomerFile['customer']['employmentType']
    language: string
    taxRegime: CustomerFile['customer']['taxRegime']
    /**
     * A twelfth of the income the customer declared, which is not the same thing as
     * `income.monthly` and is needed beside it.
     *
     * `income.monthly` is read off the credits in the statement and is the better number when
     * there is a statement to read. Over IDBI's own feed there frequently is not: `txnCat` is
     * `TCI` on every row and the narrations carry no payroll marker, so no salary is
     * recognisable and the derived figure is zero for a customer who plainly has an income.
     * Anything sized from the derived figure then comes out at zero too — which is how a
     * six-month emergency fund ended up proposed with a target of ₹0.
     *
     * So the declared figure is carried as the fallback it is. It comes from the customer
     * rather than the bank, `/api/v1/profile` is where they change it, and nothing prefers it
     * over a figure actually observed in the ledger.
     */
    declaredMonthlyIncome: number
  }
  income: IncomeFacts
  commitments: CommitmentFacts
  discretionary: DiscretionaryFacts
  irregular: IrregularFacts
  surplus: {
    /** Income less commitments less a normal month's discretionary spending. */
    monthly: number
    /** Already going into investments each month. Committed, but to the customer's benefit. */
    alreadyInvested: number
    /**
     * What may actually be committed to a new product: the normal-month surplus less the
     * provision for irregular expenses. **This is the number the suitability gate must check
     * an amount against**, and the number the roadmap may plan with. Never negative.
     */
    deployable: number
  }
  balances: BalanceFacts
  buffer: BufferFacts
  debt: DebtFacts
  protection: ProtectionFacts
  holdings: {
    total: number
    equity: number
    debt: number
    /**
     * What the holdings themselves say is going in each month.
     *
     * Distinct from `commitments.investments`, which is the SIP debits *recognised in the
     * statement* — and over a feed whose narrations carry no merchant that is zero even for a
     * customer with a live SIP. The screen said "Nothing going in each month" above a ₹7.2 lakh
     * portfolio with a ₹5,000 monthly mandate on it.
     */
    sipMonthly: number
  }
  quality: QualityFacts
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return Math.round(sorted[mid] ?? 0)
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
}

function variation(values: readonly number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  if (mean === 0) return 0
  const v = values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length
  return Math.sqrt(v) / mean
}

/** Complete calendar months in the window, oldest first. Partial months at either end drop. */
function completeMonths(txns: readonly Transaction[]): string[] {
  const keys = [...new Set(txns.map((t) => monthKey(t.txnDate)))].sort()
  return keys.slice(1, -1)
}

function ageOn(dob: string, asOf: string): number {
  const b = ymd(dob)
  const a = ymd(asOf)
  let age = a.year - b.year
  if (a.month < b.month || (a.month === b.month && a.day < b.day)) age -= 1
  return age
}

/* ------------------------------------------------------------------ *
 * Derivation
 * ------------------------------------------------------------------ */

export interface DeriveOptions {
  /** Months of history to reason over. Twelve describes how someone lives *now*. */
  window: number
  /** Buffer target. Three months is the floor the suitability gate enforces; six is the goal. */
  bufferTargetMonths: number
  /** Above this, debt outranks every investment. Indian cards run 30-42%; IDBI's is 34.8%. */
  highInterestThreshold: number
  /** A loan inside this many months of ending is a raise about to happen. */
  emiEndingWithinMonths: number
}

const DEFAULTS: DeriveOptions = {
  window: 12,
  bufferTargetMonths: 6,
  highInterestThreshold: 24,
  emiEndingWithinMonths: 6,
}

export function derive(
  file: CustomerFile,
  asOf: string,
  options?: Partial<DeriveOptions>,
): Snapshot {
  const opts = { ...DEFAULTS, ...options }
  const from = addMonths(asOf, -opts.window)
  const window = file.transactions.filter((t) => t.txnDate >= from && t.txnDate <= asOf)
  const months = completeMonths(window)
  const inMonth = (key: string): Transaction[] => window.filter((t) => monthKey(t.txnDate) === key)

  /* Recurring analysis, which everything else leans on ---------------- */

  const allSeries = detectRecurring(window, asOf)
  const committed = commitments(allSeries)
  const habits = detectHabits(window, asOf)

  /* Income ------------------------------------------------------------ */

  const incomeSeries = allSeries
    .filter((s) => s.kind === 'income' && s.active)
    .sort((a, b) => b.monthlyCost - a.monthlyCost)

  const creditsByMonth = months.map((k) =>
    inMonth(k)
      .filter((t) => t.txnType === 'CREDIT')
      .reduce((s, t) => s + t.txnAmount, 0),
  )
  const incomeVariation = variation(creditsByMonth)

  // Prefer a detected salary series: it is one regular event we can name a date for, which is
  // what the daily plan needs. Fall back to summing credits, which is the only option for a
  // trader — and mark it, because a number derived that way deserves less confidence.
  const primary = incomeSeries[0]
  const useSeries = primary !== undefined && primary.cadence === 'monthly' && incomeVariation < 0.15

  const payDayOfMonth = useSeries && primary ? primary.dayOfMonth : null
  const nextPayDate = nextPayDay(asOf, payDayOfMonth ?? 1)

  const income: IncomeFacts = {
    monthly: useSeries && primary ? primary.monthlyCost : median(creditsByMonth),
    stability: incomeVariation < 0.15 ? 'regular' : 'variable',
    variation: Number(incomeVariation.toFixed(3)),
    payDay: payDayOfMonth,
    nextPayDate,
    daysToNextPay: Math.max(0, daysBetween(asOf, nextPayDate)),
    source: useSeries ? 'salary-series' : 'monthly-credits',
  }

  /* Commitments ------------------------------------------------------- */

  const sumKind = (kinds: readonly Series['kind'][]): number =>
    committed.filter((s) => kinds.includes(s.kind)).reduce((sum, s) => sum + s.monthlyCost, 0)

  const investmentMandates = allSeries.filter((s) => s.active && s.kind === 'sip')
  const subscriptionSeries = allSeries.filter((s) => s.active && s.kind === 'subscription')

  const rent = sumKind(['rent'])
  const emis = sumKind(['emi'])
  const bills = sumKind(['bill'])
  const obligations = sumKind(['obligation', 'transfer'])
  const subs = subscriptionSeries.reduce((s, x) => s + x.monthlyCost, 0)
  const investments = investmentMandates.reduce((s, x) => s + x.monthlyCost, 0)

  const countedSeries = [...committed, ...subscriptionSeries, ...investmentMandates]

  const commitmentFacts: CommitmentFacts = {
    rent,
    emis,
    bills,
    obligations,
    subscriptions: subs,
    investments,
    total: rent + emis + bills + obligations + subs + investments,
    series: [...countedSeries].sort((a, b) => b.monthlyCost - a.monthlyCost),
  }

  // Every transaction already counted as a commitment, so it cannot also be counted as
  // discretionary. Built from *all* the counted series rather than only the "owed" ones:
  // subscriptions were previously in both totals, which inflated a customer's outgoings by the
  // exact cost of their subscriptions and made Priya look like she overspends her salary when
  // her balance says otherwise.
  const committedTxnIds = new Set(countedSeries.flatMap((s) => s.txnIds))

  /* Discretionary ----------------------------------------------------- */

  // Categories that are never discretionary, whether or not they form a recurring series. A
  // one-off ₹46,000 school payment is not "spending you could cut", and counting it as such
  // both distorts the trend and produces advice that insults the customer.
  const NEVER_DISCRETIONARY: ReadonlySet<SpendCategory> = new Set<SpendCategory>([
    'Investment',
    'Insurance',
    'Education',
    'Loan EMI',
    'Fees & charges',
    'Income',
  ])

  const isDiscretionary = (t: Transaction): boolean => {
    if (t.txnType !== 'DEBIT') return false
    if (committedTxnIds.has(t.txnId)) return false
    return !NEVER_DISCRETIONARY.has(categorize(t).category)
  }

  const discretionaryByMonth = months.map((k) =>
    inMonth(k)
      .filter(isDiscretionary)
      .reduce((s, t) => s + t.txnAmount, 0),
  )

  const byCategory = new Map<SpendCategory, number>()
  for (const t of window) {
    if (!isDiscretionary(t)) continue
    const c = categorize(t).category
    byCategory.set(c, (byCategory.get(c) ?? 0) + t.txnAmount)
  }

  // Three complete months against the three before. Shorter is noise; longer misses a change
  // while it is still worth naming — and per Cleo's rule, only a gap they can still act on.
  //
  // Compared on medians, not means: with three values the median is the middle one, so a single
  // unusual month cannot invent a trend. One hospital bill was otherwise enough to report a
  // 44% fall in spending that never happened.
  const shift = (series: readonly number[]): number => {
    const recent = median(series.slice(-3))
    const prior = median(series.slice(-6, -3))
    return prior === 0 ? 0 : (recent - prior) / prior
  }

  const monthlyFor = (predicate: (t: Transaction) => boolean): number[] =>
    months.map((k) =>
      inMonth(k)
        .filter(predicate)
        .reduce((s, t) => s + t.txnAmount, 0),
    )

  const trendPct = shift(discretionaryByMonth)

  const categoryTrends = [...byCategory.keys()]
    .map((category) => {
      const series = monthlyFor((t) => isDiscretionary(t) && categorize(t).category === category)
      return {
        category,
        recent: median(series.slice(-3)),
        prior: median(series.slice(-6, -3)),
        changePct: Number(shift(series).toFixed(3)),
      }
    })
    // Only movements worth a sentence, and only on categories big enough to matter. A 60% jump
    // on ₹300 of stationery is arithmetically true and completely useless.
    .filter((c) => Math.abs(c.changePct) >= 0.15 && c.recent >= 1_000)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))

  const discretionary: DiscretionaryFacts = {
    monthly: median(discretionaryByMonth),
    byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    topHabits: habits.slice(0, 8),
    trend: trendPct > 0.1 ? 'rising' : trendPct < -0.1 ? 'falling' : 'flat',
    trendPct: Number(trendPct.toFixed(3)),
    categoryTrends,
  }

  /* Balances ---------------------------------------------------------- */

  const savings = file.accounts
    .filter((a) => a.accountType === 'Savings' || a.accountType === 'Current')
    .reduce((s, a) => s + a.currentBalance, 0)
  const deposits = file.accounts
    .filter((a) => a.accountType === 'FD' || a.accountType === 'RD')
    .reduce((s, a) => s + a.currentBalance, 0)

  const balancesInWindow = window
    .map((t) => t.balanceAfterTxn)
    .filter((b): b is number => b !== null)

  const monthlyOutflow = commitmentFacts.total + discretionary.monthly

  // Consecutive recent months whose closing balance held above one month of outflow. "Four
  // months running" is what makes a banker believe the money is genuinely idle rather than
  // merely present on the day we happened to look.
  let idleMonths = 0
  for (let i = months.length - 1; i >= 0; i -= 1) {
    const key = months[i]
    if (!key) break
    const closes = inMonth(key)
      .map((t) => t.balanceAfterTxn)
      .filter((b): b is number => b !== null)
    const close = closes[closes.length - 1]
    if (close === undefined || close < monthlyOutflow) break
    idleMonths += 1
  }

  const balances: BalanceFacts = {
    savings,
    deposits,
    total: savings + deposits,
    idleFloor: balancesInWindow.length > 0 ? Math.min(...balancesInWindow) : savings,
    idleMonths,
  }

  /* Buffer ------------------------------------------------------------ */

  // Deposits count towards a buffer only where they can actually be reached. An ordinary FD can
  // be broken at a penalty, so it counts; a five-year tax-saver could not, and should be
  // excluded once the shelf carries the lock-in per holding.
  const reachable = savings + deposits
  /*
   * Null where the outflow is unknown, which is not the same as zero cover.
   *
   * This used to report 0 when `monthlyOutflow` was 0, and the buffer insight fires below
   * three months — so a customer with ₹4.4 lakh in reachable savings and a statement too
   * sparse to show any commitments was told her savings cover about zero months of her
   * outgoings. Over IDBI's own statement that is the normal case rather than an edge one:
   * `txnCat` is `TCI` on every row, so nothing is recognisable as rent or an EMI and the
   * outflow legitimately comes out unknown. A ratio with an unknown denominator has no value,
   * and saying so is the only honest option.
   */
  const monthsCovered = monthlyOutflow === 0 ? null : reachable / monthlyOutflow

  const buffer: BufferFacts = {
    monthsCovered: monthsCovered === null ? null : Number(monthsCovered.toFixed(1)),
    targetMonths: opts.bufferTargetMonths,
    shortfall: Math.max(0, Math.round(opts.bufferTargetMonths * monthlyOutflow - reachable)),
  }

  /* Debt -------------------------------------------------------------- */

  const rates = file.liabilities.map((l) => l.loanInterestRate)
  const endingSoon = file.liabilities
    .filter(
      (l) => l.tenureRemainingMonths > 0 && l.tenureRemainingMonths <= opts.emiEndingWithinMonths,
    )
    .sort((a, b) => a.tenureRemainingMonths - b.tenureRemainingMonths)[0]

  const debt: DebtFacts = {
    total: file.liabilities.reduce((s, l) => s + l.outstandingPrincipal, 0),
    hasHighInterest: file.liabilities.some((l) => l.loanInterestRate >= opts.highInterestThreshold),
    highestRate: rates.length > 0 ? Math.max(...rates) : 0,
    missedRepayment: file.liabilities.some((l) => l.dpdStatus > 0),
    monthlyOutgo: file.liabilities.reduce((s, l) => s + l.emiAmount, 0),
    endingSoon: endingSoon
      ? {
          loanType: endingSoon.loanType,
          emiAmount: endingSoon.emiAmount,
          monthsLeft: endingSoon.tenureRemainingMonths,
        }
      : null,
  }

  /* Protection -------------------------------------------------------- */

  const life = file.policies
    .filter((p) => p.assetClass === 'Protection' && /TERM|LIFE|PMJJBY/i.test(p.name))
    .reduce((s, p) => s + p.investedAmount, 0)
  const health = file.policies
    .filter((p) => /HEALTH|MEDICLAIM|BUPA/i.test(p.name))
    .reduce((s, p) => s + p.investedAmount, 0)

  const dependents = file.customer.dependents
  /*
   * Ten times annual income is the standard thumb rule, and it is a rule of thumb rather than a
   * calculation. Anything shown to a customer as a cover requirement has to say so.
   *
   * Which income, though. The observed figure is the better one and is used wherever it exists,
   * but it is read off payroll markers in the narrations and IDBI's own statement carries none
   * — so it comes out zero for a customer who plainly earns. Ten times zero is zero, and a
   * requirement of zero closes the protection gap by arithmetic: a customer with a dependent
   * and a ₹1 crore policy against a ₹24 lakh declared income was told she needed no cover at
   * all, and the gap the app exists to find silently did not exist. So the declared income is
   * the fallback, and a cover requirement is never sized from a figure of zero.
   */
  const annualForCover =
    income.monthly > 0 ? income.monthly * 12 : file.customer.declaredAnnualIncome
  const needed = dependents > 0 ? annualForCover * 10 : 0

  const protection: ProtectionFacts = {
    dependents,
    lifeCoverInForce: life,
    healthCoverInForce: health,
    lifeCoverNeeded: needed,
    gap: Math.max(0, needed - life),
  }

  /* Holdings and data quality ----------------------------------------- */

  const holdings = {
    total: file.holdings.reduce((s, h) => s + h.currentValue, 0),
    equity: file.holdings
      .filter((h) => h.assetClass === 'Equity')
      .reduce((s, h) => s + h.currentValue, 0),
    debt: file.holdings
      .filter((h) => h.assetClass === 'Debt')
      .reduce((s, h) => s + h.currentValue, 0),
    sipMonthly: file.holdings
      .filter((h) => h.sipActive)
      .reduce((s, h) => s + (h.sipAmount ?? 0), 0),
  }

  let named = 0
  let unexplainedValue = 0
  let totalValue = 0
  for (const t of window) {
    const e = categorize(t)
    totalValue += t.txnAmount
    if (e.method === 'merchant' || e.method === 'mandate' || e.method === 'keyword') named += 1
    else unexplainedValue += t.txnAmount
  }

  /* Irregular expenses ------------------------------------------------ */

  // "Large" is relative to how this customer normally spends, not an absolute rupee figure:
  // ₹20,000 is an ordinary weekend for Priya and a crisis for Sunil. Half a normal month's
  // discretionary spending, with a floor so a very frugal customer does not have every grocery
  // run classified as a shock.
  const oneOffThreshold = Math.max(10_000, discretionary.monthly * 0.5)

  // Detected across *all* available history rather than the reasoning window. These are rare
  // events by definition, and a hospital bill amortised over the eleven months that happen to
  // contain it reads as a ₹9,591 monthly habit — which cut Rohan's investable surplus to a
  // quarter of what he demonstrably accumulates.
  const countedKeys = new Set(countedSeries.map((s) => s.key))
  const isOneOff = (t: Transaction): boolean =>
    t.txnType === 'DEBIT' &&
    !countedKeys.has(seriesKey(t.narration)) &&
    !NEVER_DISCRETIONARY.has(categorize(t).category) &&
    t.txnAmount >= oneOffThreshold

  const historyMonths = Math.max(1, completeMonths(file.transactions).length)

  const oneOffs = file.transactions
    .filter(isOneOff)
    .map((t) => ({
      date: t.txnDate,
      narration: t.narration,
      amount: t.txnAmount,
      category: categorize(t).category,
    }))
    .sort((a, b) => b.amount - a.amount)

  const oneOffTotal = oneOffs.reduce((s, o) => s + o.amount, 0)
  const runRate = oneOffTotal / historyMonths

  // 1 where the buffer is at or above target, 0 where there is nothing saved — and 0 where the
  // outflow is unknown, because an unproven buffer has to be treated as an absent one wherever
  // the number gates something.
  const bufferCoverage =
    monthsCovered === null ? 0 : Math.min(1, Math.max(0, monthsCovered / opts.bufferTargetMonths))

  const irregular: IrregularFacts = {
    oneOffs,
    total: oneOffTotal,
    monthlyRunRate: Math.round(runRate),
    monthlyProvision: Math.round(runRate * (1 - bufferCoverage)),
  }

  const surplusMonthly = income.monthly - commitmentFacts.total - discretionary.monthly

  return {
    asOf,
    customer: {
      name: file.customer.custName,
      age: ageOn(file.customer.dateOfBirth, asOf),
      dependents,
      city: file.customer.city,
      declaredMonthlyIncome: Math.round(file.customer.declaredAnnualIncome / 12),
      riskProfile: file.customer.riskProfile,
      employmentType: file.customer.employmentType,
      language: file.customer.preferredLanguage,
      taxRegime: file.customer.taxRegime,
    },
    income,
    commitments: commitmentFacts,
    discretionary,
    irregular,
    surplus: {
      monthly: Math.round(surplusMonthly),
      alreadyInvested: commitmentFacts.investments,
      // Never negative: a customer spending more than they earn has nothing to deploy, and
      // saying otherwise is how advice becomes harm.
      deployable: Math.max(0, Math.round(surplusMonthly - irregular.monthlyProvision)),
    },
    balances,
    buffer,
    debt,
    protection,
    holdings,
    quality: {
      transactions: window.length,
      monthsOfHistory: months.length,
      categorisedShare: window.length === 0 ? 0 : Number((named / window.length).toFixed(3)),
      unexplainedShare: totalValue === 0 ? 0 : Number((unexplainedValue / totalValue).toFixed(3)),
    },
  }
}

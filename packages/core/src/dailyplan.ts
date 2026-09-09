/**
 * The daily plan: what to say today.
 *
 * Cleo's shape, and it is the right one — *"every day she shows you what has happened since you
 * last checked in, whether you are still on track, and what you can spend today without throwing
 * off your goals."* Three pieces, and exactly one thing to do.
 *
 * The cadence question this module answers, from `docs/product/autopilot.md`: a wealth
 * decision is not a daily event, so the daily loop is not there to sell anything. It is there to
 * keep someone oriented, and **that is how the app earns the right to give the monthly advice.**
 */
import type { Action } from './actions.ts'
import { addDays, monthKey } from './dates.ts'
import type { Snapshot } from './derive.ts'
import { findInsights } from './insights.ts'
import type { Insight } from './insights.ts'
import { compoundedValueOf } from './projection.ts'
import type { Roadmap } from './roadmap.ts'
import { evaluate } from './suitability.ts'
import type { Product, Transaction } from './types.ts'

export interface SafeToSpend {
  /** What is left to spend before the next salary, after everything already owed. */
  pot: number
  /** The pot divided by the days remaining. The number that fits on one line. */
  perDay: number
  daysToSalary: number
  nextSalaryDate: string
  /**
   * Whether the date above is a salary landing or just the turn of the month. A shop owner has
   * no pay day, and telling him his salary arrives on the 1st is the kind of line that loses a
   * banker's trust in one glance.
   */
  incomeStability: 'regular' | 'variable'
  /** Held back deliberately. Shown so the number is never a black box. */
  reserved: { label: string; amount: number }[]
}

export interface DailyPlan {
  date: string
  /** Since the customer last opened the app. The "what did I miss" answer. */
  since: {
    from: string
    transactions: Transaction[]
    spent: number
    /** True where a category the customer capped has been exceeded. */
    capBreached: boolean
  }
  onRoute: boolean
  /** One sentence on the route. Never a scold — see the note on tone below. */
  routeNote: string
  safeToSpend: SafeToSpend
  /** Exactly one. "One action at a time" is the entire differentiation. */
  primary: Action | null
  /** Available but not pushed. The customer asked for these, we did not offer them. */
  secondary: Action[]
  insights: Insight[]
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

export interface DailyPlanOptions {
  /** When the customer last looked. Everything in `since` is measured from here. */
  lastSeen: string
  /** Categories the customer has accepted a cap on, and the monthly limit. */
  caps: { category: string; monthlyLimit: number }[]
  /** Horizon used for the compounding line. Retirement age less current age, normally. */
  horizonYears: number
  assumedRatePct: number
}

/**
 * Build today.
 *
 * Pure: snapshot, roadmap and ledger in, plan out. No clock — `asOf` is supplied so the demo's
 * time machine can ask for any day and get the plan as it stood.
 */
export function buildDailyPlan(
  snapshot: Snapshot,
  roadmap: Roadmap | null,
  transactions: readonly Transaction[],
  shelf: readonly Product[],
  asOf: string,
  options?: Partial<DailyPlanOptions>,
): DailyPlan {
  const lastSeen = options?.lastSeen ?? addDays(asOf, -7)
  const caps = options?.caps ?? []
  const horizonYears = options?.horizonYears ?? 30
  const ratePct = options?.assumedRatePct ?? 10

  /* Since you were away ----------------------------------------------- */

  const since = transactions.filter(
    (t) => t.txnDate > lastSeen && t.txnDate <= asOf && t.txnType === 'DEBIT',
  )
  const spentSince = since.reduce((s, t) => s + t.txnAmount, 0)

  // The calendar month, which is what the safe-to-spend envelope below is measured against: an
  // envelope genuinely does reset when the month does.
  const thisMonth = transactions.filter(
    (t) => monthKey(t.txnDate) === monthKey(asOf) && t.txnType === 'DEBIT',
  )

  /*
   * A cap, though, is measured over a month of spending ending today.
   *
   * The calendar month was the obvious reading of "monthly limit" and it made the whole feature
   * silently dead at the start of one: on the 1st, month-to-date is empty, so a cap of one rupee
   * against a customer who had spent a lakh the previous week reported nothing wrong. A limit
   * that only starts working around the 10th is a limit somebody will conclude is broken.
   *
   * A trailing window is also the truer measure. The question a cap answers is "am I spending
   * more than I meant to", and that does not reset because a month did.
   */
  const capWindowFrom = addDays(asOf, -30)
  const capWindow = transactions.filter(
    (t) => t.txnDate > capWindowFrom && t.txnDate <= asOf && t.txnType === 'DEBIT',
  )
  const capBreached = caps.some((cap) => {
    const spent = capWindow
      .filter((t) => t.spendCategory === cap.category)
      .reduce((s, t) => s + t.txnAmount, 0)
    return spent > cap.monthlyLimit
  })

  /* Safe to spend ------------------------------------------------------ */

  // The stage the customer is actually funding right now.
  const commitment = roadmap?.monthlyCommitment ?? 0

  // What has already gone on *discretionary* spending this month.
  //
  // Only discretionary: rent, EMIs and bills are subtracted once already as commitments, and
  // counting them here as well took them off the envelope twice — which showed a customer as
  // having spent ₹57,952 in a month whose discretionary spending is nearer ₹20,000.
  const committedIds = new Set(snapshot.commitments.series.flatMap((x) => x.txnIds))
  const spentThisMonth = thisMonth
    .filter((txn) => {
      if (committedIds.has(txn.txnId)) return false
      const c = txn.spendCategory
      return (
        c !== 'Investment' &&
        c !== 'Insurance' &&
        c !== 'Loan EMI' &&
        c !== 'Income' &&
        c !== 'Education' &&
        c !== 'Fees & charges'
      )
    })
    .reduce((sum, txn) => sum + txn.txnAmount, 0)

  // The month's envelope, not the account balance.
  //
  // This looked right computed from `balances.savings` and was badly wrong: it told a customer
  // with two years of accumulated savings that ₹4,792 a day was safe, when his actual
  // discretionary spending is nearer ₹670. Safe-to-spend is a *budget* question — what is left
  // of this month's income after everything owed — and the accumulated balance is precisely the
  // money the whole product exists to stop him spending.
  const envelope = Math.round(snapshot.income.monthly - snapshot.commitments.total - commitment)

  const reserved = [
    { label: 'Bills and commitments', amount: Math.round(snapshot.commitments.total) },
    { label: 'Your plan this month', amount: Math.round(commitment) },
    { label: 'Already spent this month', amount: Math.round(spentThisMonth) },
  ].filter((r) => r.amount > 0)

  const pot = Math.max(0, envelope - Math.round(spentThisMonth))
  const daysToSalary = Math.max(1, snapshot.income.daysToNextPay)

  const safeToSpend: SafeToSpend = {
    pot,
    perDay: Math.round(pot / daysToSalary),
    daysToSalary,
    nextSalaryDate: snapshot.income.nextPayDate,
    incomeStability: snapshot.income.stability,
    reserved,
  }

  /* On route ----------------------------------------------------------- */

  // Tone matters more here than anywhere else in the app, and Cleo's finding is specific:
  // "you've run out of your budget this week" tested badly, and "you've got ₹35 for groceries
  // for the next few days, let's see how we can make that stretch" tested well. Empathy,
  // encouragement, timing. A *bank* saying the first version is worse still.
  const onRoute = pot > 0 && !capBreached
  /*
   * Every branch below but the last two quotes a pay date, and there is not always one to
   * quote. With no salary recognisable in the statement `nextPayDate` is a month boundary the
   * derivation guessed at, so "Tight until 02 June. Let us get through the 13 days" was told to
   * a customer whose statement contains no salary and no commitments — a countdown to a date
   * that came from nowhere. Where the income is unknown the note says what is actually true and
   * asks for the missing piece.
   */
  const incomeKnown = snapshot.income.monthly > 0
  /*
   * A cap is the customer's own limit, so it is worth saying whether or not there is an income
   * to build an allowance from. Without this the branch below swallowed it: a customer with no
   * recognisable salary could set a limit, go past it, and be told nothing.
   */
  const capNote = capBreached ? ` You are also over a limit you set.` : ''
  const routeNote = !incomeKnown
    ? `I have not found a salary in this statement, so I am not counting down to one. ` +
      `${inr(snapshot.balances.total)} is what I can see in your accounts. Tell me what comes ` +
      `in each month and I can tell you what is safe to spend.${capNote}`
    : !roadmap
      ? `${inr(pot)} to last ${daysToSalary} days — about ${inr(safeToSpend.perDay)} a day.`
      : pot <= 0
        ? `Tight until ${snapshot.income.nextPayDate.slice(8)} ${monthName(snapshot.income.nextPayDate)}. ` +
          `Your plan is safe — I have kept that aside. Let us get through the ${daysToSalary} days.`
        : capBreached
          ? `You are over on a cap you set. Still ${inr(pot)} in hand for ${daysToSalary} days, ` +
            `so nothing is broken — worth knowing, not worth worrying about.`
          : `On track. ${inr(safeToSpend.perDay)} a day for the next ${daysToSalary} days, and this ` +
            `month's ${inr(commitment)} is already set aside.`

  /* The one action ----------------------------------------------------- */

  const insights = findInsights(snapshot)
  const actions = insights
    .map((insight) => toAction(insight, snapshot, shelf, horizonYears, ratePct))
    .filter((a): a is Action => a !== null)

  return {
    date: asOf,
    since: {
      from: lastSeen,
      transactions: since.slice(-12),
      spent: spentSince,
      capBreached,
    },
    onRoute,
    routeNote,
    safeToSpend,
    primary: actions[0] ?? null,
    secondary: actions.slice(1, 4),
    insights,
  }
}

function monthName(iso: string): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  return months[Number(iso.slice(5, 7)) - 1] ?? ''
}

/**
 * Turn an insight into something tappable.
 *
 * Every action that names a product goes through the suitability gate here, so an action cannot
 * reach a screen without a verdict attached. The gate is not a filter applied later — it is on
 * the only path an action can take.
 */
function toAction(
  insight: Insight,
  snapshot: Snapshot,
  shelf: readonly Product[],
  horizonYears: number,
  ratePct: number,
): Action | null {
  if (!insight.suggests) return null

  const pickBy = (predicate: (p: Product) => boolean): Product | undefined =>
    [...shelf].filter(predicate).sort((a, b) => a.minInvestment - b.minInvestment)[0]

  const deployable = snapshot.surplus.deployable
  const id = `${insight.kind}:${insight.suggests}`

  const base = { id, kind: insight.suggests, evidence: insight.evidence }

  switch (insight.suggests) {
    case 'open_sweep_in': {
      const product = pickBy((p) => p.category === 'Sweep-in FD')
      const amount = Math.max(0, Math.round(snapshot.balances.idleFloor * 0.8))
      if (!product || amount < product.minInvestment) return null
      return withVerdict(
        {
          ...base,
          label: `Sweep ${inr(amount)} into a deposit`,
          detail:
            `Moves the part of your balance you never touch into ${product.name} at about ` +
            `${product.indicativeReturn ?? 6.8}%. It comes straight back the day you need it — ` +
            `no lock-in, no risk, no new paperwork.`,
          amount,
          productId: product.productId,
          productName: product.name,
        },
        product,
        snapshot,
        shelf,
        0,
      )
    }

    case 'start_sip':
    case 'increase_sip': {
      const freed = snapshot.debt.endingSoon?.emiAmount ?? deployable
      const amount = Math.min(Math.max(freed, 500), Math.max(deployable, 500))
      const product =
        horizonYears >= 3
          ? pickBy((p) => p.category === 'Index Fund')
          : pickBy((p) => p.category === 'Recurring Deposit')
      if (!product) return null
      return withVerdict(
        {
          ...base,
          label:
            insight.suggests === 'increase_sip'
              ? `Add ${inr(amount)} a month to your SIP`
              : `Start ${inr(amount)} a month`,
          detail:
            `Into ${product.name}. Set it for the day after your salary lands, so it goes before ` +
            `you can spend it.`,
          amount,
          productId: product.productId,
          productName: product.name,
          projected: {
            years: horizonYears,
            ratePct,
            becomes: compoundedValueOf(amount, horizonYears, ratePct),
          },
        },
        product,
        snapshot,
        shelf,
        horizonYears,
      )
    }

    case 'buy_term_cover': {
      const life = shelf.filter((p) => p.coverType === 'life' && !p.bundlesProtectionAndInvestment)

      // The most cover affordable, not the cheapest policy on the shelf. Sorting by premium put
      // a ₹2 lakh government scheme ahead of ₹1 crore of term against a ₹1.02 crore gap —
      // technically a recommendation, practically no cover at all.
      const affordable = [...life]
        .filter((p) => p.minInvestment <= Math.max(deployable, 100))
        .sort((a, b) => (b.coverAmount ?? 0) - (a.coverAmount ?? 0))[0]

      const product = affordable ?? [...life].sort((a, b) => a.minInvestment - b.minInvestment)[0]
      if (!product) return null
      return withVerdict(
        {
          ...base,
          label: `Take ${inr(product.coverAmount ?? 0)} of cover for ${inr(product.minInvestment)} a month`,
          detail:
            `${product.name}. Pure cover — no maturity value, nothing to cash in, which is exactly ` +
            `why it is this cheap.`,
          amount: product.minInvestment,
          productId: product.productId,
          productName: product.name,
        },
        product,
        snapshot,
        shelf,
        30,
      )
    }

    case 'enrol_pmjjby': {
      const product = pickBy((p) => p.category === 'Government Insurance' && p.coverType === 'life')
      if (!product) return null
      return withVerdict(
        {
          ...base,
          label: `Enrol in ${product.name}`,
          detail: `About ${inr(product.minInvestment * 12)} a year for ${inr(product.coverAmount ?? 0)} of cover. It pays the bank almost nothing.`,
          amount: product.minInvestment,
          productId: product.productId,
          productName: product.name,
        },
        product,
        snapshot,
        shelf,
        30,
      )
    }

    case 'set_category_cap': {
      const target =
        snapshot.discretionary.categoryTrends[0]?.category ??
        snapshot.discretionary.byCategory[0]?.[0]
      const trend = snapshot.discretionary.categoryTrends[0]
      const cap = trend ? trend.prior : Math.round((snapshot.discretionary.monthly / 12) * 10)
      const saved = trend ? Math.max(0, trend.recent - trend.prior) : 0
      if (!target) return null
      return {
        ...base,
        label: `Cap ${target} at ${inr(cap)} a month`,
        detail:
          `Back to what it was three months ago, not to nothing. I will tell you when you are ` +
          `close, and you can change it any time.`,
        amount: 0,
        verdictId: null,
        ...(saved > 0
          ? {
              projected: {
                years: horizonYears,
                ratePct,
                becomes: compoundedValueOf(saved, horizonYears, ratePct),
              },
            }
          : {}),
      }
    }

    case 'cancel_subscription': {
      return {
        ...base,
        label: 'Review your subscriptions',
        detail:
          'I have listed what each one actually costs you a year. I cannot tell which you still ' +
          'use — that part is yours.',
        amount: 0,
        verdictId: null,
      }
    }

    case 'pay_down_card': {
      return {
        ...base,
        label: `Put everything spare against the ${snapshot.debt.highestRate}% balance`,
        detail:
          `Before anything else. It is the highest guaranteed return available to you and it is ` +
          `not an investment.`,
        amount: Math.max(0, deployable),
        verdictId: null,
      }
    }

    case 'talk_to_rm': {
      return {
        ...base,
        label: 'Book a call with your relationship manager',
        detail:
          'They will have all of this in front of them. You will not have to explain it again.',
        amount: 0,
        verdictId: null,
      }
    }

    default:
      return null
  }
}

/** Attach the gate's verdict, and drop the action entirely where the gate refuses it. */
function withVerdict(
  action: Omit<Action, 'verdictId'>,
  product: Product,
  snapshot: Snapshot,
  shelf: readonly Product[],
  horizonYears: number,
): Action | null {
  const verdict = evaluate({
    product,
    snapshot,
    amount: action.amount,
    goal: horizonYears > 0 ? { kind: 'suggested', horizonYears } : null,
    alternatives: shelf,
  })

  // A blocked action does not reach a screen. The refusal is not silence, though — the insight
  // that produced it is still on the list, and the roadmap explains what has to happen first.
  if (verdict.verdict === 'BLOCKED') return null

  return { ...action, verdictId: null }
}

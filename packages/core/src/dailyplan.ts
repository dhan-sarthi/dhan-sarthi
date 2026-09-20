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
import { compoundedValueOf, monthsToClear } from './projection.ts'
import type { Roadmap } from './roadmap.ts'
import { evaluate } from './suitability.ts'
import type { Product, Transaction } from './types.ts'

export interface SafeToSpend {
  /** What is left to spend before the next salary, after everything already owed. */
  pot: number
  /**
   * The month's discretionary allowance before anything was spent out of it: income less
   * commitments less the plan. `pot` is this less what has gone already.
   *
   * Carried explicitly because the screen used to rebuild it by finding a reserved row whose
   * **label** began with "Already" — so renaming that label to "Spent so far this month" made the
   * match fail, the fallback zero applied, and the card read "₹20,943 left of ₹20,943". A figure
   * recovered from display copy is a figure one copy edit away from being wrong.
   */
  envelope: number
  /**
   * The customer's own monthly ceiling, or null where they never set one.
   *
   * Carried separately from `envelope` because the screen has to be able to say *whose*
   * number it is showing. "You set this" and "this is what your salary leaves" are different
   * sentences, and a limit the customer chose is the one they will actually defend.
   */
  limit: number | null
  /** What the month leaves after everything owed, before any limit is applied. */
  affordable: number
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

/**
 * A large round figure the way it is said, not the way it is stored.
 *
 * `inr` is right for a balance, which has to be exact. A **cover amount** is not a balance: it is
 * a round target, and `₹1,00,00,000` is eight digits a customer has to count before they know
 * whether it says one crore or ten. It appeared that way in the decision record, where six months
 * of history put it on screen twice, and nobody reading that list is auditing the zeroes.
 */
const spoken = (n: number): string => {
  const abs = Math.abs(n)
  const trim = (v: number): string => String(Number(v.toFixed(2)))
  if (abs >= 1_00_00_000) return `₹${trim(n / 1_00_00_000)} crore`
  if (abs >= 1_00_000) return `₹${trim(n / 1_00_000)} lakh`
  return inr(n)
}

export interface DailyPlanOptions {
  /** When the customer last looked. Everything in `since` is measured from here. */
  lastSeen: string
  /** Categories the customer has accepted a cap on, and the monthly limit. */
  caps: { category: string; monthlyLimit: number }[]
  /** Horizon used for the compounding line. Retirement age less current age, normally. */
  horizonYears: number
  assumedRatePct: number
  /**
   * A monthly ceiling the customer set on their own discretionary spending.
   *
   * Null or absent means the envelope is whatever their income leaves after everything owed,
   * which is the figure this module has always computed. A limit *replaces* that figure and
   * may only ever lower it: a customer who sets a limit above what they actually have has not
   * given themselves more money, and an app that agreed would be the only thing in the room
   * lying to them.
   */
  spendLimit: number | null
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
  const spendLimit = options?.spendLimit ?? null

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
  const affordable = Math.round(snapshot.income.monthly - snapshot.commitments.total - commitment)

  /*
   * The customer's own limit, where they set one, and never more than they can afford.
   *
   * Capping at `affordable` is the whole point of letting them set it at all. Cleo's limit is
   * a target a person chooses; ours additionally cannot be used to manufacture headroom,
   * because every figure downstream — safe to spend, the per-day line, whether today is on
   * track — is computed off this number.
   */
  const envelope = spendLimit === null ? affordable : Math.min(spendLimit, affordable)

  const reserved = [
    /*
     * Labels a person would use, not labels the code would.
     *
     * "Your plan this month" named the roadmap rather than the money: it is the amount actually
     * leaving the account towards cover and investments, and a reader cannot be expected to know
     * that "plan" is a noun this app owns. Each of these now says what the money *is*.
     */
    { label: 'Rent, bills and EMIs', amount: Math.round(snapshot.commitments.total) },
    { label: 'Saved and invested', amount: Math.round(commitment) },
    { label: 'Already spent this month', amount: Math.round(spentThisMonth) },
  ].filter((r) => r.amount > 0)

  const pot = Math.max(0, envelope - Math.round(spentThisMonth))
  const daysToSalary = Math.max(1, snapshot.income.daysToNextPay)

  const safeToSpend: SafeToSpend = {
    pot,
    envelope: Math.max(0, envelope),
    limit: spendLimit,
    affordable: Math.max(0, affordable),
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
    ? `No salary found in this statement, so there is no pay day to count to. ` +
      `${inr(snapshot.balances.total)} is what I can see. Tell me what comes in each month ` +
      `and I can tell you what is safe to spend.${capNote}`
    : !roadmap
      ? `${inr(pot)} for ${daysToSalary} days. About ${inr(safeToSpend.perDay)} a day.`
      : pot <= 0
        ? `Tight until ${snapshot.income.nextPayDate.slice(8)} ${monthName(snapshot.income.nextPayDate)}. ` +
          `Your plan money is safe — I set it aside. ${daysToSalary} days to go.`
        : capBreached
          ? `Over a cap you set. Still ${inr(pot)} for ${daysToSalary} days, so nothing is broken.`
          : // The set-aside clause only where something is actually set aside. Priya's plan
            // commits nothing this month, and the sentence read "This month's ₹0 is already
            // set aside" — a reassurance about no money at all.
            `On track. ${inr(safeToSpend.perDay)} a day for ${daysToSalary} days.` +
            (commitment > 0 ? ` This month's ${inr(commitment)} is already set aside.` : '')

  /* The one action ----------------------------------------------------- */

  const insights = findInsights(snapshot)
  /*
   * Several insights can land on the same action, and two cards proposing the identical thing
   * read as a bug even when both are honest. A price rise and a subscription review both end at
   * "review your subscriptions"; two drifting categories both end at a cap on the largest one.
   *
   * Deduplicated on what the customer actually sees — the action kind and its label — rather
   * than on the action id, which carries the originating insight and is therefore distinct by
   * construction. Rank order is preserved, so the survivor is the one the waterfall put first
   * and its evidence is the evidence for the higher-ranked reason.
   */
  const seen = new Set<string>()
  const actions = insights
    .map((insight) => toAction(insight, snapshot, shelf, horizonYears, ratePct, asOf))
    .filter((a): a is Action => a !== null)
    .filter((a) => {
      const signature = `${a.kind}:${a.label}`
      if (seen.has(signature)) return false
      seen.add(signature)
      return true
    })

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
    /*
     * Everything else the engine found, not a display slice of it.
     *
     * This was `slice(1, 4)`, and the cap was a screen's decision leaking into the data model:
     * the server's `findAction` searches `[primary, ...secondary]` when recording a decision, so
     * an action past the fourth could be shown nowhere *and* be undecidable — which is how a
     * "Talk to a human" request from the More menu came back `NOT_FOUND`. Screens pick what to
     * draw; `Today` takes the first undecided one.
     */
    secondary: actions.slice(1),
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
  asOf: string,
): Action | null {
  if (!insight.suggests) return null

  const pickBy = (predicate: (p: Product) => boolean): Product | undefined =>
    [...shelf].filter(predicate).sort((a, b) => a.minInvestment - b.minInvestment)[0]

  const deployable = snapshot.surplus.deployable
  /*
   * The plan's date is part of the action's identity, and it has to be.
   *
   * An action is a recommendation *on a dated plan*: "add ₹8,200 a month" in March was computed
   * from March's statements and carries March's figures, and the same sentence in September is a
   * second recommendation rather than the same one seen again. The audit trail keys a decision on
   * this id — `UNIQUE (session_id, action_id)` in `0006_app_engine.sql` — so an undated id makes a
   * customer's whole history collapse to one row per insight: decline the SIP once and the app can
   * never ask again, and a record covering months can only ever hold four entries.
   *
   * Dating it keeps the property that constraint is actually for: two taps on the same card on the
   * same day are still one decision, because it is still the same plan.
   */
  const id = `${asOf}:${insight.kind}:${insight.suggests}`

  const base = { id, kind: insight.suggests, evidence: insight.evidence }

  switch (insight.suggests) {
    case 'open_sweep_in': {
      const product = pickBy((p) => p.category === 'Sweep-in FD')
      /*
       * A maturing deposit sizes itself: the amount in question is the money coming free on the
       * maturity date, not a fraction of the idle floor. Sweeping 80% of the twelve-month
       * minimum balance is the right sum for cash that has simply been sitting; it is the wrong
       * sum — and a confusing one — when the customer is being asked what to do with a specific
       * deposit whose value they can read off their own statement.
       */
      const maturing = snapshot.balances.maturingSoon
      const amount =
        insight.kind === 'deposit_maturing' && maturing
          ? Math.max(0, Math.round(maturing.amount))
          : Math.max(0, Math.round(snapshot.balances.idleFloor * 0.8))
      if (!product || amount < product.minInvestment) return null
      return withVerdict(
        {
          ...base,
          label:
            insight.kind === 'deposit_maturing'
              ? `Move ${inr(amount)} into a sweep-in instead`
              : `Sweep ${inr(amount)} into a deposit`,
          detail: `${product.name}, about ${product.indicativeReturn ?? 6.8}%. No lock-in — take it out any day.`,
          amount,
          productId: product.productId,
          productName: product.name,
        },
        product,
        snapshot,
        shelf,
        0,
        'lump_sum',
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
          detail: `${product.name}, auto-debited the day after payday so you never see it.`,
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
          label: `Take ${spoken(product.coverAmount ?? 0)} of cover for ${inr(product.minInvestment)} a month`,
          detail: `${product.name}. Pure cover — nothing paid back at the end, so it is cheap.`,
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
          detail: `${inr(product.minInvestment * 12)} a year buys ${inr(product.coverAmount ?? 0)} of cover.`,
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
        detail: `That is what it was three months ago. Change it whenever you like.`,
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
        label: 'Check your subscriptions',
        detail: 'Here is what each one costs a year. You decide which to keep.',
        amount: 0,
        verdictId: null,
      }
    }

    case 'pay_down_card': {
      /*
       * A payment, sized and dated, and never "everything spare".
       *
       * This card read "Put everything spare against the 34.8% balance" over evidence quoting an
       * ₹8,14,315 outstanding, under a header that says TODAY. Nobody clears eight lakh today,
       * so the one card the product stakes itself on was asking for something impossible — and
       * it was the only action in this file that did not name its own amount. Every sibling does:
       * "Start ₹5,000 a month", "Sweep ₹2,00,000 into a deposit", "Cap Dining at ₹4,000 a month".
       *
       * So it names one: this month's spare, capped at the balance, with the months it takes to
       * clear beside it so the payment is not mistaken for the whole debt. That is a thing a
       * customer can actually do before the day is out.
       */
      const balance = snapshot.debt.highInterestTotal
      const pay = Math.min(Math.max(0, deployable), balance)

      /*
       * With nothing spare there is no payment to propose, and proposing one anyway is how
       * Priya — deployable ₹0 against ₹3,10,012 on a card — got a "Do it" button attached to
       * ₹0. The insight is still true and still ranks first; it is the *action* that has no
       * content, so the card falls through to the next one the engine actually has.
       */
      if (pay <= 0) return null

      const months = monthsToClear(balance, snapshot.debt.highestRate, pay)

      return {
        ...base,
        label: `Pay ${inr(pay)} off the card`,
        detail: months
          ? `${snapshot.debt.highestRate}% interest. Keep this up and it clears in ${months} months.`
          : `${snapshot.debt.highestRate}% interest. Every rupee off it beats any investment.`,
        amount: pay,
        verdictId: null,
      }
    }

    case 'talk_to_rm': {
      return {
        ...base,
        label: 'Talk to your relationship manager',
        detail: 'They will already have all of this. No need to explain it again.',
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
  /** A transfer of money already held, rather than a monthly commitment out of income. */
  cadence: 'monthly' | 'lump_sum' = 'monthly',
): Action | null {
  const verdict = evaluate({
    product,
    snapshot,
    amount: action.amount,
    cadence,
    goal: horizonYears > 0 ? { kind: 'suggested', horizonYears } : null,
    alternatives: shelf,
  })

  // A blocked action does not reach a screen. The refusal is not silence, though — the insight
  // that produced it is still on the list, and the roadmap explains what has to happen first.
  if (verdict.verdict === 'BLOCKED') return null

  // Carry the cadence onto the action. The decision route re-runs this same gate over the
  // same snapshot when the customer accepts, and without this it would reach a different
  // verdict than the one that put the action on screen.
  return { ...action, cadence, verdictId: null }
}

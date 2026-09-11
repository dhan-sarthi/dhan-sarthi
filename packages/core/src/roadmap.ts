/**
 * The roadmap: a destination turned into a dated route.
 *
 * Cleo's framing, which is the right one: *"think of it like a GPS for your money — you set the
 * destination and Cleo figures out how to get you there, recalculating along the way."* What
 * makes ours a bank's version rather than a budgeting app's is that the route is not a straight
 * line to the customer's stated goal. It is the suitability ladder from
 * `docs/product/product-shelf.md`, with the goal at the end of it:
 *
 *   free up money -> protection -> clear expensive debt -> emergency buffer -> the goal
 *
 * So a customer who says "I want to invest" and has a card at 34.8% gets a route whose first three
 * stages are not investing. That is the diagnose-before-prescribe principle expressed as data
 * rather than as a slogan, and every stage carries the sentence explaining why it comes first.
 *
 * One deliberate departure from the published ladder: **protection runs first, not fourth.**
 * The ladder lists it after the emergency buffer, which in practice would leave someone with
 * dependents uninsured for eighteen months while they save. A term premium is small, ongoing and
 * immediately effective, so it starts at once and runs alongside everything else — the same
 * reasoning that exempts protection from the buffer rule in the suitability gate.
 */
import { addMonths } from './dates.ts'
import type { Snapshot } from './derive.ts'
import {
  DISCLAIMER,
  monthlyInterest,
  monthsToClear,
  paymentToClear,
  project,
  requiredMonthly,
} from './projection.ts'
import type { Projection } from './projection.ts'
import { evaluate } from './suitability.ts'
import type { Verdict } from './suitability.ts'
import type { Product } from './types.ts'

export type GoalKind =
  'emergency_fund' | 'debt_payoff' | 'protection' | 'wealth_target' | 'retirement'

/**
 * Which rupees `Goal.targetAmount` is counted in.
 *
 * `today` — the amount is in money the customer recognises now. A long-dated target stated
 * this way has to be funded at the *real* rate, or thirty years of price rises are silently
 * left out of the contribution. This is what `suggestGoal` produces and what `goal.ts` argues
 * for at length: a retirement number inflated forward to 2057 came out at ₹11.48 crore, read
 * as absurd, and made every plan infeasible for a reason that had nothing to do with the
 * customer.
 *
 * `at_horizon` — the customer has already inflated the figure themselves and typed the rupees
 * of the year it lands. Discounting it a second time would tell them to save far more than
 * they need, for a reason nobody on either side of the screen could see, so it is funded at
 * the nominal rate however long the horizon.
 */
export type GoalAmountBasis = 'today' | 'at_horizon'

export interface Goal {
  id: string
  kind: GoalKind
  /**
   * What the money is actually for — "house deposit", "Aanya's college". A house, a car and a
   * wedding are all `wealth_target` with a label and a horizon rather than separate kinds: one
   * calculation with twelve labels, instead of twelve near-identical branches that drift apart
   * the first time one is edited.
   */
  purpose?: string
  targetAmount: number
  /**
   * Which money `targetAmount` is in. Absent means `today`, so every goal written before this
   * field existed — and every goal `suggestGoal` proposes — keeps the numbers it had.
   */
  amountBasis?: GoalAmountBasis
  targetDate: string
  createdAt: string
}

export type StageKind = 'free_up' | 'get_cover' | 'clear_debt' | 'build_buffer' | 'grow'

export interface Stage {
  /** One-based, in route order. There is no stage 0. */
  index: number
  kind: StageKind
  label: string
  /** Why this comes before the customer's stated goal. Shown, not implied. */
  why: string
  productId: string | null
  productName: string | null
  /** Committed each month while this stage runs. */
  monthly: number
  /** What the stage is trying to reach. Zero for open-ended stages. */
  targetAmount: number
  /**
   * How long the stage runs. **Zero means it has no end**, and it is the only way this type
   * has of saying so.
   *
   * One stage can be undated: a debt whose monthly payment does not beat the interest accruing
   * on the balance. `monthsToClear` returns null there because the balance grows, and the
   * honest answer to "when is it clear" is that there is no such month. This used to be filled
   * with a flat 120 months so the stage had *a* length, which put a payoff date on a debt that
   * mathematically never clears — and dated every sequential stage behind it off that fiction.
   *
   * Read it with `completesOn`, which lands on `startsOn` whenever this is zero.
   */
  monthsToComplete: number
  startsOn: string
  /**
   * When the stage finishes — **except** where it equals `startsOn`, which together with
   * `monthsToComplete: 0` means there is no completion date to give. Never render such a date.
   */
  completesOn: string
  /**
   * `ongoing` stages keep costing their monthly amount after they complete — a term premium
   * does not stop. `sequential` stages hand their money to the next stage when they finish.
   */
  cadence: 'ongoing' | 'sequential'
  /** The gate's verdict on this stage's product, so the route cannot contain unsuitable advice. */
  verdict: Verdict | null
  /** True for the stage that is the customer's actual goal, false for every prerequisite. */
  isGoal: boolean
}

export interface Roadmap {
  version: number
  createdAt: string
  /** Why this version differs from the last. The audit trail and the "it learns" story, at once. */
  reasonForChange: string
  goal: Goal
  stages: Stage[]
  /**
   * The **array position** of the stage running now: `stages[currentStageIndex]`.
   *
   * A position into `stages`, deliberately, and *not* a `Stage.index` — those are one-based, so
   * a stage index of 0 would name no stage at all and the two conventions have already been
   * read for each other once. Every stage is laid from `createdAt` forward, so on a freshly cut
   * roadmap this is 0 and the first stage is the live one; it is computed rather than asserted
   * so it stays true if that ever stops being so.
   *
   * It answers "which stage does the plan open at", which is what the avatar brief and
   * `get_plan` want. It does **not** answer "which stages have money going into them this
   * month" — several can at once, because an ongoing premium runs alongside whatever is
   * sequential. That rule is `s.index === 1 || s.cadence === 'ongoing'`, and it is what
   * `monthlyCommitment` below is summed over.
   */
  currentStageIndex: number
  /** What leaves the account this month across every stage now running. */
  monthlyCommitment: number
  totalMonths: number
  completesOn: string
  /**
   * False where the goal cannot be reached from the customer's present position — including
   * where a prerequisite cannot be: a debt the payment never clears blocks everything behind
   * it, so a route containing one is not feasible whatever the goal stage worked out.
   */
  feasible: boolean
  /** How much more per month the plan would need. Zero when feasible. */
  shortfallMonthly: number
  /** Present only for market-linked stages, and always a band. */
  projection: Projection | null
  disclaimer: string
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

const MONTHS = [
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

/**
 * "September 2057" reads as a date; "2057-09" reads as a database key. This is the stage title
 * the customer reads on Plan, beside a header that already spells the month out.
 */
const spokenMonth = (iso: string): string =>
  `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(0, 7)} ${iso.slice(0, 4)}`

function pick(shelf: readonly Product[], id: string): Product | undefined {
  return shelf.find((p) => p.productId === id)
}

/** The cheapest product on the shelf matching a predicate. */
function cheapest(
  shelf: readonly Product[],
  predicate: (p: Product) => boolean,
): Product | undefined {
  return [...shelf].filter(predicate).sort((a, b) => a.minInvestment - b.minInvestment)[0]
}

export interface RoadmapOptions {
  /** Months of expenses the buffer aims at before growth begins. */
  bufferFloorMonths: number
  /** Assumed nominal return for market-linked stages. */
  growthRatePct: number
  /**
   * Assumed inflation. A goal expressed in today's money has to be funded at the *real* rate —
   * nominal less inflation — or the contribution is understated by decades of price rises.
   */
  inflationPct: number
  /** Rate for deposit-style stages, where the rate is contractual rather than a guess. */
  depositRatePct: number
  version: number
  reasonForChange: string
}

const DEFAULTS: RoadmapOptions = {
  bufferFloorMonths: 3,
  growthRatePct: 10,
  inflationPct: 5.5,
  depositRatePct: 6.9,
  version: 1,
  reasonForChange: 'First plan.',
}

/**
 * Beyond this many years a target in today's money is funded in real terms. Below it, the
 * nominal rate: the correction is small enough that quoting it would be false precision.
 */
export const REAL_RATE_HORIZON_YEARS = 10

/**
 * The rate a goal's contribution is sized at, and the only place that decision is made.
 *
 * Exported because the create-a-goal screen has to quote the same monthly figure the roadmap
 * will carry a moment later, and a customer shown two numbers is right to stop believing
 * either. A screen that mirrors this branch by hand drifts from it the first time either is
 * edited; a screen that calls it cannot.
 *
 * Three cases, in order:
 *
 * - **Not a growth goal** — a buffer or a short-dated target funded with a deposit. The rate is
 *   contractual rather than a guess, and no inflation adjustment is applied at all.
 * - **A growth goal stated in today's money, ten years out or more** — funded at the *real*
 *   rate, nominal less inflation, because the target is in rupees that will buy less by then.
 * - **Everything else** — the nominal rate. That includes a growth goal whose amount is
 *   `at_horizon`: the customer has already put the inflation in, and taking it out again here
 *   is the double-discount this branch exists to avoid.
 *
 * The parameter is spelled out rather than `Pick<Goal, …>` so a goal that has come off the wire
 * can be handed straight to it. Under `exactOptionalPropertyTypes` a zod optional infers as
 * `?: T | undefined`, which `?: T` will not accept — and this function's whole reason for being
 * exported is that callers on the other side of the API ask it rather than reimplement it.
 */
export function fundingRatePct(
  goal: { kind: GoalKind; amountBasis?: GoalAmountBasis | undefined },
  horizonYears: number,
  options?: Partial<Pick<RoadmapOptions, 'growthRatePct' | 'inflationPct' | 'depositRatePct'>>,
): number {
  const opts = { ...DEFAULTS, ...options }
  if (goal.kind !== 'wealth_target' && goal.kind !== 'retirement') return opts.depositRatePct

  const inTodaysMoney = (goal.amountBasis ?? 'today') === 'today'
  return inTodaysMoney && horizonYears >= REAL_RATE_HORIZON_YEARS
    ? opts.growthRatePct - opts.inflationPct
    : opts.growthRatePct
}

/**
 * Build the route.
 *
 * Pure: snapshot in, roadmap out, no I/O and no clock. `asOf` comes from the caller so a
 * regenerated roadmap is reproducible and so the demo's time machine can ask for the route as it
 * stood on any date.
 */
export function buildRoadmap(
  snapshot: Snapshot,
  goal: Goal,
  shelf: readonly Product[],
  asOf: string,
  options?: Partial<RoadmapOptions>,
): Roadmap {
  const opts = { ...DEFAULTS, ...options }
  const stages: Stage[] = []

  const monthlyOutflow = snapshot.commitments.total + snapshot.discretionary.monthly
  let available = snapshot.surplus.deployable
  let cursor = asOf
  let index = 0

  /*
   * A debt on the route that the payment never clears, and what it would take to clear it.
   *
   * Held out here because it is the whole route's problem rather than one stage's: nothing
   * sequential behind a balance that grows has a date either, so the roadmap is not feasible
   * whatever the goal stage goes on to work out, and the shortfall worth quoting is the one
   * that unblocks it rather than the one behind it.
   */
  let undatedDebt = false
  let undatedDebtShortfall = 0

  const push = (
    stage: Omit<Stage, 'index' | 'startsOn' | 'completesOn' | 'verdict'> & {
      product?: Product | undefined
      goalContext?: { kind: string; horizonYears: number } | undefined
    },
  ): void => {
    const { product, goalContext, ...rest } = stage
    const startsOn = cursor
    const completesOn = addMonths(cursor, rest.monthsToComplete)

    stages.push({
      ...rest,
      index: (index += 1),
      startsOn,
      completesOn,
      // The gate is only run for stages starting now. A later stage is evaluated against the
      // customer as they will be when it begins — after the card is cleared and the buffer
      // built — and running today's rules against it would show the roadmap contradicting
      // itself: proposing a step and blocking it in the same breath.
      verdict:
        product && startsOn === asOf
          ? evaluate({
              product,
              snapshot,
              amount: rest.monthly,
              goal: goalContext ?? null,
              alternatives: shelf,
            })
          : null,
    })

    // Sequential stages own the money until they finish, so the next one starts after them.
    if (rest.cadence === 'sequential') cursor = completesOn
  }

  /* Stage: free up money ---------------------------------------------- */

  // Where there is nothing to deploy, no product can be the first step. The only honest first
  // stage is behavioural, and it is what makes the daily loop *causal* rather than decorative:
  // capping the two habits below is what funds every stage after it.
  const needsFreeingUp = available <= 0
  if (needsFreeingUp) {
    const targets = snapshot.discretionary.topHabits.slice(0, 2)
    const recoverable = Math.round(targets.reduce((s, h) => s + h.monthlyAverage, 0) * 0.4)

    /*
     * With no habits to name, this stage cannot name any.
     *
     * The sentence was built assuming there would always be one or two — and with an empty
     * list it produced "there is nothing to put anywhere. cost about ₹0 a month between them.
     * Cutting that by not quite half is the whole plan starting", which is not a sentence and
     * quotes ₹0 twice. A statement whose narrations carry no merchant makes that the normal
     * case rather than an edge one: IDBI's own feed recognises no habit at all.
     */
    const habitless = targets.length === 0

    push({
      kind: 'free_up',
      label: habitless
        ? 'Find the first thing to spare'
        : `Free up about ${inr(recoverable)} a month`,
      // Both branches keep the two facts a stage this early cannot do without: there is
      // nothing spare, and — in the habitless case — the reason no habit is named is that the
      // statement is unreadable, not that the customer has none.
      why: habitless
        ? `Everything that comes in goes out, and no habit here is recognisable enough to ` +
          `name. Tell me one outgoing you could drop and the plan has a start.`
        : `Everything that comes in goes out. ` +
          `${targets.map((h) => h.merchant ?? h.key).join(' and ')} ` +
          `${targets.length === 1 ? 'costs' : 'cost'} ` +
          `${inr(targets.reduce((s, h) => s + h.monthlyAverage, 0))} a month between them; ` +
          `cutting that by not quite half funds everything below.`,
      productId: null,
      productName: null,
      monthly: 0,
      targetAmount: recoverable,
      monthsToComplete: 1,
      cadence: 'sequential',
      isGoal: goal.kind === 'debt_payoff' && snapshot.debt.hasHighInterest,
    })

    available = recoverable
  }

  /* Stage: protection -------------------------------------------------- */

  // Deliberately before debt. A term premium is small, immediately effective and cannot be
  // caught up on later — someone dying uninsured with dependents is not a risk worth trading
  // against four months of interest.
  if (snapshot.protection.gap > 0) {
    const lifeCover = shelf.filter(
      (p) => p.coverType === 'life' && !p.bundlesProtectionAndInvestment,
    )

    // The cheapest policy that actually closes the gap — not simply the cheapest policy. PMJJBY
    // is ₹37 a month and covers ₹2 lakh; offering it against a ₹1.02 crore shortfall would be
    // technically a recommendation and practically no cover at all. It is the right answer only
    // when nothing adequate is affordable, which is a different situation and says so.
    const adequate = [...lifeCover]
      .filter((p) => (p.coverAmount ?? 0) >= snapshot.protection.gap)
      .sort((a, b) => a.minInvestment - b.minInvestment)[0]

    const affordableFallback = [...lifeCover]
      .filter((p) => p.minInvestment <= Math.max(available, 100))
      .sort((a, b) => (b.coverAmount ?? 0) - (a.coverAmount ?? 0))[0]

    const term =
      adequate && adequate.minInvestment <= Math.max(available, 100) ? adequate : affordableFallback

    if (term) {
      const closesGap = (term.coverAmount ?? 0) >= snapshot.protection.gap
      push({
        kind: 'get_cover',
        label: `${term.name} — ${inr(term.minInvestment)} a month`,
        // "There is nothing in force" was the old wording and it was wrong for anyone holding
        // a policy too small for their dependents — the stage fires on a *gap*, not on an
        // absence. The gap figure says the same thing and is true either way.
        why:
          `${snapshot.customer.dependents} ` +
          `${snapshot.customer.dependents === 1 ? 'person depends' : 'people depend'} on your ` +
          `income and ${inr(snapshot.protection.gap)} of cover is missing — the cheapest step ` +
          `here, and the only one that cannot be caught up on later.` +
          (closesGap
            ? ''
            : ` This does not close it all, but something in force beats the right amount later.`),
        productId: term.productId,
        productName: term.name,
        monthly: term.minInvestment,
        targetAmount: term.coverAmount ?? 0,
        monthsToComplete: 1,
        cadence: 'ongoing',
        isGoal: goal.kind === 'protection',
        product: term,
      })

      // An ongoing premium reduces what every later stage has to work with, permanently.
      available = Math.max(0, available - term.minInvestment)
    }
  }

  /* Stage: clear expensive debt ---------------------------------------- */

  if (snapshot.debt.hasHighInterest && available > 0) {
    const rate = snapshot.debt.highestRate
    const principal = snapshot.debt.total
    const interest = monthlyInterest(principal, rate)

    // Amortised properly. Dividing the balance by the payment ignores the interest still
    // accruing, and at these rates that is not a rounding error — it is a payoff date that will
    // never arrive, promised to someone trusting us with their money.
    const clears = monthsToClear(principal, rate, available)
    const viable = clears !== null
    const needed = paymentToClear(principal, rate, 36)

    /*
     * And where it never clears, the stage says so in its numbers and not only in its prose.
     *
     * This used to fall back to a flat 120 months, which is the same promise wearing a longer
     * face: `completesOn` came out ten years from now on a balance that grows every month, the
     * label said "will not clear" directly above it, and — because the stage is sequential —
     * every stage behind it was dated off a payoff that does not happen. Priya's buffer was
     * scheduled for 2036 and her route ran to 2040 on the strength of it.
     *
     * Zero months is this type's way of saying there is no end: `completesOn` lands back on
     * `startsOn`, the cursor does not move, and the roadmap below is marked infeasible with the
     * payment that would actually retire the balance.
     */
    const months = clears ?? 0
    if (!viable) {
      undatedDebt = true
      undatedDebtShortfall = Math.max(0, needed - available)
    }

    push({
      kind: 'clear_debt',
      label: viable
        ? `Clear ${inr(principal)} at ${rate}% — about ${months} months`
        : `${inr(principal)} at ${rate}% will not clear at ${inr(available)} a month`,
      // The infeasible branch keeps all four of its figures: the interest, what the plan can
      // pay, what three years would take, and the difference. They are why the stage carries no
      // completion date, and a shorter sentence that dropped them would leave that unexplained.
      why: viable
        ? `Nothing on the shelf returns ${rate}% a year, so paying this down beats every ` +
          `investment available to you.`
        : `Interest alone is ${inr(interest)} a month, so at ${inr(available)} the balance grows ` +
          `and there is no date to give. Clearing it inside three years needs about ` +
          `${inr(needed)} a month — ${inr(Math.max(0, needed - available))} more than there is.`,
      productId: null,
      productName: null,
      monthly: available,
      targetAmount: principal,
      monthsToComplete: months,
      cadence: 'sequential',
      isGoal: goal.kind === 'debt_payoff',
    })
  }

  /* Stage: arrears ----------------------------------------------------- */

  // A missed repayment blocks every investment in the suitability gate, so a route that steps
  // over it would be proposing something its own rules refuse. It is also the cheapest thing on
  // the list: the damage a default does to a credit score outlasts any return we could have made.
  if (snapshot.debt.missedRepayment) {
    push({
      kind: 'clear_debt',
      label: 'Bring the missed instalment up to date',
      why:
        `A repayment on record was missed. Until it clears I can recommend nothing else, and ` +
        `the mark on your credit file costs more, for longer, than anything I could earn you.`,
      productId: null,
      productName: null,
      monthly: 0,
      targetAmount: 0,
      monthsToComplete: 1,
      cadence: 'sequential',
      isGoal: false,
    })
  }

  /* Stage: emergency buffer -------------------------------------------- */

  const bufferTarget = Math.round(opts.bufferFloorMonths * monthlyOutflow)
  const bufferHave = snapshot.balances.total
  const bufferGap = Math.max(0, bufferTarget - bufferHave)

  if (bufferGap > 0 && available > 0) {
    const vehicle =
      pick(shelf, 'IDBI_SWEEP_001') ??
      cheapest(shelf, (p) => p.category === 'Liquid' || p.category === 'Recurring Deposit')

    const months = Math.max(1, Math.ceil(bufferGap / available))

    push({
      kind: 'build_buffer',
      label: `${inr(bufferTarget)} within reach — ${opts.bufferFloorMonths} months of your outgoings`,
      why:
        `${inr(bufferHave)} reachable covers about ${snapshot.buffer.monthsCovered} months. ` +
        `Below three, nothing with a lock-in can be recommended — and one bad month becomes ` +
        `a loan.`,
      productId: vehicle?.productId ?? null,
      productName: vehicle?.name ?? null,
      monthly: available,
      targetAmount: bufferTarget,
      monthsToComplete: months,
      cadence: 'sequential',
      isGoal: goal.kind === 'emergency_fund',
      product: vehicle,
      goalContext: { kind: 'emergency_fund', horizonYears: months / 12 },
    })
  }

  /* Stage: the goal ---------------------------------------------------- */

  const horizonYears = Math.max(
    0.25,
    Math.round(
      ((new Date(goal.targetDate).getTime() - new Date(cursor).getTime()) / 86_400_000 / 365.25) *
        100,
    ) / 100,
  )

  let projection: Projection | null = null
  let shortfallMonthly = 0
  let feasible = true

  const alreadyPrerequisite = stages.some((s) => s.isGoal)

  if (!alreadyPrerequisite) {
    const wantsGrowth = goal.kind === 'wealth_target' || goal.kind === 'retirement'

    // A long target in today's money is funded at the real rate: sizing a thirty-year goal at
    // the nominal 10% would understate the contribution badly. A target the customer has
    // already inflated is funded at the nominal one, because taking the inflation back out
    // would charge them for it twice. `fundingRatePct` owns that decision for both of us.
    const rate = fundingRatePct(goal, horizonYears, opts)

    const vehicle = wantsGrowth
      ? horizonYears >= 3
        ? pick(shelf, 'MF_INDEX_103')
        : cheapest(shelf, (p) => p.category === 'Debt' || p.category === 'Recurring Deposit')
      : cheapest(shelf, (p) => p.category === 'Recurring Deposit')

    const existing = wantsGrowth ? snapshot.holdings.equity : 0
    const needed = requiredMonthly(goal.targetAmount, horizonYears, rate, existing)
    const affordable = Math.min(needed, Math.max(0, available))

    feasible = affordable >= needed && available > 0
    shortfallMonthly = Math.max(0, needed - affordable)

    push({
      kind: 'grow',
      label:
        `${goal.purpose ?? 'Your goal'}: ${inr(goal.targetAmount)} by ` +
        `${spokenMonth(goal.targetDate)}`,
      why: feasible
        ? `${inr(needed)} a month at an assumed ${rate}% gets you there. ${DISCLAIMER}`
        : available > 0
          ? `${inr(needed)} a month would be needed and there is ${inr(available)} spare. ` +
            `Extend the date, lower the target, or find the difference in your spending.`
          : // Nothing spare and nothing readable are different situations, and "there is ₹0
            // spare" says the first while meaning the second. A statement with no recognisable
            // income has no surplus to report either way.
            `${inr(needed)} a month would be needed. Nothing here is recognisable as income or ` +
            `as a regular outgoing, so I cannot see what is spare — tell me what comes in.`,
      productId: vehicle?.productId ?? null,
      productName: vehicle?.name ?? null,
      monthly: affordable,
      targetAmount: goal.targetAmount,
      monthsToComplete: Math.round(horizonYears * 12),
      cadence: 'ongoing',
      isGoal: true,
      product: vehicle,
      goalContext: { kind: goal.kind, horizonYears },
    })

    if (affordable > 0) {
      projection = project(affordable, horizonYears, existing, {
        ...(wantsGrowth ? {} : { rates: [{ label: 'Contractual', ratePct: rate }] }),
      })
    }
  }

  /* Assemble ----------------------------------------------------------- */

  /*
   * Where the plan opens: the position in `stages` of the first one still to finish.
   *
   * An array position, not a `Stage.index` — see the field. Stages are laid from `asOf`
   * forward, so this resolves to the first of them and `stages[0]` is what every consumer
   * subscripting this gets. Derived rather than written down as a literal 0, because a
   * hardcoded index that happens to be right reads exactly like one that is wrong.
   */
  const firstUnfinished = stages.findIndex((s) => s.completesOn > asOf)
  const currentStageIndex = firstUnfinished === -1 ? 0 : firstUnfinished
  const running = stages.filter((s) => s.index === 1 || s.cadence === 'ongoing')
  // Sequential stages run one after another; an ongoing goal runs to its own horizon. The route
  // is as long as the longer of the two, not the sum — a term premium does not extend the plan.
  const sequentialMonths = stages
    .filter((s) => s.cadence === 'sequential')
    .reduce((m, s) => m + s.monthsToComplete, 0)
  const goalStage = stages.find((s) => s.isGoal && s.cadence === 'ongoing')
  const totalMonths = Math.max(sequentialMonths, goalStage?.monthsToComplete ?? 0)

  return {
    version: opts.version,
    createdAt: asOf,
    reasonForChange: opts.reasonForChange,
    goal,
    stages,
    currentStageIndex,
    monthlyCommitment: running.reduce((s, x) => s + x.monthly, 0),
    totalMonths,
    completesOn: addMonths(asOf, Math.max(totalMonths, Math.round(horizonYears * 12))),
    // A balance that outruns its payment blocks the route whether or not it is the goal, and
    // it did not use to: the goal stage is skipped when a prerequisite already carries the
    // goal, so a plan whose one debt never clears reported itself feasible with nothing short.
    feasible: feasible && !undatedDebt,
    shortfallMonthly: Math.max(shortfallMonthly, undatedDebt ? undatedDebtShortfall : 0),
    projection,
    disclaimer: DISCLAIMER,
  }
}

/**
 * The stage the route is on, on a given date.
 *
 * `roadmap.currentStageIndex` answers the same question, but it is fixed when the roadmap is
 * cut and a roadmap outlives the day it was cut — it is stored and served again while the
 * snapshot and the goal hold. Read a month later it still names the stage the plan opened at,
 * which by then may have finished. This asks the question against a clock instead, so a caller
 * holding a stored roadmap gets the stage that is actually running.
 *
 * A stage with no end — `monthsToComplete` of zero, which only an unclearable debt has — is
 * never behind us: nothing after it has a date either, so the route stops there and says so.
 * Null once every stage has finished, which is a real answer rather than the last one again.
 */
export function currentStage(roadmap: Roadmap, asOf: string): Stage | null {
  return roadmap.stages.find((s) => s.monthsToComplete === 0 || s.completesOn > asOf) ?? null
}

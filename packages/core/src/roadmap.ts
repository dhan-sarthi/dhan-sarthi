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
  targetDate: string
  createdAt: string
}

export type StageKind = 'free_up' | 'get_cover' | 'clear_debt' | 'build_buffer' | 'grow'

export interface Stage {
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
  monthsToComplete: number
  startsOn: string
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
  currentStageIndex: number
  /** What leaves the account this month across every stage now running. */
  monthlyCommitment: number
  totalMonths: number
  completesOn: string
  /** False where the goal cannot be reached from the customer's present position. */
  feasible: boolean
  /** How much more per month the goal would need. Zero when feasible. */
  shortfallMonthly: number
  /** Present only for market-linked stages, and always a band. */
  projection: Projection | null
  disclaimer: string
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`

/**
 * A large round sum the way it is actually said: "₹1 crore", not "₹1,00,00,000".
 *
 * Only for a notional target — a cover amount, a goal, a shortfall against one — never for money
 * that moves. A premium, a balance or an instalment is always shown to the rupee; rounding those
 * to "about ₹1 lakh" is how a statement stops reconciling.
 *
 * Deliberately the same thresholds and decimal places as `approx` in the web app, because the
 * goal stage's label sits directly under a panel that renders the same figure with that
 * function: one target written two ways on one screen reads as a defect.
 */
const spokenAmount = (n: number): string => {
  const abs = Math.abs(n)
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(abs >= 10_00_00_000 ? 0 : 2)} crore`
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(abs >= 10_00_000 ? 1 : 2)} lakh`
  return inr(n)
}

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

    push({
      kind: 'free_up',
      label: `Free up about ${inr(recoverable)} a month`,
      why:
        `Right now everything that comes in goes out, so there is nothing to put anywhere. ` +
        `${targets.map((h) => h.merchant ?? h.key).join(' and ')} ` +
        `${targets.length === 1 ? 'costs' : 'cost'} about ` +
        `${inr(targets.reduce((s, h) => s + h.monthlyAverage, 0))} a month between them. ` +
        `Cutting that by not quite half is the whole plan starting.`,
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
        /* The label says what happens, never which product, what it covers or what it costs:
           `productName` is its own row, `targetAmount` the cover and `monthly` its own column.
           Naming them here printed the policy twice and the price twice in one card, and any
           amount written here also had to agree with how the same figure is rendered two lines
           below — two ways to get one row wrong. Every other stage label is an outcome, and
           this one now matches. */
        label: 'Put life cover in force',
        why:
          `${snapshot.customer.dependents} ${snapshot.customer.dependents === 1 ? 'person' : 'people'} ` +
          `depend on your income and there is nothing in force. This is the cheapest thing on ` +
          `this list and the only one that cannot be caught up on later.` +
          (closesGap
            ? ''
            : ` It does not close the whole gap — ${spokenAmount(snapshot.protection.gap)} would — ` +
              `but it ` +
              `is what is affordable today, and something in force beats the right amount later.`),
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
    const months = clears ?? 120
    const needed = paymentToClear(principal, rate, 36)

    push({
      kind: 'clear_debt',
      label: viable
        ? `Clear ${inr(principal)} at ${rate}% — about ${months} months`
        : `${inr(principal)} at ${rate}% will not clear at ${inr(available)} a month`,
      why: viable
        ? `Nothing on the shelf returns ${rate}% a year, so every rupee that goes here beats ` +
          `every rupee that goes anywhere else. This is the highest-return investment available ` +
          `to you and it is not an investment.`
        : `The interest alone is ${inr(interest)} a month. At ${inr(available)} the balance ` +
          `grows, so there is no date I can give you — it is not a slow plan, it is not a plan. ` +
          `Clearing it inside three years needs about ${inr(needed)} a month, which means finding ` +
          `${inr(Math.max(0, needed - available))} more before anything else on this list happens.`,
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
        `There is a repayment on record that was missed. Until that is cleared I cannot ` +
        `recommend putting money anywhere else — and the mark it leaves on your credit file ` +
        `will cost you more, for longer, than anything I could have earned you this year.`,
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
        `You have ${inr(bufferHave)} reachable, which covers about ` +
        `${snapshot.buffer.monthsCovered} months. Below three, one bad month becomes a loan — ` +
        `and it is the reason nothing with a lock-in can be recommended before this.`,
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

    // Long-horizon targets are stated in today's money, so they are funded at the real rate.
    // Sizing a thirty-year goal at the nominal 10% would understate the contribution badly.
    const rate = wantsGrowth
      ? horizonYears >= 10
        ? opts.growthRatePct - opts.inflationPct
        : opts.growthRatePct
      : opts.depositRatePct

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
        `${goal.purpose ?? 'Your goal'}: ${spokenAmount(goal.targetAmount)} by ` +
        `${spokenMonth(goal.targetDate)}`,
      why: feasible
        ? `${inr(needed)} a month at an assumed ${rate}% gets you there. ${DISCLAIMER}`
        : `${inr(needed)} a month would be needed and there is ${inr(available)} spare. ` +
          `We can extend the date, lower the target, or find the difference in your spending — ` +
          `and I would rather show you that than pretend the number works.`,
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

  // The first stage not yet finished. Everything the customer sees on Today comes from here.
  const currentStageIndex = 0
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
    feasible,
    shortfallMonthly,
    projection,
    disclaimer: DISCLAIMER,
  }
}

/**
 * Drift — the gap between what the plan says the money should be doing and what the statements
 * show it doing.
 *
 * The reference calls this rebalancing and means something this app structurally cannot do.
 * SmartWealth's `rebalance-align-portfolio` compares two *fund* allocations — Equity 85% against
 * Equity 75% — which needs a look-through into the securities inside each scheme, a live NAV, and
 * a model portfolio to compare against. This app has none of the three: `portfolio.ts` says so at
 * length, `currentValue` is what the customer typed, and there is no price feed anywhere in the
 * tree. Building that screen on invented percentages would be the one thing the whole product is
 * arguing against.
 *
 * What this app *does* have is better, and it is the thing a distribution app cannot say: a
 * roadmap computed from twelve months of statements, and those same statements telling us what
 * actually happens each month. So the drift here is a **flow** drift, not a **stock** one — the
 * month the plan asks for against the month the ledger shows — and every figure below is a field
 * on `Snapshot` or on `Roadmap`, never a derived guess dressed as an observation.
 *
 * ## The two measures, translated
 *
 * The reference's intro names two: `Making Additional Investments` and `Aligning Your Portfolio`.
 * They survive the translation intact, because they are the only two things anybody can ever do
 * about a plan that is off:
 *
 * - **Add more** — the plan is short. The arithmetic does not reach the target at the present
 *   pace, and the fix is rupees: a larger monthly, or a lump sum. `roadmap.feasible`,
 *   `roadmap.shortfallMonthly`.
 * - **Realign** — the plan is not short, but the money is not going where the plan puts it. The
 *   fix is not more money, it is the same money moved. `commitments`, `holdings.sipMonthly`,
 *   `protection.lifeCoverInForce`, `buffer`, `debt`.
 *
 * ## What is deliberately not here
 *
 * Anything requiring a look-through, a NAV, a benchmark or an expected return per scheme. The
 * full list is in the build report; the short version is that a percentage this app cannot
 * source is a percentage it does not print.
 */
import type { ActionKind, Roadmap, Snapshot, Stage } from '@dhan/contracts'
import type { Slice } from '../../components/charts/index.ts'
import { inr } from '../../lib/money.ts'

/* ---------------------------------------------------------------- The month */

/**
 * The five ways a month's income is spent, in the order the plan reads them.
 *
 * These are the labels `align` matches the two series on, so they are one list and both sides
 * take it verbatim. Change a string here and the comparison stops comparing — it draws two
 * unrelated donuts whose colours mean different things, which is the exact failure
 * `charts/series.ts` exists to prevent.
 *
 * They are short because `LegendRow` truncates and a legend reading "Everyday spen…" is a legend
 * that has stopped labelling anything. Fourteen characters is what a 375px card holds beside its
 * figure, so that is the budget: `Day-to-day` rather than `Everyday spending`, `Into the plan`
 * rather than `Towards your plan`.
 */
export const MONTH_SLICES = [
  'Commitments',
  'Day-to-day',
  'One-off costs',
  'Into the plan',
  'Not spoken for',
] as const

export type MonthSlice = (typeof MONTH_SLICES)[number]

/**
 * The whole the two months are shares of.
 *
 * `income.monthly` is read off the credits and is the right number when there is one. Over IDBI's
 * own feed there frequently is not — `derive.ts` explains why at length — so the declared figure
 * stands in, and `known` says which of the two answered. Zero from both means the comparison
 * cannot be drawn at all, and the screen says that rather than dividing by it.
 */
export function monthlyIncome(snapshot: Snapshot): {
  amount: number
  source: 'statement' | 'declared' | 'none'
} {
  if (snapshot.income.monthly > 0) return { amount: snapshot.income.monthly, source: 'statement' }
  const declared = snapshot.customer.declaredMonthlyIncome
  if (declared > 0) return { amount: declared, source: 'declared' }
  return { amount: 0, source: 'none' }
}

/**
 * What is actually going into investments each month, and how we know.
 *
 * Two fields answer this and they disagree on purpose. `commitments.investments` is the SIP
 * debits the *statement* recognises; `holdings.sipMonthly` is what the customer's own holdings
 * say is running. `derive.ts` records the bug that made both necessary: over a feed whose
 * narrations carry no merchant the first is zero for someone with a live ₹5,000 mandate, and the
 * screen said "nothing going in each month" above a ₹7.2 lakh portfolio.
 *
 * So the larger of the two is the honest figure — a statement can under-see, a declared mandate
 * cannot under-declare itself — and `source` carries which one won, because a figure taken from
 * the customer's own record deserves to be labelled as one.
 */
export function investingNow(snapshot: Snapshot): {
  amount: number
  source: 'statement' | 'mandates' | 'agreed' | 'none'
} {
  const seen = snapshot.commitments.investments
  const declared = snapshot.holdings.sipMonthly
  if (seen <= 0 && declared <= 0) return { amount: 0, source: 'none' }
  if (seen === declared) return { amount: seen, source: 'agreed' }
  return seen > declared
    ? { amount: seen, source: 'statement' }
    : { amount: declared, source: 'mandates' }
}

/** The `free_up` stage's recoverable target — the only spending cut the roadmap itself proposes. */
function freeUpTarget(roadmap: Roadmap): number {
  return roadmap.stages
    .filter((s) => s.kind === 'free_up')
    .reduce((n, s) => n + Math.max(0, s.targetAmount), 0)
}

/** Everything committed that is not already an investment. Rent, EMIs, bills, dues, subs. */
function fixedOutgoings(snapshot: Snapshot): number {
  return Math.max(0, snapshot.commitments.total - snapshot.commitments.investments)
}

const slice = (label: MonthSlice, value: number): Slice => ({ label, value: Math.max(0, value) })

/**
 * The month as the statements show it.
 *
 * Reconciles to income exactly, which is why these five and not another five:
 * `surplus.monthly = income − commitments − discretionary` and
 * `deployable = surplus.monthly − irregular.monthlyProvision`, so the slices sum back to
 * `income.monthly` by construction. Where `investingNow` takes the declared mandate over the
 * statement the sum can exceed income slightly; `series()` renders that as proportions of itself
 * rather than overdrawing, and the screen carries the note.
 */
export function observedMonth(snapshot: Snapshot): Slice[] {
  return [
    slice('Commitments', fixedOutgoings(snapshot)),
    slice('Day-to-day', snapshot.discretionary.monthly),
    slice('One-off costs', snapshot.irregular.monthlyProvision),
    slice('Into the plan', investingNow(snapshot).amount),
    slice('Not spoken for', snapshot.surplus.deployable),
  ]
}

/**
 * The month as the roadmap draws it.
 *
 * Three of the five are unchanged, and that is not padding — it is the honest claim. The roadmap
 * does not propose moving rent, and it does not touch the provision for one-off costs, which
 * `derive.ts` argues is precisely the money that must not be invested. What it moves is the
 * fourth slice: `monthlyCommitment` is what leaves the account across every stage now running,
 * and it comes out of the fifth.
 */
export function plannedMonth(roadmap: Roadmap, snapshot: Snapshot): Slice[] {
  const income = monthlyIncome(snapshot).amount
  const fixed = fixedOutgoings(snapshot)
  const everyday = Math.max(0, snapshot.discretionary.monthly - freeUpTarget(roadmap))
  const aside = snapshot.irregular.monthlyProvision
  const plan = roadmap.monthlyCommitment
  return [
    slice('Commitments', fixed),
    slice('Day-to-day', everyday),
    slice('One-off costs', aside),
    slice('Into the plan', plan),
    slice('Not spoken for', income - fixed - everyday - aside - plan),
  ]
}

/**
 * The pair, ready to hand to `AllocationCompare`, with the one whole they are both shares of.
 *
 * Two things this does that neither side can do alone, and both of them are the difference
 * between a comparison and two donuts:
 *
 * **One denominator.** `series()` takes `whole = max(sum, total)` per series, so two cards given
 * only their own numbers would silently be drawn against two different wholes and their slices
 * would not be comparable. The whole here is the larger of the month's income and either side's
 * sum — which also handles the customer whose outgoings exceed their income, where forcing income
 * as the denominator would draw a ring past its own end.
 *
 * **The same rows.** A label worth nothing on both sides is dropped from both, so a plan with no
 * provision for one-off costs does not carry two legend rows reading `0%`. Dropping it from one
 * side only would be worse than keeping it: `align` would re-introduce it as a zero and the
 * colours either side of it would shift.
 */
export function monthPair(
  roadmap: Roadmap,
  snapshot: Snapshot,
): { planned: Slice[]; observed: Slice[]; whole: number; income: number } {
  const income = monthlyIncome(snapshot).amount
  const planned = plannedMonth(roadmap, snapshot)
  const observed = observedMonth(snapshot)
  const keep = new Set(
    MONTH_SLICES.filter(
      (label) =>
        (planned.find((s) => s.label === label)?.value ?? 0) > 0 ||
        (observed.find((s) => s.label === label)?.value ?? 0) > 0,
    ),
  )
  const live = (list: Slice[]): Slice[] => list.filter((s) => keep.has(s.label as MonthSlice))
  const total = (list: Slice[]): number => list.reduce((n, s) => n + s.value, 0)
  const kept = { planned: live(planned), observed: live(observed) }
  const whole = Math.max(income, total(kept.planned), total(kept.observed))
  /*
   * Whole percentages in the legend, which is what `04-rebalance-align-portfolio` prints — `85%`,
   * `10%`, `5%`. `series()`'s default runs to two decimals because a *quantity* series has to add
   * up, and it produced `56.15%` beside `6.1%` here: two different precisions on one card, both
   * of them claiming to know a month's spending to the paisa. These are rupees off a statement
   * divided by an income, so the second decimal is arithmetic, not information. `Slice.display`
   * is the seam the chart already provides for exactly this, so nothing shared changes.
   */
  const shown = (list: Slice[]): Slice[] =>
    list.map((s) => ({ ...s, display: `${whole > 0 ? Math.round((s.value / whole) * 100) : 0}%` }))
  return { planned: shown(kept.planned), observed: shown(kept.observed), whole, income }
}

/* ---------------------------------------------------------------- Drift */

/** Which of the reference's two measures fixes this. */
export type Measure = 'add' | 'realign'

export type DriftKind =
  /** The arithmetic does not reach the target at the present pace. The engine's own verdict. */
  | 'shortfall'
  /** The plan asks for more each month than the statements leave spare. */
  | 'unaffordable'
  /** A goal stage funded at less than the plan asks, or not funded at all. */
  | 'contribution'
  /** A protection stage whose cover is still not in force. */
  | 'cover'
  /** A balance that grows faster than it is paid down, or a repayment on record as missed. */
  | 'debt'
  /** Reachable money below the floor the suitability gate enforces before anything with a lock. */
  | 'buffer'
  /** Discretionary spending rising — which is what moves the surplus the whole plan is sized on. */
  | 'spending'

export interface Drift {
  id: string
  kind: DriftKind
  measure: Measure
  /** Three or four words. The band's bold half. */
  title: string
  /** The sentence, with the figures in it. Never a restatement of the title. */
  detail: string
  /** ₹ a month the plan asks for at this point, where the drift has one. */
  planned: number | null
  /**
   * ₹ a month the statements show against it. **Null means unobservable, never zero** — money
   * moved into a savings buffer never leaves the bank, so there is no outflow to recognise, and
   * drawing that as ₹0 would be a claim rather than a gap.
   */
  observed: number | null
  /** `bad` stops the plan working; `warn` is a thing to watch. Maps onto `StatusBand`'s tones. */
  severity: 'bad' | 'warn'
  stage: Stage | null
}

/** Monthly interest at the current balance. Core's own test, mirrored — see `jar.ts`. */
function interestOn(snapshot: Snapshot): number {
  return monthlyInterest(snapshot.debt.total, snapshot.debt.highestRate)
}

/**
 * Every drift this app can prove, worst first.
 *
 * Each branch names the fields it reads, because the discipline that matters here is not the
 * arithmetic — it is refusing to add a seventh branch whose evidence is a plausible guess. A
 * drift with no field behind it does not go on this list; it goes in the report as an omission.
 */
export function detectDrift(roadmap: Roadmap, snapshot: Snapshot): Drift[] {
  const out: Drift[] = []
  const stageOf = (kind: Stage['kind']): Stage | null =>
    roadmap.stages.find((s) => s.kind === kind) ?? null

  /* Arrears first. It blocks every investment in the gate, so nothing below it can proceed. */
  if (snapshot.debt.missedRepayment) {
    out.push({
      id: 'drift-arrears',
      kind: 'debt',
      measure: 'realign',
      title: 'A repayment is behind',
      detail:
        `There is a repayment on record that was missed. Until it is cleared the suitability ` +
        `rules refuse every investment on the shelf, so no amount of extra money moves this ` +
        `plan forward — the arrear does.`,
      planned: null,
      observed: null,
      severity: 'bad',
      stage: stageOf('clear_debt'),
    })
  }

  /* A debt whose payment does not beat the interest accruing on it. */
  const debt = stageOf('clear_debt')
  if (snapshot.debt.hasHighInterest && snapshot.debt.total > 0) {
    const interest = interestOn(snapshot)
    const paying = debt?.monthly ?? 0
    if (paying <= interest) {
      out.push({
        id: 'drift-debt',
        kind: 'debt',
        measure: 'add',
        title: 'The balance is growing',
        detail:
          `${inr(snapshot.debt.total)} at ${snapshot.debt.highestRate}% accrues ` +
          `${inr(interest)} a month in interest alone, and the plan can put ${inr(paying)} ` +
          `against it. At that pace the balance rises — there is no payoff date to give you, ` +
          `because there is not one.`,
        planned: paying,
        observed: interest,
        severity: 'bad',
        stage: debt,
      })
    }
  }

  /* Cover the plan proposes and the file still shows as not in force. */
  const cover = stageOf('get_cover')
  if (cover && snapshot.protection.gap > 0) {
    out.push({
      id: 'drift-cover',
      kind: 'cover',
      measure: 'realign',
      title: 'Cover is not in force',
      detail:
        `${snapshot.customer.dependents} ` +
        `${snapshot.customer.dependents === 1 ? 'person depends' : 'people depend'} on your ` +
        `income and ${inr(snapshot.protection.gap)} of the cover the plan asks for is still ` +
        `not in force. ${cover.productName ?? 'The policy'} is ${inr(cover.monthly)} a month ` +
        `and it is the one step on this route that cannot be caught up on later.`,
      planned: cover.monthly,
      observed: null,
      severity: 'bad',
      stage: cover,
    })
  }

  /* Reachable money under the floor the gate enforces before anything with a lock-in. */
  const buffer = stageOf('build_buffer')
  const covered = snapshot.buffer.monthsCovered
  if (buffer && covered !== null && covered < snapshot.buffer.targetMonths) {
    out.push({
      id: 'drift-buffer',
      kind: 'buffer',
      measure: 'realign',
      // A buffer short of its *target* is the ordinary state of a plan that is working; short of
      // three months is the state the gate refuses to sell past. Two different sentences.
      title: covered < 3 ? 'The buffer is below the floor' : 'The buffer is still filling',
      detail:
        `${inr(snapshot.balances.total)} is reachable, which covers about ${covered} ` +
        `${covered === 1 ? 'month' : 'months'} of your outgoings against a target of ` +
        `${snapshot.buffer.targetMonths}. ` +
        (covered < 3
          ? `Below three the suitability rules will not sell you anything with a lock-in, so ` +
            `this is what the rest of the route is waiting on.`
          : `Money going in here does not leave the bank, so your statements cannot show it ` +
            `arriving — the balance is the only evidence there is.`),
      planned: buffer.monthly,
      observed: null,
      severity: covered < 3 ? 'bad' : 'warn',
      stage: buffer,
    })
  }

  /* The goal stage funded at less than the plan asks. The clearest flow drift there is. */
  const grow = roadmap.stages.find((s) => s.kind === 'grow') ?? null
  const running = investingNow(snapshot)
  if (grow && grow.monthly > 0 && running.amount < grow.monthly) {
    const behind = grow.monthly - running.amount
    out.push({
      id: 'drift-contribution',
      kind: 'contribution',
      measure: 'add',
      title: running.amount > 0 ? 'Less is going in than planned' : 'Nothing is going in yet',
      detail:
        `The plan puts ${inr(grow.monthly)} a month into ` +
        `${grow.productName ?? 'the goal'}. ` +
        (running.amount > 0
          ? `${sourceLine(running)} — ${inr(behind)} a month short of it.`
          : `${sourceLine(running)}, so the whole ${inr(grow.monthly)} is the gap.`),
      planned: grow.monthly,
      observed: running.amount,
      severity: 'bad',
      stage: grow,
    })
  }

  /* The engine's own verdict on whether the target is reachable at all. */
  if (!roadmap.feasible && roadmap.shortfallMonthly > 0) {
    out.push({
      id: 'drift-shortfall',
      kind: 'shortfall',
      measure: 'add',
      title: 'The target is out of reach at this pace',
      detail:
        `Reaching ${roadmap.goal.purpose ? `“${roadmap.goal.purpose}”` : 'your goal'} on time ` +
        `needs ${inr(roadmap.shortfallMonthly)} a month more than your statements leave spare. ` +
        `The plan says so rather than moving the number until it fits.`,
      planned: roadmap.monthlyCommitment + roadmap.shortfallMonthly,
      observed: roadmap.monthlyCommitment,
      severity: 'bad',
      stage: roadmap.stages.find((s) => s.isGoal) ?? null,
    })
  }

  /* The plan asking for more each month than there is left to give. */
  if (roadmap.monthlyCommitment > snapshot.surplus.deployable && roadmap.feasible) {
    out.push({
      id: 'drift-affordability',
      kind: 'unaffordable',
      measure: 'realign',
      title: 'The plan costs more than is spare',
      detail:
        `The route commits ${inr(roadmap.monthlyCommitment)} a month and your statements leave ` +
        `${inr(snapshot.surplus.deployable)} spare after commitments, everyday spending and the ` +
        `provision for one-off costs. The plan was cut against a different month than the one ` +
        `you are having.`,
      planned: roadmap.monthlyCommitment,
      observed: snapshot.surplus.deployable,
      severity: 'bad',
      stage: null,
    })
  }

  /*
   * Rising discretionary spending — the cause behind most of the above, and the cheapest fix.
   *
   * `trendPct` and `changePct` are **fractions despite their names**: `derive.ts` computes
   * `(recent − prior) / prior` and stores it to three decimals, so a fifth more spending arrives
   * as `0.209` and not as `20.9`. Reading it as a percentage would have printed "up 0%" over a
   * real 21% rise and would have silenced the branch entirely at any sane threshold. 0.15 is the
   * same bar `derive.ts` uses to decide a category's movement is worth reporting at all.
   */
  const trend = snapshot.discretionary
  if (trend.trend === 'rising' && trend.trendPct >= 0.15) {
    const worst = [...trend.categoryTrends].sort((a, b) => b.changePct - a.changePct)[0]
    out.push({
      id: 'drift-spending',
      kind: 'spending',
      measure: 'realign',
      title: 'Spending is climbing',
      detail:
        `Your everyday spending is up ${Math.round(trend.trendPct * 100)}% over the last three ` +
        `months against the three before them` +
        (worst && worst.changePct > 0
          ? `, most of it ${worst.category.toLowerCase()} — ${inr(worst.prior)} to ` +
            `${inr(worst.recent)}.`
          : `.`) +
        ` Every rupee of that came out of what the plan had to work with.`,
      planned: null,
      observed: trend.monthly,
      severity: 'warn',
      stage: null,
    })
  }

  return out
}

function sourceLine(running: ReturnType<typeof investingNow>): string {
  if (running.source === 'none') return 'Nothing is running against it'
  if (running.source === 'statement')
    return `Your statements show ${inr(running.amount)} a month going out`
  if (running.source === 'mandates')
    return `Your holdings record ${inr(running.amount)} a month of mandates`
  return `${inr(running.amount)} a month is running`
}

export function driftFor(list: readonly Drift[], measure: Measure): Drift[] {
  return list.filter((d) => d.measure === measure)
}

/* ---------------------------------------------------------------- Debt arithmetic */

/**
 * How many months a debt takes to clear at a given monthly payment, or `null` where it never
 * does. A mirror of `packages/core/src/projection.ts`, for the reason `lib/projection.ts` is one:
 * ADR-0001 keeps the engine out of the main bundle, and `drift.test.ts` proves the mirror.
 *
 * The `null` is the whole point and is not an edge case on an Indian credit card. At IDBI's own
 * 34.8%, ₹5.83 lakh accrues about ₹16,900 a month in interest alone, so a ₹5,992 payment leaves
 * the balance *growing*. Dividing the balance by the payment — which is what a naive funding
 * screen does — would promise a payoff date that never arrives to somebody trusting us with
 * their money.
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
  if (monthlyPayment <= principal * r) return null
  return Math.ceil(-Math.log(1 - (r * principal) / monthlyPayment) / Math.log(1 + r))
}

/** The smallest payment that actually retires a debt within `months`. Core's, mirrored. */
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

/* ---------------------------------------------------------------- Changes */

/**
 * What a rebalance would actually change, and where each change ends.
 *
 * The reference's cart groups its lines into `SIPs to Stop` / `Lump sum to Sell` / `SIPs to
 * Start` / `Lump sum to Buy` — four groups because it can sell units it can see. This app cannot
 * sell anything: there is no folio, no units, no redemption route, and inventing one would be
 * inventing a feature. So the grouping that survives is the honest half of it — money that starts
 * moving, and money that stops leaking — and the exit group is behavioural rather than a
 * redemption.
 *
 * `terminus` is the decision this whole surface turns on. A change that buys a product on the
 * shelf goes through `screens/invest/`, which means it goes through the suitability gate, which
 * is `07-DECISIONS.md` §3 and is not optional. A change that is not a purchase — a spending cap,
 * a card repayment, an arrear — has nothing to sell and ends at the self-report the app already
 * has.
 */
export type Terminus = 'spine' | 'self_report' | 'none'

export interface Change {
  id: string
  group: 'start' | 'stop'
  /** The instruction, imperative and with the amount in it. */
  label: string
  /** What it is going into, or the habit it comes out of. */
  detail: string
  /** ₹ a month. A lump sum carries its own figure in `oneOff`. */
  monthly: number
  /** A one-off, where the customer asked for one on the funding screen. */
  oneOff: number
  productId: string | null
  productName: string | null
  terminus: Terminus
  /** Why it ends where it ends. Printed, because a handoff nobody explained looks like a dodge. */
  terminusNote: string
  /**
   * The daily plan's action this change *is*, where the plan already carries one.
   *
   * The join used to be the product, which cannot work for the rows that need it: every
   * `self_report` change is behavioural — a card repayment, a spending cap — and behavioural
   * changes carry `productId: null` by construction. So the match never fired, and "I did it" /
   * "Not now" / "Recorded" were unreachable on every row that was supposed to have them.
   *
   * A kind is the honest key. An action's id is `${insight.kind}:${suggests}` and nothing about
   * it is derivable from a roadmap stage, but "put money against the card" and `pay_down_card`
   * are the same decision whoever asks, and so are "cap this habit" and `set_category_cap`.
   */
  actionKind: ActionKind | null
}

export interface ChangeInputs {
  /** Extra monthly the customer dialled in on the funding screen. */
  extraMonthly: number
  /** A one-off the customer dialled in on the funding screen. */
  lumpSum: number
  /** Product ids the shelf can actually sell today. Anything else cannot reach the spine. */
  sellable: ReadonlySet<string>
}

/**
 * The stage extra money goes into.
 *
 * Not always the growth stage, and assuming it was is a bug worth naming: a customer whose goal
 * the engine reads as `debt_payoff` has no growth stage at all, and their extra ₹5,000 belongs
 * against a card at 34.8% — which is the highest-returning thing on their list and the engine
 * says so in the stage's own `why`. So: the goal stage if it holds money, otherwise the growth
 * stage, otherwise the buffer. A behavioural stage never qualifies, because there is nothing to
 * put money into.
 */
export function fundingStage(roadmap: Roadmap): Stage | null {
  const holdsMoney = (s: Stage): boolean =>
    s.kind === 'grow' ||
    s.kind === 'build_buffer' ||
    (s.kind === 'clear_debt' && s.targetAmount > 0)
  const candidates = roadmap.stages.filter(holdsMoney)
  return (
    candidates.find((s) => s.isGoal) ??
    candidates.find((s) => s.kind === 'grow') ??
    candidates[0] ??
    null
  )
}

/**
 * Build the reviewable set.
 *
 * Nothing here invents an instruction: every line is a roadmap stage the plan already contains,
 * or an amount the customer typed on the funding screen. A stage whose product is not on the
 * shelf still earns a line — "this is what would change" is true whether or not the bank can
 * transact it today — it simply cannot reach the spine, and says so.
 */
export function changesFor(
  roadmap: Roadmap,
  snapshot: Snapshot,
  drifts: readonly Drift[],
  inputs: ChangeInputs,
): Change[] {
  const out: Change[] = []
  const seen = new Set<DriftKind>(drifts.map((d) => d.kind))
  const running = investingNow(snapshot)
  const funding = fundingStage(roadmap)
  const extraMonthly = Math.max(0, Math.round(inputs.extraMonthly))
  const lumpSum = Math.max(0, Math.round(inputs.lumpSum))

  /** A stage reaches the spine only if the shelf can sell what it names. Nothing else may. */
  const terminusOf = (stage: Stage): [Terminus, string] =>
    stage.productId && inputs.sellable.has(stage.productId)
      ? ['spine', 'Runs past the suitability rules before anything is placed.']
      : [
          'none',
          'Nothing on the shelf this app can transact matches this step — your relationship manager arranges it.',
        ]

  /*
   * Extra money the funding screen dialled in goes onto whichever line already owns the funding
   * stage, and onto a line of its own only if no line claimed it. Tracked with a flag rather than
   * inferred from the output, because two lines carrying the same lump sum would double it in
   * every total on the review screen.
   */
  let extrasPlaced = extraMonthly <= 0 && lumpSum <= 0
  const extrasFor = (stage: Stage | null): { monthly: number; oneOff: number } => {
    if (extrasPlaced || !funding || !stage || stage.index !== funding.index) {
      return { monthly: 0, oneOff: 0 }
    }
    extrasPlaced = true
    return { monthly: extraMonthly, oneOff: lumpSum }
  }

  const push = (
    id: string,
    stage: Stage | null,
    line: Pick<Change, 'group' | 'label' | 'detail' | 'monthly'> & Partial<Change>,
  ): void => {
    const extras = extrasFor(stage)
    const [terminus, terminusNote] =
      line.terminus !== undefined
        ? [line.terminus, line.terminusNote ?? '']
        : stage
          ? terminusOf(stage)
          : (['none', ''] as [Terminus, string])
    out.push({
      id,
      group: line.group,
      label: line.label,
      detail: line.detail,
      monthly: line.monthly + extras.monthly,
      oneOff: (line.oneOff ?? 0) + extras.oneOff,
      /* `??` would swallow a deliberate null. A card repayment sets `productId: null` because it
         is never a purchase, and the stage's own product must not be allowed to overwrite that
         — harmless today only because `roadmap.ts` happens to leave `clear_debt` productless. */
      productId: line.productId !== undefined ? line.productId : (stage?.productId ?? null),
      productName: line.productName !== undefined ? line.productName : (stage?.productName ?? null),
      terminus,
      terminusNote,
      actionKind: line.actionKind ?? null,
    })
  }

  /* Cover first, because the route puts it first and `roadmap.ts` says why at length. */
  const cover = roadmap.stages.find((s) => s.kind === 'get_cover') ?? null
  if (cover && seen.has('cover')) {
    push('change-cover', cover, {
      group: 'start',
      label: `Start ${cover.productName ?? 'term cover'} at ${inr(cover.monthly)} a month`,
      detail: `Closes ${inr(snapshot.protection.gap)} of the cover your dependents are short of. It is the one step here that cannot be caught up on later.`,
      monthly: cover.monthly,
    })
  }

  /* The card. Never a purchase, so it never touches the spine. */
  const card = roadmap.stages.find((s) => s.kind === 'clear_debt' && s.targetAmount > 0) ?? null
  if (card && seen.has('debt')) {
    const interest = interestOn(snapshot)
    const inThree = paymentToClear(card.targetAmount, snapshot.debt.highestRate, 36)
    /*
     * The plan's own figure, not a figure this screen invented to look decisive. `interest + 1`
     * would have printed "₹16,902 a month" — a number nobody chose, one rupee above the accrual,
     * that takes a decade to clear the balance. What the customer needs is the plan's figure, the
     * interest it is up against, and the payment that actually retires it; the arithmetic is not
     * flattered and the gap is named.
     */
    push('change-debt', card, {
      group: 'start',
      label: `Put ${inr(card.monthly)} a month against the card`,
      detail:
        card.monthly > interest
          ? `${inr(interest)} a month is what the balance accrues at ${snapshot.debt.highestRate}%, so this is what makes it fall. ${inr(inThree)} a month would clear it inside three years.`
          : `${inr(interest)} a month is what the balance accrues at ${snapshot.debt.highestRate}%, so this does not yet make it fall. ${inr(inThree)} a month clears it inside three years — dial the difference in above and it comes back here.`,
      monthly: card.monthly,
      productId: null,
      productName: null,
      terminus: 'self_report',
      terminusNote: 'Nothing to place. Tell the plan what you did and the next version reads it.',
      actionKind: 'pay_down_card',
    })
  }

  /* The buffer. */
  const buffer = roadmap.stages.find((s) => s.kind === 'build_buffer') ?? null
  if (buffer && seen.has('buffer') && buffer.monthly > 0) {
    push('change-buffer', buffer, {
      group: 'start',
      label: `Put ${inr(buffer.monthly)} a month into ${buffer.productName ?? 'the buffer'}`,
      detail: `Takes the reachable balance towards ${inr(buffer.targetAmount)} — the floor the suitability rules check every later step against.`,
      monthly: buffer.monthly,
    })
  }

  /* The goal contribution, at whatever is missing from it. */
  const grow = roadmap.stages.find((s) => s.kind === 'grow') ?? null
  if (grow && (seen.has('contribution') || seen.has('shortfall'))) {
    const behind = Math.max(0, grow.monthly - running.amount)
    push('change-grow', grow, {
      group: 'start',
      label:
        running.amount > 0
          ? `Take the SIP to ${inr(grow.monthly)} a month`
          : `Start ${inr(grow.monthly)} a month into ${grow.productName ?? 'the goal'}`,
      detail:
        running.amount > 0
          ? `${inr(running.amount)} a month is running. ${inr(behind)} more is what the plan's own figure asks for.`
          : `The plan's own figure for ${roadmap.goal.purpose ?? 'the goal'}, at the assumed rate it was cut against.`,
      monthly: behind,
    })
  }

  /*
   * The extras, where the stage they belong to did not already earn a line. A customer who dials
   * in a lump sum against a plan with no drift is still asking for something real.
   */
  if (funding && !extrasPlaced) {
    const [terminus, terminusNote] =
      funding.kind === 'clear_debt'
        ? ([
            'self_report',
            'Nothing to place. Tell the plan what you did and the next version reads it.',
          ] as [Terminus, string])
        : terminusOf(funding)
    out.push({
      id: 'change-extra',
      group: 'start',
      label:
        extraMonthly > 0 && lumpSum > 0
          ? `Add ${inr(extraMonthly)} a month and ${inr(lumpSum)} today`
          : extraMonthly > 0
            ? `Add ${inr(extraMonthly)} a month`
            : `Put ${inr(lumpSum)} in today`,
      detail: `Into ${funding.productName ?? funding.label}, which is where the plan puts money for ${roadmap.goal.purpose ?? 'this goal'}.`,
      monthly: extraMonthly,
      oneOff: lumpSum,
      productId: funding.kind === 'clear_debt' ? null : funding.productId,
      productName: funding.kind === 'clear_debt' ? null : funding.productName,
      terminus,
      terminusNote,
      // Extra money against a card is the same decision the daily plan calls `pay_down_card`.
      actionKind: funding.kind === 'clear_debt' ? 'pay_down_card' : null,
    })
  }

  /* The habits the free_up stage names. Behavioural, so they end at the self-report. */
  const freeUp = roadmap.stages.find((s) => s.kind === 'free_up')
  if (freeUp) {
    for (const habit of snapshot.discretionary.topHabits.slice(0, 2)) {
      const cap = Math.round(habit.monthlyAverage * 0.6)
      out.push({
        id: `change-cap-${habit.key}`,
        group: 'stop',
        label: `Cap ${habit.merchant ?? habit.key} at ${inr(cap)} a month`,
        detail: `About ${inr(habit.monthlyAverage)} a month now. Roughly ${inr(habit.monthlyAverage - cap)} of it is what funds the step above it.`,
        monthly: habit.monthlyAverage - cap,
        oneOff: 0,
        productId: null,
        productName: null,
        terminus: 'self_report',
        terminusNote: 'A cap you set and keep. The app records the decision, not the money.',
        actionKind: 'set_category_cap',
      })
    }
  }

  return out
}

/** The total a set of changes would move each month, and once. */
export function changeTotals(changes: readonly Change[]): { monthly: number; oneOff: number } {
  return changes.reduce(
    (t, c) => ({ monthly: t.monthly + c.monthly, oneOff: t.oneOff + c.oneOff }),
    { monthly: 0, oneOff: 0 },
  )
}

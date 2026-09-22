/**
 * The goal the plan is built around: the one the customer chose, or the default for them.
 *
 * Cleo's own framing, and the right one: *"you tell Cleo what you want to achieve, **or she can
 * suggest a goal based on your financial situation**."* A mass-market customer who has never had
 * advice cannot answer "what are your financial goals?" — so the app proposes, and the
 * conversation is them editing it. The proposal follows the ladder: whatever is most broken.
 *
 * The first half of that sentence is the customer naming the goal themselves, which onboarding
 * asks as its last question. A chosen kind replaces the proposal, not the route: `buildRoadmap`
 * still puts the cover, the expensive debt and the buffer in front of it, each with its reason,
 * so a customer who picks the long game with a card at 34.8% is told to clear the card first —
 * and the plan says it is for the long game. A kind with nothing to aim at (a payoff with nothing
 * costly owed, cover with no gap) falls back to the ladder rather than planning for a problem the
 * customer does not have.
 *
 * Lives in core rather than the app because it is a decision about the customer, and the API,
 * the avatar brief and the screens all have to propose the same one.
 */
import type { Snapshot } from './derive.ts'
import { futureValue } from './projection.ts'
import { fundingRatePct } from './roadmap.ts'
import type { Goal, GoalAmountBasis, GoalKind } from './roadmap.ts'

/**
 * Under this many months of outgoings the buffer is the ladder's problem, and a chosen safety
 * net is one the route can plan.
 *
 * Not the six the goal is sized at. `buildRoadmap` builds the buffer to three months and funds
 * any goal stage after it without counting what is already in the account, so a safety net chosen
 * by someone four months in would be planned as though nothing had been saved. Past three it is
 * the ladder's proposal instead, which is what the route can honestly plan.
 */
const THIN_BUFFER_MONTHS = 3

/** A default for "something specific" is a starting figure to move, so it is a round one. */
const WEALTH_STEP = 100_000

/** How far out "something specific" is proposed: past a market-linked vehicle's three years. */
const WEALTH_YEARS = 5

/**
 * The default goal, or the customer's own amount in place of the proposed one, or the kind they
 * chose in place of the proposed kind.
 *
 * `overrideBasis` says which money that amount is in and is only meaningful beside an
 * `override`: every figure this function *proposes* is in today's money, for the reason the
 * retirement branch records below. It is spread in only when given, so a session that has
 * never stated a basis produces byte for byte the goal it always produced — and `Goal`
 * reads an absent `amountBasis` as `today`, which is what that goal has always meant.
 *
 * `chosenKind` is the same promise again: absent or null, the ladder decides, and the goal is
 * the one this function has always proposed, byte for byte. Given, and applicable, it is that
 * kind's goal, sized by the same rules the ladder sizes its own rungs by.
 *
 * And where a kind is chosen, `override` belongs to it. The figure lands on the chosen kind's
 * goal and on no other: where that kind has nothing to aim at and the ladder proposes instead,
 * the ladder's goal carries the ladder's own figure. A ₹1.5 crore typed for the family's cover
 * is not a retirement number the day the policy is bought, and a ₹2.5 crore typed for the long
 * game is not six months of breathing room the month the buffer dips. With no kind chosen the
 * figure lands on whatever the ladder proposes, which is the only way one ever reached it before
 * a kind could be chosen.
 */
export function suggestGoal(
  snapshot: Snapshot,
  asOf: string,
  override: number | null,
  overrideBasis: GoalAmountBasis | null = null,
  chosenKind: GoalKind | null = null,
): Goal {
  /**
   * The target, and the money it is in: the customer's own figure where it belongs to this goal,
   * the proposed one where it does not. Spread in where `targetAmount` has always sat, so a
   * goal's keys come out in the order they always have — a stored version compares its goal as
   * bytes, and a key that moved would cut a version nobody asked for.
   */
  const sized = (theirs: boolean, proposed: number): Pick<Goal, 'targetAmount' | 'amountBasis'> =>
    theirs && override !== null
      ? {
          targetAmount: override,
          ...(overrideBasis === null ? {} : { amountBasis: overrideBasis }),
        }
      : { targetAmount: proposed }

  const monthlyOutflow = snapshot.commitments.total + snapshot.discretionary.monthly

  /*
   * What a month costs, for sizing a target.
   *
   * The observed outflow first, because a ledger beats a declaration. Where the statement is
   * too sparse to show one — IDBI's own feed routinely is — the observed income is the next
   * best thing, and the declared income after that. Without this ladder both remaining goals
   * multiply zero: a six-month emergency fund with a target of ₹0, and a retirement number of
   * ₹0, proposed to a customer with three loans and ₹56,780 in the bank.
   */
  const monthlyBasis =
    monthlyOutflow > 0
      ? monthlyOutflow
      : snapshot.income.monthly > 0
        ? snapshot.income.monthly
        : snapshot.customer.declaredMonthlyIncome

  /** `asOf`, a whole number of years on: how every goal here is dated. */
  const yearsOn = (years: number): string => `${Number(asOf.slice(0, 4)) + years}${asOf.slice(4)}`

  const expensive = snapshot.debt.hasHighInterest

  // Null means the outflow could not be read, which is not proof of a buffer, so the ladder
  // treats it the same as a thin one: it is the rung most likely to be right when little is known.
  const thinBuffer =
    snapshot.buffer.monthsCovered === null || snapshot.buffer.monthsCovered < THIN_BUFFER_MONTHS

  // The expensive debt, not every debt. A car loan at 9.4% is not what this goal is for and
  // pricing it at the card's rate is what made the route report itself infeasible.
  const debt = (theirs: boolean): Goal => ({
    id: 'goal-debt',
    kind: 'debt_payoff',
    purpose: 'Clear the expensive debt',
    ...sized(theirs, snapshot.debt.highInterestTotal),
    targetDate: yearsOn(3),
    createdAt: asOf,
  })

  const buffer = (theirs: boolean): Goal => ({
    id: 'goal-buffer',
    kind: 'emergency_fund',
    purpose: 'Six months of breathing room',
    ...sized(theirs, Math.round(monthlyBasis * 6)),
    targetDate: yearsOn(2),
    createdAt: asOf,
  })

  /*
   * The cover the people who depend on the customer need, whole — not the gap.
   *
   * What stands against a cover goal is the cover already in force (the Plan tab's `haveOf`
   * reads `lifeCoverInForce` for it), so the figure has to be the requirement that cover counts
   * towards. Sized at the gap, a customer with ₹1 crore in force against ₹1.2 crore needed would
   * read as having reached a ₹20 lakh target five times over. A year out, because the stage that
   * carries it puts a policy in force in a month and a premium only gets dearer with waiting.
   */
  const cover = (theirs: boolean): Goal => ({
    id: 'goal-cover',
    kind: 'protection',
    purpose: 'Cover for the people who depend on you',
    ...sized(theirs, snapshot.protection.lifeCoverNeeded),
    targetDate: yearsOn(1),
    createdAt: asOf,
  })

  /*
   * A house, a car, a wedding: the customer has a number in mind and has not said it yet.
   *
   * So the default is a starting figure the route can plan and the customer can move: a year of
   * what a month costs, five years out, as money still to put by. Five years puts it past the
   * three that a market-linked vehicle needs and inside the ten where inflation would decide the
   * answer, and a year of outgoings is a plausible deposit, car or wedding for the customer this
   * is for.
   *
   * *Still to put by*, because the route counts the equity already invested towards any growth
   * goal. A year of outgoings alone was ₹20 lakh for Karan, and his ₹13.84 lakh of funds grow
   * past that by 2031 on their own — so the goal stage asked ₹0 a month, drew no projection, and
   * planned nothing for the goal he had just chosen. The default is what that equity reaches by
   * the date, at the rate the route funds this goal at, and the year of outgoings on top: rounded
   * up to the lakh, so rounding can never take it back under what the holdings reach alone.
   * Never below a lakh, so an unreadable statement does not propose a goal of ₹0.
   */
  const wealth = (theirs: boolean): Goal => {
    const rate = fundingRatePct({ kind: 'wealth_target' }, WEALTH_YEARS)
    const reached = futureValue(0, WEALTH_YEARS, rate, snapshot.holdings.equity)
    const proposed = Math.ceil((reached + monthlyBasis * 12) / WEALTH_STEP) * WEALTH_STEP
    return {
      id: 'goal-wealth',
      kind: 'wealth_target',
      purpose: 'Something specific',
      ...sized(theirs, Math.max(WEALTH_STEP, proposed)),
      targetDate: yearsOn(WEALTH_YEARS),
      createdAt: asOf,
    }
  }

  // Twenty-five times current annual spending — the conventional shorthand for "enough to draw
  // 4% a year and not run out" — and stated in **today's** money.
  //
  // The obvious alternative is to inflate that spending forward to 60 and quote the nominal
  // figure. It is arithmetically defensible and it produced ₹11.48 crore, which overflowed the
  // card, read as absurd, and made every plan infeasible for a reason that had nothing to do
  // with the customer. Nobody thinks in 2057 rupees. So the target is in money the customer
  // recognises, and the inflation is handled where it belongs — in the projection, which already
  // shows a real-terms line beside the nominal one.
  const retirement = (theirs: boolean): Goal => {
    const yearsTo60 = Math.max(5, 60 - snapshot.customer.age)
    const target = monthlyBasis * 12 * 25
    return {
      id: 'goal-retire',
      kind: 'retirement',
      purpose: 'Enough to stop working at 60',
      ...sized(theirs, Math.round(target / 500_000) * 500_000),
      targetDate: yearsOn(yearsTo60),
      createdAt: asOf,
    }
  }

  /*
   * The customer's own choice, where it has something to aim at.
   *
   * Null is "nothing to plan": cover with no gap, a safety net the route would plan as though the
   * balance were not there, and a payoff with nothing costly owed. That last one includes the
   * cheap debt: a loan at 9.4% is already being cleared by its instalment, which the outgoings
   * count, so saving towards its balance as well pays it twice. Aimed at every rupee owed, it
   * turned Sunil's feasible buffer plan into an infeasible ₹2,92,552 deposit his EMIs clear in
   * about 29 months anyway, and put Rohan's education loan, five instalments from done, into a
   * three-year one. Those fall through to the ladder, which proposes the problem the customer
   * does have. The long game and something specific always have somewhere to go.
   */
  const chosen = (kind: GoalKind): Goal | null => {
    switch (kind) {
      case 'debt_payoff':
        return expensive ? debt(true) : null
      case 'emergency_fund':
        return thinBuffer ? buffer(true) : null
      case 'protection':
        return snapshot.protection.gap > 0 ? cover(true) : null
      case 'wealth_target':
        return wealth(true)
      case 'retirement':
        return retirement(true)
    }
  }

  const own = chosenKind === null ? null : chosen(chosenKind)
  if (own !== null) return own

  // The ladder. A figure rides on its proposal only where no kind was ever chosen: one chosen
  // and fallen back from keeps its figure for when it applies again, not for this goal.
  const unchosen = chosenKind === null
  if (expensive) return debt(unchosen)
  if (thinBuffer) return buffer(unchosen)
  return retirement(unchosen)
}

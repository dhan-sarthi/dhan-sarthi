/**
 * The default goal for a customer.
 *
 * Cleo's own framing, and the right one: *"you tell Cleo what you want to achieve, **or she can
 * suggest a goal based on your financial situation**."* A mass-market customer who has never had
 * advice cannot answer "what are your financial goals?" — so the app proposes, and the
 * conversation is them editing it. The proposal follows the ladder: whatever is most broken.
 *
 * Lives in core rather than the web app because it is a decision about the customer, and the
 * API, the avatar brief and the screens all have to propose the same one.
 */
import type { Snapshot } from './derive.ts'
import type { Goal } from './roadmap.ts'

export function suggestGoal(snapshot: Snapshot, asOf: string, override: number | null): Goal {
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

  if (snapshot.debt.hasHighInterest) {
    return {
      id: 'goal-debt',
      kind: 'debt_payoff',
      purpose: 'Clear the expensive debt',
      targetAmount: override ?? snapshot.debt.total,
      targetDate: `${Number(asOf.slice(0, 4)) + 3}${asOf.slice(4)}`,
      createdAt: asOf,
    }
  }

  // Null means the outflow could not be read, which is not proof of a buffer, so the ladder
  // treats it the same as a thin one: it is the rung most likely to be right when little is known.
  if (snapshot.buffer.monthsCovered === null || snapshot.buffer.monthsCovered < 3) {
    return {
      id: 'goal-buffer',
      kind: 'emergency_fund',
      purpose: 'Six months of breathing room',
      targetAmount: override ?? Math.round(monthlyBasis * 6),
      targetDate: `${Number(asOf.slice(0, 4)) + 2}${asOf.slice(4)}`,
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
  const yearsTo60 = Math.max(5, 60 - snapshot.customer.age)
  const target = monthlyBasis * 12 * 25
  return {
    id: 'goal-retire',
    kind: 'retirement',
    purpose: 'Enough to stop working at 60',
    targetAmount: override ?? Math.round(target / 500_000) * 500_000,
    targetDate: `${Number(asOf.slice(0, 4)) + yearsTo60}${asOf.slice(4)}`,
    createdAt: asOf,
  }
}

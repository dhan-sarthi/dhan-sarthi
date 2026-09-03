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

  if (snapshot.buffer.monthsCovered < 3) {
    return {
      id: 'goal-buffer',
      kind: 'emergency_fund',
      purpose: 'Six months of breathing room',
      targetAmount: override ?? Math.round(monthlyOutflow * 6),
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
  const target = monthlyOutflow * 12 * 25
  return {
    id: 'goal-retire',
    kind: 'retirement',
    purpose: 'Enough to stop working at 60',
    targetAmount: override ?? Math.round(target / 500_000) * 500_000,
    targetDate: `${Number(asOf.slice(0, 4)) + yearsTo60}${asOf.slice(4)}`,
    createdAt: asOf,
  }
}

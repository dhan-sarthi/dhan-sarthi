/**
 * Insights: the things worth saying, found in the data rather than written in advance.
 *
 * Cleo call this the insight pool and generate it on a schedule rather than in response to a
 * question — which is what makes a notification-first product possible at all. Each insight here
 * carries its evidence and exactly one suggested action, because an observation nobody can act
 * on is not an insight, it is trivia.
 *
 * Two rules govern what may be said, both adapted from Cleo and both load-bearing:
 *
 * **Only name a gap they can act on within the next month.** Money already spent cannot be
 * unspent, so naming it is cruelty dressed as honesty.
 *
 * **Never claim a signal the data cannot support.** Cleo advertise finding "a subscription you
 * forgot about". A bank statement contains no usage data, so we do not claim it — we list what
 * the mandates cost a year and ask. What we *can* detect without asking is a price that went up.
 */
import type { ActionKind } from './actions.ts'
import type { Snapshot } from './derive.ts'
import { compoundedValueOf } from './projection.ts'
import { subscriptions } from './recurring.ts'

export type InsightKind =
  | 'idle_cash'
  | 'emi_ending'
  | 'subscription_review'
  | 'price_increase'
  | 'category_drift'
  | 'protection_gap'
  | 'expensive_debt'
  | 'missed_repayment'
  | 'buffer_thin'
  | 'habit_cost'

export interface Insight {
  kind: InsightKind
  /** Ordering. `urgent` interrupts; `opportunity` waits for the customer to open the app. */
  severity: 'urgent' | 'important' | 'opportunity'
  /** One sentence, with the number in it. This is what appears on the card. */
  headline: string
  /** The reasoning, for "why this?". */
  detail: string
  /** Rupees a month this is worth, where it is worth anything. Used for ranking. */
  monthlyValue: number
  /** The transactions or derived facts behind it. Never a restatement of the headline. */
  evidence: string[]
  suggests: ActionKind | null
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`
const pct = (n: number): string => `${Math.round(Math.abs(n) * 100)}%`

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
 * "April 2026" reads as a month; "2026-04" reads as a database key. Headlines are the sentence
 * the customer reads, so they take the spoken form. The exact ISO date stays in `evidence`,
 * which is the audit trail and is meant to be precise rather than readable.
 */
const spokenMonth = (iso: string): string =>
  `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(0, 7)} ${iso.slice(0, 4)}`

/**
 * Everything worth saying about this customer today, most valuable first.
 *
 * Pure over the snapshot, so the same input always produces the same list — which matters more
 * than it sounds: a proactive nudge that changes wording between two views of the same data
 * reads as a system that does not know what it thinks.
 */
export function findInsights(snapshot: Snapshot): Insight[] {
  const out: Insight[] = []
  const s = snapshot

  /* Urgent — a customer is in trouble and something can be done this month ---- */

  if (s.debt.missedRepayment) {
    out.push({
      kind: 'missed_repayment',
      severity: 'urgent',
      headline: 'There is a missed loan repayment on your record.',
      detail:
        'Until it is cleared I cannot recommend putting money anywhere else. The mark it leaves ' +
        'on your credit file will cost you more, for longer, than anything I could earn you.',
      monthlyValue: 0,
      evidence: [
        `${s.debt.monthlyOutgo ? `EMI outgo ${inr(s.debt.monthlyOutgo)}/month` : ''}`,
      ].filter(Boolean),
      suggests: 'talk_to_rm',
    })
  }

  if (s.debt.hasHighInterest) {
    const interest = Math.round((s.debt.total * s.debt.highestRate) / 100 / 12)
    out.push({
      kind: 'expensive_debt',
      severity: 'urgent',
      headline: `${inr(s.debt.total)} at ${s.debt.highestRate}% is costing you ${inr(interest)} a month in interest alone.`,
      detail:
        `Nothing on the shelf returns ${s.debt.highestRate}% a year. Every rupee that goes here ` +
        `beats every rupee that goes anywhere else — it is the highest-return investment ` +
        `available to you, and it is not an investment.`,
      monthlyValue: interest,
      evidence: [
        `Outstanding ${inr(s.debt.total)} at ${s.debt.highestRate}% p.a.`,
        `Interest accruing ${inr(interest)}/month`,
      ],
      suggests: 'pay_down_card',
    })
  }

  /* Important — a real gap, and the customer can start closing it now ---------- */

  if (s.protection.gap > 0 && s.protection.dependents > 0) {
    out.push({
      kind: 'protection_gap',
      severity: 'important',
      // Two different sentences, because a gap is not always an absence. Saying "there is no
      // life cover in force" to someone holding a ₹1 crore policy is simply wrong, and it is
      // the kind of wrong that costs the whole screen its credibility.
      headline:
        s.protection.lifeCoverInForce <= 0
          ? `${s.protection.dependents} ${s.protection.dependents === 1 ? 'person depends' : 'people depend'} ` +
            `on your income and there is no life cover in force.`
          : `Your life cover is about ${inr(s.protection.gap)} short of what ` +
            `${s.protection.dependents === 1 ? 'your dependent' : 'your dependents'} would need.`,
      detail:
        `A rule of thumb puts the cover needed at around ten times annual income — about ` +
        `${inr(s.protection.lifeCoverNeeded)} for you, against ` +
        `${inr(s.protection.lifeCoverInForce)} in force. Term cover is the cheapest way to buy ` +
        `the difference and the only thing on this list that cannot be caught up on later.`,
      monthlyValue: 0,
      evidence: [
        `${s.protection.dependents} ${s.protection.dependents === 1 ? 'dependent' : 'dependents'} on record`,
        `Life cover in force: ${inr(s.protection.lifeCoverInForce)}`,
        `Indicative requirement (10x annual income): ${inr(s.protection.lifeCoverNeeded)}`,
        s.income.monthly > 0
          ? `Annual income observed in the statement: ${inr(s.income.monthly * 12)}`
          : `Annual income as declared, since no salary credit was recognisable: ${inr(s.customer.declaredMonthlyIncome * 12)}`,
      ],
      suggests: 'buy_term_cover',
    })
  }

  // An unknown outflow cannot be short of a buffer. Saying nothing is right here: the quality
  // line at the foot of the screen already reports how little of the statement was readable.
  if (s.buffer.monthsCovered !== null && s.buffer.monthsCovered < 3) {
    out.push({
      kind: 'buffer_thin',
      severity: 'important',
      headline: `Your savings cover about ${s.buffer.monthsCovered} months of your outgoings.`,
      detail:
        'Below three months, one bad month becomes a loan. It is also the reason nothing with a ' +
        'lock-in can be recommended to you yet — that is a rule, not a preference.',
      monthlyValue: 0,
      evidence: [
        `Reachable savings ${inr(s.balances.total)}`,
        `Monthly outflow ${inr(s.commitments.total + s.discretionary.monthly)}`,
        `Shortfall to a ${s.buffer.targetMonths}-month buffer: ${inr(s.buffer.shortfall)}`,
      ],
      suggests: 'open_sweep_in',
    })
  }

  if (s.debt.endingSoon) {
    const { loanType, emiAmount, monthsLeft } = s.debt.endingSoon
    // A loan finishing is a raise nobody notices, and the money vanishes into spending unless
    // it is claimed before it arrives. Deterministic, verifiable, and few advisors read the
    // ledger deeply enough to find it.
    out.push({
      kind: 'emi_ending',
      severity: 'important',
      headline:
        `Your ${loanType.toLowerCase()} finishes in ${monthsLeft} ` +
        `${monthsLeft === 1 ? 'month' : 'months'} — that is ${inr(emiAmount)} a month freed up.`,
      detail:
        `Money that appears without warning gets spent. Route it before it arrives and you will ` +
        `not miss it, because you are not missing it now.`,
      monthlyValue: emiAmount,
      evidence: [
        `${loanType}: ${monthsLeft} instalments remaining`,
        `EMI ${inr(emiAmount)}/month ends ${monthsLeft} months from now`,
      ],
      suggests: s.commitments.investments > 0 ? 'increase_sip' : 'start_sip',
    })
  }

  /* Opportunity — worth saying when they next open the app --------------------- */

  if (s.balances.idleFloor > s.commitments.total && s.balances.idleMonths >= 3) {
    out.push({
      kind: 'idle_cash',
      severity: 'opportunity',
      headline:
        `${inr(s.balances.idleFloor)} has sat in your savings account for ` +
        `${s.balances.idleMonths} months without once being needed.`,
      detail:
        'A savings account pays about 2.7% and prices are rising faster than that, so money ' +
        'left there quietly loses value. This is not about risk — a sweep-in deposit keeps it ' +
        'reachable any day.',
      monthlyValue: Math.round((s.balances.idleFloor * 0.04) / 12),
      evidence: [
        `Twelve-month minimum balance: ${inr(s.balances.idleFloor)}`,
        `Held above one month of outgoings for ${s.balances.idleMonths} consecutive months`,
      ],
      suggests: 'open_sweep_in',
    })
  }

  for (const series of subscriptions(s.commitments.series)) {
    for (const change of series.priceChanges) {
      out.push({
        kind: 'price_increase',
        severity: 'opportunity',
        headline:
          `${series.merchant ?? series.key} went from ${inr(change.from)} to ${inr(change.to)} ` +
          `in ${spokenMonth(change.on)}.`,
        detail:
          `That is ${inr((change.to - change.from) * 12)} a year you did not agree to. Worth ` +
          `deciding again rather than by default.`,
        monthlyValue: change.to - change.from,
        evidence: [
          `Charged ${inr(change.from)} until ${change.on}`,
          `Charged ${inr(change.to)} since`,
          `${series.occurrences} charges detected on day ${series.dayOfMonth ?? '?'} of the month`,
        ],
        suggests: 'cancel_subscription',
      })
    }
  }

  const subs = subscriptions(s.commitments.series)
  if (subs.length >= 2) {
    const annual = subs.reduce((sum, x) => sum + x.annualCost, 0)
    out.push({
      kind: 'subscription_review',
      severity: 'opportunity',
      headline: `${subs.length} subscriptions are costing you ${inr(annual)} a year.`,
      // The honest framing. We cannot know which they have stopped using, so we ask.
      detail:
        'Nobody cancels ₹1,499 a month. Rather more people cancel ₹17,988 a year. I do not know ' +
        'which of these you still use — you do.',
      monthlyValue: Math.round(annual / 12),
      evidence: subs.map(
        (x) => `${x.merchant ?? x.key}: ${inr(x.amount)}/month, ${inr(x.annualCost)}/year`,
      ),
      suggests: 'cancel_subscription',
    })
  }

  for (const trend of s.discretionary.categoryTrends.slice(0, 1)) {
    if (trend.changePct <= 0) continue
    const extra = trend.recent - trend.prior
    out.push({
      kind: 'category_drift',
      severity: 'opportunity',
      headline: `${trend.category} is up ${pct(trend.changePct)} over the last three months.`,
      detail:
        `${inr(trend.prior)} a month became ${inr(trend.recent)}. Nothing dramatic happened — ` +
        `it just drifted, which is how it usually goes. Capping it back is ${inr(extra)} a month, ` +
        `and over thirty years that is ${inr(compoundedValueOf(extra, 30))}.`,
      monthlyValue: extra,
      evidence: [
        `Three months to ${s.asOf}: ${inr(trend.recent)}/month`,
        `The three months before that: ${inr(trend.prior)}/month`,
      ],
      suggests: 'set_category_cap',
    })
  }

  const habit = s.discretionary.topHabits[0]
  if (habit && habit.timesPerMonth >= 4) {
    out.push({
      kind: 'habit_cost',
      severity: 'opportunity',
      headline:
        `${habit.merchant ?? habit.key} ${habit.timesPerMonth} times a month — ` +
        `${inr(habit.annualTotal)} a year.`,
      // Cleo's research finding: the damage is the small repeat purchase, not the impulse buy.
      detail:
        `Typically ${inr(habit.typicalAmount)} at a time, which is why it does not feel like ` +
        `anything. Added up it is the largest single thing you could change.`,
      monthlyValue: Math.round(habit.monthlyAverage * 0.3),
      evidence: [
        `${habit.occurrences} transactions since ${habit.firstSeen}`,
        `Typical ${inr(habit.typicalAmount)}, ${habit.timesPerMonth}x/month`,
        `${inr(habit.monthlyAverage)}/month, ${inr(habit.annualTotal)}/year`,
      ],
      suggests: 'set_category_cap',
    })
  }

  const order: Record<Insight['severity'], number> = { urgent: 0, important: 1, opportunity: 2 }
  return out.sort(
    (a, b) => order[a.severity] - order[b.severity] || b.monthlyValue - a.monthlyValue,
  )
}

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
  | 'deposit_maturing'
  | 'human_handoff'

export interface Insight {
  kind: InsightKind
  /** Ordering. `urgent` interrupts; `opportunity` waits for the customer to open the app. */
  severity: 'urgent' | 'important' | 'opportunity'
  /** One sentence, with the number in it. This is what appears on the card. */
  headline: string
  /** The reasoning, for "why this?". */
  detail: string
  /** Rupees a month this is worth, where it is worth anything. The last tiebreak, never the first. */
  monthlyValue: number
  /**
   * Days until this stops being actionable, where it has a date at all.
   *
   * A dated event is not more *important* than the waterfall — it is only actionable now. A
   * deposit renews on its maturity date whether or not anyone looked; term cover can be bought
   * next week. That asymmetry is the whole reason a deadline jumps the queue.
   */
  deadlineDays?: number
  /** The transactions or derived facts behind it. Never a restatement of the headline. */
  evidence: string[]
  suggests: ActionKind | null
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

/** "11 September". A maturity date is a day, not a month, because the customer has to act by it. */
const spokenDate = (iso: string): string =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7)}`

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
      headline: 'You have a missed loan repayment on record.',
      detail:
        'Clear it before anything else. A mark on your credit file costs you more, ' +
        'and for longer, than any return I could find you.',
      monthlyValue: 0,
      evidence: [
        `${s.debt.monthlyOutgo ? `${inr(s.debt.monthlyOutgo)} a month in EMIs` : ''}`,
      ].filter(Boolean),
      suggests: 'talk_to_rm',
    })
  }

  if (s.debt.hasHighInterest) {
    /*
     * The expensive balance, not every balance.
     *
     * This used `debt.total` against `highestRate`, which is the card's rate applied to the whole
     * book. Karan carries ₹1,86,240 on a card at 34.8% and ₹6,28,075 of loans well under half
     * that, and the card was reported as costing him ₹23,615 a month when it costs ₹5,401 — a
     * figure 4.4x too large, quoted on the one card that claims to be the honest one. It is also
     * what made the action unactionable: an ₹8,14,315 balance on a card the customer could pay
     * off this year reads as a debt nobody can touch. `highInterestTotal` is the field that
     * exists for exactly this, and the suitability gate has always used it.
     */
    const balance = s.debt.highInterestTotal
    const interest = Math.round((balance * s.debt.highestRate) / 100 / 12)
    out.push({
      kind: 'expensive_debt',
      severity: 'urgent',
      headline: `${inr(balance)} at ${s.debt.highestRate}% costs you ${inr(interest)} a month.`,
      detail: `Nothing you can invest in returns ${s.debt.highestRate}%. Clear this first.`,
      monthlyValue: interest,
      evidence: [
        `${inr(balance)} outstanding at ${s.debt.highestRate}% a year`,
        `${inr(interest)} a month in interest`,
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
          : `Your life cover is about ${spoken(s.protection.gap)} short of what ` +
            `${s.protection.dependents === 1 ? 'your dependent' : 'your dependents'} would need.`,
      // Ten-times-income is a rule of thumb and has to say so: it is an indicative requirement,
      // not a computed need, and a figure this size presented as a calculation would be a claim
      // the data cannot carry. The "cannot be caught up on later" clause is why this outranks
      // everything below it, so it survives the cut too.
      detail:
        `The rule of thumb is ten times income — ${spoken(s.protection.lifeCoverNeeded)}, against ` +
        `${spoken(s.protection.lifeCoverInForce)} you hold now. Term cover is the cheapest fix, ` +
        `and it gets dearer every year you wait.`,
      monthlyValue: 0,
      evidence: [
        `${s.protection.dependents} ${s.protection.dependents === 1 ? 'person depends' : 'people depend'} on you`,
        `${inr(s.protection.lifeCoverInForce)} of cover today`,
        `${inr(s.protection.lifeCoverNeeded)} needed — ten times your income`,
        s.income.monthly > 0
          ? `${inr(s.income.monthly * 12)} a year, from your statement`
          : `${inr(s.customer.declaredMonthlyIncome * 12)} a year, as you told us — no salary found in the statement`,
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
        'Under three months, one bad month turns into a loan. Nothing locked-in until you are past it.',
      monthlyValue: 0,
      evidence: [
        `${inr(s.balances.total)} you can reach today`,
        `${inr(s.commitments.total + s.discretionary.monthly)} goes out every month`,
        `${inr(s.buffer.shortfall)} short of ${s.buffer.targetMonths} months' cover`,
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
        `Your ${loanType.toLowerCase()} ends in ${monthsLeft} ` +
        `${monthsLeft === 1 ? 'month' : 'months'}. That frees ${inr(emiAmount)} a month.`,
      detail: `Claim it before the first month lands and you will never miss it.`,
      monthlyValue: emiAmount,
      evidence: [
        `${monthsLeft} instalments left on your ${loanType.toLowerCase()}`,
        `${inr(emiAmount)} a month, free from then on`,
      ],
      suggests: s.commitments.investments > 0 ? 'increase_sip' : 'start_sip',
    })
  }

  /*
   * A deposit maturing is the mirror of an EMI ending, and the more valuable of the two.
   *
   * An EMI ending is a windfall the customer can miss. A deposit maturing is a decision that
   * gets made *for* them: left alone it auto-renews at the counter rate, and after tax and
   * inflation that is a real loss on money they already own. Doing nothing is the expensive
   * option — which is precisely when advice is worth paying for, and precisely what no bank
   * bothers to tell anyone, because the silent renewal is the profitable outcome.
   */
  if (s.balances.maturingSoon) {
    const { amount, daysLeft, maturityDate, interestRate } = s.balances.maturingSoon
    out.push({
      kind: 'deposit_maturing',
      severity: 'important',
      headline:
        `Your ${inr(amount)} deposit matures on ${spokenDate(maturityDate)}, ` +
        `${daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `${daysLeft} days away`}.`,
      detail:
        'Do nothing and it auto-renews at the counter rate, which loses money after tax ' +
        'and inflation. Deciding now costs you nothing.',
      // A rough spread against a better home for the money, monthly. Used only to break ties
      // inside one rung of the waterfall, never shown to the customer as a promise.
      monthlyValue: Math.round((amount * 0.015) / 12),
      deadlineDays: daysLeft,
      evidence: [
        `${inr(amount)} deposit, matures ${maturityDate}`,
        interestRate === null ? 'Renewal rate unknown' : `Currently earning ${interestRate}%`,
        `${daysLeft} days from today`,
      ],
      suggests: 'open_sweep_in',
    })
  }

  /* Opportunity — worth saying when they next open the app --------------------- */

  if (s.balances.idleFloor > s.commitments.total && s.balances.idleMonths >= 3) {
    out.push({
      kind: 'idle_cash',
      severity: 'opportunity',
      headline: `${inr(s.balances.idleFloor)} has sat untouched in savings for ${s.balances.idleMonths} months.`,
      // Both halves are load-bearing: 2.7% against rising prices is the evidence that idle
      // money is losing value, and "comes back any day" is why a sweep-in is suggested to
      // someone whose buffer may still be thin.
      detail:
        'Savings pays 2.7%, below inflation, so it loses value sitting there. A sweep-in still comes back any day.',
      monthlyValue: Math.round((s.balances.idleFloor * 0.04) / 12),
      evidence: [
        `${inr(s.balances.idleFloor)} — your lowest balance in twelve months`,
        `Never dipped below it in ${s.balances.idleMonths} months`,
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
        detail: `${inr((change.to - change.from) * 12)} a year extra that you never agreed to.`,
        monthlyValue: change.to - change.from,
        evidence: [
          `${inr(change.from)} a month until ${change.on}`,
          `${inr(change.to)} a month since`,
          `${series.occurrences} charges, on the ${series.dayOfMonth ?? '?'} of each month`,
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
      headline: `${subs.length} subscriptions cost you ${inr(annual)} a year.`,
      // The honest framing, and the whole of what is left to say: a statement carries no usage
      // data, so the one thing this card must not imply is that we know which are dead.
      detail: 'I cannot tell which of these you still use. You can.',
      monthlyValue: Math.round(annual / 12),
      evidence: subs.map(
        (x) => `${x.merchant ?? x.key}: ${inr(x.amount)} a month, ${inr(x.annualCost)} a year`,
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
      headline: `${trend.category} is up ${pct(trend.changePct)} in three months.`,
      // The thirty-year figure went with the exposition, and it was the right one to lose: it
      // was the only projection in this file printed without its rate beside it, which is the
      // one thing `projection.ts` insists on. The card keeps the two months and the cause.
      detail: `${inr(trend.prior)} a month became ${inr(trend.recent)}. Nothing big happened — it just crept up.`,
      monthlyValue: extra,
      evidence: [
        `Last three months: ${inr(trend.recent)} a month`,
        `The three before that: ${inr(trend.prior)} a month`,
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
        `${habit.merchant ?? habit.key}, ${habit.timesPerMonth} times a month. ` +
        `${inr(habit.annualTotal)} a year.`,
      // Cleo's research finding: the damage is the small repeat purchase, not the impulse buy.
      // "The largest single thing you could change" went with it — this is the top habit by
      // spend, which is not the same claim and was not one the ranking could support.
      detail: `Usually ${inr(habit.typicalAmount)} at a time. Small enough that it never feels like much.`,
      monthlyValue: Math.round(habit.monthlyAverage * 0.3),
      evidence: [
        `${habit.occurrences} times since ${habit.firstSeen}`,
        `Usually ${inr(habit.typicalAmount)}, ${habit.timesPerMonth} times a month`,
        `${inr(habit.monthlyAverage)} a month, ${inr(habit.annualTotal)} a year`,
      ],
      suggests: 'set_category_cap',
    })
  }

  /*
   * The escape hatch, always on the list and always last.
   *
   * Thirteen actions is a closed vocabulary, and a closed vocabulary needs a door: the honest
   * answer to a question outside it is a person, not a worse answer inside it. `decisions.md`
   * calls `talk_to_rm` "the escape hatch that keeps the whole thing defensible", and a bank
   * reads an advisor that knows the edge of its own competence very differently from one that
   * answers everything.
   *
   * It fires for every customer so the request always has an action id to be recorded against,
   * which is what puts a callback on the same append-only trail as every other decision. Last in
   * the waterfall, so it can never displace advice the engine actually has.
   */
  out.push({
    kind: 'human_handoff',
    severity: 'opportunity',
    headline: 'You can talk to a person about any of this.',
    detail: 'Some questions need human judgement. A call is free and changes nothing here.',
    monthlyValue: 0,
    evidence: [`Requested from the app on ${s.asOf}`],
    suggests: 'talk_to_rm',
  })

  return rank(out)
}

/**
 * The waterfall from `docs/product/problem.md`, as code.
 *
 * Retail financial planning is close to a deterministic sequence, and the sequence *is* the
 * product: clear expensive debt, hold a cushion, cover the people who depend on you, and only
 * then deploy what is left.
 *
 * This ordering used to be `monthlyValue` descending inside a severity band, and that inverted
 * the waterfall in the one case it most matters: `protection_gap` and `emi_ending` are both
 * `important`, so a ₹8,200 SIP increase outranked a ₹985 term policy for a customer with two
 * dependents and no cover in force. Ranking advice by the size of the cheque is how every bank
 * mis-sells; refusing to is the entire claim this product makes.
 */
const WATERFALL: Record<InsightKind, number> = {
  missed_repayment: 0,
  expensive_debt: 1,
  buffer_thin: 2,
  protection_gap: 3,
  deposit_maturing: 4,
  emi_ending: 5,
  idle_cash: 6,
  price_increase: 7,
  subscription_review: 8,
  category_drift: 9,
  habit_cost: 10,
  human_handoff: 11,
}

const SEVERITY: Record<Insight['severity'], number> = { urgent: 0, important: 1, opportunity: 2 }

/**
 * Inside this many days a dated event jumps the waterfall.
 *
 * Fourteen, not thirty: the claim being made is "this stops being available", and a month out
 * that is not yet true. Term cover bought next week is the same policy; a deposit renewed next
 * week is a different deposit.
 */
const DEADLINE_WINDOW_DAYS = 14

/** Most worth saying first. Pure, total, and the same for the same input. */
function rank(insights: readonly Insight[]): Insight[] {
  const due = (i: Insight): boolean =>
    i.deadlineDays !== undefined && i.deadlineDays <= DEADLINE_WINDOW_DAYS

  return [...insights].sort((a, b) => {
    // Urgent still interrupts. A missed repayment outranks any deadline, because nothing else
    // can be recommended while it stands.
    if (SEVERITY[a.severity] !== SEVERITY[b.severity]) {
      return SEVERITY[a.severity] - SEVERITY[b.severity]
    }
    // Then a live deadline, soonest first.
    if (due(a) !== due(b)) return due(a) ? -1 : 1
    if (due(a) && due(b)) return (a.deadlineDays ?? 0) - (b.deadlineDays ?? 0)
    // Then the waterfall.
    if (WATERFALL[a.kind] !== WATERFALL[b.kind]) return WATERFALL[a.kind] - WATERFALL[b.kind]
    // Rupees only as a last resort, and only inside one rung.
    return b.monthlyValue - a.monthlyValue
  })
}

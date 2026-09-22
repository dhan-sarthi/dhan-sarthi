// A finding as the thing to do (D13), for every screen that shows one.
//
// The engine writes each finding as a statement ("You have a missed loan repayment on record."),
// and a statement is something to read. A card says the thing to do instead: the title is the
// action naming its amount and the line under it is one sentence of why, leading with the number
// — "Cut ₹2,421 a month of fast food spending", then "30% of the ₹8,070 a month it costs".
//
// One wording for both places a finding is shown, /noticed and Spend's Smart insights. Two
// wordings of the same finding were two answers to "what comes first": the carousel said "Clear
// it before anything else" in the engine's words while /noticed had already dropped them.
//
// Every figure is the snapshot's, which is what the engine derived the finding from; a price
// rise's subject and a subscription count are read off the headline, which core writes in one
// fixed shape per kind (`ask.ts` reads it the same way). A shape this file does not know keeps
// the engine's words rather than a guess. The engine's sentence is still the key a card is filed
// and rated under (`insightKey`), and /noticed prints it word for word at the top of the evidence.
import type { Insight, Snapshot } from '@dhan/contracts'
import { rupees, rupeesShort } from './money.ts'
import { asModifier } from './names.ts'

/** What a card says, and the one figure it stands behind. */
export type InsightCopy = {
  /** The thing to do, as an imperative naming its amount. */
  title: string
  /** One sentence of why, leading with the number. */
  why: string
  /** Rupees a month the card prints, and the total at the top adds up. */
  worth: number
  /** The sentence already says how long is left, so the line under it does not. */
  saysDays: boolean
  /** Reworded from the engine's sentence, which then leads the evidence. */
  reworded: boolean
}

/**
 * The two findings whose `monthlyValue` is core's guess at a better rate — 1.5% on a deposit
 * renewed well, 4% on idle cash — kept to break ties and never meant as a promise. Printed, or
 * added to the total, it would read as one.
 */
const GUESSED = new Set<Insight['kind']>(['deposit_maturing', 'idle_cash'])

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/**
 * A finding as the thing to do (D13). The figures are the snapshot's, which is what the engine
 * derived the finding from; a price rise's subject and a subscription count are read off the
 * headline, which core writes in one fixed shape per kind (`ask.ts` reads it the same way).
 * Anything unrecognised keeps the engine's words, and its figure is labelled under them.
 */
export function copyOf(insight: Insight, s: Snapshot): InsightCopy {
  const value = insight.monthlyValue
  const card = (title: string, why: string, worth = value, saysDays = false): InsightCopy => ({
    title,
    why,
    worth,
    saysDays,
    reworded: true,
  })

  switch (insight.kind) {
    case 'missed_repayment':
      return card(
        'Clear the missed repayment',
        'A mark on your credit file costs more, for longer, than any return.',
      )
    case 'expensive_debt': {
      const { highInterestTotal: owed, highestRate: rate } = s.debt
      if (owed <= 0 || value <= 0) break
      return card(
        `Pay off ${rupees(owed)} at ${rate}%`,
        `${rupees(value)} a month in interest, and nothing you can invest returns ${rate}%.`,
      )
    }
    case 'protection_gap': {
      const { gap, lifeCoverInForce: held, dependents } = s.protection
      if (gap <= 0 || dependents <= 0) break
      // Ten times income is a rule of thumb, not a computed need, and the card says so.
      return held <= 0
        ? card(
            `Get ${rupeesShort(gap)} of life cover`,
            `${count(dependents, 'person depends', 'people depend')} on you, and the rule of thumb is ten times your income.`,
          )
        : card(
            `Get ${rupeesShort(gap)} more life cover`,
            `${rupeesShort(held)} of cover now, against a rule of thumb of ten times your income.`,
          )
    }
    case 'buffer_thin': {
      const { monthsCovered: months, shortfall } = s.buffer
      if (months === null || shortfall <= 0) break
      return card(
        `Add ${rupees(shortfall)} to your safety net`,
        `${count(months, 'month', 'months')} of outgoings saved, and one bad month could turn into a loan.`,
      )
    }
    case 'emi_ending': {
      const loan = s.debt.endingSoon
      if (loan === null || value <= 0) break
      return card(
        `Claim the ${rupees(value)} a month your loan frees`,
        `${count(loan.monthsLeft, 'month', 'months')} left on your ${loan.loanType.toLowerCase()}, and left alone it drifts into spending.`,
      )
    }
    case 'deposit_maturing': {
      const deposit = s.balances.maturingSoon
      if (deposit === null) break
      const when =
        deposit.daysLeft <= 0
          ? 'It renews today'
          : `${count(deposit.daysLeft, 'day', 'days')} until it renews`
      return card(
        `Decide where your ${rupees(deposit.amount)} deposit goes`,
        `${when} at the counter rate, which loses money after tax and inflation.`,
        0,
        true,
      )
    }
    case 'idle_cash': {
      const { idleFloor: idle, idleMonths: months } = s.balances
      if (idle <= 0 || months <= 0) break
      const rate = /pays ([\d.]+%)/.exec(insight.detail)?.[1]
      return card(
        `Put ${rupees(idle)} of idle savings to work`,
        rate === undefined
          ? `${count(months, 'month', 'months')} untouched, losing value to inflation.`
          : `${count(months, 'month', 'months')} untouched at ${rate}, below inflation.`,
        0,
      )
    }
    case 'price_increase': {
      const m = /^(.+?) went from ₹[\d,]+ to (₹[\d,]+) in (.+)\.$/.exec(insight.headline)
      const [name, price, since] = [m?.[1], m?.[2], m?.[3]]
      if (name === undefined || price === undefined || since === undefined || value <= 0) break
      return card(
        `Decide if ${name} is worth ${price} a month`,
        `${rupees(value)} a month more since ${since}, a rise you never agreed to.`,
      )
    }
    case 'subscription_review': {
      const m = /^(\d+) subscriptions cost you (₹[\d,]+) a year\.$/.exec(insight.headline)
      const [n, year] = [m?.[1], m?.[2]]
      if (n === undefined || year === undefined || value <= 0) break
      return card(
        `Review ${rupees(value)} a month of subscriptions`,
        `${n} of them, ${year} a year, and only you know which you still use.`,
      )
    }
    case 'category_drift': {
      const trend = s.discretionary.categoryTrends.find((t) =>
        insight.headline.startsWith(`${t.category} is up`),
      )
      if (trend === undefined || value <= 0) break
      const category = trend.category.charAt(0).toLowerCase() + trend.category.slice(1)
      return card(
        `Bring ${category} back to ${rupees(trend.prior)} a month`,
        `${rupees(value)} a month more over the last three months, with nothing big behind it.`,
      )
    }
    case 'habit_cost': {
      // The engine's figure is a 30% cut of the habit's monthly spend, so the card names the cut
      // and what it is a share of — unlabelled, "₹2,421 a month" under "₹96,845 a year" read as
      // the habit contradicting itself.
      const habit = s.discretionary.topHabits.find((h) =>
        insight.headline.startsWith(`${h.merchant ?? h.key},`),
      )
      if (habit === undefined || value <= 0 || habit.monthlyAverage <= 0) break
      const share = Math.round((value / habit.monthlyAverage) * 100)
      return card(
        `Cut ${rupees(value)} a month of ${asModifier(habit.merchant ?? habit.key)} spending`,
        `${share}% of the ${rupees(habit.monthlyAverage)} a month it costs, usually ${rupees(habit.typicalAmount)} at a time.`,
      )
    }
    case 'human_handoff':
      return card(
        'Talk to a person at IDBI',
        'Some questions need human judgement, and the call is free.',
        0,
      )
  }
  return {
    title: insight.headline,
    why: insight.detail,
    worth: GUESSED.has(insight.kind) ? 0 : value,
    saysDays: false,
    reworded: false,
  }
}

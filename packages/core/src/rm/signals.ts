/**
 * Signals: the engine's insights, re-voiced for the relationship manager.
 *
 * The engine writes to the customer ("₹1,86,240 at 34.8% costs you ₹5,401 a month"). The RM
 * reads about the customer, in the third person, with the figure first ("Card at 34.8% —
 * ₹1.86L outstanding"). Nothing else changes on the way through:
 *
 * - **No new arithmetic.** Every figure in a signal is one the insight already states, read back
 *   out of its own headline, detail and evidence. Re-deriving them from the snapshot would be a
 *   second derivation that could disagree with what the customer was shown, and the record of
 *   what the customer was shown is the thing a bank has to stand behind.
 * - **The engine's order and severity.** `human_handoff` is dropped (the engine adds it to every
 *   customer, so on the console it would mean nothing); everything else keeps its place.
 *
 * The figures are read with patterns written against the engine's own templates in
 * `insights.ts`, and the tests feed those templates through `findInsights` rather than through
 * strings copied here, so a template that changes shape fails a test instead of quietly
 * producing a title with no number in it. Where a pattern does not match, the signal still
 * exists: it falls back to the kind's name and the insight's own sentence, re-voiced.
 */
import type { InsightKind } from '../insights.ts'
import { plural, rupees, rupeesTitle, shortDate } from './format.ts'
import { amountsIn, numberBefore, percentIn, revoice } from './util.ts'

export type SignalKind = Exclude<InsightKind, 'human_handoff'>
export type SignalSeverity = 'urgent' | 'important' | 'opportunity'

export interface Signal {
  kind: SignalKind
  severity: SignalSeverity
  /** RM-voiced, third person, leading with the figure where there is one. */
  title: string
  detail: string
  /** The rupee figure the title leads with; null where the insight states none. */
  figure: number | null
  deadlineDays: number | null
  evidence: string[]
}

/**
 * The insight fields this module reads. Structural, with optionals spelled `?: T | undefined`,
 * so core's `Insight` and the wire mirror from `@dhan/contracts` both pass without a cast.
 */
export interface InsightLike {
  kind: InsightKind
  severity: SignalSeverity
  headline: string
  detail: string
  monthlyValue: number
  deadlineDays?: number | undefined
  evidence: readonly string[]
}

/** What the queue says about a signal: the reason to call, and a first line for the call. */
export interface VoicedSignal {
  signal: Signal
  /** One sentence, third person, with its figure. */
  why: string
  /** A suggested first line, figure first. Spoken to the customer, so it avoids "you" too. */
  opener: string
}

/** The kind as a desk would name it in a filter or a chart legend. */
export const SIGNAL_LABELS: Readonly<Record<SignalKind, string>> = {
  missed_repayment: 'Missed repayment',
  expensive_debt: 'Expensive card debt',
  buffer_thin: 'Thin buffer',
  protection_gap: 'Protection gap',
  deposit_maturing: 'Deposit maturing',
  emi_ending: 'EMI ending',
  idle_cash: 'Idle cash',
  price_increase: 'Price rise',
  subscription_review: 'Subscriptions',
  category_drift: 'Spend drift',
  habit_cost: 'Habit cost',
}

/* ------------------------------------------------------------------ *
 * The engine's ranking
 * ------------------------------------------------------------------ */

/**
 * The waterfall from `insights.ts`, restated because the engine keeps its own copy private.
 *
 * The call queue ranks one top signal per customer *across* customers, which needs a comparator
 * rather than a ranked list, and the spec says it must be the engine's own ranking. A parity
 * test sorts a shuffled `findInsights` result with this comparator and expects the engine's
 * order back, so the two copies cannot drift apart unnoticed.
 */
const WATERFALL: Readonly<Record<InsightKind, number>> = {
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

const SEVERITY: Readonly<Record<SignalSeverity, number>> = {
  urgent: 0,
  important: 1,
  opportunity: 2,
}

/** Inside this many days a dated event jumps the waterfall, as in the engine. */
export const DEADLINE_WINDOW_DAYS = 14

/** Severity, then a live deadline (soonest first), then the waterfall, then monthly value. */
export function byEngineRank(
  a: Pick<InsightLike, 'kind' | 'severity' | 'monthlyValue' | 'deadlineDays'>,
  b: Pick<InsightLike, 'kind' | 'severity' | 'monthlyValue' | 'deadlineDays'>,
): number {
  const due = (i: { deadlineDays?: number | undefined }): boolean =>
    i.deadlineDays !== undefined && i.deadlineDays <= DEADLINE_WINDOW_DAYS
  if (SEVERITY[a.severity] !== SEVERITY[b.severity]) {
    return SEVERITY[a.severity] - SEVERITY[b.severity]
  }
  if (due(a) !== due(b)) return due(a) ? -1 : 1
  if (due(a) && due(b)) return (a.deadlineDays ?? 0) - (b.deadlineDays ?? 0)
  if (WATERFALL[a.kind] !== WATERFALL[b.kind]) return WATERFALL[a.kind] - WATERFALL[b.kind]
  return b.monthlyValue - a.monthlyValue
}

/* ------------------------------------------------------------------ *
 * Re-voicing
 * ------------------------------------------------------------------ */

interface Lines {
  title: string
  detail: string
  figure: number | null
  why: string
  opener: string
}

const first = (values: readonly number[]): number | null => values[0] ?? null

/** "today", "tomorrow", "in 10 days". */
const when = (days: number): string =>
  days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`

function dependents(n: number): string {
  return plural(n, 'dependent')
}

/**
 * One kind at a time, each reading its own template. Returns null where a template did not
 * match, and the caller falls back to the generic lines rather than printing a broken title.
 */
function linesFor(i: InsightLike): Lines | null {
  const ev = (n: number): string => i.evidence[n] ?? ''

  switch (i.kind) {
    case 'missed_repayment': {
      // The engine carries one figure here, the EMIs a month, and only when there are EMIs.
      const emis = first(amountsIn(i.evidence.join(' ')))
      return emis === null
        ? {
            title: 'A loan repayment missed',
            detail:
              'A missed repayment is on record. Uday holds back every investment until it clears.',
            figure: null,
            why: 'A loan repayment was missed, and investing is on hold until it clears.',
            opener: 'One loan repayment was missed. Shall we get it settled first?',
          }
        : {
            title: `${rupeesTitle(emis)} a month in EMIs, a repayment missed`,
            detail:
              'A missed repayment is on record. Uday holds back every investment until it clears.',
            figure: emis,
            why: `${rupees(emis)} a month goes to EMIs and a repayment was missed, so investing is on hold.`,
            opener: `${rupeesTitle(emis)} a month goes to EMIs and one repayment was missed. Shall we get it settled first?`,
          }
    }

    case 'expensive_debt': {
      const balance = first(amountsIn(ev(0)))
      const rate = percentIn(ev(0))
      const interest = first(amountsIn(ev(1)))
      if (balance === null || rate === null || interest === null) return null
      return {
        title: `Card at ${rate}% — ${rupeesTitle(balance)} outstanding`,
        detail: `${rupees(interest)} a month in interest. Uday blocks every investment until it is cleared.`,
        figure: balance,
        why: `${rupees(balance)} on a card at ${rate}% costs ${rupees(interest)} a month in interest.`,
        opener: `${rupees(interest)} a month is going on card interest. Shall we plan to clear it?`,
      }
    }

    case 'buffer_thin': {
      const months = numberBefore(i.headline, 'months')
      const reach = first(amountsIn(ev(0)))
      const outgo = first(amountsIn(ev(1)))
      const shortfall = first(amountsIn(ev(2)))
      const target = numberBefore(ev(2), "months'")
      if (months === null || reach === null || outgo === null || shortfall === null) return null
      const goal = target === null ? 'the target' : plural(target, 'month')
      return {
        title: `${plural(months, 'month')} of savings — ${rupeesTitle(shortfall)} short of ${goal}`,
        detail: `${rupees(reach)} in reach against ${rupees(outgo)} going out a month. Under three months, one bad month becomes a loan.`,
        figure: shortfall,
        why: `Savings cover ${plural(months, 'month')} of outgoings, ${rupees(shortfall)} short of ${goal}.`,
        opener: `${plural(months, 'month')} of savings is thin cover. Shall we build that up before anything else?`,
      }
    }

    case 'protection_gap': {
      const count = numberBefore(ev(0), '(?:person|people)')
      const inForce = first(amountsIn(ev(1)))
      const needed = first(amountsIn(ev(2)))
      if (count === null || inForce === null || needed === null) return null
      // The gap the headline states, from the two exact figures in the evidence rather than the
      // headline's spoken "about ₹1.5 crore", which is rounded and absent when no cover is held.
      // It is the engine's own `max(0, needed - inForce)`, not a new quantity.
      const gap = Math.max(0, needed - inForce)
      const held = inForce > 0 ? `${rupeesTitle(inForce)} held` : 'none held'
      return {
        title:
          inForce > 0
            ? `${rupeesTitle(gap)} short on life cover — ${dependents(count)}`
            : `${rupeesTitle(gap)} short on life cover — ${dependents(count)}, no policy`,
        detail: `Ten times income is the rule of thumb: ${rupeesTitle(needed)} needed, ${held}. Term cover is the cheapest way to close it.`,
        figure: gap,
        why: `${rupees(gap)} short on life cover, with ${dependents(count)} relying on that income.`,
        opener: `${rupeesTitle(gap)} is the life cover gap for ${dependents(count)}. Worth ten minutes on term cover?`,
      }
    }

    case 'deposit_maturing': {
      const amount = first(amountsIn(ev(0)))
      const date = /matures (\d{4}-\d{2}-\d{2})/.exec(ev(0))?.[1]
      const days = i.deadlineDays
      if (amount === null || date === undefined || days === undefined) return null
      const rate = percentIn(ev(1))
      const earning = rate === null ? '' : `, earning ${rate}% now`
      return {
        title: `${rupeesTitle(amount)} deposit matures ${when(days)}`,
        detail: `Matures ${shortDate(date)}${earning}. Left alone it auto-renews at the counter rate.`,
        figure: amount,
        why: `${rupees(amount)} deposit matures ${when(days)} and auto-renews if nobody acts.`,
        opener: `${rupeesTitle(amount)} matures on ${shortDate(date)}. Shall we decide where it goes before it renews?`,
      }
    }

    case 'emi_ending': {
      const m = /^Your (.+) ends in (\d+) months?\./.exec(i.headline)
      const loan = m?.[1]
      const left = m?.[2] === undefined ? null : Number(m[2])
      const emi = first(amountsIn(i.headline))
      if (loan === undefined || left === null || emi === null) return null
      return {
        title: `${rupeesTitle(emi)} a month frees up in ${plural(left, 'month')}`,
        detail: `The ${loan} ends after ${plural(left, 'more instalment', 'more instalments')}. Claimed before the first free month, it never drifts into spending.`,
        figure: emi,
        why: `${rupees(emi)} a month frees up when the ${loan} ends in ${plural(left, 'month')}.`,
        opener: `${rupeesTitle(emi)} a month frees up once the ${loan} ends. Shall we plan where it goes?`,
      }
    }

    case 'idle_cash': {
      const floor = first(amountsIn(i.headline))
      const months = numberBefore(i.headline, 'months')
      if (floor === null || months === null) return null
      return {
        title: `${rupeesTitle(floor)} idle in savings for ${plural(months, 'month')}`,
        detail: `The balance never fell below ${rupees(floor)} in that time. Savings pays 2.7%, under inflation; a sweep-in still comes back any day.`,
        figure: floor,
        why: `${rupees(floor)} has sat untouched in savings for ${plural(months, 'month')}.`,
        opener: `${rupeesTitle(floor)} has sat in savings for ${plural(months, 'month')}. Worth putting it to work while it stays reachable?`,
      }
    }

    case 'price_increase': {
      const m = /^(.+) went from ₹[\d,]+ to ₹[\d,]+ in (.+)\.$/.exec(i.headline)
      const merchant = m?.[1]
      const month = m?.[2]
      const [from, to] = amountsIn(i.headline)
      const annual = first(amountsIn(i.detail))
      if (merchant === undefined || month === undefined) return null
      if (from === undefined || to === undefined || annual === null) return null
      return {
        title: `${rupeesTitle(annual)} a year more for ${merchant}`,
        detail: `${rupees(from)} a month until ${month}, ${rupees(to)} since. Worth asking whether it is still wanted.`,
        figure: annual,
        why: `${merchant} went from ${rupees(from)} to ${rupees(to)} a month in ${month}: ${rupees(annual)} a year more.`,
        opener: `${rupeesTitle(annual)} a year more on ${merchant} since ${month}. Still worth keeping?`,
      }
    }

    case 'subscription_review': {
      const count = numberBefore(i.headline, 'subscriptions')
      const annual = first(amountsIn(i.headline))
      if (count === null || annual === null) return null
      return {
        title: `${rupeesTitle(annual)} a year on ${plural(count, 'subscription')}`,
        detail: 'A statement shows no usage, so only the customer knows which are still in use.',
        figure: annual,
        why: `${rupees(annual)} a year across ${plural(count, 'subscription')}.`,
        opener: `${rupeesTitle(annual)} a year goes on ${plural(count, 'subscription')}. Are all of them still in use?`,
      }
    }

    case 'category_drift': {
      const m = /^(.+) is up (\d+)% in three months\./.exec(i.headline)
      const category = m?.[1]
      const pct = m?.[2]
      const recent = first(amountsIn(ev(0)))
      const prior = first(amountsIn(ev(1)))
      if (category === undefined || pct === undefined || recent === null || prior === null) {
        return null
      }
      // The engine's own monthly value is exactly the rise, recent less prior.
      const extra = i.monthlyValue
      const name = category.toLowerCase()
      return {
        title: `${rupeesTitle(extra)} a month more on ${name} — up ${pct}%`,
        detail: `${rupees(prior)} a month became ${rupees(recent)} over three months, with nothing large behind it.`,
        figure: extra,
        why: `${category} is up ${pct}% in three months, ${rupees(extra)} a month more.`,
        opener: `${rupeesTitle(extra)} a month more on ${name} lately. Anything behind it?`,
      }
    }

    case 'habit_cost': {
      const m = /^(.+), (\d+(?:\.\d+)?) times a month\./.exec(i.headline)
      const merchant = m?.[1]
      const times = m?.[2]
      const annual = first(amountsIn(i.headline))
      const typical = first(amountsIn(i.detail))
      if (merchant === undefined || times === undefined || annual === null || typical === null) {
        return null
      }
      return {
        title: `${rupeesTitle(annual)} a year on ${merchant} — ${times} times a month`,
        detail: `Usually ${rupees(typical)} at a time. Small enough that it never feels like much.`,
        figure: annual,
        why: `${rupees(annual)} a year on ${merchant}, ${times} times a month.`,
        opener: `${rupeesTitle(annual)} a year on ${merchant}. Worth setting a monthly cap?`,
      }
    }

    case 'human_handoff':
      return null
  }
}

/** The kind's name and the insight's own words, re-voiced, for a template that did not match. */
function fallback(i: InsightLike): Lines {
  const label = i.kind === 'human_handoff' ? 'Asked for a person' : SIGNAL_LABELS[i.kind]
  const figure = first(amountsIn(i.headline))
  const headline = revoice(i.headline)
  return {
    title: figure === null ? label : `${label} — ${rupeesTitle(figure)}`,
    detail: revoice(i.detail),
    figure,
    why: headline,
    opener: `${label}: worth a few minutes on it?`,
  }
}

/** The signal and its queue lines, or null for `human_handoff`. */
export function voiceInsight(insight: InsightLike): VoicedSignal | null {
  if (insight.kind === 'human_handoff') return null
  const lines = linesFor(insight) ?? fallback(insight)
  return {
    signal: {
      kind: insight.kind,
      severity: insight.severity,
      title: lines.title,
      detail: lines.detail,
      figure: lines.figure,
      deadlineDays: insight.deadlineDays ?? null,
      evidence: insight.evidence.map(revoice),
    },
    why: lines.why,
    opener: lines.opener,
  }
}

export function toSignal(insight: InsightLike): Signal | null {
  return voiceInsight(insight)?.signal ?? null
}

/** Every insight but the handoff, re-voiced, in the order given (the engine's ranking). */
export function toSignals(insights: readonly InsightLike[]): Signal[] {
  const out: Signal[] = []
  for (const insight of insights) {
    const signal = toSignal(insight)
    if (signal !== null) out.push(signal)
  }
  return out
}

/** The first signal in the engine's order, or null where the handoff is all there is. */
export function topSignal(insights: readonly InsightLike[]): Signal | null {
  return toSignals(insights)[0] ?? null
}

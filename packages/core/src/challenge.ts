/**
 * Spending challenges: name one thing you spend on, put a ceiling on it, and watch it daily.
 *
 * Cleo's shape, and the reason it is worth copying is the one thing a budget is not: a challenge
 * is bounded. "Spend less on eating out" is an instruction nobody can finish, whereas "₹2,400 on
 * Swiggy for the next four weeks" has a start, an end and a verdict — and a verdict is what makes
 * the customer come back on day nine to see whether they are still winning.
 *
 * It sits here, in core, rather than in the API, for the usual reason: the figure on the screen,
 * the figure the avatar quotes and the figure the audit row records have to be the same figure,
 * and the only way to guarantee that is for there to be one function that produces it.
 *
 * Two things this module deliberately is not. It is not an `ActionKind` — a challenge is not
 * something the bank does to an account, and putting it in the action vocabulary would mean the
 * suitability gate has to have an opinion about it. And it is not an `InsightKind` — nothing here
 * is found in the data and offered; the customer chooses the target themselves, which is most of
 * why they keep it.
 */
import { categorize } from './categorize.ts'
import { addDays, daysBetween } from './dates.ts'
import type { SpendCategory, Transaction } from './types.ts'

/* ------------------------------------------------------------------ *
 * Targets
 * ------------------------------------------------------------------ */

export type SpendTargetKind = 'merchant' | 'category'

export interface SpendTarget {
  kind: SpendTargetKind
  /** The merchant name from `categorize()`, or the derived SpendCategory. */
  name: string
}

export interface TargetSpend {
  target: SpendTarget
  /** Total debited to this target inside the window. */
  spent: number
  occurrences: number
}

/**
 * Four weeks, which is the window a customer means by "lately".
 *
 * Twenty-eight rather than thirty because a challenge is lived in weeks — seven bars on a chart,
 * four of them — and a thirty-day baseline against a twenty-eight-day challenge would quietly
 * make every suggested limit 7% too generous.
 */
export const CHALLENGE_WINDOW_DAYS = 28

/**
 * Categories no challenge may be set over.
 *
 * Six of these are the same six `derive()` holds privately as `NEVER_DISCRETIONARY`, and the
 * duplication is on purpose. Exporting that set from `derive.ts` would make it part of the
 * snapshot's contract, so a change made for the snapshot's sake — narrowing what counts as
 * discretionary spending in a month, say — would silently change which challenges the wizard
 * offers, which is a different question with a different answer. Two small lists that happen to
 * agree today, each owned by the thing that reads it, is the lesser evil: the failure mode is a
 * list that drifts, and the alternative's failure mode is a feature that changes for a reason
 * nobody can see.
 *
 * Two additions. `Rent & bills` is discretionary over a year and not over a month, and a
 * challenge to spend less on rent before the 1st is not a challenge, it is a threat.
 * `Transfers` is money that left for another account and has not been spent yet — a debit to
 * a friend, a UPI to a landlord, a sweep the self-transfer flag did not catch. Offering
 * "spend less on Transfers" would name the one row on the statement whose purpose the bank
 * genuinely does not know, and the customer would be held to a limit on a total that means
 * nothing to them.
 */
export const NOT_CHALLENGEABLE: ReadonlySet<SpendCategory> = new Set<SpendCategory>([
  'Investment',
  'Insurance',
  'Education',
  'Loan EMI',
  'Fees & charges',
  'Income',
  'Rent & bills',
  'Transfers',
])

/*
 * The window convention, chosen once for this whole file: exclusive at the lower bound,
 * inclusive at the upper — `> addDays(asOf, -days)` and `<= asOf`.
 *
 * Three conventions already coexist in this package and picking the wrong one shifts every
 * figure by a day's spending without anything looking wrong. This is the one `buildDailyPlan`
 * measures a cap over, and it is the one a customer means by "the last four weeks": twenty-eight
 * days ending today, today included, the day four weeks ago excluded because they have already
 * had that day counted once.
 *
 * The other two are wrong here for stated reasons. A calendar month resets on the 1st, which is
 * exactly when a challenge started on the 20th is at its most interesting. And an inclusive lower
 * bound counts twenty-nine days into a twenty-eight-day window, which is how a baseline comes out
 * high and a limit derived from it comes out slack.
 */
function inWindow(date: string, after: string, through: string): boolean {
  return date > after && date <= through
}

/** Money actually leaving, which is a debit that is not the customer moving their own money. */
function isSpend(t: Transaction): boolean {
  return t.txnType === 'DEBIT' && t.isSelfTransfer !== true
}

/** Whether one transaction counts against one target. Always the derived category, never the bank's. */
function hits(target: SpendTarget, t: Transaction): boolean {
  const e = categorize(t)
  return target.kind === 'merchant' ? e.merchant === target.name : e.category === target.name
}

interface Bucket {
  spent: number
  occurrences: number
}

function tally(into: Map<string, Bucket>, key: string, amount: number): void {
  const row = into.get(key)
  if (row === undefined) {
    into.set(key, { spent: amount, occurrences: 1 })
    return
  }
  row.spent += amount
  row.occurrences += 1
}

function rank(
  buckets: ReadonlyMap<string, Bucket>,
  kind: SpendTargetKind,
  limit: number,
): TargetSpend[] {
  return (
    [...buckets.entries()]
      .map(([name, row]) => ({
        target: { kind, name },
        spent: Math.round(row.spent),
        occurrences: row.occurrences,
      }))
      // Ties broken by name so the wizard offers the same three every time it is opened. Two
      // merchants on the same rupee is not hypothetical when the amounts are round.
      .sort((a, b) => b.spent - a.spent || a.target.name.localeCompare(b.target.name))
      .slice(0, Math.max(0, limit))
  )
}

/**
 * Merchants and categories a challenge could sensibly be set over, biggest first.
 *
 * A merchant whose narration nothing recognised is **dropped**, not bucketed as "Other". An IDBI
 * narration is routinely `S1 TXN 20`, so the Other bucket would be the largest one on the screen
 * for most customers, and "spend less on Other" is not a spending habit anyone recognises. The
 * category list is where that money still gets counted, which is the honest place for it.
 */
export function topSpendTargets(
  txns: readonly Transaction[],
  asOf: string,
  days: number = CHALLENGE_WINDOW_DAYS,
  limit = 3,
): { merchants: TargetSpend[]; categories: TargetSpend[] } {
  const from = addDays(asOf, -days)
  const merchants = new Map<string, Bucket>()
  const categories = new Map<string, Bucket>()

  for (const t of txns) {
    if (!isSpend(t)) continue
    if (!inWindow(t.txnDate, from, asOf)) continue

    const { merchant, category } = categorize(t)
    // The exclusion applies to both lists, not only to categories. A merchant is not made
    // challengeable by being named: a monthly LIC premium recognised as `LIC` would otherwise be
    // offered as an "LIC Challenge", and a customer who wins that one has lapsed their cover.
    if (NOT_CHALLENGEABLE.has(category)) continue

    if (merchant !== null) tally(merchants, merchant, t.txnAmount)
    tally(categories, category, t.txnAmount)
  }

  return {
    merchants: rank(merchants, 'merchant', limit),
    categories: rank(categories, 'category', limit),
  }
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

export interface ChallengeTerms {
  target: SpendTarget
  /** Rupees the customer may spend on the target for the whole challenge. */
  limit: number
  days: number
  startDate: string
}

export interface ChallengeDay {
  date: string
  spent: number
  /** True once the date is at or before `asOf`. Future days are not "zero-spend days". */
  elapsed: boolean
}

export interface ChallengeProgress {
  /** 1-based, clamped to `days`. 1 on the start date. */
  dayIndex: number
  days: number
  spent: number
  limit: number
  /** `Math.max(0, limit - spent)`. */
  remaining: number
  overspent: boolean
  /** One entry per day of the challenge, start date first, always `days` long. */
  daily: ChallengeDay[]
  /** Elapsed days with no spend on the target. */
  zeroDays: number
  longestZeroStreak: number
  /** The transactions inside the window, newest first. */
  txnIds: string[]
  /** `asOf` is past the last day. */
  complete: boolean
  /** Complete and never over the limit. Null while it is still running. */
  won: boolean | null
  endDate: string
}

/**
 * Where a running challenge stands on `asOf`.
 *
 * The challenge's own span is the same convention as everything else here, written on the start
 * boundary rather than the end: `> addDays(startDate, -1)` and `<= endDate`. Spelling it that way
 * rather than `>= startDate` is not pedantry — it is the one form that cannot be confused with
 * the other two conventions by someone skimming, and this file only has one.
 *
 * Nothing after `asOf` is counted, even where the ledger has rows for it. The demo's forward
 * generator produces them, and a challenge that has already spent tomorrow's money would be the
 * most convincing bug in the app.
 */
export function challengeProgress(
  terms: ChallengeTerms,
  txns: readonly Transaction[],
  asOf: string,
): ChallengeProgress {
  const days = Math.max(1, Math.round(terms.days))
  const endDate = addDays(terms.startDate, days - 1)
  const through = asOf < endDate ? asOf : endDate

  const matched = txns.filter(
    (t) =>
      isSpend(t) &&
      inWindow(t.txnDate, addDays(terms.startDate, -1), through) &&
      hits(terms.target, t),
  )

  const perDay = new Map<string, number>()
  for (const t of matched) perDay.set(t.txnDate, (perDay.get(t.txnDate) ?? 0) + t.txnAmount)

  const daily: ChallengeDay[] = []
  let zeroDays = 0
  let longestZeroStreak = 0
  let streak = 0

  for (let i = 0; i < days; i += 1) {
    const date = addDays(terms.startDate, i)
    const elapsed = date <= asOf
    const spent = Math.round(perDay.get(date) ?? 0)
    daily.push({ date, spent, elapsed })
    if (!elapsed) continue
    if (spent === 0) {
      zeroDays += 1
      streak += 1
      if (streak > longestZeroStreak) longestZeroStreak = streak
    } else {
      streak = 0
    }
  }

  /*
   * The headline is the sum of the bars, not a second sum of the same rows.
   *
   * Utilities and charges land with paise on them, so rounding each day and rounding the total
   * independently disagree by a rupee often enough to matter — and both numbers are on the same
   * screen, one as a figure and one as a chart a customer can add up. A screen that fails its own
   * arithmetic is a screen nobody checks a second time.
   */
  const spent = daily.reduce((sum, d) => sum + d.spent, 0)
  const limit = Math.round(terms.limit)
  const complete = asOf > endDate
  const overspent = spent > limit

  return {
    dayIndex: Math.min(days, Math.max(1, daysBetween(terms.startDate, asOf) + 1)),
    days,
    spent,
    limit,
    remaining: Math.max(0, limit - spent),
    overspent,
    daily,
    zeroDays,
    longestZeroStreak,
    // Newest first, and stable within a day: a statement has no time of day worth trusting, so
    // two rows on the same date keep the order the ledger gave them.
    txnIds: [...matched]
      .sort((a, b) => (a.txnDate < b.txnDate ? 1 : a.txnDate > b.txnDate ? -1 : 0))
      .map((t) => t.txnId),
    complete,
    // Spend only ever accumulates, so "never over the limit" and "not over it at the end" are the
    // same statement. Null rather than false while it runs: a challenge on day three has not been
    // lost, and a screen that reads `won === false` as a loss would say so.
    won: complete ? !overspent : null,
    endDate,
  }
}

/* ------------------------------------------------------------------ *
 * Limits
 * ------------------------------------------------------------------ */

export interface LimitOption {
  limit: number
  /** `baseline - limit`, floored at 0. */
  predictedSaving: number
  recommended: boolean
}

/**
 * Round figures, on the stepper's own ladder.
 *
 * Rounded **down**, always. A limit rounded up is a limit the app invented in the customer's
 * favour, and the first thing they will do with the extra ₹80 is spend it.
 *
 * The floor of one whole step exists so a very small baseline cannot produce a limit of ₹0. A
 * challenge nobody can win by definition is worse than no challenge: it teaches that the app's
 * numbers are decorative.
 */
export function roundLimit(n: number): number {
  const step = n < 5_000 ? 100 : n < 50_000 ? 500 : 1_000
  return Math.max(step, Math.floor(n / step) * step)
}

/** 80 / 65 / 50 percent of the baseline. The first is the recommended one. */
const TIERS: readonly number[] = [0.8, 0.65, 0.5]

/**
 * Three limits over one window, derived from what they actually spent.
 *
 * `baseline` is the target's spend over the challenge's length at their current rate — that is,
 * `baselineFor` has already scaled it, which is why the tiers here are flat percentages and why
 * `days` does nothing arithmetically. It is kept in the signature deliberately: a reader
 * comparing this against the wire, where `days` sits beside the options, should be able to
 * satisfy themselves that the tiers do not move with the length rather than having to go and
 * look. Hence the repo's `_` convention for a parameter that is part of the shape and not of
 * the sum.
 *
 * 80% is recommended because it is the easiest, and a challenge nobody finishes teaches nothing.
 * Cleo's own framing, and the behavioural point behind it: the product of a completed challenge
 * is not the ₹600 saved, it is the customer's belief that they can do the next one.
 */
export function suggestLimits(baseline: number, _days: number): LimitOption[] {
  const base = Math.max(0, Math.round(baseline))
  const options: LimitOption[] = []
  const seen = new Set<number>()

  for (const tier of TIERS) {
    const limit = roundLimit(base * tier)
    // A limit at or above what they already spend is not a challenge, it is a rubber stamp. This
    // only fires on a baseline small enough that the rounding floor overtakes the tier, and on
    // such a target there is nothing worth challenging — the caller's job is then to say so.
    if (limit >= base) continue
    if (seen.has(limit)) continue
    seen.add(limit)
    options.push({
      limit,
      predictedSaving: Math.max(0, base - limit),
      recommended: options.length === 0,
    })
  }

  return options
}

/**
 * What `days` of spending on this target costs at the four-week rate.
 *
 * A straight pro-rata, and it is worth being honest that four weeks of history is thin: one
 * Diwali inside the window makes the baseline high and the limit derived from it slack. It is
 * still the right window, because the customer has to recognise the figure — a median over six
 * months is a better estimate of a normal month and a worse answer to "what have I been spending
 * on Swiggy lately", which is the question the wizard is actually asking.
 */
export function baselineFor(
  spend: TargetSpend,
  days: number,
  windowDays: number = CHALLENGE_WINDOW_DAYS,
): number {
  if (windowDays <= 0) return 0
  return Math.round((spend.spent * days) / windowDays)
}

/**
 * What repeating the challenge 1x, 2x and 3x would put aside.
 *
 * Straight multiplication, and it must be presented as exactly that. It is not a projection and
 * it carries no compounding: the customer has not done the first one yet, and a line reading
 * "₹7,200 over twelve weeks" beside a challenge they started this morning is a promise the data
 * cannot support. The screen's job is to say "if you did this three times".
 */
export function repeatedSaving(
  predictedSaving: number,
  days: number,
): { days: number; saved: number }[] {
  const saving = Math.max(0, Math.round(predictedSaving))
  return [1, 2, 3].map((times) => ({ days: days * times, saved: saving * times }))
}

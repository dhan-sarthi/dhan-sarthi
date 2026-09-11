/**
 * A jar, out of the roadmap this app already computes.
 *
 * SmartWealth's Smart Jars are several pots, each with a target, a horizon, money going in and a
 * status. This app has one `Goal` (`packages/core/src/goal.ts`) and a `Roadmap` of stages in
 * front of it — and a stage is already all four of those things: `targetAmount`, `completesOn`,
 * `monthly`, and enough facts around it to say honestly how it is doing. So the jars are the
 * roadmap's stages, read, not a second goal model kept beside the first. `COMPONENT-GAP.md` asks
 * for exactly this under `GoalCard`: merge `Plan`'s `StageCard` with `GoalSheet`'s goal summary
 * and add the progress and the status footer neither of them has.
 *
 * **A jar is a stage that fills up.** `build_buffer`, `clear_debt` and `grow` accumulate towards
 * a number. `free_up` and `get_cover` do not — freeing up money is a behaviour and a term premium
 * is a monthly cost with no pot behind it — so they stay on Plan, where the whole route is, and
 * are not dressed up as jars they are not. The list says so rather than leaving the customer to
 * wonder why the plan has five steps and this screen has two pots.
 *
 * **`achieved` is nullable and that is the point.** The reference never shows a jar it cannot
 * price, because the reference's data is staged. Here the buffer's balance is readable and the
 * goal's existing corpus is the same figure the engine funds against, but *how much of a debt has
 * been repaid* is not in the snapshot at all — only what is left. Returning `null` rather than
 * zero keeps "we cannot see it" and "there is nothing in it" apart, and the card draws no bar
 * rather than a bar at 0%, which would be a claim.
 */
import type { Goal, Roadmap, Snapshot, Stage } from '@dhan/contracts'

/** The three tints on the reference's cards, against three states this app can actually prove. */
export type JarStatus = 'reached' | 'on_track' | 'queued' | 'attention'

export interface Jar {
  id: string
  stage: Stage
  kind: Stage['kind']
  /** Short enough to be a title. `stage.label` carries the figures and is the line under it. */
  name: string
  target: number
  /** What is in it, or null where the app cannot see it. Never a zero standing in for a gap. */
  achieved: number | null
  /** 0–1, or null with `achieved`. Clamped: an overfunded pot is full, not 130% full. */
  fraction: number | null
  /** Going in each month, from this stage. Zero where the stage is queued behind another. */
  monthly: number
  /** When the stage finishes at the present pace. */
  by: string
  /** The customer's actual destination, as against a prerequisite in front of it. */
  isGoal: boolean
  /** Money is going into it now. Core's own rule: the first stage, plus anything ongoing. */
  running: boolean
  /**
   * Whether `by` is a date that will actually arrive.
   *
   * False on a debt whose payment does not beat the interest accruing on it. `monthsToClear`
   * returns null there and `buildRoadmap` falls back to 120 months so the stage has *a* length —
   * so `completesOn` on such a stage is a payoff date that never comes, which core's own comment
   * calls the single easiest way to lose a room of bankers. Nothing draws it.
   */
  dated: boolean
  status: JarStatus
}

/*
 * "Not funded yet" rather than the reference's "Rebalancing in Process", and rather than "Not
 * started". This app has no rebalancing, so the amber slot goes to the true thing it does have:
 * the route runs its stages one at a time, so a jar can be most of the way full and still have
 * nothing going into it this month. "Not started" would fight the 82% bar directly above it;
 * "not funded" says exactly which half is idle.
 */
const STATUS_LABEL: Record<JarStatus, string> = {
  reached: 'Reached',
  on_track: 'On track',
  queued: 'Not funded yet',
  attention: 'Needs attention',
}

const STATUS_TONE = {
  reached: 'good',
  on_track: 'good',
  queued: 'warn',
  attention: 'bad',
} as const

export const statusLabel = (s: JarStatus): string => STATUS_LABEL[s]
export const statusTone = (s: JarStatus): 'good' | 'warn' | 'bad' => STATUS_TONE[s]

/** One decimal below ten per cent, none above. `9.2%` is a fact; `9%` of ₹1.2 crore is a shrug. */
export function share(fraction: number): string {
  const pct = fraction * 100
  return `${pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10}%`
}

/** Stages that hold money. Everything else on the route is an action, and Plan is where it lives. */
const ACCUMULATING: readonly Stage['kind'][] = ['build_buffer', 'clear_debt', 'grow']

/**
 * What is in the pot already.
 *
 * Each line is the *same* figure the engine used to size the stage, which is what stops the card
 * disagreeing with the plan behind it:
 *
 * - the buffer is sized against `balances.total` and filled by it;
 * - a growth goal is funded on top of `holdings.equity`, so that is what already counts towards
 *   it — and a goal the engine funds with a deposit gets no existing corpus at all, so nothing
 *   counts yet and the card says so;
 * - a debt's target is the balance outstanding. The original principal is not in the snapshot,
 *   so the fraction repaid is unknowable and is reported as unknowable.
 */
export function existingTowards(kind: Goal['kind'], snapshot: Snapshot): number | null {
  if (kind === 'debt_payoff') return null
  if (kind === 'emergency_fund') return snapshot.balances.total
  if (kind === 'wealth_target' || kind === 'retirement') return snapshot.holdings.equity
  // Protection is a premium, not a pot. Nothing accumulates towards it.
  return 0
}

function achievedFor(stage: Stage, snapshot: Snapshot, goal: Goal): number | null {
  if (stage.kind === 'build_buffer') return Math.min(snapshot.balances.total, stage.targetAmount)
  if (stage.kind === 'clear_debt') return null
  const existing = existingTowards(goal.kind, snapshot)
  return existing === null ? null : Math.min(existing, stage.targetAmount)
}

/** Core's own test in `monthsToClear`: the payment has to beat the interest or the balance grows. */
function clears(stage: Stage, snapshot: Snapshot): boolean {
  const interest = (stage.targetAmount * snapshot.debt.highestRate) / 100 / 12
  return stage.monthly > interest
}

function statusFor(jar: Omit<Jar, 'status'>, roadmap: Roadmap, snapshot: Snapshot): JarStatus {
  if (jar.achieved !== null && jar.target > 0 && jar.achieved >= jar.target) return 'reached'
  // The goal the plan cannot reach at the present pace. `feasible` is the engine's own verdict,
  // and `Plan` already prints the shortfall underneath it — this is the same fact, in a colour.
  if (jar.isGoal && !roadmap.feasible) return 'attention'
  // A balance that grows faster than it is paid down. Ahead of the queued check on purpose: "not
  // funded yet" is true and beside the point next to a debt that will not clear when it is.
  if (!jar.dated) return 'attention'
  // An arrear blocks every investment in the suitability gate, so the debt it sits on is not
  // merely behind — it is holding up the rest of the route.
  if (jar.kind === 'clear_debt' && snapshot.debt.missedRepayment) return 'attention'
  if (!jar.running) return 'queued'
  if (jar.monthly <= 0) return 'attention'
  return 'on_track'
}

/**
 * The jars, in the order the route runs them.
 *
 * `running` is core's rule verbatim — `roadmap.ts` computes `monthlyCommitment` from "index 1
 * plus anything ongoing", and a card that called a later stage active would be claiming money is
 * moving that is not. `currentStageIndex` is not that rule: it is `0` in every roadmap the engine
 * builds, and stage indices start at 1.
 */
export function jars(roadmap: Roadmap, snapshot: Snapshot): Jar[] {
  return roadmap.stages
    .filter((s) => ACCUMULATING.includes(s.kind) && s.targetAmount > 0)
    .map((stage) => {
      const achieved = achievedFor(stage, snapshot, roadmap.goal)
      const partial: Omit<Jar, 'status'> = {
        id: `jar-${stage.index}`,
        stage,
        kind: stage.kind,
        name: jarName(stage, roadmap.goal),
        target: stage.targetAmount,
        achieved,
        fraction:
          achieved === null || stage.targetAmount <= 0
            ? null
            : Math.min(1, achieved / stage.targetAmount),
        monthly: stage.monthly,
        by: stage.completesOn,
        isGoal: stage.isGoal,
        running: stage.index === 1 || stage.cadence === 'ongoing',
        dated: stage.kind !== 'clear_debt' || clears(stage, snapshot),
      }
      return { ...partial, status: statusFor(partial, roadmap, snapshot) }
    })
}

/** The stages that are on the route but are not pots, so the list can say what it left out. */
export function nonJarStages(roadmap: Roadmap): Stage[] {
  return roadmap.stages.filter((s) => !ACCUMULATING.includes(s.kind) || s.targetAmount <= 0)
}

function jarName(stage: Stage, goal: Goal): string {
  if (stage.kind === 'build_buffer') return 'Emergency buffer'
  if (stage.kind === 'clear_debt')
    return stage.isGoal ? (goal.purpose ?? 'Clear the debt') : 'Clear the expensive debt'
  return goal.purpose ?? 'Your goal'
}

/* ---------------------------------------------------------------- Horizons */

/** Whole months between two ISO dates, floored at one so nothing divides by zero. */
export function monthsBetween(from: string, to: string): number {
  const a = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7))
  const b = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7))
  return Math.max(1, b - a)
}

/** An ISO date `months` after `from`, day held. The client half of core's `addMonths`. */
export function addMonths(from: string, months: number): string {
  const y = Number(from.slice(0, 4))
  const m = Number(from.slice(5, 7)) - 1 + months
  const year = y + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${from.slice(8, 10)}`
}

/**
 * The rate the plan will fund this target at, once it is saved.
 *
 * Mirrors the branch in `buildRoadmap`'s goal stage, and it has to: the create screen quotes a
 * monthly figure and the roadmap quotes one a second later, and a customer who sees two is right
 * to stop believing either. A long target stated in today's money is funded at the *real* rate —
 * nominal less inflation — because inflating the target instead is the thing `goal.ts` refused to
 * do. Under ten years the engine uses the nominal rate, and a goal it funds with a deposit uses
 * the contractual one.
 */
export const GROWTH_RATE_PCT = 10
export const INFLATION_PCT = 5.5
export const DEPOSIT_RATE_PCT = 6.9

export function fundingRatePct(kind: Goal['kind'], horizonYears: number): number {
  const wantsGrowth = kind === 'wealth_target' || kind === 'retirement'
  if (!wantsGrowth) return DEPOSIT_RATE_PCT
  return horizonYears >= 10 ? GROWTH_RATE_PCT - INFLATION_PCT : GROWTH_RATE_PCT
}

/**
 * Whether the target may be restated in the rupees of the year it lands.
 *
 * Under ten years, yes: the engine funds the target at the nominal rate, so a nominal target is
 * funded correctly and "what the car costs in 2031" is the truer number to save for. At ten years
 * and beyond the engine funds in real terms *on purpose* — `goal.ts` records why, and it is the
 * decision that stopped a retirement plan quoting ₹11.48 crore — so an inflated target would be
 * discounted for inflation a second time and every plan would read as infeasible. There is no
 * field on `Goal` saying which money an amount is in, so the screen has to hold the line instead.
 */
export function inflationMayMoveTarget(kind: Goal['kind'], horizonYears: number): boolean {
  // A balance owed does not inflate. It accrues, at a rate the plan already amortises against,
  // and dressing that up as inflation would be two different arithmetics wearing one label.
  if (kind === 'debt_payoff') return false
  const wantsGrowth = kind === 'wealth_target' || kind === 'retirement'
  return !wantsGrowth || horizonYears < 10
}

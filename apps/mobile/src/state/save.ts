// The savings pot, read once per screen that shows it.
//
// /save is a payload of its own rather than part of /view, and four screens need it: the
// Grow tab's Save pane, the hacks list, the settings sheet and the one-hack editor. Three of
// them had copied the same `useFocusEffect(useCallback(() => { api.save().then(setSave)
// .catch(() => setSave(null)) }, []))` block, comment and all — one payload, three readers,
// three chances for them to disagree about what a failed read means.
//
// On focus rather than on mount, which is the reason this is not simply `usePayload`: every
// one of those screens pushes another that changes what the pot says, and coming back to
// "3 of 5 on" after turning a fourth one on is the sheet arguing with the screen the
// customer just used.
//
// Except the first focus. A screen is focused in the same moment it mounts, and the mount
// has already asked `usePayload` for the pot — so the first focus used to send a second GET
// for an answer that was still on its way. It is skipped; every focus after it is a return
// from a pushed screen, and that is the one the refetch exists for.
//
// The pot is money set aside for the roadmap's goal, and the goal's horizon — how long is left,
// when it is done, what goes in each month — belongs to the route. `goalHorizon` below works it
// out once, and both the Grow tab's pot and the Plan tab's hero print it, so the same goal is
// never counted two ways.
import { useFocusEffect } from 'expo-router'
import { useCallback, useRef } from 'react'
import { api } from '~/api/client'
import { usePayload, type Payload } from '~/state/payload'
import { duration } from '~/lib/duration'
import { addMonths, elapsedMonths } from '@dhan/core'
import type { Roadmap, SaveView, Stage, View } from '@dhan/contracts'

/**
 * `reloadOn` re-reads when that value changes, on top of the refetch on focus: the Grow tab
 * passes the snapshot, because a clock moved or a decision taken moves the pot too and that
 * tab is already in front of the customer when it happens.
 */
export function useSaveView(reloadOn?: unknown): Payload<SaveView> {
  const payload = usePayload(api.save, reloadOn)
  const { reload } = payload
  const focused = useRef(false)

  useFocusEffect(
    useCallback(() => {
      if (!focused.current) {
        focused.current = true
        return
      }
      void reload()
    }, [reload]),
  )

  return payload
}

/* ── The goal's horizon ────────────────────────────────────────────────────────────────── */

/**
 * The roadmap's goal, measured once for every screen that prints it.
 *
 * Two screens print this goal: the pot on Grow and the route on Plan. They used to count it two
 * ways — the pot to the customer's own target date ("3 years left"), the route to the day its
 * stage finishes ("11 months to go") — and the same goal read as two. So every time claim about
 * the goal is the route's, worked out here once, and Plan's `GoalHero` and Grow's Save hero both
 * read it:
 * - The goal is the last stage flagged as one: a debt goal flags the stage that frees the money
 *   as well as the payoff, and the payoff is the one the goal is about.
 * - What already stands against it is the route's measure: the balance for a buffer, the cover
 *   in force, the corpus already invested. A payoff has none.
 * - A stage up to the goal that never clears leaves it undated. A growth goal the monthly falls
 *   short of has no finish, and is counted to the target date. A buffer is staged only in part,
 *   so its finish is the engine's own sum run to the target. Everything else finishes when its
 *   stage does.
 * - The monthly is what goes toward the goal once the route reaches it, and nothing while no
 *   money leaves the account yet.
 */
export type GoalHorizon = {
  /** 0..1 of the target already there, by the route's measure; null where it has none. */
  progress: number | null
  /** "11 months to go", "No end date yet", "Target reached"; null when there is nothing to count. */
  toGo: string | null
  /** The day the route has the goal's figure, when it has one and it is not the target date. */
  doneBy: string | null
  /** Rupees a month toward the goal once the route reaches it; 0 while nothing is spare. */
  monthly: number
}

export function goalHorizon(roadmap: Roadmap, snapshot: View['snapshot']): GoalHorizon {
  const goal = [...roadmap.stages].reverse().find((s) => s.isGoal)
  const { targetAmount, targetDate } = roadmap.goal
  const have = haveOf(roadmap, goal, snapshot)
  const progress =
    have === null || targetAmount <= 0 ? null : Math.max(0, Math.min(1, have / targetAmount))
  const reached = progress === 1
  const { doneBy, undated } = finishOf(roadmap, goal, have)
  const months = undated || reached ? null : elapsedMonths(snapshot.asOf, doneBy ?? targetDate)
  const toGo = undated
    ? 'No end date yet'
    : reached
      ? 'Target reached'
      : months !== null && months > 0
        ? // `duration` says "This month" for one, which reads wrongly before "to go".
          `${months === 1 ? '1 month' : duration(months)} to go`
        : null
  return {
    progress,
    toGo,
    doneBy: doneBy === targetDate ? null : doneBy,
    monthly: roadmap.monthlyCommitment > 0 ? (goal?.monthly ?? roadmap.monthlyCommitment) : 0,
  }
}

/**
 * What already stands against the goal's figure, measured the way the route measures it: the
 * balance for a buffer, the cover in force, the corpus already invested. A payoff has none — the
 * ledger holds what is left to pay, never what the balance began at. Plan's hero, its numbers pane
 * and its shortfall read this same function.
 */
export function haveOf(
  roadmap: Roadmap,
  goal: Stage | undefined,
  snapshot: View['snapshot'],
): number | null {
  if (roadmap.goal.kind === 'emergency_fund') return snapshot.balances.total
  if (roadmap.goal.kind === 'debt_payoff' || goal === undefined) return null
  switch (goal.kind) {
    case 'build_buffer':
      return snapshot.balances.total
    case 'get_cover':
      return snapshot.protection.lifeCoverInForce
    case 'grow':
      return roadmap.projection?.existingCorpus ?? null
    default:
      return null
  }
}

/**
 * When the route has the goal's figure: the one date every time claim about the goal is measured
 * to. A stage up to the goal that never clears leaves it undated; a growth goal the monthly falls
 * short of has no finish; a buffer, staged only in part, finishes on the engine's own sum run to
 * the target; everything else finishes when its stage does. Shared with the Plan tab.
 */
export function finishOf(
  roadmap: Roadmap,
  goal: Stage | undefined,
  have: number | null,
): { doneBy: string | null; undated: boolean } {
  if (goal === undefined) return { doneBy: null, undated: false }
  const upto = roadmap.stages.slice(0, roadmap.stages.indexOf(goal) + 1)
  if (upto.some((s) => s.monthsToComplete === 0)) return { doneBy: null, undated: true }
  if (goal.kind === 'grow' && roadmap.shortfallMonthly > 0) return { doneBy: null, undated: false }
  if (goal.kind === 'build_buffer' && goal.monthly > 0 && have !== null) {
    const left = Math.max(0, roadmap.goal.targetAmount - have)
    if (left === 0) return { doneBy: null, undated: false }
    const months = Math.max(1, Math.ceil(left / goal.monthly))
    return { doneBy: addMonths(goal.startsOn, months), undated: false }
  }
  return { doneBy: goal.monthsToComplete > 0 ? goal.completesOn : null, undated: false }
}

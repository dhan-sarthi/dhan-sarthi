/**
 * Goal health: whether a customer's plan is on course, read off the plan and the engine.
 *
 * Three states and no score, because a score invites a ranking the definitions cannot support.
 * The spec's table, verbatim:
 *
 * - **On track** — the roadmap is feasible, there is no monthly shortfall, no urgent insight.
 * - **At risk** — feasible, but a shortfall or an urgent insight (missed repayment, expensive
 *   debt). Urgent is the engine's own severity, so a kind it later promotes to urgent moves a
 *   customer here without this file changing.
 * - **Off track** — the roadmap is not feasible.
 *
 * Deliberately blind to the stages. A stage with `monthsToComplete: 0` has no end date, and the
 * roadmap already folds that into `feasible`; reading the stages again here would be a second
 * opinion on a question the plan has answered.
 */
import type { GoalKind } from '../roadmap.ts'
import { revoice } from './util.ts'

export type GoalHealth = 'on_track' | 'at_risk' | 'off_track'

export function goalHealth(
  roadmap: { feasible: boolean; shortfallMonthly: number },
  insights: readonly { severity: string }[],
): GoalHealth {
  if (!roadmap.feasible) return 'off_track'
  if (roadmap.shortfallMonthly > 0) return 'at_risk'
  if (insights.some((i) => i.severity === 'urgent')) return 'at_risk'
  return 'on_track'
}

const GOAL_LABEL: Readonly<Record<GoalKind, string>> = {
  emergency_fund: 'Emergency fund',
  debt_payoff: 'Clear expensive debt',
  protection: 'Life cover',
  wealth_target: 'Wealth goal',
  retirement: 'Retirement',
}

/**
 * The goal as the RM names it.
 *
 * Only a wealth target uses the customer's own purpose ("house deposit", "Aanya's college"),
 * because that is the one kind where the purpose is the customer's words rather than the
 * engine's. The engine's purposes for the other kinds are written to the customer ("cover for
 * the people who depend on you") and would put a second person on the RM's screen.
 */
export function goalLabel(goal: { kind: GoalKind; purpose?: string | undefined }): string {
  const purpose = goal.purpose?.trim()
  if (goal.kind === 'wealth_target' && purpose) {
    const voiced = revoice(purpose)
    return voiced.charAt(0).toUpperCase() + voiced.slice(1)
  }
  return GOAL_LABEL[goal.kind]
}

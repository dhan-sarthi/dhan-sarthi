/**
 * `get_plan`: a compact plan the model can speak from, every figure from the same View the
 * screens show.
 */
import type { GetPlanResult } from '@dhan/contracts'
import type { ToolHandler } from '../../../ports/index.ts'
import type { ToolContext } from './context.ts'

export function makeGetPlan(ctx: ToolContext): ToolHandler {
  const { view, audit, runwaySessionId } = ctx

  return async (rawArgs) => {
    const started = ctx.clock.now().getTime()
    const stage = view.roadmap.stages[view.roadmap.currentStageIndex] ?? null
    const primary = view.plan.primary

    const result: GetPlanResult = {
      goal: {
        kind: view.goal.kind,
        purpose: view.goal.purpose ?? null,
        target_amount: view.goal.targetAmount,
        target_date: view.goal.targetDate,
      },
      current_stage: stage
        ? {
            label: stage.label,
            why: stage.why,
            monthly: stage.monthly,
            completes_on: stage.completesOn,
          }
        : null,
      monthly_commitment: view.roadmap.monthlyCommitment,
      feasible: view.roadmap.feasible,
      primary_action: primary
        ? { label: primary.label, detail: primary.detail, amount: primary.amount }
        : null,
      safe_to_spend_per_day: view.plan.safeToSpend.perDay,
      days_to_salary: view.plan.safeToSpend.daysToSalary,
    }

    await audit.appendToolCall({
      runwaySessionId,
      tool: 'get_plan',
      args: (rawArgs ?? {}) as Record<string, unknown>,
      result,
      adviceRecordId: null,
      latencyMs: ctx.clock.now().getTime() - started,
    })
    return result
  }
}

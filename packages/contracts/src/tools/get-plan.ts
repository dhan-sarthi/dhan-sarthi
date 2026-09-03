import { z } from 'zod'
import { defineTool } from './contract.ts'

export const GetPlanArgsSchema = z.object({}).strict()
export type GetPlanArgs = z.infer<typeof GetPlanArgsSchema>

/** A compact plan the model can speak from. Every figure is from the same View the screens show. */
export const GetPlanResultSchema = z.object({
  goal: z.object({
    kind: z.string(),
    purpose: z.string().nullable(),
    target_amount: z.number(),
    target_date: z.string(),
  }),
  current_stage: z
    .object({
      label: z.string(),
      why: z.string(),
      monthly: z.number(),
      completes_on: z.string(),
    })
    .nullable(),
  monthly_commitment: z.number(),
  feasible: z.boolean(),
  primary_action: z
    .object({ label: z.string(), detail: z.string(), amount: z.number() })
    .nullable(),
  safe_to_spend_per_day: z.number(),
  days_to_salary: z.number(),
})
export type GetPlanResult = z.infer<typeof GetPlanResultSchema>

export const getPlanTool = defineTool({
  name: 'get_plan',
  description:
    'The customer’s current plan: the goal, the stage they are on, what leaves the account each month, today’s one action and what is safe to spend. Call it when they ask where they stand or what to do next.',
  args: GetPlanArgsSchema,
  result: GetPlanResultSchema,
  timeoutSeconds: 2,
})

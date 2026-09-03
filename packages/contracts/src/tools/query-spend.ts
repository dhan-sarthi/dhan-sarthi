import { z } from 'zod'
import { defineTool } from './contract.ts'

export const QuerySpendArgsSchema = z
  .object({
    question: z
      .string()
      .min(1)
      .describe('The customer’s question about their money, in their words.'),
  })
  .strict()
export type QuerySpendArgs = z.infer<typeof QuerySpendArgsSchema>

export const QuerySpendResultSchema = z.object({
  /** A complete answer with the figure in it. Say this; do not do arithmetic of your own. */
  text: z.string(),
  evidence: z.array(z.string()),
})
export type QuerySpendResult = z.infer<typeof QuerySpendResultSchema>

export const querySpendTool = defineTool({
  name: 'query_spend',
  description:
    'Any question about what the customer spent, earned, pays for or owes — how much, on what, when, compared with when. Never work a figure out yourself; ask this and say what it returns.',
  args: QuerySpendArgsSchema,
  result: QuerySpendResultSchema,
  timeoutSeconds: 4,
})

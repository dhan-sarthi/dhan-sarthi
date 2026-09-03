import { z } from 'zod'
import { VerdictOutcomeSchema } from '../domain.ts'
import { defineTool } from './contract.ts'

/**
 * Snake case throughout: these names are read by the model, and the JSON Schema it sees is
 * generated from here.
 */
export const CheckSuitabilityArgsSchema = z
  .object({
    product_name: z
      .string()
      .min(1)
      .describe('The product exactly as the customer or you named it, e.g. "LIC ULIP".'),
    monthly_amount: z
      .number()
      .nonnegative()
      .optional()
      .describe('Monthly rupees being proposed, if an amount was mentioned.'),
  })
  .strict()
export type CheckSuitabilityArgs = z.infer<typeof CheckSuitabilityArgsSchema>

export const CheckSuitabilityResultSchema = z.object({
  verdict: VerdictOutcomeSchema,
  /** The shelf product it resolved to, or null when the name matched nothing. */
  product: z.string().nullable(),
  rule_id: z.string().nullable(),
  /** The sentence the rules wrote. Read it back; do not rephrase the verdict. */
  spoken: z.string(),
  alternative: z
    .object({ product_id: z.string(), name: z.string(), monthly: z.number() })
    .nullable(),
})
export type CheckSuitabilityResult = z.infer<typeof CheckSuitabilityResultSchema>

export const checkSuitabilityTool = defineTool({
  name: 'check_suitability',
  description:
    'Before you recommend, endorse or agree to ANY specific product — including one the customer raises — call this with the product name. It returns a verdict from the bank’s suitability rules and the sentence to say. You must read that sentence back; you may not decide suitability yourself.',
  args: CheckSuitabilityArgsSchema,
  result: CheckSuitabilityResultSchema,
  timeoutSeconds: 6,
})

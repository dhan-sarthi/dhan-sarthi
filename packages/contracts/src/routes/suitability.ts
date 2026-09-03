import { z } from 'zod'
import { AdviceRecordIdSchema, ErrorBodySchema, MoneySchema, ProductIdSchema } from '../common.ts'
import { VerdictSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

export const EvaluateRequestSchema = z
  .object({
    productId: ProductIdSchema,
    /** Monthly rupees proposed. Zero where the question is only about the product. */
    amount: MoneySchema.nonnegative(),
    goal: z.object({ kind: z.string(), horizonYears: z.number().nonnegative() }).optional(),
  })
  .strict()
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>

/** Always writes an advice record: a verdict nobody recorded is a verdict nobody can audit. */
export const EvaluateResponseSchema = z.object({
  verdict: VerdictSchema,
  adviceRecordId: AdviceRecordIdSchema,
})
export type EvaluateResponse = z.infer<typeof EvaluateResponseSchema>

export const evaluateSuitabilityRoute = defineRoute({
  id: 'evaluateSuitability',
  method: 'POST',
  path: '/api/v1/suitability/evaluate',
  summary:
    'The verdict from the deterministic gate over the session’s current snapshot. Used by "Why?" and by the refusal in the text tier.',
  auth: 'session',
  rateLimit: { max: 30, window: '1 minute', keyBy: 'session' },
  request: { body: EvaluateRequestSchema },
  response: {
    200: EvaluateResponseSchema,
    400: ErrorBodySchema,
    404: ErrorBodySchema,
    ...SESSION_ERRORS,
  },
})

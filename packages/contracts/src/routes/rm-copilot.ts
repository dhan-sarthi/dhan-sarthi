/**
 * The RM copilot: a meeting brief and a question box, scoped to one customer in the book.
 *
 * Facts are assembled on the server as numbered lines before any model sees them, and every
 * sentence that comes back names the facts it rests on. The model phrases; it never judges. A
 * question that names a product runs the suitability rules first and quotes their verdict, and
 * an RM's check is written to the access log rather than to the customer's chain.
 */
import { z } from 'zod'
import { ErrorBodySchema, ProductIdSchema, TimestampSchema } from '../common.ts'
import {
  CitedSentenceSchema,
  FactSchema,
  PhrasedBySchema,
  RuleVerdictSchema,
} from '../rm-domain.ts'
import { RM_ERRORS, defineRoute } from '../route.ts'
import { AskTurnSchema } from './ask.ts'
import { RmCustomerParamsSchema } from './rm.ts'

// One completion per press, against the copilot's own model and breaker. Twenty a minute is
// far past what an RM preparing for a meeting presses, and well short of a runaway loop.
const COPILOT_RATE_LIMIT = { max: 20, window: '1 minute', keyBy: 'session' } as const

export const RmBriefSchema = z.object({
  sections: z.array(z.object({ title: z.string(), sentences: z.array(CitedSentenceSchema) })),
  facts: z.array(FactSchema),
  /** `rules` with no key, a failed call or a sentence that failed its citation check. */
  phrasedBy: PhrasedBySchema,
  generatedAt: TimestampSchema,
})
export type RmBrief = z.infer<typeof RmBriefSchema>

export const rmBriefRoute = defineRoute({
  id: 'rmBrief',
  method: 'POST',
  path: '/api/v1/rm/customers/:cif/brief',
  summary:
    'A meeting-prep brief for one customer, every sentence citing the numbered facts it rests on. Falls back to the deterministic brief rather than failing. Writes a "briefed" entry to the access log.',
  auth: 'rm',
  rateLimit: COPILOT_RATE_LIMIT,
  request: { params: RmCustomerParamsSchema },
  response: { 200: RmBriefSchema, 404: ErrorBodySchema, ...RM_ERRORS },
})

export const RmAskRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    /** Most recent last. Held by the console, as the customer's app holds its own. */
    history: z.array(AskTurnSchema).max(12).optional(),
  })
  .strict()
export type RmAskRequest = z.infer<typeof RmAskRequestSchema>

/** The rules' verdict on a product the question named, quoted verbatim. */
export const RmCheckVerdictSchema = z.object({
  productId: ProductIdSchema,
  productName: z.string(),
  verdict: RuleVerdictSchema,
  ruleId: z.string().nullable(),
  /** The sentence the rules would say to the customer. Null on a PASS. */
  spoken: z.string().nullable(),
  recorded: z.string(),
})
export type RmCheckVerdict = z.infer<typeof RmCheckVerdictSchema>

export const RmAnswerSchema = z.object({
  sentences: z.array(CitedSentenceSchema),
  facts: z.array(FactSchema),
  phrasedBy: PhrasedBySchema,
  /** Present where the question named a shelf product; null otherwise. */
  verdict: RmCheckVerdictSchema.nullable(),
})
export type RmAnswer = z.infer<typeof RmAnswerSchema>

export const rmAskRoute = defineRoute({
  id: 'rmAsk',
  method: 'POST',
  path: '/api/v1/rm/customers/:cif/ask',
  summary:
    'Ask about one customer. Answered from numbered facts with citations; a named product is judged by the suitability rules first and their verdict quoted. Writes an "asked" entry, or "checked" where a product was judged, to the access log.',
  auth: 'rm',
  rateLimit: COPILOT_RATE_LIMIT,
  request: { params: RmCustomerParamsSchema, body: RmAskRequestSchema },
  response: {
    200: RmAnswerSchema,
    400: ErrorBodySchema,
    404: ErrorBodySchema,
    ...RM_ERRORS,
  },
})

import { z } from 'zod'
import { ErrorBodySchema } from '../common.ts'
import { AnswerSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

export const AskRequestSchema = z.object({ question: z.string().trim().min(1).max(500) }).strict()
export type AskRequest = z.infer<typeof AskRequestSchema>

export const askRoute = defineRoute({
  id: 'ask',
  method: 'POST',
  path: '/api/v1/ask',
  summary:
    'The text tier: a deterministic answer over the session’s snapshot and ledger, with evidence. No model.',
  auth: 'session',
  rateLimit: { max: 30, window: '1 minute', keyBy: 'session' },
  request: { body: AskRequestSchema },
  response: { 200: AnswerSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

export const AskSuggestionsSchema = z.object({
  opening: AnswerSchema,
  questions: z.array(z.string()),
})
export type AskSuggestions = z.infer<typeof AskSuggestionsSchema>

export const askSuggestionsRoute = defineRoute({
  id: 'askSuggestions',
  method: 'GET',
  path: '/api/v1/ask/suggestions',
  summary: 'The opening line and suggested questions for the text tier’s first screen.',
  auth: 'session',
  response: { 200: AskSuggestionsSchema, ...SESSION_ERRORS },
})

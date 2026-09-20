import { z } from 'zod'
import { ErrorBodySchema } from '../common.ts'
import { AnswerSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

/**
 * A turn the client already has on screen. Optional, and the older clients that send only a
 * question are unaffected — the tier answered one question at a time before the model existed
 * and still can.
 *
 * Held by the client rather than the server because the transcript is the client's: a chat
 * that survives a restart is a feature nobody asked for, and a server-side history is a second
 * place a customer's questions would be stored.
 */
export const AskTurnSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string().trim().min(1).max(2000),
  })
  .strict()
export type AskTurn = z.infer<typeof AskTurnSchema>

export const AskRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    /** Most recent last. Anything past the last six turns is dropped server-side. */
    history: z.array(AskTurnSchema).max(20).optional(),
  })
  .strict()
export type AskRequest = z.infer<typeof AskRequestSchema>

export const askRoute = defineRoute({
  id: 'ask',
  method: 'POST',
  path: '/api/v1/ask',
  summary:
    'The text tier: the figures computed over the session’s snapshot and ledger, phrased by the language model where one is configured and returned verbatim where it is not. Evidence always from the engine.',
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

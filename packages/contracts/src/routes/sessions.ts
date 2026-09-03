import { z } from 'zod'
import { CifSchema, ErrorBodySchema } from '../common.ts'
import { SessionStateSchema } from '../domain.ts'
import { PUBLIC_ERRORS, defineRoute } from '../route.ts'

export const CreateSessionRequestSchema = z.object({ cif: CifSchema }).strict()
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>

/** The token is returned exactly once. Only its hash is stored. */
export const CreateSessionResponseSchema = z.object({
  token: z.string(),
  session: SessionStateSchema,
})
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>

export const createSessionRoute = defineRoute({
  id: 'createSession',
  method: 'POST',
  path: '/api/v1/sessions',
  summary:
    'Create an isolated reviewer session at the persona anchor (as-of 2026-09-01, last seen six days earlier) with a 30-day sliding expiry. Returns the opaque bearer once.',
  auth: 'none',
  rateLimit: { max: 20, window: '1 hour', keyBy: 'ip' },
  request: { body: CreateSessionRequestSchema },
  response: {
    200: CreateSessionResponseSchema,
    400: ErrorBodySchema,
    404: ErrorBodySchema,
    ...PUBLIC_ERRORS,
  },
})

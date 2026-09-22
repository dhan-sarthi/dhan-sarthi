import { z } from 'zod'
import { ErrorBodySchema, NoContentSchema, RunwaySessionIdSchema, TicketSchema } from '../common.ts'
import {
  AvatarAvailabilitySchema,
  AvatarCallRecordSchema,
  AvatarGrantSchema,
  AvatarPreparedSchema,
  WaitlistStatusSchema,
} from '../domain.ts'
import { PUBLIC_ERRORS, SESSION_ERRORS, defineRoute } from '../route.ts'

export const avatarAvailabilityRoute = defineRoute({
  id: 'avatarAvailability',
  method: 'GET',
  path: '/api/v1/avatar/availability',
  summary:
    'Public and minimal: whether Uday can take a call right now, the queue, the minutes left today and the breaker. Lets Ask render the right tier before the tap.',
  auth: 'none',
  response: { 200: AvatarAvailabilitySchema, ...PUBLIC_ERRORS },
})

/** The client sends nothing but its bearer. The brief is built server-side and is not editable. */
export const AvatarSessionRequestSchema = z
  .object({
    /*
     * What the customer tapped to get here, where they tapped something.
     *
     * "Talk me through this" on a smart insight has to open the call on *that* finding rather
     * than on the generic greeting — otherwise the button is an ordinary deep link into the
     * tab and the customer has to re-ask the question they just pressed a button about.
     *
     * The headline only, and it is a *topic*, never a script: the brief builder folds it into
     * the opening line server-side, and every figure Uday then quotes still comes from the
     * View or a tool result. A client that could post arbitrary words into the avatar's mouth
     * is the one thing the server-built brief exists to prevent, which is why this is capped
     * and why nothing downstream treats it as trusted text.
     */
    topic: z.string().min(1).max(200).optional(),
  })
  .strict()
export type AvatarSessionRequest = z.infer<typeof AvatarSessionRequestSchema>

export const AvatarSessionHeadersSchema = z
  .object({
    'idempotency-key': z.string().min(8).max(128),
    /** A claimable waitlist ticket acquires the slot ahead of anyone else for its hold window. */
    'x-waitlist-ticket': TicketSchema.optional(),
  })
  .passthrough()

/** 409: the single slot is held. Carries the ticket the caller was given, and where they stand. */
export const AvatarBusyBodySchema = ErrorBodySchema.extend({
  code: z.literal('AVATAR_BUSY'),
  /** pool_busy is our own pool; provider_concurrency is Runway refusing. Only one is fixed by keys. */
  cause: z.enum(['pool_busy', 'provider_concurrency']),
  ticket: TicketSchema.nullable(),
  position: z.number().int().nullable(),
  estimatedWaitSeconds: z.number().nullable(),
})
export type AvatarBusyBody = z.infer<typeof AvatarBusyBodySchema>

/** 429, 502, 503: the honest sentence the client shows, and why. */
export const AvatarUnavailableBodySchema = ErrorBodySchema.extend({
  cause: z.enum([
    'budget_exhausted',
    'gate_unavailable',
    'provider_error',
    'breaker_open',
    'not_configured',
    'disabled',
  ]),
  retryAfterSeconds: z.number().optional(),
})
export type AvatarUnavailableBody = z.infer<typeof AvatarUnavailableBodySchema>

export const startAvatarSessionRoute = defineRoute({
  id: 'startAvatarSession',
  method: 'POST',
  path: '/api/v1/avatar/session',
  summary:
    'Grant a live call. The server builds the brief, registers the tools, opens the RPC gate, and only then consumes the session. One live call per session.',
  auth: 'session',
  idempotent: true,
  rateLimit: { max: 5, window: '1 hour', keyBy: 'ip' },
  request: { body: AvatarSessionRequestSchema, headers: AvatarSessionHeadersSchema },
  response: {
    200: AvatarGrantSchema,
    400: ErrorBodySchema,
    409: AvatarBusyBodySchema,
    429: AvatarUnavailableBodySchema,
    502: AvatarUnavailableBodySchema,
    503: AvatarUnavailableBodySchema,
    401: ErrorBodySchema,
    500: ErrorBodySchema,
  },
})

export const prepareAvatarSessionRoute = defineRoute({
  id: 'prepareAvatarSession',
  method: 'POST',
  path: '/api/v1/avatar/session/prepare',
  summary:
    'Ready a call before the customer asks for one: claim an account, create the session, wait for READY and open the gate — and hand nothing over. Free on Runway until handed over. The next POST /avatar/session hands it over in one round trip. Never queues; `prepared: false` means the tap builds its call from nothing.',
  auth: 'session',
  rateLimit: { max: 30, window: '1 hour', keyBy: 'session' },
  request: { body: AvatarSessionRequestSchema },
  response: {
    200: AvatarPreparedSchema,
    400: ErrorBodySchema,
    401: ErrorBodySchema,
    500: ErrorBodySchema,
  },
})

export const TicketParamsSchema = z.object({ ticket: TicketSchema })
export type TicketParams = z.infer<typeof TicketParamsSchema>

export const getWaitlistRoute = defineRoute({
  id: 'getWaitlist',
  method: 'GET',
  path: '/api/v1/avatar/waitlist/:ticket',
  summary:
    'Poll the queue. When claimable, POST /avatar/session with X-Waitlist-Ticket wins the slot for the hold window.',
  auth: 'session',
  request: { params: TicketParamsSchema },
  response: {
    200: WaitlistStatusSchema,
    403: ErrorBodySchema,
    404: ErrorBodySchema,
    ...SESSION_ERRORS,
  },
})

export const leaveWaitlistRoute = defineRoute({
  id: 'leaveWaitlist',
  method: 'DELETE',
  path: '/api/v1/avatar/waitlist/:ticket',
  summary: 'Leave the queue.',
  auth: 'session',
  request: { params: TicketParamsSchema },
  response: { 204: NoContentSchema, 403: ErrorBodySchema, ...SESSION_ERRORS },
})

export const RunwaySessionParamsSchema = z.object({ runwaySessionId: RunwaySessionIdSchema })
export type RunwaySessionParams = z.infer<typeof RunwaySessionParamsSchema>

export const endAvatarSessionRoute = defineRoute({
  id: 'endAvatarSession',
  method: 'POST',
  path: '/api/v1/avatar/session/:runwaySessionId/end',
  summary:
    'Release the lease, close the RPC handler, cancel the provider session, charge the minutes and schedule the transcript fetch. Always 204; safe to call from sendBeacon with no body.',
  auth: 'session',
  request: { params: RunwaySessionParamsSchema },
  response: { 204: NoContentSchema, 403: ErrorBodySchema, ...SESSION_ERRORS },
})

export const getAvatarCallRecordRoute = defineRoute({
  id: 'getAvatarCallRecord',
  method: 'GET',
  path: '/api/v1/avatar/session/:runwaySessionId/record',
  summary:
    'What the gate did during a call: tool calls, advice records, transcript status, reconciliation and gate coverage.',
  auth: 'session',
  request: { params: RunwaySessionParamsSchema },
  response: {
    200: AvatarCallRecordSchema,
    403: ErrorBodySchema,
    404: ErrorBodySchema,
    ...SESSION_ERRORS,
  },
})

/* The tool gate on the wire, when the provider calls it over HTTP ------------------- */

/**
 * Anam has no room to join, so there is no hidden participant to answer the model's tools.
 * Its webhook tools are called from Anam's servers instead, which makes the gate an ordinary
 * route — one the public internet can reach.
 *
 * Nothing about that request identifies the customer. There is no signature, and the body holds
 * only what the model extracted. So the call id is in the path and a per-call secret, minted
 * when the session was created and never reused, is in the header. Both have to match a call
 * this process is currently hosting, and the handlers have to already be attached: a tool call
 * that arrives before the gate is open is refused, not answered by a half-built session.
 */
export const AvatarToolParamsSchema = z.object({
  runwaySessionId: RunwaySessionIdSchema,
  tool: z.string().min(1).max(64),
})
export type AvatarToolParams = z.infer<typeof AvatarToolParamsSchema>

export const AvatarToolHeadersSchema = z
  .object({ 'x-avatar-call': z.string().min(16).max(128) })
  .passthrough()

/** Whatever the tool answers. Shapes are the tools' business; this route only carries them. */
export const AvatarToolResultSchema = z.record(z.unknown())

export const avatarToolCallRoute = defineRoute({
  id: 'avatarToolCall',
  method: 'POST',
  path: '/api/v1/avatar/tool/:runwaySessionId/:tool',
  summary:
    'The tool gate, called by the avatar provider rather than over a room. Authenticated by a per-call secret, refused unless this process is hosting that call with its handlers attached.',
  auth: 'none',
  request: {
    params: AvatarToolParamsSchema,
    body: z.record(z.unknown()),
    headers: AvatarToolHeadersSchema,
  },
  response: {
    200: AvatarToolResultSchema,
    403: ErrorBodySchema,
    404: ErrorBodySchema,
    409: ErrorBodySchema,
    ...PUBLIC_ERRORS,
  },
  rateLimit: { max: 240, window: '1 minute', keyBy: 'ip' },
})

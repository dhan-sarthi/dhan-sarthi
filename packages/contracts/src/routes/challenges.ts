import { z } from 'zod'
import { ErrorBodySchema, MoneySchema, NoContentSchema } from '../common.ts'
import { ChallengeQuoteSchema, ChallengeViewSchema, SpendTargetSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'
// actions.ts's header, imported rather than restated — see the note in save.ts.
import { IdempotencyHeadersSchema } from './actions.ts'

/**
 * A challenge is a ceiling the customer sets on one merchant or one category for a few weeks.
 *
 * The view carries the running challenge *and* everything the four-step wizard needs to start
 * a new one, even while one is running. That looks wasteful and is not: the targets and the
 * lengths both fall out of the same single pass over the statement the running challenge is
 * already scored against, and a wizard that fetched per step would trade one computed answer
 * for four round trips and three loading states.
 */
export const getChallengesRoute = defineRoute({
  id: 'getChallenges',
  method: 'GET',
  path: '/api/v1/challenges',
  summary:
    'The running challenge with its progress, and the merchants, categories and lengths the wizard offers for the next one.',
  auth: 'session',
  // No 400: the route validates nothing, and a status declared where it cannot be reached is
  // a claim the OpenAPI document makes on the API's behalf that the API will never honour.
  response: { 200: ChallengeViewSchema, ...SESSION_ERRORS },
})

/**
 * What limits to offer for one target over one length.
 *
 * On the query and not in a body because it asks a question and changes nothing: the answer
 * is a function of the statement and the two values here, the wizard asks it again on every
 * tap of a different length, and a POST that wrote nothing would be lying about itself. The
 * numbers are coerced because a query string has no numbers in it.
 */
export const ChallengeQuoteQuerySchema = z
  .object({
    kind: z.enum(['merchant', 'category']),
    name: z.string().min(1).max(60),
    days: z.coerce.number().int().min(1).max(90),
  })
  .strict()
export type ChallengeQuoteQuery = z.infer<typeof ChallengeQuoteQuerySchema>
export type ChallengeQuoteQueryInput = z.input<typeof ChallengeQuoteQuerySchema>

// Declared immediately before `/api/v1/challenges/:challengeId` and kept next to it on
// purpose. A literal segment and a parameter that could swallow it belong where the next
// person reading either one can see the other. Fastify prefers the static segment over the
// parameter anyway, and these two do not even compete — one is a GET and the other a DELETE —
// but that is two accidents deep, and the ordering is what the reader should be able to check.
export const quoteChallengeRoute = defineRoute({
  id: 'quoteChallenge',
  method: 'GET',
  path: '/api/v1/challenges/quote',
  summary:
    'The three limits on offer for one target over one length, what each would save, and what repeating the challenge would add. Pure: it reads the statement and writes nothing.',
  auth: 'session',
  request: { query: ChallengeQuoteQuerySchema },
  response: { 200: ChallengeQuoteSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

/**
 * The wizard's four answers, collapsed into the three the server needs.
 *
 * The limit is sent rather than the tier that produced it. A tier is a percentage of a
 * baseline that moves with every new statement line, so the same tap a day later is a
 * different rupee figure — and the figure is what the customer agreed to and what the
 * progress bar has to be measured against for the whole run.
 */
export const ChallengeDraftSchema = z
  .object({
    target: SpendTargetSchema,
    limit: MoneySchema.positive(),
    days: z.number().int().min(1).max(90),
  })
  .strict()
export type ChallengeDraft = z.infer<typeof ChallengeDraftSchema>

export const startChallengeRoute = defineRoute({
  id: 'startChallenge',
  method: 'POST',
  path: '/api/v1/challenges',
  summary:
    'Start a challenge on one target. 409 CHALLENGE_ALREADY_RUNNING while one is still going, 422 NOTHING_TO_CHALLENGE where the target has no spend in the window. Requires an Idempotency-Key.',
  auth: 'session',
  idempotent: true,
  request: { body: ChallengeDraftSchema, headers: IdempotencyHeadersSchema },
  // 200 rather than 201, like every other write here: the answer is the whole challenge view
  // the client is about to render, not a bare location for the thing that was made.
  response: {
    200: ChallengeViewSchema,
    400: ErrorBodySchema,
    409: ErrorBodySchema,
    422: ErrorBodySchema,
    ...SESSION_ERRORS,
  },
})

export const ChallengeParamsSchema = z.object({ challengeId: z.string().min(1) })
export type ChallengeParams = z.infer<typeof ChallengeParamsSchema>

/**
 * Give up on the running challenge.
 *
 * The id is in the path and is checked, rather than "end whatever is running": a customer who
 * left the screen open while the challenge completed and then tapped the button would
 * otherwise end the one they started afterwards. A mismatch is a 404, which is the honest
 * answer — the thing they were looking at is not there any more.
 */
export const endChallengeRoute = defineRoute({
  id: 'endChallenge',
  method: 'DELETE',
  path: '/api/v1/challenges/:challengeId',
  summary:
    'End the running challenge. 404 CHALLENGE_NOT_FOUND when the id is not the one running, which is what a stale screen sends.',
  auth: 'session',
  request: { params: ChallengeParamsSchema },
  response: { 204: NoContentSchema, 404: ErrorBodySchema, ...SESSION_ERRORS },
})

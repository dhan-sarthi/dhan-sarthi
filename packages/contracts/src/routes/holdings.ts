import { z } from 'zod'
import { ErrorBodySchema, MoneySchema, NoContentSchema } from '../common.ts'
import { HoldingSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

/**
 * A customer's investments, which IDBI has no endpoint for.
 *
 * No mutual fund, deposit book, NPS or insurance operation exists in the catalogue, and a
 * consented Account Aggregator pull returns deposit accounts held at other banks rather than a
 * portfolio. So there is no bank read that answers "what do they already own" — and without an
 * answer the app can only recommend into a vacuum, suggesting an equity fund to someone who
 * holds three. This is where that answer lives until a real feed exists.
 *
 * A term deposit held at IDBI is not recorded here: it arrives as an account on 394 and 365
 * and is already in the accounts block, so recording it again would count it twice in every
 * net-worth figure.
 */
export const HoldingRecordSchema = HoldingSchema.extend({ holdingId: z.string() })
export type HoldingRecordResponse = z.infer<typeof HoldingRecordSchema>

export const HoldingsResponseSchema = z.object({
  holdings: z.array(HoldingRecordSchema),
  /** Protection, kept separate because suitability reads cover differently from capital. */
  policies: z.array(HoldingRecordSchema),
  updatedAt: z.string(),
  /** Sum of `currentValue` across `holdings`. Policies are cover, not capital, and excluded. */
  totalValue: MoneySchema,
  /** False where this source serves the bank's own holdings and the app owns none to change. */
  editable: z.boolean(),
})
export type HoldingsResponse = z.infer<typeof HoldingsResponseSchema>

export const getHoldingsRoute = defineRoute({
  id: 'getHoldings',
  method: 'GET',
  path: '/api/v1/holdings',
  summary:
    'What the session customer already owns. Declared rather than read from the bank: the catalogue has no holdings endpoint.',
  auth: 'session',
  response: { 200: HoldingsResponseSchema, ...SESSION_ERRORS },
})

export const HoldingDraftSchema = HoldingSchema.strict()
export type HoldingDraftRequest = z.infer<typeof HoldingDraftSchema>

export const addHoldingRoute = defineRoute({
  id: 'addHolding',
  method: 'POST',
  path: '/api/v1/holdings',
  summary:
    'Record something the customer owns. A protection product lands in policies; everything else in holdings.',
  auth: 'session',
  request: { body: HoldingDraftSchema },
  // 200 rather than 201: every write in this API answers 200 with the row it made, and the
  // registry test enforces exactly one of 200 or 204 per route.
  response: { 200: HoldingRecordSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

export const HoldingParamsSchema = z.object({ holdingId: z.string().min(1) })

export const replaceHoldingRoute = defineRoute({
  id: 'replaceHolding',
  // PATCH rather than PUT because the registry's method union does not admit PUT, and the
  // body is a whole holding either way: a fund's value and its SIP move together.
  method: 'PATCH',
  path: '/api/v1/holdings/:holdingId',
  summary: 'Replace one recorded holding, keeping its id.',
  auth: 'session',
  request: { params: HoldingParamsSchema, body: HoldingDraftSchema },
  response: { 200: HoldingRecordSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

export const removeHoldingRoute = defineRoute({
  id: 'removeHolding',
  method: 'DELETE',
  path: '/api/v1/holdings/:holdingId',
  summary: 'Forget one recorded holding. The advice is recomputed without it.',
  auth: 'session',
  request: { params: HoldingParamsSchema },
  response: { 204: NoContentSchema, ...SESSION_ERRORS },
})

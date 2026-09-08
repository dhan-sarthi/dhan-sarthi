import { z } from 'zod'
import { ActionIdSchema, ErrorBodySchema } from '../common.ts'
import { AdviceRecordSchema, DecisionKindSchema, DecisionRecordSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

export const ActionParamsSchema = z.object({ actionId: ActionIdSchema })
export type ActionParams = z.infer<typeof ActionParamsSchema>

/** Only the kind and their words. Amounts and products are re-derived server-side, never trusted. */
export const DecisionRequestSchema = z
  .object({
    kind: DecisionKindSchema,
    note: z.string().max(500).optional(),
  })
  .strict()
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>

export const IdempotencyHeadersSchema = z
  .object({ 'idempotency-key': z.string().min(8).max(128) })
  .passthrough()

/**
 * What became of the lead, where one was attempted.
 *
 * The bank's side of an accepted recommendation, reported beside the decision rather than
 * folded into it: the decision is the customer's and is already on the record, and a bank that
 * refuses or is unreachable does not un-decide it. Null for a behavioural action, which
 * recommends no product, and for a decline.
 */
export const LeadOutcomeSchema = z.object({
  status: z.enum(['created', 'duplicate', 'refused', 'unavailable', 'incomplete']),
  /** The bank's own sentence, or ours where nothing was sent. Safe to show a customer. */
  message: z.string(),
  leadId: z.string().nullable(),
})
export type LeadOutcomeResponse = z.infer<typeof LeadOutcomeSchema>

export const DecisionResponseSchema = z.object({
  /** Null for behavioural actions, which recommend no product and so have no verdict. */
  adviceRecord: AdviceRecordSchema.nullable(),
  decision: DecisionRecordSchema,
  roadmapVersion: z.number().int(),
  lead: LeadOutcomeSchema.nullable(),
})
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>

export const decideActionRoute = defineRoute({
  id: 'decideAction',
  method: 'POST',
  path: '/api/v1/actions/:actionId/decision',
  summary:
    'Record a decision on today’s action. The server re-derives the plan, finds the action by id, runs the suitability gate for money actions and appends the advice record, the decision and a new roadmap version in one unit of work.',
  auth: 'session',
  idempotent: true,
  request: {
    params: ActionParamsSchema,
    body: DecisionRequestSchema,
    headers: IdempotencyHeadersSchema,
  },
  response: {
    200: DecisionResponseSchema,
    400: ErrorBodySchema,
    404: ErrorBodySchema,
    409: ErrorBodySchema,
    ...SESSION_ERRORS,
  },
})

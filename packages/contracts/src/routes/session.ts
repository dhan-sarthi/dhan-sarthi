import { z } from 'zod'
import { ErrorBodySchema, MoneySchema, NoContentSchema } from '../common.ts'
import { ConsentScopeSchema, SessionStateSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

export const getSessionRoute = defineRoute({
  id: 'getSession',
  method: 'GET',
  path: '/api/v1/session',
  summary:
    'The caller’s session: clock, caps, goal override, scope overrides, version, capabilities.',
  auth: 'session',
  response: { 200: SessionStateSchema, ...SESSION_ERRORS },
})

export const eraseSessionRoute = defineRoute({
  id: 'eraseSession',
  method: 'DELETE',
  path: '/api/v1/session',
  summary:
    'DPDP erasure of reviewer state: deletes the subject row, cascading sessions and snapshots. Audit rows stay immutable and become unlinkable.',
  auth: 'session',
  response: { 204: NoContentSchema, ...SESSION_ERRORS },
})

/**
 * The only mutation of the simulated clock. `expectedVersion` makes it an optimistic update:
 * two tabs pressing +1 month move the clock once and the loser gets 409 STALE_CLOCK.
 */
export const ClockRequestSchema = z.union([
  z
    .object({
      advanceDays: z.union([z.literal(1), z.literal(7), z.literal(30)]),
      expectedVersion: z.number().int().nonnegative(),
    })
    .strict(),
  z.object({ reset: z.literal(true), expectedVersion: z.number().int().nonnegative() }).strict(),
])
export type ClockRequest = z.infer<typeof ClockRequestSchema>

export const advanceClockRoute = defineRoute({
  id: 'advanceClock',
  method: 'POST',
  path: '/api/v1/session/clock',
  summary:
    'Advance or reset the simulated clock; last seen moves to the old as-of. 409 STALE_CLOCK on a version mismatch, 422 CLOCK_BEYOND_SEEDED_HORIZON past the seeded ledger.',
  auth: 'session',
  request: { body: ClockRequestSchema },
  response: {
    200: SessionStateSchema,
    400: ErrorBodySchema,
    409: ErrorBodySchema,
    422: ErrorBodySchema,
    ...SESSION_ERRORS,
  },
})

export const GoalPatchSchema = z.object({ targetAmount: MoneySchema.positive() }).strict()
export type GoalPatch = z.infer<typeof GoalPatchSchema>

export const setGoalRoute = defineRoute({
  id: 'setGoal',
  method: 'PATCH',
  path: '/api/v1/session/goal',
  summary:
    'Override the suggested goal target. The next /view cuts a new roadmap version with reason "Target changed by the customer".',
  auth: 'session',
  request: { body: GoalPatchSchema },
  response: { 200: SessionStateSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

/**
 * A monthly limit on one category, or the removal of one.
 *
 * `monthlyLimit` is nullable rather than optional because clearing a cap and forgetting to send
 * one are different intentions and the wire should be able to tell them apart.
 */
export const CategoryCapPatchSchema = z
  .object({ category: z.string().min(1).max(40), monthlyLimit: MoneySchema.positive().nullable() })
  .strict()
export type CategoryCapPatch = z.infer<typeof CategoryCapPatchSchema>

export const setCategoryCapRoute = defineRoute({
  id: 'setCategoryCap',
  method: 'POST',
  path: '/api/v1/session/caps',
  summary:
    'Set or clear a monthly limit on one spending category. The daily plan reads caps, so the next /view says so on Today.',
  auth: 'session',
  request: { body: CategoryCapPatchSchema },
  response: { 200: SessionStateSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

export const ConsentPatchSchema = z
  .object({ scope: ConsentScopeSchema, granted: z.boolean() })
  .strict()
export type ConsentPatch = z.infer<typeof ConsentPatchSchema>

export const setConsentRoute = defineRoute({
  id: 'setConsent',
  method: 'POST',
  path: '/api/v1/session/consent',
  summary:
    'Per-session scope override. Withdrawing a block genuinely recomputes the advice without it on the next /view.',
  auth: 'session',
  request: { body: ConsentPatchSchema },
  response: { 200: SessionStateSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

import { z } from 'zod'
import { ErrorBodySchema, MoneySchema, NoContentSchema } from '../common.ts'
import {
  ConsentScopeSchema,
  GoalAmountBasisSchema,
  GoalKindSchema,
  SessionStateSchema,
} from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

export const getSessionRoute = defineRoute({
  id: 'getSession',
  method: 'GET',
  path: '/api/v1/session',
  summary:
    'The caller’s session: clock, caps, goal override, the goal kind the customer chose, scope overrides, version, capabilities.',
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

/**
 * The customer's goal: the kind they chose, their own target, and which money they stated it in.
 *
 * `kind` is the goal the customer named — onboarding asks it as its last question, and the goal
 * screen can change it. The engine plans around it wherever it has something to aim at and falls
 * back to its own proposal where it does not: a payoff with nothing costly owed, cover with no
 * gap. A kind other than the stored one clears the stored target unless this same patch sets
 * one, because a figure typed for clearing a card is not a figure for retirement.
 *
 * A target belongs to the stored kind: it is planned while that kind is the plan's goal, and
 * kept, unplanned, while the plan falls back to its own proposal. So a client setting a target
 * on the goal the plan is showing sends that goal's kind beside it, which pins the kind to the
 * figure. Sent alone, a target is for the stored kind — or, where none was ever chosen, for
 * whichever goal the plan is on.
 *
 * `amountBasis` is optional and absent means `today`, so a client written before the field
 * existed sends the same body and gets the same plan. Sending `at_horizon` says the customer
 * has already inflated the figure themselves — the engine then funds it at the nominal rate
 * however long the horizon, rather than taking that inflation straight back out. It qualifies
 * an amount, so it is refused where there is none beside it.
 *
 * Two shapes, as a union rather than one object with refinements, so the published contract says
 * what the route enforces. A refinement is invisible to JSON Schema: the OpenAPI document went
 * out with no `required` at all, and `{}` and `{kind, amountBasis}` read as valid bodies that
 * the route then answered with a 400. Each shape is strict, so a basis beside a lone kind is an
 * unrecognised key, and a patch that names neither a kind nor a target matches neither.
 */
export const GoalPatchSchema = z.union(
  [
    z.object({ kind: GoalKindSchema }).strict(),
    z
      .object({
        kind: GoalKindSchema.optional(),
        targetAmount: MoneySchema.positive(),
        amountBasis: GoalAmountBasisSchema.optional(),
      })
      .strict(),
  ],
  {
    errorMap: () => ({
      message:
        'Send a goal kind, a target amount or both: kind is one of the five goal kinds, and ' +
        'amountBasis only comes beside a targetAmount.',
    }),
  },
)
export type GoalPatch = z.infer<typeof GoalPatchSchema>

export const setGoalRoute = defineRoute({
  id: 'setGoal',
  method: 'PATCH',
  path: '/api/v1/session/goal',
  summary:
    'Record the goal kind the customer chose, override the suggested goal target, and say whether it is in today’s money or the rupees of the year it lands. A target belongs to the stored kind, and a kind other than the stored one clears it unless the same patch sets one. The next /view cuts a new roadmap version with reason "Goal chosen by the customer" when the customer’s choice moved the plan’s goal, or "Target changed by the customer" when their figure did.',
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

/**
 * A monthly ceiling on discretionary spending, or the removal of one.
 *
 * Nullable for the same reason `CategoryCapPatch.monthlyLimit` is: clearing a limit and
 * forgetting to send one are different intentions.
 */
export const SpendLimitPatchSchema = z
  .object({ monthlyLimit: MoneySchema.positive().nullable() })
  .strict()
export type SpendLimitPatch = z.infer<typeof SpendLimitPatchSchema>

export const setSpendLimitRoute = defineRoute({
  id: 'setSpendLimit',
  method: 'POST',
  path: '/api/v1/session/spend-limit',
  summary:
    'Set or clear the customer’s own monthly spending ceiling. The daily plan reads it, so safe-to-spend on the next /view is measured against it.',
  auth: 'session',
  request: { body: SpendLimitPatchSchema },
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

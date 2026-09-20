import { z } from 'zod'
import { ErrorBodySchema, MoneySchema } from '../common.ts'
import { SaveViewSchema, SmartSaveLevelSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'
// The idempotency header is actions.ts's and is imported rather than restated: a second
// declaration of the same shape under the same name would be an ambiguous star export out of
// `routes/index.ts` and would vanish from the package, and under a different name it would be
// the same rule written twice, free to drift on the day the length bounds change.
import { IdempotencyHeadersSchema } from './actions.ts'

/**
 * The savings pot: the goal seen from the saving end, the five hacks, and what they put in.
 *
 * A read, and yet every one of these three routes answers with the whole view rather than
 * just the thing it touched. The pot accrues lazily — the hacks are replayed over the days
 * since they were last accrued at the moment somebody looks — so a request that changed one
 * hack has almost certainly moved the deposits, the interest and the projected monthly inflow
 * as well, and a client left to patch its own copy from a narrower answer would draw a pot
 * that disagrees with the next refresh.
 */
export const getSaveRoute = defineRoute({
  id: 'getSave',
  method: 'GET',
  path: '/api/v1/save',
  summary:
    'The savings pot: goal, hacks, the deposits they have made, interest earned, and everything the hack configuration screens need.',
  auth: 'session',
  response: { 200: SaveViewSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

/**
 * One hack, set whole.
 *
 * A discriminated union on `id` rather than a partial of `SaveHacks`, so the wire cannot
 * carry a weekly amount for the swear jar or a merchant for round-ups: the server would have
 * to decide what to do with a field that means nothing where it landed, and every one of
 * those decisions is a bug waiting for the screen that sends the wrong body.
 *
 * Each member is `.strict()` and each configuration field is optional, because turning a hack
 * off is a body with nothing but `id` and `enabled`. The configuration it already had is
 * kept, so the customer who turns Set & Forget back on next month does not choose ₹500 again.
 */
export const SaveHackPatchSchema = z.discriminatedUnion('id', [
  z
    .object({
      id: z.literal('roundups'),
      enabled: z.boolean(),
      toNearest: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      id: z.literal('set_forget'),
      enabled: z.boolean(),
      weekly: MoneySchema.positive().optional(),
    })
    .strict(),
  z
    .object({
      id: z.literal('smart_save'),
      enabled: z.boolean(),
      level: SmartSaveLevelSchema.optional(),
    })
    .strict(),
  z
    .object({
      id: z.literal('swear_jar'),
      enabled: z.boolean(),
      /** Nullable as well as optional: clearing the merchant and not mentioning it differ. */
      merchant: z.string().min(1).max(60).nullable().optional(),
      perSpend: MoneySchema.positive().optional(),
    })
    .strict(),
  z
    .object({
      id: z.literal('payday_saver'),
      enabled: z.boolean(),
      /** Half a percent to fifty. Below the floor it is theatre; above the ceiling it is rent. */
      percent: z.number().min(0.5).max(50).optional(),
    })
    .strict(),
])
export type SaveHackPatch = z.infer<typeof SaveHackPatchSchema>

export const setSaveHackRoute = defineRoute({
  id: 'setSaveHack',
  method: 'POST',
  path: '/api/v1/save/hacks',
  summary:
    'Switch one save hack on or off and set its configuration. 422 SAVE_HACK_UNAVAILABLE where the hack has nothing to run on — the swear jar with no merchant, the payday saver with no regular salary.',
  auth: 'session',
  request: { body: SaveHackPatchSchema },
  response: {
    200: SaveViewSchema,
    400: ErrorBodySchema,
    422: ErrorBodySchema,
    ...SESSION_ERRORS,
  },
})

/** Money the customer moved themselves, on top of whatever the hacks are doing. */
export const SaveDepositRequestSchema = z.object({ amount: MoneySchema.positive() }).strict()
export type SaveDepositRequest = z.infer<typeof SaveDepositRequestSchema>

export const addSaveDepositRoute = defineRoute({
  id: 'addSaveDeposit',
  method: 'POST',
  path: '/api/v1/save/deposits',
  summary:
    'Put money into the pot by hand. Requires an Idempotency-Key: a double tap on a slow connection must not put the amount aside twice.',
  auth: 'session',
  idempotent: true,
  request: { body: SaveDepositRequestSchema, headers: IdempotencyHeadersSchema },
  // 200 rather than 201, like every other write here: the deposit is made and the answer is
  // the pot it landed in, and the registry test admits exactly one of 200 or 204 per route.
  response: { 200: SaveViewSchema, 400: ErrorBodySchema, ...SESSION_ERRORS },
})

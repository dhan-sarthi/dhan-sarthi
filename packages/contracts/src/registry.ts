/**
 * The route registry: the one table every route in the API exists in.
 *
 * `http/register.ts` registers rows from here and nowhere else; a test walks Fastify's route
 * table and fails on anything not in this list. The OpenAPI document, the contract-test matrix
 * and the web client's typed fetch are all derived from these rows, which is what makes a
 * second client cheap and an undeclared response shape impossible.
 */
import type { z } from 'zod'
import type { RouteEntry } from './route.ts'
import {
  addHoldingRoute,
  advanceClockRoute,
  consentNotificationRoute,
  dataNotificationRoute,
  askRoute,
  askSuggestionsRoute,
  avatarAvailabilityRoute,
  createSessionRoute,
  decideActionRoute,
  endAvatarSessionRoute,
  eraseSessionRoute,
  evaluateSuitabilityRoute,
  getAvatarCallRecordRoute,
  getHealthRoute,
  getHoldingsRoute,
  getOpenApiRoute,
  getProfileRoute,
  getRecordRoute,
  getRulesRoute,
  getSessionRoute,
  getShelfRoute,
  getViewRoute,
  getWaitlistRoute,
  leaveWaitlistRoute,
  listConsentRequestsRoute,
  listCustomersRoute,
  listTransactionsRoute,
  operatorAvatarStatusRoute,
  operatorReleaseAllRoute,
  operatorSeedRoute,
  patchProfileRoute,
  removeHoldingRoute,
  replaceHoldingRoute,
  returnFromConsentRoute,
  setConsentRoute,
  setGoalRoute,
  startAvatarSessionRoute,
  startConsentRequestRoute,
  verifyConsentRequestRoute,
  verifyRecordRoute,
} from './routes/index.ts'

export const ROUTES = [
  getHealthRoute,
  getOpenApiRoute,
  listCustomersRoute,
  createSessionRoute,
  getSessionRoute,
  eraseSessionRoute,
  advanceClockRoute,
  setGoalRoute,
  setConsentRoute,
  getViewRoute,
  listTransactionsRoute,
  decideActionRoute,
  evaluateSuitabilityRoute,
  askRoute,
  askSuggestionsRoute,
  getRecordRoute,
  verifyRecordRoute,
  getShelfRoute,
  getProfileRoute,
  patchProfileRoute,
  getHoldingsRoute,
  addHoldingRoute,
  replaceHoldingRoute,
  removeHoldingRoute,
  listConsentRequestsRoute,
  startConsentRequestRoute,
  verifyConsentRequestRoute,
  returnFromConsentRoute,
  consentNotificationRoute,
  dataNotificationRoute,
  getRulesRoute,
  avatarAvailabilityRoute,
  startAvatarSessionRoute,
  getWaitlistRoute,
  leaveWaitlistRoute,
  endAvatarSessionRoute,
  getAvatarCallRecordRoute,
  operatorAvatarStatusRoute,
  operatorReleaseAllRoute,
  operatorSeedRoute,
] as const satisfies readonly RouteEntry[]

export type Route = (typeof ROUTES)[number]
export type RouteId = Route['id']
export type RouteById<Id extends RouteId> = Extract<Route, { id: Id }>

const byId: ReadonlyMap<string, Route> = new Map(ROUTES.map((r) => [r.id, r]))

export function routeById<Id extends RouteId>(id: Id): RouteById<Id> {
  const found = byId.get(id)
  if (!found) throw new Error(`no route "${id}" in the registry`)
  return found as RouteById<Id>
}

/* ------------------------------------------------------------------ *
 * Inferred types, by route id
 * ------------------------------------------------------------------ */

type Out<S> = S extends z.ZodTypeAny ? z.output<S> : never
type In<S> = S extends z.ZodTypeAny ? z.input<S> : never

// An empty object rather than `never` for routes without a request: `never` satisfies every
// `extends`, which would make ParamsOf and BodyOf collapse to `never` instead of their fallbacks.
type RequestOf<Id extends RouteId> =
  RouteById<Id> extends { request: infer R } ? R : Record<never, never>

/** Path parameters after validation. `{}` for routes without any. */
export type ParamsOf<Id extends RouteId> = [RequestOf<Id>] extends [{ params: infer P }]
  ? Out<P>
  : Record<string, never>

/** Query after validation, defaults applied. */
export type QueryOf<Id extends RouteId> = [RequestOf<Id>] extends [{ query: infer Q }]
  ? Out<Q>
  : Record<string, never>

/** Query as a client sends it, defaults still optional. */
export type QueryInputOf<Id extends RouteId> = [RequestOf<Id>] extends [{ query: infer Q }]
  ? In<Q>
  : Record<string, never>

/** Body after validation. `undefined` for routes without one. */
export type BodyOf<Id extends RouteId> = [RequestOf<Id>] extends [{ body: infer B }]
  ? Out<B>
  : undefined

/** Body as a client sends it. */
export type BodyInputOf<Id extends RouteId> = [RequestOf<Id>] extends [{ body: infer B }]
  ? In<B>
  : undefined

export type HeadersOf<Id extends RouteId> = [RequestOf<Id>] extends [{ headers: infer H }]
  ? Out<H>
  : Record<string, never>

/** The body for one declared status. */
export type ResponseOf<
  Id extends RouteId,
  Status extends number,
> = RouteById<Id>['response'] extends { readonly [K in Status]: infer R } ? Out<R> : never

/** The 2xx status a route answers with. */
export type SuccessStatusOf<Id extends RouteId> = Extract<
  keyof RouteById<Id>['response'],
  200 | 201 | 204
>

/** What a handler returns on success. */
export type SuccessOf<Id extends RouteId> = ResponseOf<Id, SuccessStatusOf<Id>>

/* ------------------------------------------------------------------ *
 * Compile-time checks on the helpers above
 * ------------------------------------------------------------------ */

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

type _Inference = [
  Assert<Equal<SuccessOf<'getView'>, z.output<(typeof getViewRoute.response)[200]>>>,
  Assert<Equal<SuccessStatusOf<'eraseSession'>, 204>>,
  Assert<Equal<SuccessStatusOf<'createSession'>, 200>>,
  Assert<Equal<ParamsOf<'decideAction'>, { actionId: string }>>,
  Assert<Equal<ParamsOf<'getView'>, Record<string, never>>>,
  Assert<Equal<BodyOf<'decideAction'>['kind'], 'did_it' | 'declined' | 'deferred' | 'pushed_back'>>,
  Assert<Equal<BodyOf<'getView'>, undefined>>,
  Assert<Equal<QueryOf<'listTransactions'>['limit'], number>>,
  Assert<Equal<QueryInputOf<'listTransactions'>['limit'], number | undefined>>,
  Assert<Equal<HeadersOf<'startAvatarSession'>['x-waitlist-ticket'], string | undefined>>,
  Assert<
    Equal<ResponseOf<'startAvatarSession', 409>['cause'], 'pool_busy' | 'provider_concurrency'>
  >,
]

/**
 * The shape of one row in the route registry.
 *
 * A route is data: method, path, who may call it, what it takes, what it returns and with which
 * status. `http/register.ts` in the API reads this to validate in and out; the OpenAPI document,
 * the contract tests and the web client are all derived from the same rows. Nothing about a
 * route exists anywhere else.
 */
import type { z } from 'zod'
import { ErrorBodySchema } from './common.ts'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** `session` is the reviewer's bearer; `operator` is the X-Operator-Key header. */
export type RouteAuth = 'none' | 'session' | 'operator'

export interface RateLimit {
  max: number
  /** A `@fastify/rate-limit` time window, e.g. '1 minute' or '1 hour'. */
  window: string
  keyBy: 'ip' | 'session'
}

export interface RouteCache {
  /** The Cache-Control header the route sets. */
  control: string
  /** The route sets an ETag and answers 304 to a matching If-None-Match. */
  etag?: boolean
}

export interface RouteRequest {
  params?: z.ZodTypeAny
  query?: z.ZodTypeAny
  body?: z.ZodTypeAny
  /** Header names are lowercase, as Fastify presents them. */
  headers?: z.ZodTypeAny
}

/** Status code → body schema. Every route declares at least one 2xx. */
export type RouteResponse = { readonly [status: number]: z.ZodTypeAny }

export interface RouteEntry {
  readonly id: string
  readonly method: HttpMethod
  readonly path: `/api/v1${string}`
  readonly summary: string
  readonly auth: RouteAuth
  readonly rateLimit?: RateLimit
  /**
   * Requires an Idempotency-Key header. A replay with the same key and the same request hash
   * returns the stored response; a different hash answers 409 IDEMPOTENCY_MISMATCH.
   */
  readonly idempotent?: boolean
  readonly request?: RouteRequest
  readonly response: RouteResponse
  readonly cache?: RouteCache
}

/** Identity with literal inference, so `ROUTES[n].id` is a string literal and not `string`. */
export function defineRoute<const E extends RouteEntry>(entry: E): E {
  return entry
}

/* The error responses every route of a kind shares. Spread into `response`. */

export const PUBLIC_ERRORS = {
  429: ErrorBodySchema,
  500: ErrorBodySchema,
} as const

export const SESSION_ERRORS = {
  401: ErrorBodySchema,
  429: ErrorBodySchema,
  500: ErrorBodySchema,
} as const

export const OPERATOR_ERRORS = {
  401: ErrorBodySchema,
  500: ErrorBodySchema,
} as const

/**
 * The only way to add a route.
 *
 * A route is a row in `@dhan/contracts`' registry; this turns one row into a Fastify route
 * that authenticates as the row says, parses params, query, body and headers against the
 * row's schemas, runs the handler, and parses the response against the row's schema for the
 * status it answers with. A response the contract does not declare is a 500 in development
 * and a logged violation in production — never a silent new shape. Idempotency-Key replay,
 * ETag/304 and Cache-Control are handled here too, so a handler only computes.
 */
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { z } from 'zod'
import type {
  BodyOf,
  HeadersOf,
  ParamsOf,
  QueryOf,
  Route,
  RouteById,
  RouteEntry,
  RouteId,
  SuccessOf,
} from '@dhan/contracts'
import {
  DomainError,
  IdempotencyKeyRequired,
  IdempotencyMismatch,
  RateLimited,
  ValidationFailed,
} from '../application/errors.ts'
import { hashOf } from '../application/hash.ts'
import type { RmCaller } from '../application/rm/caller.ts'
import type { Clock, Session, SessionStore } from '../ports/index.ts'
import { bearerOf } from './auth.ts'
import type { Authenticator, Principal } from './auth.ts'
import { GLOBAL_RATE_LIMIT } from './server.ts'

type SessionOf<Id extends RouteId> = RouteById<Id>['auth'] extends 'session' ? Session : null
type RmOf<Id extends RouteId> = RouteById<Id>['auth'] extends 'rm' ? RmCaller : null

export interface RouteContext<Id extends RouteId> {
  principal: Principal
  /** The caller's session on `auth: 'session'` routes; null elsewhere. */
  session: SessionOf<Id>
  /** The signed-in relationship manager on `auth: 'rm'` routes; null elsewhere. */
  rm: RmOf<Id>
  params: ParamsOf<Id>
  query: QueryOf<Id>
  body: BodyOf<Id>
  headers: HeadersOf<Id>
  request: FastifyRequest
  log: FastifyBaseLogger
}

/** A handler result that needs more than a body: another 2xx status, an ETag, extra headers. */
export class RouteReply<T> {
  readonly body: T
  readonly status: number | undefined
  readonly etag: string | undefined
  readonly headers: Record<string, string>

  constructor(body: T, opts: { status?: number; etag?: string; headers?: Record<string, string> }) {
    this.body = body
    this.status = opts.status
    this.etag = opts.etag
    this.headers = opts.headers ?? {}
  }
}

export function reply<T>(
  body: T,
  opts: { status?: number; etag?: string; headers?: Record<string, string> } = {},
): RouteReply<T> {
  return new RouteReply(body, opts)
}

export type RouteHandler<Id extends RouteId> = (
  ctx: RouteContext<Id>,
) => Promise<SuccessOf<Id> | RouteReply<SuccessOf<Id>>>

export interface RegisterDeps {
  auth: Authenticator
  sessions: SessionStore
  clock: Clock
  /** Per-row rate limits are applied only when the plugin is registered on the app. */
  rateLimits: boolean
  /**
   * A deployment's own ceiling for a row, in place of the registry's default. The registry says
   * what a route's limit is for; configuration says how many a given demo can afford — and a
   * room of judges on one venue network is one IP.
   */
  rateLimitMax?: Partial<Record<string, number>>
  /** A response that fails its schema is a 500 (true) or a logged violation (false). */
  strictResponses: boolean
}

export type Registrar = <E extends Route>(entry: E, handler: RouteHandler<E['id']>) => void

function parseWith<S extends z.ZodTypeAny>(schema: S, value: unknown, where: string): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ValidationFailed(
      `Invalid ${where}.`,
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    )
  }
  return result.data
}

function successStatus(entry: RouteEntry): number {
  const codes = Object.keys(entry.response).map(Number)
  return codes.find((c) => c === 200 || c === 201 || c === 204) ?? 200
}

/** Weak or strong, quoted or bare, one or a list: does any If-None-Match token equal the ETag? */
function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  if (header === undefined) return false
  const strip = (s: string): string => s.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
  const wanted = strip(etag)
  const raw = Array.isArray(header) ? header.join(',') : header
  return raw.split(',').some((token) => token.trim() === '*' || strip(token) === wanted)
}

type Hook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>

/**
 * The bucket a session-keyed row counts a caller in: the bearer, parsed exactly as `auth.ts`
 * parses it, or the address where there is none.
 *
 * Never the raw header. `Bearer X`, `bearer X` and `Bearer  X` are one principal to the
 * authenticator, and keyed on the header they were three buckets, so changing the case of a
 * word reset the limit.
 */
function callerKey(request: FastifyRequest): string {
  const token = bearerOf(request)
  return hashOf(token === null ? `ip:${request.ip}` : `bearer:${token}`).slice(0, 32)
}

/**
 * One per-address ceiling over every session-keyed row together, at the global rate.
 *
 * The plugin gives a route one limiter: a row with a limit of its own replaces the global
 * per-address one instead of adding to it. On a session-keyed row that left nothing per
 * address, and the bearer is whatever the caller sends, so a caller who changed it on every
 * request had a fresh bucket every time and was never refused, each 401 still costing a store
 * lookup. Its own bucket rather than the global one, so the customer app's ordinary reads never
 * pay for an RM's verify calls, and checked before the row's own limit so a refused request does
 * not spend the session's allowance as well.
 */
function addressCeiling(app: FastifyInstance): Hook {
  const limit = app.createRateLimit({
    max: GLOBAL_RATE_LIMIT.max,
    timeWindow: GLOBAL_RATE_LIMIT.window,
    keyGenerator: (request) => request.ip,
  })
  return async (request, reply) => {
    const result = await limit(request)
    if (result.isAllowed || !result.isExceeded) return
    void reply.header('retry-after', result.ttlInSeconds)
    throw new RateLimited(result.ttl, result.max)
  }
}

export function makeRegistrar(app: FastifyInstance, deps: RegisterDeps): Registrar {
  // The plugin, and so `createRateLimit`, is registered only when rate limits are on.
  const ceiling =
    deps.rateLimits && app.hasDecorator('createRateLimit') ? addressCeiling(app) : null
  return (entry, handler) => registerRoute(app, deps, entry, handler, ceiling)
}

export function registerRoute<E extends Route>(
  app: FastifyInstance,
  deps: RegisterDeps,
  entry: E,
  handler: RouteHandler<E['id']>,
  sessionRowCeiling: Hook | null = null,
): void {
  type Id = E['id']
  // The registry's rows are literal types; the interface is what the optional fields read as.
  const row: RouteEntry = entry
  const okStatus = successStatus(row)
  const limited = deps.rateLimits && row.rateLimit !== undefined
  const ceiling = limited && row.rateLimit?.keyBy === 'session' ? sessionRowCeiling : null

  app.route({
    method: row.method,
    url: row.path,
    ...(ceiling === null ? {} : { onRequest: [ceiling] }),
    config: {
      routeId: row.id,
      ...(limited && row.rateLimit
        ? {
            rateLimit: {
              max: deps.rateLimitMax?.[row.id] ?? row.rateLimit.max,
              timeWindow: row.rateLimit.window,
              keyGenerator:
                row.rateLimit.keyBy === 'session'
                  ? callerKey
                  : (req: FastifyRequest): string => req.ip,
            },
          }
        : {}),
    },
    handler: async (request: FastifyRequest, fastifyReply: FastifyReply) => {
      const principal = await deps.auth.authenticate(row.auth, request)
      const session = principal.kind === 'session' ? principal.session : null
      const rm = principal.kind === 'rm' ? principal.rm : null

      // A missing Idempotency-Key has its own code; checked before the header schema so the
      // client sees that rather than a generic validation failure.
      const idempotencyKey = request.headers['idempotency-key']
      if (row.idempotent && (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8)) {
        throw new IdempotencyKeyRequired()
      }

      const req = row.request
      const params = (
        req?.params ? parseWith(req.params, request.params, 'path parameters') : {}
      ) as ParamsOf<Id>
      const query = (req?.query ? parseWith(req.query, request.query, 'query') : {}) as QueryOf<Id>
      const body = (
        req?.body ? parseWith(req.body, request.body ?? {}, 'body') : undefined
      ) as BodyOf<Id>
      const headers = (
        req?.headers ? parseWith(req.headers, request.headers, 'headers') : {}
      ) as HeadersOf<Id>

      // Idempotency: same key and same request → the stored answer; same key, different
      // request → 409. Only successful answers are stored, so a failed call may be retried.
      let idempotency: { key: string; requestHash: string; sessionId: string } | null = null
      if (row.idempotent && typeof idempotencyKey === 'string') {
        const key = idempotencyKey
        if (!session) throw new DomainError(500, 'INTERNAL', 'Idempotent route without a session.')
        const requestHash = hashOf({ method: row.method, path: row.path, params, body })
        const stored = await deps.sessions.getIdempotent(session.id, key)
        if (stored) {
          if (stored.requestHash !== requestHash) throw new IdempotencyMismatch()
          fastifyReply.header('Idempotent-Replayed', 'true')
          return fastifyReply.code(stored.status).send(stored.body)
        }
        idempotency = { key, requestHash, sessionId: session.id }
      }

      const result = await handler({
        principal,
        session: session as SessionOf<Id>,
        rm: rm as RmOf<Id>,
        params,
        query,
        body,
        headers,
        request,
        log: request.log,
      })

      const wrapped = result instanceof RouteReply ? result : new RouteReply(result, {})
      const status = wrapped.status ?? okStatus

      if (row.cache) fastifyReply.header('Cache-Control', row.cache.control)
      for (const [name, value] of Object.entries(wrapped.headers)) fastifyReply.header(name, value)
      if (wrapped.etag) {
        fastifyReply.header('ETag', wrapped.etag)
        if (etagMatches(request.headers['if-none-match'], wrapped.etag)) {
          return fastifyReply.code(304).send()
        }
      }

      if (status === 204) return fastifyReply.code(204).send()

      const schema = (row.response as Record<number, z.ZodTypeAny | undefined>)[status]
      if (!schema) {
        throw new DomainError(500, 'INTERNAL', `Route ${row.id} answered an undeclared ${status}.`)
      }
      const checked = schema.safeParse(wrapped.body)
      let payload: unknown = wrapped.body
      if (!checked.success) {
        const issues = checked.error.issues.slice(0, 5).map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        }))
        if (deps.strictResponses) {
          throw new DomainError(
            500,
            'INTERNAL',
            `Route ${row.id} violated its response contract.`,
            {
              details: issues,
            },
          )
        }
        request.log.error({ routeId: row.id, status, issues }, 'response violates contract')
      } else {
        payload = checked.data
      }

      if (idempotency) {
        await deps.sessions.putIdempotent(idempotency.sessionId, idempotency.key, {
          requestHash: idempotency.requestHash,
          status,
          body: payload,
          createdAt: deps.clock.now().toISOString(),
        })
      }

      return fastifyReply.code(status).send(payload)
    },
  })
}

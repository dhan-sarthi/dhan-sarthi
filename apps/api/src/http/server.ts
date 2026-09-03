/**
 * The Fastify instance: helmet, CORS where a separate origin needs it, rate limits, a 16 KB
 * body limit, a request id on every line and response, and one error mapper that turns
 * anything thrown into the `ErrorBody` every route declares.
 *
 * The request timeout is a minute rather than the ten seconds most routes need, because the
 * avatar grant legitimately waits on a provider for up to forty-five; every outbound call under
 * it carries its own shorter deadline.
 */
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type {
  FastifyHttpOptions,
  FastifyInstance,
  FastifyServerOptions,
  RawServerDefault,
} from 'fastify'
import { ZodError } from 'zod'
import type { ErrorBody } from '@dhan/contracts'
import { isDomainError } from '../application/errors.ts'
import type { Config } from '../config.ts'

declare module 'fastify' {
  interface FastifyInstance {
    /** Every `METHOD /path` registered, for the no-undeclared-route test. */
    routeTable: Set<string>
  }
  interface FastifyContextConfig {
    routeId?: string
  }
}

export interface ServerOptions {
  logger?: FastifyServerOptions['logger']
  rateLimits: boolean
}

const BODY_LIMIT_BYTES = 16 * 1024
const GLOBAL_RATE_LIMIT = { max: 120, window: '1 minute' }

/** A log line must never be the place a bearer or a key survives. */
const REDACT = [
  'req.headers.authorization',
  'req.headers["x-operator-key"]',
  'req.headers["idempotency-key"]',
  'req.headers["x-waitlist-ticket"]',
]

type LoggerOption = NonNullable<FastifyServerOptions['logger']>

function loggerOptions(config: Config, override: LoggerOption | undefined): LoggerOption {
  if (override !== undefined) return override
  if (config.NODE_ENV === 'test') return false
  const base = { redact: REDACT }
  return config.NODE_ENV === 'production' ? base : { ...base, transport: { target: 'pino-pretty' } }
}

export async function createServer(
  config: Config,
  options: ServerOptions,
): Promise<FastifyInstance> {
  const serverOptions: FastifyHttpOptions<RawServerDefault> = {
    logger: loggerOptions(config, options.logger),
    trustProxy: config.TRUST_PROXY,
    bodyLimit: BODY_LIMIT_BYTES,
    requestTimeout: 60_000,
    exposeHeadRoutes: false,
  }
  const app = Fastify(serverOptions)

  app.decorate('routeTable', new Set<string>())
  app.addHook('onRoute', (route) => {
    for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
      app.routeTable.add(`${method} ${route.url}`)
    }
  })

  await app.register(helmet, { global: true })

  // CloudFront serves / and /api/* from one origin in production, so CORS is only for a client
  // on another origin: the Vite dev server, or an explicitly listed one.
  if (config.CORS_ORIGIN || config.NODE_ENV !== 'production') {
    await app.register(cors, { origin: config.CORS_ORIGIN ?? true })
  }

  if (options.rateLimits) {
    await app.register(rateLimit, {
      global: true,
      max: GLOBAL_RATE_LIMIT.max,
      timeWindow: GLOBAL_RATE_LIMIT.window,
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: (_request, context): ErrorBody => ({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Slow down a little.',
        details: { retryAfterMs: context.ttl, limit: context.max },
      }),
    })
  }

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id)
  })

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorBody = {
      code: 'NOT_FOUND',
      message: `No route for ${request.method} ${request.url.split('?')[0]}.`,
    }
    void reply.code(404).send(body)
  })

  app.setErrorHandler((err: unknown, request, reply) => {
    const routeId = request.routeOptions.config.routeId

    if (isDomainError(err)) {
      const body: ErrorBody & Record<string, unknown> = {
        code: err.code,
        message: err.message,
        ...(err.details === undefined ? {} : { details: err.details }),
        ...err.extra,
      }
      if (err.status >= 500) request.log.error({ err, routeId }, err.message)
      void reply.code(err.status).send(body)
      return
    }

    if (err instanceof ZodError) {
      void reply.code(400).send({
        code: 'VALIDATION',
        message: 'Invalid request.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      } satisfies ErrorBody)
      return
    }

    const status =
      typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500
    const message = err instanceof Error ? err.message : String(err)

    if (status === 429) {
      void reply.code(429).send({ code: 'RATE_LIMITED', message } satisfies ErrorBody)
      return
    }
    if (status === 413) {
      void reply.code(413).send({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body too large.',
      } satisfies ErrorBody)
      return
    }
    if (status >= 400 && status < 500) {
      void reply.code(status).send({ code: 'VALIDATION', message } satisfies ErrorBody)
      return
    }

    request.log.error({ err, routeId }, 'unhandled error')
    void reply.code(500).send({
      code: 'INTERNAL',
      message: 'Something went wrong on our side. Nothing you did caused it.',
    } satisfies ErrorBody)
  })

  return app
}

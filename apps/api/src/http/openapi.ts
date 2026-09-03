/**
 * OpenAPI 3.1, generated from the registry at boot. What a reviewer imports into Postman, and
 * what a contract diff shows in a PR. Nothing here is hand-kept: every path, parameter, body
 * and response comes from the same rows Fastify validates against.
 */
import { z } from 'zod'
import { ROUTES, jsonSchemaOf } from '@dhan/contracts'
import type { OpenApiDocument, RouteEntry } from '@dhan/contracts'

type Json = Record<string, unknown>

function parameters(schema: z.ZodTypeAny | undefined, where: 'path' | 'query' | 'header'): Json[] {
  if (!(schema instanceof z.ZodObject)) return []
  const shape = schema.shape as Record<string, z.ZodTypeAny>
  return Object.entries(shape).map(([name, field]) => ({
    name,
    in: where,
    required: where === 'path' || !field.isOptional(),
    schema: jsonSchemaOf(field),
    ...(field.description ? { description: field.description } : {}),
  }))
}

function operation(route: RouteEntry): Json {
  const responses: Json = {}
  for (const [status, schema] of Object.entries(route.response)) {
    const code = Number(status)
    const noBody = code === 204 || code === 304 || schema instanceof z.ZodUndefined
    responses[status] = {
      description: describeStatus(code),
      ...(noBody ? {} : { content: { 'application/json': { schema: jsonSchemaOf(schema) } } }),
    }
  }

  const security =
    route.auth === 'session'
      ? [{ bearerAuth: [] }]
      : route.auth === 'operator'
        ? [{ operatorKey: [] }]
        : []

  return {
    operationId: route.id,
    summary: route.summary,
    ...(security.length > 0 ? { security } : {}),
    parameters: [
      ...parameters(route.request?.params, 'path'),
      ...parameters(route.request?.query, 'query'),
      ...parameters(route.request?.headers, 'header'),
      ...(route.idempotent
        ? [
            {
              name: 'Idempotency-Key',
              in: 'header',
              required: true,
              schema: { type: 'string', minLength: 8, maxLength: 128 },
            },
          ]
        : []),
    ],
    ...(route.request?.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: jsonSchemaOf(route.request.body) } },
          },
        }
      : {}),
    responses,
    ...(route.cache ? { 'x-cache-control': route.cache.control } : {}),
    ...(route.rateLimit ? { 'x-rate-limit': route.rateLimit } : {}),
  }
}

function describeStatus(code: number): string {
  const known: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No content',
    304: 'Not modified',
    400: 'Validation failed',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not found',
    409: 'Conflict',
    413: 'Payload too large',
    422: 'Unprocessable',
    429: 'Rate limited or budget exhausted',
    500: 'Internal error',
    502: 'Provider error',
    503: 'Unavailable',
  }
  return known[code] ?? `HTTP ${code}`
}

export function buildOpenApi(opts: { version: string }): OpenApiDocument {
  const paths: Record<string, Json> = {}
  for (const route of ROUTES as readonly RouteEntry[]) {
    const path = route.path.replace(/:(\w+)/g, '{$1}')
    paths[path] = { ...(paths[path] ?? {}), [route.method.toLowerCase()]: operation(route) }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Dhan Sarthi API',
      version: opts.version,
      description:
        'The advisory API. Every figure a screen shows comes from here; every route is declared in @dhan/contracts.',
    },
    servers: [{ url: '/', description: 'Same origin' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'The session token from POST /api/v1/sessions.',
        },
        operatorKey: { type: 'apiKey', in: 'header', name: 'X-Operator-Key' },
      },
    },
    paths,
  }
}

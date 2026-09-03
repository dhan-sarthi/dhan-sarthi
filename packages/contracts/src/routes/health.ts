import { z } from 'zod'
import { HealthResponseSchema } from '../domain.ts'
import { defineRoute } from '../route.ts'

/** Generated at boot from the registry. Loose on purpose: it is snapshot-tested, not typed. */
export const OpenApiDocumentSchema = z
  .object({
    openapi: z.string(),
    info: z.object({ title: z.string(), version: z.string() }).passthrough(),
    paths: z.record(z.unknown()),
  })
  .passthrough()
export type OpenApiDocument = z.infer<typeof OpenApiDocumentSchema>

export const getHealthRoute = defineRoute({
  id: 'getHealth',
  method: 'GET',
  path: '/api/v1/health',
  summary:
    'Liveness plus dependency truth: bank source and latency, seed hash, avatar provider, breaker state, open RPC handlers, fault injection. The ALB target.',
  auth: 'none',
  response: {
    200: HealthResponseSchema,
    // Same body, so a reviewer sees which dependency is down rather than a bare status.
    503: HealthResponseSchema,
  },
})

export const getOpenApiRoute = defineRoute({
  id: 'getOpenApi',
  method: 'GET',
  path: '/api/v1/openapi.json',
  summary: 'OpenAPI 3.1 generated from the route registry at boot. What a reviewer imports.',
  auth: 'none',
  response: { 200: OpenApiDocumentSchema },
  cache: { control: 'public, max-age=300' },
})

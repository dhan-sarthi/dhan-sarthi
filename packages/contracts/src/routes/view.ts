import { ErrorBodySchema, NoContentSchema } from '../common.ts'
import { ViewSchema } from '../domain.ts'
import { SESSION_ERRORS, defineRoute } from '../route.ts'

export const getViewRoute = defineRoute({
  id: 'getView',
  method: 'GET',
  path: '/api/v1/view',
  summary:
    'The one object every screen reads: snapshot, goal, roadmap, daily plan, insights, shelf, rules and provenance. ETag is snapshotId:roadmapVersion.',
  auth: 'session',
  response: {
    200: ViewSchema,
    304: NoContentSchema,
    // The consent artefact is expired or revoked: advice generation halts, it does not degrade.
    403: ErrorBodySchema,
    ...SESSION_ERRORS,
  },
  cache: { control: 'private, no-store', etag: true },
})

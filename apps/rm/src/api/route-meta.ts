import type { HttpMethod, Route, RouteId } from '@dhan/contracts'

/** The routes the console holds a credential for: none, or the signed-in RM's bearer. */
export type ConsoleRoute = Extract<Route, { auth: 'none' | 'rm' }>
export type ConsoleRouteId = ConsoleRoute['id']

/**
 * What the client needs to know about a route to call it, and nothing else: no schemas, so zod
 * and the registry stay out of the bundle (`scripts/routes-table.mjs` writes the table).
 */
export interface RouteMeta {
  readonly id: RouteId
  readonly method: HttpMethod
  readonly path: string
  readonly auth: 'none' | 'rm'
  /** The route sets an ETag and answers 304 to a matching If-None-Match. */
  readonly etag?: true
}

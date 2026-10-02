import { useQueryClient, type FetchQueryOptions } from '@tanstack/react-query'
import { Component, Suspense, useEffect, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router'
import { Card, ErrorState } from '../ui/index.ts'
import { PageFallback } from './pages.ts'

/**
 * A page that fails to load, or throws while it draws, takes only itself down: the sidebar, the
 * top bar and search stay, and the RM reads one plain sentence with a way out instead of a blank
 * window. The usual cause after route splitting is a chunk that will not load (a deploy replaced
 * it, or the connection dropped), and a reload is what fixes that.
 */
class Boundary extends Component<
  { children: ReactNode; resetKey: string },
  { error: unknown; resetKey: string }
> {
  constructor(props: { children: ReactNode; resetKey: string }) {
    super(props)
    this.state = { error: null, resetKey: props.resetKey }
  }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  // Moving to another page clears the failure: the next page deserves its own chance.
  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { error: unknown; resetKey: string },
  ) {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey }
  }

  override render() {
    if (this.state.error === null) return this.props.children
    return (
      <Card>
        <ErrorState
          size="page"
          title="This page did not load"
          body="Part of the console could not be loaded or drawn. Reloading usually fixes it, and nothing was changed."
          onRetry={() => window.location.reload()}
        />
      </Card>
    )
  }
}

/**
 * The reads a route's page makes first, as `api/queries.ts` writes them (`queries.today()`), so
 * the route can start them itself. Given the route's `:cif` where it has one.
 */
// TanStack's options type is invariant in its key and data parameters, so a list of different
// reads can only be typed this loosely; each entry is still a `queries.*` call, checked where it
// is written.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFetchOptions = FetchQueryOptions<any, any, any, any>
export type RoutePrefetch = (cif: string | undefined) => readonly AnyFetchOptions[]

/**
 * One page's code and its loading state: the page's skeleton until the chunk arrives. The page
 * draws the skeleton itself (`PageFallback`, read by `lazyPage` in `pages.ts`) rather than
 * suspending, so React's 300 ms reveal throttle never holds a loaded page back; the Suspense
 * fallback stays for anything else inside that suspends.
 *
 * `prefetch` starts the page's own reads the moment the route renders, beside its chunk, rather
 * than after it: a page's queries live inside its chunk, so a cold load used to wait for the
 * chunk and only then ask for its data. The options are the hooks' own, so the page finds the
 * answer (or the request in flight) under the same key and asks nothing twice. Only the route
 * being opened does this, never the background preload, because opening a customer is an
 * access-logged read.
 */
export function RoutePage({
  fallback,
  children,
  prefetch,
}: {
  fallback: ReactNode
  children: ReactNode
  prefetch?: RoutePrefetch
}) {
  const location = useLocation()
  const { cif } = useParams()
  const client = useQueryClient()
  useEffect(() => {
    if (!prefetch) return
    for (const options of prefetch(cif)) void client.prefetchQuery(options)
  }, [client, prefetch, cif])
  return (
    <Boundary resetKey={location.pathname}>
      <PageFallback.Provider value={fallback}>
        <Suspense fallback={fallback}>{children}</Suspense>
      </PageFallback.Provider>
    </Boundary>
  )
}

import { Component, Suspense, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Card, ErrorState } from '../ui/index.ts'

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

/** One page's code and its loading state: the page's skeleton until the chunk arrives. */
export function RoutePage({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const location = useLocation()
  return (
    <Boundary resetKey={location.pathname}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </Boundary>
  )
}

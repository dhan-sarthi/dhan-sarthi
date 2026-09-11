/**
 * Reading the holdings block, once, for the whole Dashboard surface.
 *
 * Three of the four panes want it and a fetch per pane would re-read it on every tab tap, so the
 * Dashboard holds one of these and hands the result down. Split from `portfolio.ts` so the
 * arithmetic over there stays a pure module with no runtime imports, and can be tested as one.
 */
import { useCallback, useEffect, useState } from 'react'
import { portfolioOf } from './portfolio.ts'
import type { HoldingsSource, Portfolio } from './portfolio.ts'

export interface PortfolioState {
  portfolio: Portfolio | null
  loading: boolean
  /** The sentence to show instead of the rows. Never a spinner that never ends. */
  error: string | null
  reload: () => void
}

/**
 * `at` is the snapshot the rows belong beside — the caller passes `view.meta.snapshotId`.
 *
 * Keying on it is what makes the pane consistent with the figures around it: advancing the
 * simulated clock or saving a holding recuts the snapshot, and the rows come back with it rather
 * than a step behind. It also means a slow reply for the previous snapshot cannot land as the
 * current one, because the state it wrote is not the state that is read.
 */
export function usePortfolio(source: HoldingsSource, at: string): PortfolioState {
  const [state, setState] = useState<{
    at: string
    portfolio: Portfolio | null
    error: string | null
  }>({ at: '', portfolio: null, error: null })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const held = await source()
        if (live) setState({ at, portfolio: portfolioOf(held), error: null })
      } catch (err) {
        if (!live) return
        /* `ApiError` is an `Error` carrying the server's own sentence, which is the one worth
           showing. Anything else that got thrown here is a bug and says so generically. */
        setState({
          at,
          portfolio: null,
          error: err instanceof Error ? err.message : 'What you hold could not be read.',
        })
      }
    })()
    return () => {
      live = false
    }
  }, [source, at, tick])

  const settled = state.at === at
  return {
    portfolio: settled ? state.portfolio : null,
    loading: !settled,
    error: settled ? state.error : null,
    reload,
  }
}

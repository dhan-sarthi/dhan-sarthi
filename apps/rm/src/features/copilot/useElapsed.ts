import { useEffect, useState } from 'react'

/**
 * Whole seconds since `startedAt`, ticking once a second while it is set. The copilot's progress
 * lines show this rather than a made-up percentage: a model call has no progress to report, but
 * how long it has taken is true.
 */
export function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null) return
    // Until the first tick `now` may predate `startedAt`; the floor at zero covers that second.
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000))
}

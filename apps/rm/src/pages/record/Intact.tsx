import { useEffect, useState } from 'react'
import { formatCount } from '../../lib/format.ts'
import { clockTime } from './advice.ts'

/*
 * The moment a verification comes back clean, shared by the book's strip and a customer's
 * record: "224 of 224 records intact · not one word changed · 8:21:12 am".
 *
 * The server has already walked every chain when this renders; the count runs up to its figure
 * over most of a second, with a bar filling beside it, so the result lands as a result rather
 * than as one more line of text. The figure it counts to is the server's, and nothing else on
 * the line moves. Anyone who asks for reduced motion gets the final figure at once.
 */

const COUNT_MS = 900

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Counts from 0 to `target` once per `key` (a new verification restarts it). */
export function useCountUp(target: number, key: string): number {
  const reduced = prefersReducedMotion()
  const [state, setState] = useState<{ key: string; value: number }>(() => ({ key, value: 0 }))
  // A new verification starts the count again from zero, set while rendering so the previous
  // result's final figure never flashes first.
  if (state.key !== key) setState({ key, value: 0 })

  useEffect(() => {
    if (reduced || target <= 0) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS)
      // Ease out: quick at first, settling on the figure.
      const eased = 1 - (1 - t) ** 3
      setState({ key, value: Math.round(target * eased) })
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, key, reduced])

  if (reduced || target <= 0) return target
  return state.key === key ? state.value : 0
}

/** The lead line and its bar, drawn on the brand fill. */
export function IntactSummary({
  checked,
  checkedAt,
  scope,
}: {
  checked: number
  checkedAt: string
  /** What was walked, for the line under the figure: "in your book", "on Karan’s record". */
  scope: string
}) {
  const shown = useCountUp(checked, checkedAt)
  const pct = checked > 0 ? (shown / checked) * 100 : 100
  const records = `record${checked === 1 ? '' : 's'}`
  return (
    <div className="min-w-0">
      {/* The figure ticks, so a screen reader is given the settled sentence instead of every
          frame of the count. */}
      <p className="sr-only">
        {formatCount(checked)} of {formatCount(checked)} {records} intact, not one word changed,
        checked at {clockTime(checkedAt)}.
      </p>
      <p aria-hidden className="text-heading text-on-brand">
        <span className="tabular">
          {formatCount(shown)} of {formatCount(checked)}
        </span>{' '}
        {records} intact
        <span className="text-on-brand/75">
          {' '}
          · not one word changed · <span className="tabular">{clockTime(checkedAt)}</span>
        </span>
      </p>
      <div
        aria-hidden
        className="mt-2.5 h-1 w-full max-w-md overflow-hidden rounded-full bg-on-brand/20"
      >
        <div className="h-full rounded-full bg-on-brand" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 max-w-[72ch] text-label font-normal text-pretty text-on-brand/80">
        Every hash {scope} recomputed to the value it was written with. One changed word anywhere
        would have broken it.
      </p>
    </div>
  )
}

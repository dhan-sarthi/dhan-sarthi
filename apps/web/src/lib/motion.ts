/**
 * The three bits of motion that need JavaScript.
 *
 * Everything else is CSS in `styles/motion.css`. These are here because a count-up needs the
 * previous value, a ripple needs the touch coordinates, and both need to know whether the
 * customer asked for less motion.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** Whether the OS is asking for less motion. Live, because a customer can change it mid-session. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/**
 * A number that travels to its new value instead of jumping.
 *
 * The point is not that it looks nice. When a customer edits their declared income and the
 * surplus, the daily allowance and the goal target all change at once, a jump gives them four
 * new numbers and no idea which of them moved. A count tells them.
 *
 * First render does not animate: a screen that counts up from zero on load is a slot machine,
 * and it delays the one thing the customer came to read. Only a *change* animates.
 */
export function useCountUp(value: number, durationMs = 520): number {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const frame = useRef(0)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      from.current = value
      setShown(value)
      return
    }
    if (reduced || !Number.isFinite(value)) {
      from.current = value
      setShown(value)
      return
    }

    const start = performance.now()
    const a = from.current
    const b = value
    if (a === b) return

    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs)
      // Ease out cubic: fast at first, so the figure is readable long before it settles.
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(a + (b - a) * eased)
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else from.current = b
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [value, durationMs, reduced])

  return shown
}

/**
 * True for a moment after `value` changes, so a figure can be marked as just-moved.
 *
 * Pairs with the count: the number travels, and the cell it sits in flashes once. Together
 * they answer "what changed" without a diff view.
 */
export function useChanged(value: unknown, holdMs = 900): boolean {
  const [changed, setChanged] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setChanged(true)
    const t = setTimeout(() => setChanged(false), holdMs)
    return () => clearTimeout(t)
  }, [value, holdMs])
  return changed
}

/**
 * A ripple under the finger.
 *
 * `active:scale` on its own is invisible on a phone because the fingertip covers the element.
 * The ripple lands around the touch instead of under it, which is the whole reason Material
 * has one.
 */
export function useRipple(): (event: ReactPointerEvent<HTMLElement>) => void {
  const reduced = usePrefersReducedMotion()
  return useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (reduced) return
      const host = event.currentTarget
      const rect = host.getBoundingClientRect()
      const size = Math.max(rect.width, rect.height)
      const ink = document.createElement('span')
      ink.className = 'ds-ripple'
      ink.style.width = `${size}px`
      ink.style.height = `${size}px`
      ink.style.left = `${event.clientX - rect.left - size / 2}px`
      ink.style.top = `${event.clientY - rect.top - size / 2}px`
      host.appendChild(ink)
      // Removed on the animation's own end rather than a matching timeout, so the two cannot
      // drift apart when the tab is backgrounded mid-press.
      ink.addEventListener('animationend', () => ink.remove(), { once: true })
    },
    [reduced],
  )
}

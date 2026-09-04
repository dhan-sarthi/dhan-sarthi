/**
 * The whole motion budget, in one file and with no library.
 *
 * A bank build should not carry fifty kilobytes to fade a card in. Entrances are CSS (see the
 * `rise` keyframes in `app.css`); the only thing that needs JavaScript is the count-up, because
 * a figure that resolves in front of you reads as *computed* rather than fetched — which is the
 * one claim this product most wants a reviewer to feel.
 *
 * Everything here answers to `prefers-reduced-motion: reduce` by doing nothing at all.
 */
import { useEffect, useRef, useState } from 'react'

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Count from the previous value to this one.
 *
 * Only two things should trigger it: the first paint of a figure, and the figure changing because
 * the customer moved the clock or took a decision. It eases out, so most of the travel happens
 * immediately and the last hundred rupees settle — a linear count reads like a slot machine.
 */
export function useCountUp(value: number, ms = 600): number {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const frame = useRef(0)

  useEffect(() => {
    if (prefersReducedMotion() || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const start = performance.now()
    const a = from.current
    const b = value
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / ms)
      // easeOutCubic: fast, then settles. No overshoot — money must never appear to overshoot.
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(a + (b - a) * eased))
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else from.current = b
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [value, ms])

  return shown
}

/**
 * Stagger helper: the nth card's entrance delay, capped so a long list never crawls.
 * Returned as a style object because the delay is data, not a class.
 */
export function riseDelay(index: number, step = 40, max = 320): { animationDelay: string } {
  return { animationDelay: `${Math.min(index * step, max)}ms` }
}

// A figure that arrives at its value instead of asserting it.
//
// Every number in this app is derived from a snapshot taken at a date — that is the product's
// whole claim, and it is the one claim a static screen cannot make. A net worth that is simply
// *printed* looks like a field in a database. The same number counting up looks like something
// that was worked out, and when the simulated clock moves thirty days forward and the figure
// travels from the old value to the new one rather than blinking, the customer has watched the
// derivation happen. That is worth more than any amount of copy explaining it.
//
// It counts on the JS thread, deliberately. Reanimated cannot format ₹4,82,448 on the UI thread
// without routing the string back anyway, and the alternative — animating a disguised TextInput —
// brings its own baseline and padding metrics that would not match `Type`. A handful of digits
// updating for 900ms on a screen that is otherwise idle is a cost worth paying for text that sits
// exactly where every other headline in the app sits.
//
// Three rules it follows:
//
//   · It counts from the *previous* value, not from zero, on every change after the first. Zero
//     is only honest the first time; after that the number came from somewhere.
//   · It never counts while the entrance is still running. Overlapping the two is what makes a
//     screen feel busy rather than composed, so the caller's stagger delay is respected.
//   · Under Reduce Motion it is the final value, immediately. A count-up is spatial movement
//     made of digits, and someone who asked for less of that meant this too.
import { useEffect, useRef, useState } from 'react'
import { Type, type TypeProps } from '~/ui/Text'
import { dur, useReducedMotion } from '~/ui/motion'

/** Cubic in-out. An odometer spins up and spins down; expo-out would land before it was read. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function useCountUp(value: number, { delay = 0, duration = dur.count } = {}): number {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(reduced ? value : 0)
  // The value the next run counts *from*. Held in a ref so a re-render mid-count does not
  // restart the animation from wherever it happens to be on screen.
  const from = useRef(reduced ? value : 0)

  useEffect(() => {
    if (reduced || !Number.isFinite(value)) {
      from.current = value
      setShown(value)
      return
    }
    const start = from.current
    if (start === value) return

    let frame = 0
    let t0 = 0
    let cancelled = false

    const run = (now: number): void => {
      if (cancelled) return
      if (!t0) t0 = now
      const p = Math.min(1, (now - t0) / duration)
      setShown(start + (value - start) * ease(p))
      if (p < 1) frame = requestAnimationFrame(run)
      else from.current = value
    }

    const id = setTimeout(() => {
      frame = requestAnimationFrame(run)
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(id)
      cancelAnimationFrame(frame)
      // Whatever interrupted this owns the number now, and it should travel from where the
      // eye last saw it rather than jumping back to the old start.
      from.current = value
    }
  }, [value, delay, duration, reduced])

  return shown
}

export function Count({
  value,
  format,
  delay = 0,
  duration,
  ...rest
}: Omit<TypeProps, 'children'> & {
  value: number
  format: (n: number) => string
  delay?: number
  duration?: number
}) {
  const shown = useCountUp(value, { delay, ...(duration === undefined ? {} : { duration }) })
  return <Type {...rest}>{format(shown)}</Type>
}

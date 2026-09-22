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
//     is only honest the first time; after that the number came from somewhere. "Previous" means
//     where the eye last saw it: an interrupted count carries on from the digits on screen, and
//     a figure given an `id` remembers itself across a remount, so switching panes and back does
//     not spin the pot up from ₹0 a second time.
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

/**
 * Where each identified figure was last seen, across mounts. Module state on purpose: a pane
 * that unmounts takes its hooks with it, and this is the only place the number can wait.
 */
const lastShown = new Map<string, number>()

export function useCountUp(
  value: number,
  { delay = 0, duration = dur.count, id }: { delay?: number; duration?: number; id?: string } = {},
): number {
  const reduced = useReducedMotion()
  const seed = reduced ? value : id === undefined ? 0 : (lastShown.get(id) ?? 0)
  const [shown, setShown] = useState(seed)
  // The value the next run counts *from*. Held in a ref so a re-render mid-count does not
  // restart the animation from wherever it happens to be on screen.
  const from = useRef(seed)
  // What is on screen right now, for the cleanup to read: state is stale inside it.
  const shownRef = useRef(seed)

  useEffect(() => {
    if (reduced || !Number.isFinite(value)) {
      from.current = value
      shownRef.current = value
      if (id !== undefined) lastShown.set(id, value)
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
      const next = start + (value - start) * ease(p)
      shownRef.current = next
      if (id !== undefined) lastShown.set(id, next)
      setShown(next)
      if (p < 1) frame = requestAnimationFrame(run)
      else from.current = value
    }

    const timer = setTimeout(() => {
      frame = requestAnimationFrame(run)
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      // Whatever interrupted this owns the number now, and it should travel from where the
      // eye last saw it. Writing the old target here instead made an interrupted count jump
      // to the end it never reached and count again from there.
      from.current = shownRef.current
    }
  }, [value, delay, duration, reduced, id])

  return shown
}

/**
 * `id` names the figure across remounts (`'spend.pot'`, `'grow.saved'`); two Counts sharing an
 * id share a memory, so keep it to one figure. A screen reader is given the destination, not
 * the odometer: the label is the final value, and the text is `plain` so a display-sized figure
 * never lands in the headings rotor.
 */
export function Count({
  value,
  format,
  delay = 0,
  duration,
  id,
  ...rest
}: Omit<TypeProps, 'children'> & {
  value: number
  format: (n: number) => string
  delay?: number
  duration?: number
  id?: string
}) {
  const shown = useCountUp(value, {
    delay,
    ...(duration === undefined ? {} : { duration }),
    ...(id === undefined ? {} : { id }),
  })
  return (
    <Type accessibilityLabel={format(value)} plain {...rest}>
      {format(shown)}
    </Type>
  )
}

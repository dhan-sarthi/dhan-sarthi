// The one authored moment in the app.
//
// Everything else that moves here is doing a job — acknowledging a touch, explaining a state,
// carrying the eye from one pane to the next. This is the exception, and it is allowed to be,
// because the gate answering is the single thing Dhan Sarthi does that nothing else in the
// category does. A bank-owned advisor saying "no" about a product the bank itself distributes
// is the product's whole argument, and until now it arrived by hard cut: the offer card was
// there in one frame and a refusal was there in the next.
//
// A hard cut is not neutral. It reads as a form validating — as though the answer had been
// sitting in the page all along waiting to be revealed. What a verdict should read as is a
// judgment being handed down, which means it has to *take time* and it has to *arrive in
// order*: the surface first, then the ruling, then the reasoning, then the count of what it
// passed on the way. Four beats inside 560ms.
//
// The order is the argument. "Passed 7 of 9 checks. Stopped at R-04" landing last is what
// turns a refusal from an obstruction into an account of itself — and it lands last because
// that is the sentence you want the customer still reading when the motion stops.
//
// The haptic carries the same distinction the colour does, for the customer who felt the phone
// before they looked at it. Success is the two-tap confirmation; a refusal is the warning
// pattern. Not an error pattern — the app did not fail, it decided.
import { useEffect, type ReactNode } from 'react'
import * as Haptics from 'expo-haptics'
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { dur, easeOut, timing, useReducedMotion } from '~/ui/motion'

/** The four beats, in milliseconds from the surface landing. A caller lines its copy up to these. */
export const BEAT = { surface: 0, ruling: 90, reasoning: 200, provenance: 330 } as const

/**
 * The surface a verdict lands on.
 *
 * It expands from 96% and rises 12pt — small numbers, because the card is already the widest
 * thing on the screen and anything larger reads as a modal rather than as the card changing its
 * mind. Under Reduce Motion the travel goes and the fade and the haptic stay: the customer
 * still learns that something was decided and still learns which way.
 */
export function VerdictSurface({
  tone,
  children,
  className,
}: {
  tone: 'passed' | 'blocked'
  children: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const arrived = useSharedValue(0)

  useEffect(() => {
    void Haptics.notificationAsync(
      tone === 'blocked'
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Success,
    )
    arrived.value = withTiming(1, timing(dur.verdict, easeOut))
  }, [tone, arrived])

  const shell = useAnimatedStyle(() => ({
    opacity: arrived.value,
    ...(reduced
      ? {}
      : {
          transform: [
            { scale: 0.96 + arrived.value * 0.04 },
            { translateY: (1 - arrived.value) * 12 },
          ],
        }),
  }))

  return (
    <Animated.View style={shell} className={className}>
      {children}
    </Animated.View>
  )
}

/**
 * One beat inside the surface. Pass a `BEAT` value; the content fades up on that offset.
 *
 * Deliberately not a stagger helper: the beats are named for what they say, not numbered for
 * where they sit, so a card that has no alternative to offer simply omits that beat instead of
 * leaving a hole in a sequence.
 */
export function Beat({
  at,
  children,
  className,
}: {
  at: number
  children: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const shown = useSharedValue(0)

  useEffect(() => {
    shown.value = withDelay(at, withTiming(1, timing(dur.state, easeOut)))
  }, [at, shown])

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    ...(reduced ? {} : { transform: [{ translateY: (1 - shown.value) * 8 }] }),
  }))

  return (
    <Animated.View style={style} className={className}>
      {children}
    </Animated.View>
  )
}

/**
 * The outer shell a verdict replaces an offer inside.
 *
 * The offer card and the verdict card are different heights, so without this the content below
 * them jumps the instant the answer lands — which undoes, in one frame, everything the sequence
 * above spent 560ms building. `LinearTransition` morphs the height instead, and the surface
 * rises into the space as it opens.
 *
 * It is a plain wrapper with no styling of its own so that the card inside keeps owning its
 * fill, radius and padding.
 */
export function VerdictFrame({ children }: { children: ReactNode }) {
  return (
    <Animated.View layout={LinearTransition.duration(dur.move).easing(easeOut)}>
      {children}
    </Animated.View>
  )
}

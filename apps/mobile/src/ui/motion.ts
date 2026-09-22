// The motion system, as six durations and three curves.
//
// Same argument as Text.tsx: naming the roles rather than exposing a number is what keeps
// the restraint enforceable. A component asks for `dur.state` because it is changing state,
// not for 220 because 220 looked right in that one card, and the whole app re-times together
// when the number moves. tokens.json owns the values, same as it owns the colours.
//
// What each duration is for:
//
//   tap       90   the scale under a finger — below this it is not perceptible
//   feedback  140  a control acknowledging it was hit
//   state     220  a fill, a tint, a radio dot: something became true
//   move      320  something travelled — a pane, an indicator, a sheet
//   enter     420  content arriving on a screen that was empty
//   verdict   560  the one authored sequence: the gate answering
//
// Nothing loops. Every animation in this app is finite and tied to a state change, which is
// the only reason a screen full of moving parts still reads as a banking product.
import { Easing as RNEasing } from 'react-native'
import {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  withSpring,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated'
import type { WithSpringConfig, WithTimingConfig } from 'react-native-reanimated'
import { motion } from '@dhan/design'

const [o1, o2, o3, o4] = motion.ease.out
const [i1, i2, i3, i4] = motion.ease.inOut

/** Exponential deceleration. Confident arrivals — the default for anything appearing. */
export const easeOut = Easing.bezier(o1!, o2!, o3!, o4!)
/** Symmetric. For something travelling between two known places. */
export const easeInOut = Easing.bezier(i1!, i2!, i3!, i4!)

/**
 * The same curves again, for React Navigation's driver.
 *
 * The tab navigator animates its scenes with React Native's own `Animated`, not Reanimated, and
 * the two take incompatible easing objects. Rather than let the navigator fall back to its
 * built-in `inOut(ease)` — a different curve from everything else that moves in this app — the
 * bezier control points are read from the same tokens and handed over in the form it accepts.
 */
export const native = {
  easeOut: RNEasing.bezier(o1!, o2!, o3!, o4!),
  easeInOut: RNEasing.bezier(i1!, i2!, i3!, i4!),
}

export const dur = motion.duration
export const PRESS_SCALE = motion.press.scale

/**
 * The stagger delay for item `i` of a list, capped.
 *
 * Uncapped stagger turns a twelve-row card into a two-second wait for the last row. The cap
 * means a long list still reads as a sequence at the top and is simply *there* by the bottom,
 * which is what a customer scrolling past it actually wants.
 */
export function stagger(i: number): number {
  return Math.min(i, motion.stagger.cap) * motion.stagger.step
}

/**
 * Reanimated already snaps `withTiming`/`withSpring` to their final value under Reduce Motion,
 * so a fade or a fill needs no special handling. This is for the cases where the honest
 * alternative is a *different* animation rather than none: a pane that slid should still
 * cross-fade, a number that counted should still be correct, a verdict that rose should still
 * announce itself. Branch on this, and remove the travel — not the meaning.
 */
export { useReducedMotion }

/**
 * The arrival that survives Reduce Motion, and its exit.
 *
 * Reanimated's default under Reduce Motion is to skip an entering animation outright, which
 * makes new content teleport. Someone who asked for less movement did not ask for that: they
 * get the fade with the travel removed, which still says "this is new" and still tells an
 * arrival from something that was always there. `ReduceMotion.Never` is the honest spelling —
 * this fade *is* the reduced version, so it must not be reduced a second time.
 */
export function flat(delay = 0) {
  return FadeIn.delay(delay).duration(dur.state).reduceMotion(ReduceMotion.Never)
}

export function flatOut(delay = 0) {
  return FadeOut.delay(delay).duration(dur.state).reduceMotion(ReduceMotion.Never)
}

/**
 * Siblings moving to make room, or not moving at all.
 *
 * The layout builders can be told about Reduce Motion, but the app branches by hand so the
 * reduced case is *no* layout animation rather than an instant one Reanimated still schedules —
 * and so the decision reads the same as everywhere else in this file: `undefined` on the
 * `layout` prop is a View that simply takes its new place.
 */
export function layoutMove(reduced: boolean) {
  return reduced ? undefined : LinearTransition.duration(dur.move).easing(easeOut)
}

/*
 * `timing` and the `to` helpers are worklets, so an animated style or derived value can call them.
 *
 * On a phone those callbacks run on the UI thread, which can only call functions marked as
 * worklets; anything else throws "Tried to synchronously call a Remote Function" and takes the
 * app down on the first frame. The web runs worklets on the JavaScript thread, where any function
 * will do, which is why `Button`'s `useDerivedValue(() => withTiming(…, timing(…)))` passed every
 * check in a browser and crashed the APK on launch. A worklet still runs anywhere, so marking the
 * helpers costs the JavaScript-thread callers nothing.
 */
export function timing(duration: number, easing?: WithTimingConfig['easing']): WithTimingConfig {
  'worklet'
  // The default is applied here rather than in the signature: a worklet captures what its body
  // reads, not what its parameter list does, so `easing = easeOut` was undefined on the UI thread.
  return { duration, easing: easing ?? easeOut, reduceMotion: ReduceMotion.System }
}

export const spring: WithSpringConfig = {
  damping: motion.spring.damping,
  stiffness: motion.spring.stiffness,
  mass: motion.spring.mass,
  reduceMotion: ReduceMotion.System,
}

/** A snappier spring for things under a finger, where any overshoot reads as lag. */
export const springTight: WithSpringConfig = { ...spring, damping: 26, stiffness: 420 }

export const to = {
  /** Something became true. */
  state: (v: number) => {
    'worklet'
    return withTiming(v, timing(dur.state))
  },
  /** Something travelled. */
  move: (v: number) => {
    'worklet'
    return withTiming(v, timing(dur.move))
  },
  /** Something acknowledged a touch. */
  tap: (v: number) => {
    'worklet'
    return withTiming(v, timing(dur.tap, easeOut))
  },
  /** Something settled into place with weight. */
  settle: (v: number) => {
    'worklet'
    return withSpring(v, spring)
  },
  /** Something settled under a finger. */
  press: (v: number) => {
    'worklet'
    return withSpring(v, springTight)
  },
}

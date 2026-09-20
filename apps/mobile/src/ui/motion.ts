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

export function timing(duration: number, easing = easeOut): WithTimingConfig {
  return { duration, easing, reduceMotion: ReduceMotion.System }
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
  state: (v: number) => withTiming(v, timing(dur.state)),
  /** Something travelled. */
  move: (v: number) => withTiming(v, timing(dur.move)),
  /** Something acknowledged a touch. */
  tap: (v: number) => withTiming(v, timing(dur.tap, easeOut)),
  /** Something settled into place with weight. */
  settle: (v: number) => withSpring(v, spring),
  /** Something settled under a finger. */
  press: (v: number) => withSpring(v, springTight),
}

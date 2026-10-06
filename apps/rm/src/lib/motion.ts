import { motion as tokens } from '@dhan/design'

/**
 * Motion, from the same tokens the mobile app springs with. Product motion conveys a state change
 * and nothing else: a rail sliding in, a row settling, a figure arriving. `<MotionConfig
 * reducedMotion="user">` at the root turns every one of these into an instant change for anyone
 * whose system asks for reduced motion.
 *
 * Components animate with `m` (`import * as m from 'motion/react-m'`), not `motion`: `m` carries
 * no features of its own, and the root's `LazyMotion` loads them (`loadMotionFeatures`) once the
 * page is up. A list that animates layout wraps itself in `<LazyMotion features={loadLayoutFeatures}>`.
 */
export const loadMotionFeatures = () => import('./motion-dom.ts').then((m) => m.default)
export const loadLayoutFeatures = () => import('./motion-max.ts').then((m) => m.default)
const seconds = (ms: number): number => ms / 1000

export const ease = {
  out: tokens.ease.out as [number, number, number, number],
  inOut: tokens.ease.inOut as [number, number, number, number],
  in: tokens.ease.in as [number, number, number, number],
}

export const duration = {
  tap: seconds(tokens.duration.tap),
  feedback: seconds(tokens.duration.feedback),
  state: seconds(tokens.duration.state),
  move: seconds(tokens.duration.move),
  enter: seconds(tokens.duration.enter),
}

/** A panel arriving from the right edge: the side rail, the copilot. */
export const slideFromRight = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: { duration: duration.move, ease: ease.out } },
  exit: { opacity: 0, x: 16, transition: { duration: duration.state, ease: ease.in } },
}

/** Content replacing a skeleton: a short fade, no travel, so a table never jumps. */
export const settle = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.state, ease: ease.out } },
}

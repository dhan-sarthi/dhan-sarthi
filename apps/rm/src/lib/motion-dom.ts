/**
 * The animation features every `m` component needs (opacity, transforms, exit, gestures), in a
 * chunk of their own: `App.tsx`'s `LazyMotion` loads it after the first paint, so the motion
 * engine never sits in the entry the sign-in page waits for.
 */
export { domAnimation as default } from 'motion/react'

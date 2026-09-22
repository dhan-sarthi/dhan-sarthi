// Content arriving, and content changing places.
//
// Two jobs, because they are two different statements. `Reveal` is a thing appearing on a
// screen that did not have it: it rises 25pt and fades, staggered against its siblings so a
// card of six rows reads as a list being dealt rather than as six things blinking at once.
// `Pane` is a thing *replacing* another thing: it enters from the side the customer tapped,
// so switching from Overview to Budget moves left-to-right and switching back moves the other
// way. The direction is the only reason the animation is there — a pane that always slid the
// same way would be decoration, and one that slides the right way is a map.
//
// Reduce Motion is handled by hand rather than left to Reanimated's default, which disables
// an entering animation outright. Someone who asked for less movement did not ask for content
// to teleport: they get the fade with the travel removed (`flat`, in motion.ts), which still
// says "this is new" and still distinguishes an arrival from something that was always there.
import type { ReactNode } from 'react'
import Animated, { FadeInDown, FadeInLeft, FadeInRight, FadeOutUp } from 'react-native-reanimated'
import { dur, easeOut, flat, flatOut, stagger, useReducedMotion } from '~/ui/motion'

/**
 * One item arriving. `i` is its position among siblings — pass the map index and the stagger
 * takes care of itself, including the cap that stops a long list turning into a queue.
 *
 * `exiting` is for the item that also leaves: a control that hands over to the next step, a
 * card dismissed. It goes the way it came, up and out, on the state clock rather than the
 * entrance's — leaving should be quicker than arriving, because nothing new needs reading.
 */
export function Reveal({
  children,
  i = 0,
  delay = 0,
  exiting = false,
  className,
}: {
  children: ReactNode
  i?: number
  delay?: number
  exiting?: boolean
  className?: string
}) {
  const reduced = useReducedMotion()
  const wait = delay + stagger(i)
  return (
    <Animated.View
      entering={reduced ? flat(wait) : FadeInDown.delay(wait).duration(dur.enter).easing(easeOut)}
      exiting={
        exiting ? (reduced ? flatOut(0) : FadeOutUp.duration(dur.state).easing(easeOut)) : undefined
      }
      className={className}
    >
      {children}
    </Animated.View>
  )
}

/**
 * A pane replacing the pane before it.
 *
 * Mount this with `key` set to the pane's own name — the remount is what triggers the entrance,
 * and without the key React reconciles the two panes into one and nothing moves. `dir` is the
 * sign of (new index − old index); `useDirection` below keeps that bookkeeping out of screens.
 */
export function Pane({
  children,
  dir,
  className,
}: {
  children: ReactNode
  dir: number
  className?: string
}) {
  const reduced = useReducedMotion()
  if (reduced) {
    return (
      <Animated.View entering={flat(0)} className={className}>
        {children}
      </Animated.View>
    )
  }
  const from = dir >= 0 ? FadeInRight : FadeInLeft
  return (
    <Animated.View entering={from.duration(dur.move).easing(easeOut)} className={className}>
      {children}
    </Animated.View>
  )
}

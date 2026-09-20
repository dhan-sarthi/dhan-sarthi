// Moving between tabs.
//
// The five tabs are an ordered row — Spend · Plan · Uday · Grow · Protect — and the tab bar
// draws them in that order, so moving from Spend to Plan is a move to the right whether or not
// the screen says so. Until now it did not say so: the scene was swapped between two frames and
// the only thing that moved was the plate in the bar. That is the gap between navigating and
// the screen simply being replaced.
//
// The navigator hands each scene a `progress` of -1, 0 or +1 for its position relative to the
// tab you are on, which is the direction already computed. The outgoing screen slides out the
// way you came from and the incoming one arrives from the way you are going, both fading. Two
// screens counter-moving is a stronger continuity cue than one entering alone, and it is the
// same relationship the pill panes inside each tab already use — switching Overview → Debt and
// switching Spend → Plan now read as the same gesture at two scales.
//
// 24pt, matching the pane travel, so the app has one distance for "moved sideways". And
// `state` rather than `move` for the duration: `move` is for something carrying content across
// a screen, where this is a short shift on the most frequent navigation in the app. 320ms on
// every tab tap is a tax; 220ms reads as motion without ever being in the way.
import type { Animated } from 'react-native'
import { dur, native } from '~/ui/motion'

const TRAVEL = 24

/**
 * Structural typing rather than an import from `@react-navigation/bottom-tabs`.
 *
 * Same reason `TabBar` derives its props from the `tabBar` slot: expo-router bundles its own
 * copy of the bottom-tabs types, and importing them directly gives two declarations TypeScript
 * considers unrelated. Describing the shape the navigator actually passes sidesteps the whole
 * problem and stays correct as long as that shape does.
 */
type SceneProps = { current: { progress: Animated.Value } }

export function tabScene({ current }: SceneProps) {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
      }),
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-TRAVEL, 0, TRAVEL],
          }),
        },
      ],
    },
  }
}

/**
 * The Reduce Motion alternative: the cross-fade without the travel.
 *
 * React Navigation does not consult the accessibility setting for this the way Reanimated does
 * for everything else in the app, so the choice is made in the layout and handed in. The fade
 * stays because it is doing work — it is what tells you the screen changed at all when the
 * only other signal is a 40pt plate filling in the bar.
 */
export function tabSceneReduced({ current }: SceneProps) {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
      }),
    },
  }
}

/**
 * `easeInOut`, and this is the one place in the app that wants it.
 *
 * Everything else here arrives from nowhere and gets the confident deceleration of `easeOut`. A
 * tab scene is different: it travels between two known positions, and both ends of the journey
 * are real. A symmetric curve is what that looks like — the outgoing screen gathers speed as it
 * leaves instead of easing away as though it had changed its mind.
 */
export const tabTransitionSpec = {
  animation: 'timing' as const,
  config: { duration: dur.state, easing: native.easeInOut },
}

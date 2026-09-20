// Everything you can press.
//
// The app was built on `active:opacity-70`, which is what a web pressable does and what a
// native one never does. Opacity alone makes a control look *switched off* for the duration
// of the touch; what iOS actually does is take the surface slightly away from you and spring
// it back, so the control stays solid and still answers. That difference is most of the gap
// between "a React Native app" and "an app".
//
// The scale is 3% and the spring is tight enough not to overshoot, because a button that
// wobbles under a finger reads as latency. Releasing is the same spring, which means a
// double-tap interrupts cleanly instead of queueing.
//
// Haptics are declared here rather than in every call site's onPress, so the vocabulary stays
// consistent: `selection` for choosing between things, `light` for committing to one, `none`
// for navigation and for anything that already fires its own.
import { forwardRef } from 'react'
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { PRESS_SCALE, to } from '~/ui/motion'

/** Exported only so `interop.ts` can register it; every consumer should use `Tap`. */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export type TapProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: React.ReactNode
  className?: string
  /**
   * A plain style, for the handful of measurements that are runtime numbers rather than tokens —
   * the send button is one control-height square, and `control.height` is a value, not a class.
   * It is composed *under* the press transform, so it can size the target without fighting it.
   */
  style?: StyleProp<ViewStyle>
  /** How far the surface goes away. Large surfaces need less than small ones to read the same. */
  scale?: number
  haptic?: 'selection' | 'light' | 'none'
  /** Dims as well as scales — for text-only targets, where 3% of nothing is nothing. */
  dim?: boolean
}

export const Tap = forwardRef<View, TapProps>(function Tap(
  {
    children,
    className,
    style,
    scale = PRESS_SCALE,
    haptic = 'none',
    dim = false,
    onPress,
    onPressIn,
    onPressOut,
    disabled,
    ...rest
  },
  ref,
) {
  const held = useSharedValue(0)

  const pressed = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - held.value * (1 - scale) }],
    ...(dim ? { opacity: 1 - held.value * 0.35 } : {}),
  }))

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={(e) => {
        held.value = to.press(1)
        onPressIn?.(e)
      }}
      onPressOut={(e) => {
        held.value = to.press(0)
        onPressOut?.(e)
      }}
      onPress={(e) => {
        if (haptic === 'selection') void Haptics.selectionAsync()
        else if (haptic === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress?.(e)
      }}
      style={[style, pressed]}
      className={className}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  )
})

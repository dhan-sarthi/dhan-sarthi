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
//
// Targets. Anything a finger is meant to hit is 44pt on both axes. A Tap whose visible box is
// smaller than that — a 36pt glyph plate, a 40pt header button — carries `hitSlop` so the
// target still reaches 44: `hitSlop={4}` on a 36pt plate, `{2}` on a 40pt one. The box stays
// the size the design drew; the target is the size the finger needs.
//
// Links. `href` is a destination outside the app — a bureau's free-report page, the bank's own
// site. With no `onPress` the press opens it, and `onOpenFail` is where the honest message goes
// when nothing on the device can: this file cannot import the toast, so a consumer passes
// `() => toast.show("Couldn't open the link")` and MenuRow does it for its rows.
//
// Focus, on the web. `global.css` rings whatever the keyboard reaches in 2pt of ink, and that
// ring stays — someone tabbing needs to see where they are. What it must not do is land on a
// control nobody chose. A dialog focuses the first thing in it that takes focus, and in a sheet
// or a gate that is the × — a dark square round the close button before the customer has
// touched anything. So the sheet itself takes that first focus instead: `DIALOG_FOCUS` and
// `NO_RING` on the container, which is focusable, never tabbed to, and never ringed.
import { forwardRef } from 'react'
import {
  Linking,
  Platform,
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

const web = Platform.OS === 'web'

/**
 * Spread on the container a dialog should open on — the sheet's card, a gate's screen. On the
 * web it can be focused but is never tabbed to, so the dialog's first focus lands on it and not
 * on the ×. Pair it with `NO_RING` in the same container's style. Nothing on a phone.
 */
export const DIALOG_FOCUS: { tabIndex?: -1 } = web ? { tabIndex: -1 } : {}

/** The container is not a control, and a ring round it would outline the whole sheet. */
export const NO_RING: ViewStyle | undefined = web
  ? { outlineStyle: 'solid', outlineWidth: 0 }
  : undefined

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
  /** A URL outside the app, opened on press when there is no `onPress`. */
  href?: string
  /** Called when `href` could not be opened — nothing on the device handles it. */
  onOpenFail?: () => void
}

/**
 * Open a URL outside the app. Resolves false rather than throwing when nothing can open it,
 * because the caller's next move is a message, not a stack trace.
 */
export async function openExternal(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url)
    return true
  } catch {
    return false
  }
}

export const Tap = forwardRef<View, TapProps>(function Tap(
  {
    children,
    className,
    style,
    scale = PRESS_SCALE,
    haptic = 'none',
    dim = false,
    href,
    onOpenFail,
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
        if (onPress) onPress(e)
        else if (href) {
          void openExternal(href).then((opened) => {
            if (!opened) onOpenFail?.()
          })
        }
      }}
      style={[style, pressed]}
      className={className}
      {...rest}
      accessibilityRole={rest.accessibilityRole ?? (href ? 'link' : undefined)}
    >
      {children}
    </AnimatedPressable>
  )
})

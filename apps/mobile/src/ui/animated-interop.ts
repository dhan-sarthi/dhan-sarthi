// Reanimated's components, registered with NativeWind: the web's half.
//
// The web renders classes as CSS and never meets the style merge that breaks them on a phone
// (`animated-interop.native.ts`), so a plain registration is all it needs.
import { cssInterop } from 'nativewind'
import Animated from 'react-native-reanimated'
import { AnimatedPressable } from '~/ui/Tap'

export function registerAnimated(): void {
  for (const Base of [Animated.View, Animated.Text, AnimatedPressable]) {
    cssInterop(Base, { className: 'style' })
  }
}

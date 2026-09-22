// Teaching NativeWind about components it did not ship.
//
// className is a compile-time rewrite onto `style`, and NativeWind only applies it
// to the React Native core components it registers itself. Anything from a library —
// SafeAreaView, Reanimated's animated views, expo-image — silently drops the prop and
// renders unstyled, which looks like a layout bug rather than a missing registration.
// Registering them here, once, imported before any screen renders.
import { cssInterop } from 'nativewind'
import Animated from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'

const asStyle = { className: 'style' } as const

cssInterop(SafeAreaView, asStyle)
cssInterop(Animated.View, asStyle)
cssInterop(Animated.Text, asStyle)
cssInterop(Image, asStyle)

// The press-scale pressable behind every tappable surface. A Reanimated wrapper around a core
// component is still a library component as far as NativeWind is concerned, so without this
// line every button in the app loses its padding, radius and fill at once.
import { AnimatedPressable } from '~/ui/Tap'
cssInterop(AnimatedPressable, asStyle)

// The gradient scrims on the welcome carousel are positioned with plain styles, but
// registering it keeps className usable if a later screen wants one in flow.
import { LinearGradient } from 'expo-linear-gradient'
cssInterop(LinearGradient, asStyle)

// What is deliberately NOT registered, and why it stays that way.
//
// react-native-svg's `Svg`, `Path`, `Circle`, `RadialGradient` and its own `LinearGradient`.
// A `className` on any of them is silently dropped: NativeWind can only rewrite it onto
// `style`, and an SVG primitive takes its fill, stroke and stop colours from attributes that
// a style never reaches. Registering them would make a class that does nothing look like one
// that should. So ScoreGlow, Arc, ChatCanvas and the Pills edge fade position their SVG with
// `style` / `StyleSheet.absoluteFill` and colour it with runtime values from `@dhan/design`.

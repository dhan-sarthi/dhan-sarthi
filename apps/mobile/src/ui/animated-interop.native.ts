// Reanimated's components, registered with NativeWind: the phone's half, and the one thing
// NativeWind gets wrong about them there.
//
// NativeWind folds everything in `style` into one object along with the classes. Reanimated then
// finds `useAnimatedStyle`'s handle by its `viewDescriptors` key, and when that key is on the one
// object it drops the object whole (`filterOutAnimatedStyles`, react-native-reanimated 4.5): the
// animation still runs, and every class on the element is gone. So on the APK every button was a
// bare label with no fill, padding or radius, and every progress fill was invisible, while the web
// target, which never takes this path, looked exactly right.
//
// The fix keeps the handles out of NativeWind's reach: they are lifted off `style` before the
// classes are computed and put back after, as separate entries, which is the shape Reanimated
// filters correctly. The wrapper goes straight into the map NativeWind's JSX runtime reads, so
// every `<Animated.View className …>` in the app gets it with no change at the call site.
import { createElement, forwardRef, type ComponentType } from 'react'
import { cssInterop } from 'nativewind'
// Not on the package's public surface, but it is the very map NativeWind's JSX runtime reads to
// swap a component for its styled wrapper (`react-native-css-interop/dist/runtime/wrap-jsx.js`).
import { interopComponents } from 'react-native-css-interop/dist/runtime/native/api'
import Animated from 'react-native-reanimated'
import { AnimatedPressable } from '~/ui/Tap'
import { liftAnimated } from '~/lib/animated-style'

type Props = { style?: unknown; animatedStyles?: unknown[] } & Record<string, unknown>

function keepAnimatedStylesApart(Base: ComponentType<Props>, name: string): void {
  // What NativeWind wraps: it arrives with the classes already folded into `style` and puts the
  // handles back after them. `cssInterop: false` is NativeWind's own opt-out, and it is needed
  // even with `createElement`: NativeWind's Babel plugin rewrites that too, and without the flag
  // `Base` is swapped straight back for `Outer` and the two render each other until the phone
  // runs out of memory.
  const Inner = forwardRef<unknown, Props>(function Inner({ animatedStyles, style, ...rest }, ref) {
    // forwardRef's prop mapping widens this to `unknown`; `Outer` below only ever passes an array.
    const handles = animatedStyles as unknown[] | undefined
    const merged = handles?.length ? [style, ...handles] : style
    return createElement(Base, { ...rest, style: merged, ref, cssInterop: false })
  })
  const Styled = cssInterop(Inner, { className: 'style' }) as unknown as ComponentType<Props>
  const Outer = forwardRef<unknown, Props>(function Outer({ style, ...rest }, ref) {
    const { plain, animated } = liftAnimated(style)
    return createElement(Styled, {
      ...rest,
      style: plain.length <= 1 ? plain[0] : plain,
      animatedStyles: animated,
      ref,
    })
  })
  Outer.displayName = `AnimatedInterop.${name}`
  interopComponents.set(Base, Outer as ComponentType<object>)
}

export function registerAnimated(): void {
  keepAnimatedStylesApart(Animated.View as unknown as ComponentType<Props>, 'View')
  keepAnimatedStylesApart(Animated.Text as unknown as ComponentType<Props>, 'Text')
  keepAnimatedStylesApart(AnimatedPressable as unknown as ComponentType<Props>, 'Pressable')
}

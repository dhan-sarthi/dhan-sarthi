// Telling Reanimated's animated-style handles apart from ordinary styles.
//
// `useAnimatedStyle` hands back a handle, not a style, and Reanimated recognises it by its
// `viewDescriptors` key. `src/ui/animated-interop.native.ts` lifts the handles off a `style` prop
// before NativeWind folds the classes in, and puts them back after, because a handle folded into
// the same object as the classes makes Reanimated drop the whole object. Pure, so it is tested
// here rather than on a phone.

/** A handle from `useAnimatedStyle`, by the key Reanimated itself checks for. */
export function isAnimatedStyle(style: unknown): boolean {
  return typeof style === 'object' && style !== null && 'viewDescriptors' in style
}

/**
 * A `style` prop split into what NativeWind may merge (`plain`, in its original order) and
 * Reanimated's handles (`animated`). Nested arrays are flattened, as React Native flattens them;
 * `null`, `undefined` and `false`, which a conditional style leaves behind, are dropped.
 */
export function liftAnimated(style: unknown): { plain: unknown[]; animated: unknown[] } {
  const plain: unknown[] = []
  const animated: unknown[] = []
  const visit = (s: unknown): void => {
    if (Array.isArray(s)) for (const inner of s) visit(inner)
    else if (isAnimatedStyle(s)) animated.push(s)
    else if (s != null && s !== false) plain.push(s)
  }
  visit(style)
  return { plain, animated }
}

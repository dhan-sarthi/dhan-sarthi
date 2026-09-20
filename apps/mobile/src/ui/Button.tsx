// The pill button.
//
// One height, one radius, three intents. Cleo's primary is a full-width ink pill
// pinned to the bottom of the step; secondary is the same pill with a hairline and
// no fill. Nothing in this flow needs a third size, so there isn't one.
//
// Two things move. The pill takes 3% off itself under a finger, which `Tap` handles for every
// pressable in the app. And the label and the spinner cross-fade in place rather than swapping,
// because a button whose contents are replaced between two frames reads as the button being
// rebuilt — the thing you pressed disappearing is the last thing you want to see after pressing
// it. They are stacked, so the pill also cannot change width when it starts working.
import { ActivityIndicator, View } from 'react-native'
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'
import { dur, timing } from '~/ui/motion'
import { color } from '@dhan/design'

type Variant = 'primary' | 'secondary' | 'light'

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  className,
}: {
  label: string
  onPress: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  className?: string
}) {
  const inert = disabled || loading
  const shell: Record<Variant, string> = {
    primary: inert ? 'bg-ink/30' : 'bg-ink',
    secondary: 'border border-ink bg-transparent',
    light: 'bg-ground',
  }
  const onDark = variant === 'primary'

  // A plain derived value, not a shared value seeded in an effect: there is nothing to get
  // wrong on the first frame here, because a button that mounts already loading should show
  // the spinner immediately rather than fade it in.
  const busy = useDerivedValue(() => withTiming(loading ? 1 : 0, timing(dur.feedback)), [loading])
  const word = useAnimatedStyle(() => ({ opacity: 1 - busy.value }))
  const spin = useAnimatedStyle(() => ({ opacity: busy.value }))

  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      haptic="light"
      onPress={onPress}
      className={cn(
        'h-control w-full flex-row items-center justify-center rounded-pill',
        shell[variant],
        className,
      )}
    >
      <View>
        <Animated.View style={word}>
          <Type role="heading" tone={onDark ? 'onInk' : 'ink'}>
            {label}
          </Type>
        </Animated.View>
        <Animated.View style={spin} className="absolute inset-0 items-center justify-center">
          <ActivityIndicator color={onDark ? color.onInk : color.ink} />
        </Animated.View>
      </View>
    </Tap>
  )
}

/** Stacks a primary over a secondary with the gap Cleo uses between them. */
export function ButtonStack({ children }: { children: React.ReactNode }) {
  return <View className="gap-md">{children}</View>
}

// The big selectable row.
//
// This is the workhorse of Cleo's onboarding: "What are you saving for?", "Pick your
// save hacks", the style chooser all use it. Title, optional description, and a radio
// on the right — selection is shown by the radio and a darkened border, never by
// filling the whole row, which would fight the saturated cards elsewhere in the app.
//
// The dot springs in from nothing rather than appearing. A radio is the one control in a form
// where the customer is looking directly at the thing that changes, so it is the one place
// worth spending a spring on — and the overshoot is what makes a choice feel taken rather than
// recorded. The ring darkens on the same beat so the two do not read as separate events.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { cn } from '~/ui/cn'
import { dur, timing, to } from '~/ui/motion'
import { color } from '@dhan/design'

export function SelectCard({
  title,
  description,
  selected,
  onPress,
  leading,
  divide = false,
}: {
  title: string
  description?: string
  selected: boolean
  onPress: () => void
  leading?: React.ReactNode
  divide?: boolean
}) {
  // Two clocks on purpose: the ring is a state change and takes the state duration, the dot is
  // a physical arrival and takes a spring. Running the dot on a timing curve makes it look
  // printed on; running the ring on a spring makes the border wobble.
  const on = useSharedValue(selected ? 1 : 0)
  const dot = useSharedValue(selected ? 1 : 0)

  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, timing(dur.state))
    dot.value = to.settle(selected ? 1 : 0)
  }, [selected, on, dot])

  const ring = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [color.inkFaint, color.ink]),
  }))
  const pip = useAnimatedStyle(() => ({
    transform: [{ scale: dot.value }],
    opacity: dot.value,
  }))

  return (
    <Tap
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      haptic="selection"
      onPress={onPress}
      scale={0.985}
      className={cn(
        'flex-row items-center gap-lg px-lg py-lg',
        divide && 'border-t border-hairline',
      )}
    >
      {leading}
      <View className="flex-1">
        <Type role="heading">{title}</Type>
        {description ? (
          <Type role="body" tone="soft" className="mt-[2px]">
            {description}
          </Type>
        ) : null}
      </View>
      <Animated.View
        style={ring}
        className="h-[22px] w-[22px] items-center justify-center rounded-pill border-2"
      >
        <Animated.View style={pip} className="h-[11px] w-[11px] rounded-pill bg-ink" />
      </Animated.View>
    </Tap>
  )
}

// The big selectable row.
//
// This is the workhorse of Cleo's onboarding: "What are you saving for?", "Pick your
// save hacks", the style chooser all use it. Title, optional description, and a radio
// on the right — selection is shown by the radio and a darkened border, never by
// filling the whole row, which would fight the saturated cards elsewhere in the app.
//
// Everything the row says is inside the one pressable, including the `badge` under the
// description. Cleo's "Recommended" chip sits inside the row it recommends, and a chip drawn as
// a sibling below the row is a strip of the card that looks tappable and is not. `value` is the
// figure a choice is worth ("₹1,200 saved"), set just before the radio so the eye meets it on the
// way to the answer.
//
// The title is a name, not a section: it is typeset at heading size and announced as text, so a
// list of five options does not put five entries in the headings rotor. The row announces itself
// as a radio that is checked or not, which is what a screen reader expects of one in a set, and
// it says what it is in words it chose — title, description, figure, badge — rather than
// whatever a reader collects from the children, which would include the letter on a merchant's
// plate in `leading`.
//
// The dot springs in from nothing rather than appearing. A radio is the one control in a form
// where the customer is looking directly at the thing that changes, so it is the one place
// worth spending a spring on — and the overshoot is what makes a choice feel taken rather than
// recorded. The ring darkens on the same beat so the two do not read as separate events.
import { isValidElement, useEffect, type ReactNode } from 'react'
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
  badge,
  value,
  disabled = false,
  divide = false,
}: {
  title: string
  description?: string
  selected: boolean
  onPress: () => void
  leading?: ReactNode
  /** A chip under the description, inside the row: "Recommended". */
  badge?: ReactNode
  /** A figure set just before the radio. */
  value?: string
  disabled?: boolean
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
      accessibilityLabel={[title, description, value, textOf(badge)].filter(Boolean).join(', ')}
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      disabled={disabled}
      haptic="selection"
      onPress={onPress}
      scale={0.985}
      className={cn(
        'flex-row items-center gap-lg px-lg py-lg',
        divide && 'border-t border-hairline',
        disabled && 'opacity-60',
      )}
    >
      {leading}
      <View className="flex-1">
        <Type role="heading" plain>
          {title}
        </Type>
        {description ? (
          <Type role="body" tone="soft" className="mt-xxs">
            {description}
          </Type>
        ) : null}
        {badge === undefined ? null : <View className="mt-sm self-start">{badge}</View>}
      </View>
      {value === undefined ? null : (
        <Type role="body" weight="semibold" plain>
          {value}
        </Type>
      )}
      <Animated.View
        style={ring}
        className="h-radio w-radio items-center justify-center rounded-pill border-2"
      >
        <Animated.View style={pip} className="h-radio-dot w-radio-dot rounded-pill bg-ink" />
      </Animated.View>
    </Tap>
  )
}

/**
 * The words in a badge — `<Chip>Recommended</Chip>` reads "Recommended" — so the row's one
 * announcement can carry them. Anything that is not text contributes nothing.
 */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(' ')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

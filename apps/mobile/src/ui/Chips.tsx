// A row of chips you choose one of.
//
// There are already two things in this app that look like this and neither of them is this.
// `Chip` is a badge: it is a static label with a tone and no press at all. `Pills` is a tab
// strip: it always has a selection, it reports the *direction* of the change so the pane
// underneath can enter from the right side, and it is full-bleed with its own gutter. What the
// save and challenge screens need is neither — a set of suggested amounts under a stepper
// where nothing is chosen until the customer chooses it, and where the answer can equally well
// be typed instead.
//
// Which is the whole reason `value` is `T | null`. A segmented control with no selection is a
// broken segmented control; a row of suggestions with none taken is the normal state of the
// screen, because the stepper above it already holds a number the customer may simply accept.
// And once they nudge the stepper off ₹500, the ₹500 chip has to let go — `value` being driven
// from the amount rather than from the last tap is what makes that fall out for free.
//
// `T extends string | number` so a chip row can be ₹500/₹1,000 or 7/14/21 days without the
// caller stringifying and re-parsing on the way back through `onChange`. The key has to be
// `String(value)` for the same reason: React keys are strings whatever you hand them, and
// leaving the coercion implicit is how 7 and '7' quietly become the same row.
//
// The fill/border/label interpolation is `Pills`'s, verbatim in intent — one shared value, one
// clock, the label crossing with the surface underneath it rather than snapping to a colour
// the background has not reached yet. Two things about it are different, and both follow from
// where these sit.
//
// The padding is `px-lg py-md` against `Pills`'s `px-lg py-sm`, because these are stand-alone
// targets in the body of a form rather than a strip riding under a title, and 46pt is the
// control height this app gives a thing you are meant to hit on the first try.
//
// The unselected fill is `groundDeep`, where a pill's is `surface`. A pill is always on the
// cream ground and white is what lifts it off; a chip row lands as often as not on a white
// card — under the stepper on the deposit sheet, inside the hack's own config card — and a
// white chip on a white card is an outline with nothing in it. `groundDeep` is the fill this
// app already gives an inactive plate in `GlyphPlate` and `StepDots`, and it reads as a
// chip on both surfaces rather than only on one.
import { useEffect } from 'react'
import { ScrollView } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Tap } from '~/ui/Tap'
import { ROLE } from '~/ui/Text'
import { dur, timing } from '~/ui/motion'
import { color } from '@dhan/design'

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T | null
  onChange: (v: T) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="flex-row items-center gap-sm"
      accessibilityRole="radiogroup"
      // A horizontal ScrollView is a flex child of a column parent and will grow to eat every
      // remaining pixel of height unless told not to. `Pills` documents this and it bites the
      // same way here: without these two the chips stretch to the bottom of the screen and the
      // note and the Save button below them are squeezed to nothing. No gutter on the content,
      // unlike `Pills` — this one sits inside a screen that already has one.
      style={{ flexGrow: 0, flexShrink: 0 }}
    >
      {options.map((o) => (
        <Choice
          key={String(o.value)}
          label={o.label}
          active={o.value === value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </ScrollView>
  )
}

function Choice({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  const on = useSharedValue(active ? 1 : 0)

  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, timing(dur.state))
  }, [active, on])

  const shell = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [color.groundDeep, color.ink]),
    borderColor: interpolateColor(on.value, [0, 1], [color.hairline, color.ink]),
  }))
  const text = useAnimatedStyle(() => ({
    color: interpolateColor(on.value, [0, 1], [color.inkMid, color.onInk]),
  }))

  return (
    <Tap
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      haptic="selection"
      onPress={onPress}
    >
      <Animated.View style={shell} className="rounded-pill border px-lg py-md">
        <Animated.Text style={text} className={ROLE.label}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Tap>
  )
}

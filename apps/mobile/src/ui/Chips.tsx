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
// the background has not reached yet. So is the overflow: four amounts at ₹5,000 do not fit a
// 320pt screen, and a row that clips its last chip at the gutter reads as a row with three.
// The strip bleeds to the screen edge, fades out at either edge while there is more beyond it,
// and scrolls the chosen chip into view — the same `EdgeFade` and `useScrollIntoView` the pills use, so
// the app has one fade, not two. `wrap` is the other answer, for a set that should be seen
// whole rather than scrolled: the credit bands break onto a second line instead.
//
// The chip is 46pt, the control height this app gives a thing you are meant to hit on the first
// try, because these are stand-alone targets in the body of a form rather than a strip riding
// under a title.
//
// The unselected fill is `groundDeep`, where a pill's is the raised near-white. A pill is always
// on the cream ground and the lift is what separates it; a chip row lands as often on a white
// card, and a white chip on a white card is an outline with nothing in it. `groundDeep` is the
// fill this app already gives an inactive plate in `GlyphPlate` and `StepDots`, and it reads as a
// chip on both surfaces rather than only on one.
import { useEffect } from 'react'
import { ScrollView, View, type LayoutChangeEvent } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Tap } from '~/ui/Tap'
import { FONT_CAP, ROLE } from '~/ui/Text'
import { EdgeFade, useScrollIntoView } from '~/ui/Pills'
import { cn } from '~/ui/cn'
import { dur, timing } from '~/ui/motion'
import { color, space } from '@dhan/design'

export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  wrap = false,
  bleed = true,
  fadeTo,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T | null
  onChange: (v: T) => void
  /** Break onto more lines instead of scrolling. */
  wrap?: boolean
  /**
   * Scroll edge to edge through the screen's 20pt gutter (the default). Off for a row that sits
   * inside something with its own padding, such as a card.
   */
  bleed?: boolean
  /** The colour the edges fade into, for a row on something other than the ground. */
  fadeTo?: string
}) {
  // The inset is the chip's own `px-lg`, so the left fade can tell a cut amount from a cut capsule.
  const { scrollRef, register, scrollTo, overflowLeft, overflowRight, reach, scrollProps } =
    useScrollIntoView(space.lg)

  useEffect(() => {
    if (value !== null && !wrap) scrollTo(String(value))
  }, [value, wrap, scrollTo])

  const choices = options.map((o) => (
    <Choice
      key={String(o.value)}
      label={o.label}
      active={o.value === value}
      onPress={() => onChange(o.value)}
      {...(wrap ? {} : { onLayout: register(String(o.value)) })}
    />
  ))

  if (wrap) {
    return (
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-sm">
        {choices}
      </View>
    )
  }

  return (
    // A horizontal ScrollView is a flex child of a column parent and will grow to eat every
    // remaining pixel of height unless told not to; the wrapper, which the fade is positioned
    // against, carries the same two. The 4pt of padding given back by the negative margin is
    // room for the web's focus ring, which the scroller would otherwise clip (see Pills).
    <View className={cn(bleed && '-mx-pad')} style={{ flexGrow: 0, flexShrink: 0 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        className="-my-xs"
        contentContainerClassName={cn('flex-row items-center gap-sm py-xs', bleed && 'px-pad')}
        style={{ flexGrow: 0, flexShrink: 0 }}
        {...scrollProps}
      >
        {choices}
      </ScrollView>
      <EdgeFade
        side="left"
        visible={overflowLeft}
        reach={reach}
        {...(fadeTo === undefined ? {} : { fadeTo })}
      />
      <EdgeFade visible={overflowRight} {...(fadeTo === undefined ? {} : { fadeTo })} />
    </View>
  )
}

function Choice({
  label,
  active,
  onPress,
  onLayout,
}: {
  label: string
  active: boolean
  onPress: () => void
  onLayout?: (e: LayoutChangeEvent) => void
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
      accessibilityState={{ checked: active }}
      aria-checked={active}
      accessibilityLabel={label}
      haptic="selection"
      hitSlop={4}
      onPress={onPress}
      {...(onLayout === undefined ? {} : { onLayout })}
      // For the web's focus ring, which takes the shape of the focused element (see Pills).
      className="rounded-pill"
    >
      <Animated.View
        style={shell}
        className="min-h-chip justify-center rounded-pill border px-lg py-md"
      >
        <Animated.Text
          style={text}
          className={ROLE.label}
          numberOfLines={1}
          maxFontSizeMultiplier={FONT_CAP.label}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Tap>
  )
}

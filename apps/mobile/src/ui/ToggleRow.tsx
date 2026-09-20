// The switch card at the top of every save-hack screen.
//
// Five config screens open with the same object: a circular mark, the hack's name, one line of
// what it does, and the switch that decides whether any of the controls below it matter. Cleo
// draw it as a ring rather than a filled card, and that is the right call — it sits directly
// under the screen's title on the cream ground, and a white fill there would read as the first
// item of a list rather than as the screen's own subject. So the card has no background at all
// and takes whatever surface it is dropped on.
//
// What changes when it is on is the ring and the plate, together, on one clock. The ring goes
// hairline → ink and the plate goes ground → lime, which is the same pair of moves the whole
// app uses to say "this one is live": the pill in `Pills`, the plate in `checklist`. Two
// separate timings would drift on a slow frame and the ring would land before the plate, which
// reads as the card thinking about it. One shared value drives both.
//
// Seeded at its resting state rather than at zero, for the reason `Pills` gives: a screen
// opened on a hack that is already on should show it already on, not spend `dur.state`
// switching itself on in front of a customer who did nothing.
//
// The switch is the only target. A row-wide `Tap` that flips it would be a bigger, kinder hit
// area and it is still wrong here: the invisible half of that target is the sentence explaining
// what the hack does, so a customer reading it with a finger resting on the card turns it on by
// accident — and with two routes to the same bit, a fast double tap races itself and lands on
// the value nobody asked for. The `Switch` is RN's own, with `set-limit.tsx`'s token colours,
// because a switch is the one control iOS customers can identify from across a room and a
// hand-drawn one only ever loses that.
import { useEffect } from 'react'
import { Switch, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Type } from '~/ui/Text'
import { Glyph, type GlyphName } from '~/ui/Glyph'
import { dur, timing } from '~/ui/motion'
import { color } from '@dhan/design'

export function ToggleRow({
  glyph,
  title,
  detail,
  value,
  onValueChange,
}: {
  glyph: GlyphName
  title: string
  detail: string
  value: boolean
  onValueChange: (v: boolean) => void
}) {
  const on = useSharedValue(value ? 1 : 0)

  useEffect(() => {
    on.value = withTiming(value ? 1 : 0, timing(dur.state))
  }, [value, on])

  // Both animated colours live here rather than in classes because a class cannot be
  // interpolated — this is the same exemption `Pills` takes, and the values still come from
  // tokens rather than from a hex written in this file.
  const ring = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [color.hairline, color.ink]),
  }))
  const plate = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [color.groundDeep, color.success]),
  }))

  return (
    <Animated.View
      style={ring}
      className="flex-row items-center gap-md rounded-lg border px-lg py-lg"
    >
      <Animated.View style={plate} className="h-9 w-9 items-center justify-center rounded-pill">
        <Glyph name={glyph} size={19} />
      </Animated.View>

      <View className="flex-1">
        <Type role="heading">{title}</Type>
        <Type role="body" tone="soft" className="mt-[2px]">
          {detail}
        </Type>
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={title}
        accessibilityHint={detail}
        trackColor={{ false: color.hairline, true: color.brand }}
        thumbColor={color.surface}
      />
    </Animated.View>
  )
}

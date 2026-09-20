// The segmented control at the top of a tab.
//
// Cleo uses free-standing pills rather than an enclosed segmented track: the selected
// one fills dark, the rest sit on the ground with no chrome at all. It reads lighter
// than a boxed control and it matches the tab bar, where filling also means "this one".
//
// Which is also why there is no sliding indicator here, tempting as one is. A single ink
// capsule travelling between positions is the signature of a *track*, and it would quietly
// undo the decision above — it also cannot work, because each pill owns an opaque white fill
// that an indicator would have to slide behind. So the fill itself animates in place: surface
// to ink, hairline to ink, and the label's colour crossing on the same clock, which is the
// part that matters. Swapping the label instantly would leave a light word on a cream pill
// for the third of a second the background takes to catch up.
//
// The change also reports its direction, because the pane underneath enters from the side the
// customer reached for. `Pills` is the only thing that knows the order of the options, so it
// is the only thing that can say which way "next" was.
import { useEffect, useState } from 'react'
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

export function Pills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (next: T, dir: number) => void
}) {
  const current = options.findIndex((o) => o.value === value)

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="flex-row items-center gap-sm px-pad"
      accessibilityRole="tablist"
      // A horizontal ScrollView is still a flex child of a column parent, and it will
      // grow to eat every remaining pixel of height unless told not to. Without these two
      // the pills stretch the full screen and squeeze everything below them to nothing.
      style={{ flexGrow: 0, flexShrink: 0 }}
    >
      {options.map((o, i) => (
        <Pill
          key={o.value}
          label={o.label}
          active={o.value === value}
          onPress={() => onChange(o.value, Math.sign(i - current))}
        />
      ))}
    </ScrollView>
  )
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  // One progress value drives fill, border and label together. Three separate timings would
  // drift apart on a slow frame and the word would sit on the wrong colour. It is seeded at its
  // resting state so the pill a screen opens on is already filled, rather than filling itself
  // in front of the customer every time the tab mounts.
  const on = useSharedValue(active ? 1 : 0)
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, timing(dur.state))
  }, [active, on])

  const shell = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [color.surface, color.ink]),
    borderColor: interpolateColor(on.value, [0, 1], [color.hairline, color.ink]),
  }))
  const text = useAnimatedStyle(() => ({
    color: interpolateColor(on.value, [0, 1], [color.inkMid, color.onInk]),
  }))

  return (
    <Tap
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      haptic="selection"
      onPress={onPress}
    >
      <Animated.View style={shell} className="rounded-pill border px-lg py-sm">
        <Animated.Text style={text} className={ROLE.label}>
          {label}
        </Animated.Text>
      </Animated.View>
    </Tap>
  )
}

/**
 * The bookkeeping every paned screen would otherwise repeat: which pane is showing, and which
 * way the last change went so the pane can enter from that side.
 *
 * Both live in one state object on purpose. Two `useState`s would commit in two renders and
 * the entering animation would read the previous direction for a frame — which is exactly the
 * frame it runs in.
 */
export function usePane<T extends string>(
  initial: T,
): {
  pane: T
  dir: number
  set: (next: T, dir: number) => void
} {
  const [state, setState] = useState<{ pane: T; dir: number }>({ pane: initial, dir: 0 })
  return {
    pane: state.pane,
    dir: state.dir,
    set: (next: T, dir: number) => setState({ pane: next, dir }),
  }
}

// The segmented control at the top of a tab.
//
// Cleo uses free-standing pills rather than an enclosed segmented track: the selected
// one fills dark, the rest sit on the ground as flat off-white capsules with no stroke at
// all. It reads lighter than a boxed control and it matches the tab bar, where filling also
// means "this one".
//
// Which is also why there is no sliding indicator here, tempting as one is. A single ink
// capsule travelling between positions is the signature of a *track*, and it would quietly
// undo the decision above — it also cannot work, because each pill owns an opaque fill that
// an indicator would have to slide behind. So the fill itself animates in place: off-white to
// ink, and the label's colour crossing on the same clock, which is the part that matters.
// Swapping the label instantly would leave a light word on a cream pill for the third of a
// second the background takes to catch up.
//
// The change also reports its direction, because the pane underneath enters from the side the
// customer reached for. `Pills` is the only thing that knows the order of the options, so it
// is the only thing that can say which way "next" was.
//
// Four pills fit at 375pt; five do not, and a strip that scrolls has to say so. Each edge fades
// to the ground while a pill runs past it — the right one at rest, the left one once the strip
// has moved — and the selected pill is scrolled into the middle, so a pane reached by a link
// ("/grow?pane=invest") opens with its pill in view. The two edges are not mirror images,
// because we read from the left. A word cut on the right still starts, and "Holdin" fading out
// reads as more to come. A word cut on the left starts mid-word, and at 320pt the strip parked
// on Invest showed "hallenges" behind a fade that only reached the first letter. So the left
// fade reaches over a pill whose words it would cut, to that pill's far end, and what shows is
// the tail of a capsule dissolving into the ground. A pill whose words start clear of the
// fade's dense half is left alone. Both are exported, because the amount chips on the save
// screens have the same problem and should not draw a second fade.
//
// Below 360pt the capsules give up 4pt a side, so Spend's four still fit a 320pt phone. Without
// that, four pills overran 320 by about 20pt, and the strip scrolled that far to show Credit and
// parked "Overview" under the left fade, reading as "verview". Five pills scroll at any width.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ScrollView,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import Animated, {
  type SharedValue,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Tap } from '~/ui/Tap'
import { ROLE } from '~/ui/Text'
import { cn } from '~/ui/cn'
import { dur, timing, useReducedMotion } from '~/ui/motion'
import { color, space } from '@dhan/design'

/** The window width under which a pill trims its sides: 360 holds four at 12pt, 320 does not. */
const NARROW = 360

/** How far an edge fade reaches when nothing is cut under it. */
const FADE = space.xxl
/** The furthest the left fade will reach to swallow a cut pill: the longest pill, with room. */
const REACH_MAX = space.xxl * 3

export function Pills<T extends string>({
  options,
  value,
  onChange,
  fadeTo,
}: {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (next: T, dir: number) => void
  /** The colour the edges fade into, for a strip on something other than the ground. */
  fadeTo?: string
}) {
  const current = options.findIndex((o) => o.value === value)
  const narrow = useWindowDimensions().width < NARROW
  const { scrollRef, register, scrollTo, overflowLeft, overflowRight, reach, scrollProps } =
    useScrollIntoView<T>(narrow ? space.sm : space.md)

  useEffect(() => {
    scrollTo(value)
  }, [value, scrollTo])

  return (
    // A horizontal ScrollView is still a flex child of a column parent, and it will grow to
    // eat every remaining pixel of height unless told not to. Without these two the pills
    // stretch the full screen and squeeze everything below them to nothing. The wrapper is
    // what the fade is positioned against, so it carries the same two.
    //
    // The strip is 4pt taller than its pills on each side and gives the room straight back with
    // a negative margin, so nothing moves. A scroller clips what overflows it, and on the web
    // that is the focus ring drawn round the pill the keyboard is on — without the room it shows
    // as two bars either side of the pill.
    <View style={{ flexGrow: 0, flexShrink: 0 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-my-xs"
        contentContainerClassName="flex-row items-center gap-sm px-pad py-xs"
        accessibilityRole="tablist"
        style={{ flexGrow: 0, flexShrink: 0 }}
        {...scrollProps}
      >
        {options.map((o, i) => (
          <Pill
            key={o.value}
            label={o.label}
            active={o.value === value}
            narrow={narrow}
            onLayout={register(o.value)}
            onPress={() => onChange(o.value, Math.sign(i - current))}
          />
        ))}
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

function Pill({
  label,
  active,
  narrow,
  onPress,
  onLayout,
}: {
  label: string
  active: boolean
  narrow: boolean
  onPress: () => void
  onLayout: (e: LayoutChangeEvent) => void
}) {
  // One progress value drives fill, border and label together. Three separate timings would
  // drift apart on a slow frame and the word would sit on the wrong colour. It is seeded at its
  // resting state so the pill a screen opens on is already filled, rather than filling itself
  // in front of the customer every time the tab mounts.
  const on = useSharedValue(active ? 1 : 0)
  useEffect(() => {
    on.value = withTiming(active ? 1 : 0, timing(dur.state))
  }, [active, on])

  // The border is drawn in the fill colour at both ends. It is there so the pill's height is
  // the same 44 whether or not it is selected; it is never meant to be seen.
  const shell = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [color.surfaceRaised, color.ink]),
    borderColor: interpolateColor(on.value, [0, 1], [color.surfaceRaised, color.ink]),
  }))
  const text = useAnimatedStyle(() => ({
    color: interpolateColor(on.value, [0, 1], [color.inkMid, color.onInk]),
  }))

  return (
    <Tap
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      aria-selected={active}
      accessibilityLabel={label}
      haptic="selection"
      onPress={onPress}
      onLayout={onLayout}
      // The capsule is drawn by the view inside; the radius here is for the web's focus ring,
      // which follows the shape of the element that holds focus.
      className="rounded-pill"
    >
      <Animated.View
        style={shell}
        className={cn('rounded-pill border py-md', narrow ? 'px-sm' : 'px-md')}
      >
        <Animated.Text
          style={text}
          className={ROLE.label}
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Tap>
  )
}

/**
 * Keeps one item of a horizontal strip in view, and knows when the strip runs off either edge.
 *
 * `register(key)` is the item's `onLayout`; `scrollTo(key)` centres it, without travel on the
 * first call (a cold open should simply *be* in the right place) and with travel after that,
 * unless the system asked for none. `scrollProps` spread onto the ScrollView, beside `scrollRef`.
 * `reach` is how far the left fade should run; hand it to the left `EdgeFade`. `inset` is the
 * padding inside an item before its words start, which is how the reach tells a capsule cut
 * at its edge from a word cut in half.
 *
 * Layout events land after the first effect, so a key asked for before the strip or the item
 * has been measured is held and honoured by whichever measurement arrives last. Without that,
 * "/grow?pane=invest" on a cold start would ask for a position nothing knew yet and open on
 * Save with Invest filled somewhere off the edge.
 */
export function useScrollIntoView<K extends string = string>(inset = 0) {
  const scrollRef = useRef<ScrollView>(null)
  const items = useRef(new Map<K, { x: number; width: number }>())
  const frame = useRef({ width: 0, content: 0, x: 0 })
  const pending = useRef<K | null>(null)
  const placed = useRef(false)
  const shown = useRef(false)
  const [overflowLeft, setOverflowLeft] = useState(false)
  const [overflowRight, setOverflowRight] = useState(false)
  const reach = useSharedValue<number>(FADE)
  const reduced = useReducedMotion()

  const measure = useCallback(() => {
    const { width, content, x } = frame.current
    const laid = [...items.current.values()]
    // Four points of slack: a strip that is a hair wider than its frame is not a strip with
    // more to the right, and a fade that flickers at rest is worse than none. Once the items are
    // measured the question is whether one of them runs past the edge, not whether the strip
    // has moved: a strip nudged a few points into its own gutter has nothing to fade.
    const start = Math.min(...laid.map((i) => i.x))
    const end = Math.max(...laid.map((i) => i.x + i.width))
    const left = width > 0 && (laid.length > 0 ? start < x - 4 : x > 4)
    const right = width > 0 && (laid.length > 0 ? end > x + width + 4 : content - width - x > 4)
    setOverflowRight(right)
    setOverflowLeft(left)
    const target = leftReach(x, laid, inset)
    // A fade that is coming in arrives at its width; one already showing eases to the new one,
    // because the reach jumps when the edge moves from one pill to the next. `set`, not
    // `.value =`: this runs in a callback, where the compiler will not let a hook's value mutate.
    reach.set(shown.current && left ? withTiming(target, timing(dur.state)) : target)
    shown.current = left
  }, [inset, reach])

  const attempt = useCallback((key: K, animated: boolean) => {
    const item = items.current.get(key)
    const { width, content } = frame.current
    if (item === undefined || width === 0 || content === 0) {
      pending.current = key
      return
    }
    pending.current = null
    // Clamped to what the strip can actually scroll, so centring a pill that already fits
    // never asks the ScrollView to bounce past its end.
    const max = Math.max(0, content - width)
    const x = Math.min(max, Math.max(0, item.x - (width - item.width) / 2))
    scrollRef.current?.scrollTo({ x, animated })
  }, [])

  const scrollTo = useCallback(
    (key: K) => {
      const animated = placed.current && !reduced
      placed.current = true
      attempt(key, animated)
    },
    [attempt, reduced],
  )

  const register = useCallback(
    (key: K) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout
      items.current.set(key, { x, width })
      measure()
      if (pending.current === key) attempt(key, false)
    },
    [attempt, measure],
  )

  const scrollProps = {
    onLayout: (e: LayoutChangeEvent) => {
      frame.current.width = e.nativeEvent.layout.width
      measure()
      if (pending.current !== null) attempt(pending.current, false)
    },
    onContentSizeChange: (width: number) => {
      frame.current.content = width
      measure()
      if (pending.current !== null) attempt(pending.current, false)
    },
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      frame.current.x = e.nativeEvent.contentOffset.x
      measure()
    },
    scrollEventThrottle: 16,
  }

  return { scrollRef, register, scrollTo, overflowLeft, overflowRight, reach, scrollProps }
}

/**
 * How far the left fade reaches with the strip scrolled to `x`.
 *
 * The first item still showing decides. If its words start in the light half of the fade, the
 * fade takes a letter's edge at most and the word still reads whole, so it keeps its own width.
 * If they start under the dense half, or the edge cuts them, the fade runs on to the item's far
 * end: the tail of a capsule dissolving says there is more to the left, where "hallenges" only
 * says something broke.
 */
function leftReach(
  x: number,
  laid: ReadonlyArray<{ x: number; width: number }>,
  inset: number,
): number {
  let first: { x: number; width: number } | null = null
  for (const item of laid) {
    if (item.x + item.width > x + 1 && (first === null || item.x < first.x)) first = item
  }
  if (first === null || first.x + inset >= x + FADE / 2) return FADE
  return Math.min(REACH_MAX, Math.max(FADE, first.x + first.width - x))
}

/**
 * The fade over one edge of a strip that has more beyond it — the right edge unless told otherwise.
 *
 * Positioned and coloured with plain props rather than classes: a gradient is a library
 * component and NativeWind drops a className on it (see interop.ts). It fades rather than
 * appears, because it comes and goes as the customer scrolls and a hard edge popping in at the
 * end of every drag reads as a glitch. Touches pass through it to the last pill.
 *
 * `reach` (from `useScrollIntoView`) lets it run further than its own 32pt. The extra is solid
 * ground at the edge and the ramp stays 32pt, so a long reach hides the cut words and keeps the
 * same soft end as a short one.
 */
export function EdgeFade({
  visible,
  fadeTo = color.ground,
  side = 'right',
  reach,
}: {
  visible: boolean
  fadeTo?: string
  side?: 'left' | 'right'
  reach?: SharedValue<number>
}) {
  const on = useSharedValue(visible ? 1 : 0)
  useEffect(() => {
    on.value = withTiming(visible ? 1 : 0, timing(dur.state))
  }, [visible, on])
  const style = useAnimatedStyle(() => ({
    opacity: on.value,
    width: reach === undefined ? FADE : Math.max(FADE, reach.value),
  }))

  return (
    <Animated.View
      style={[
        style,
        {
          position: 'absolute',
          top: 0,
          bottom: 0,
          [side]: 0,
          flexDirection: side === 'right' ? 'row-reverse' : 'row',
          pointerEvents: 'none',
        },
      ]}
    >
      <View style={{ flex: 1, backgroundColor: fadeTo }} />
      <LinearGradient
        colors={side === 'right' ? [color.groundFade, fadeTo] : [fadeTo, color.groundFade]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ width: FADE, flexShrink: 0 }}
      />
    </Animated.View>
  )
}

export type PaneState<T extends string> = {
  pane: T
  dir: number
  set: (next: T, dir: number) => void
}

/**
 * The bookkeeping every paned screen would otherwise repeat: which pane is showing, and which
 * way the last change went so the pane can enter from that side.
 *
 * Both live in one state object on purpose. Two `useState`s would commit in two renders and
 * the entering animation would read the previous direction for a frame — which is exactly the
 * frame it runs in.
 *
 * Given its `options`, the hook also reads `?pane=` (or `key`) from the route: a link from
 * another screen — "/spend?pane=credit", a notice that opens Grow on Challenges — lands on the
 * pane it names, on a cold open and on a push onto a tab that is already mounted. A value that
 * is not one of the options is ignored rather than trusted. The param is cleared the moment it
 * is adopted, so a pill the customer taps afterwards is never overridden by the stale link, and
 * the same pane can be asked for twice in a row. The one-argument form keeps compiling for a
 * screen that has not yet passed its options; it reads nothing.
 */
export function usePane<T extends string>(initial: T): PaneState<T>
export function usePane<T extends string>(
  initial: T,
  options: ReadonlyArray<{ value: T }>,
  key?: string,
): PaneState<T>
export function usePane<T extends string>(
  initial: T,
  options?: ReadonlyArray<{ value: T }>,
  key = 'pane',
): PaneState<T> {
  const [state, setState] = useState<{ pane: T; dir: number }>({ pane: initial, dir: 0 })
  const params = useLocalSearchParams()
  const navigation = useNavigation<{
    setParams: (params: Record<string, string | undefined>) => void
  }>()

  const raw = params[key]
  const asked = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined
  const wanted =
    options !== undefined && asked !== undefined && options.some((o) => o.value === asked)
      ? (asked as T)
      : null

  useEffect(() => {
    if (wanted === null || options === undefined) return
    setState((s) => {
      if (s.pane === wanted) return s
      const from = options.findIndex((o) => o.value === s.pane)
      const to = options.findIndex((o) => o.value === wanted)
      return { pane: wanted, dir: Math.sign(to - from) }
    })
    navigation.setParams({ [key]: undefined })
  }, [wanted, options, key, navigation])

  return {
    pane: state.pane,
    dir: state.dir,
    set: (next: T, dir: number) => setState({ pane: next, dir }),
  }
}

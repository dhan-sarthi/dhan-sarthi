// The five-tab bar.
//
// Cleo draws each destination as a ring with the mark inside and the label beneath, and
// marks the active one by filling the ring rather than by tinting the icon. Filling reads at
// a glance on a cream ground where a tint would not, and it is the same move the primary
// button makes — dark fill means "this one". The bar itself is white: on the cream ground
// the change of surface is the edge, and a hairline on top of it would be a second edge.
//
// Uday sits in the centre slot Cleo gives its assistant, and like Cleo's assistant his ring is
// an outline until you are on him. An earlier build kept his plate filled on every tab, on a
// builder's note that the avatar is the product's first person. Cleo parity replaced that: with
// two filled plates on every other tab, the one you are on was the hard one to find.
//
// The fill crosses rather than snaps, and the plate lifts 2pt as it takes the selection. Two
// pixels is under the threshold at which anyone would call it an animation, which is the point:
// a tab bar is furniture, and furniture that performs is furniture you notice instead of the
// screen. What it buys is continuity — the eye follows the fill from the old plate to the new
// one instead of re-finding it, and that is the difference between navigating and re-reading.
//
// Measured against Cleo's bar: 32pt rings at a 2pt stroke, a 13pt caption 8pt beneath, and a
// bar of about 70pt above the home indicator. The inactive ring and caption are `inkMid`, not
// the softer tint — 6.9:1 on white, and the resting tabs are still read by the customer who
// is deciding where to go next.
import { useEffect } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  type SharedValue,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import type { Tabs } from 'expo-router'
import { Tap } from '~/ui/Tap'
import { ROLE } from '~/ui/Text'
import { Glyph, type GlyphName } from '~/ui/Glyph'
import { dur, timing, to } from '~/ui/motion'
import { color } from '@dhan/design'

const MARKS: Record<string, { glyph: GlyphName; label: string }> = {
  spend: { glyph: 'spend', label: 'Home' },
  plan: { glyph: 'plan', label: 'Plan' },
  uday: { glyph: 'uday', label: 'Uday' },
  grow: { glyph: 'grow', label: 'Grow' },
  protect: { glyph: 'shield', label: 'Protect' },
}

// expo-router bundles its own copy of the bottom-tabs types, so importing them from
// @react-navigation directly gives two structurally-incompatible declarations. Deriving
// the props from the `tabBar` slot pins them to whatever this expo-router actually passes.
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]

export function TabBar({ state, navigation }: TabBarProps) {
  return (
    <SafeAreaView edges={['bottom']} className="bg-surface">
      <View className="flex-row items-start justify-around px-sm pt-sm pb-xs">
        {state.routes.map((route, i) => {
          const mark = MARKS[route.name]
          if (!mark) return null
          const focused = state.index === i

          return (
            <Destination
              key={route.key}
              mark={mark}
              focused={focused}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                })
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name)
              }}
            />
          )
        })}
      </View>
    </SafeAreaView>
  )
}

function Destination({
  mark,
  focused,
  onPress,
}: {
  mark: { glyph: GlyphName; label: string }
  focused: boolean
  onPress: () => void
}) {
  // One question, two clocks. `fill` darkens the plate and crosses on the state timing; `sel`
  // lifts the plate and darkens the caption on a spring, because the lift is weight settling
  // rather than a colour becoming true. Both are seeded at rest so a cold open does not animate.
  const fill = useSharedValue(focused ? 1 : 0)
  const sel = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    fill.value = withTiming(focused ? 1 : 0, timing(dur.state))
    sel.value = to.settle(focused ? 1 : 0)
  }, [focused, fill, sel])

  // The dark fill is a layer whose opacity animates, not an interpolated background colour:
  // the "off" end of that interpolation would have to be ink at zero alpha, and a hex written
  // into a component is exactly what tokens.json exists to prevent.
  const plate = useAnimatedStyle(() => ({
    borderColor: interpolateColor(fill.value, [0, 1], [color.inkMid, color.ink]),
    transform: [{ translateY: sel.value * -2 }],
  }))
  const ink = useAnimatedStyle(() => ({ opacity: fill.value }))
  const caption = useAnimatedStyle(() => ({
    color: interpolateColor(sel.value, [0, 1], [color.inkMid, color.ink]),
  }))

  return (
    <Tap
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      accessibilityLabel={mark.label}
      haptic="selection"
      onPress={onPress}
      scale={0.92}
      className="min-h-target flex-1 items-center gap-sm"
    >
      <Animated.View
        style={plate}
        className="h-plate-sm w-plate-sm items-center justify-center overflow-hidden rounded-pill border-2"
      >
        <Animated.View style={ink} className="absolute inset-0 bg-ink" />
        {/* The glyph is drawn twice and cross-faded rather than re-tinted, because an SVG
            stroke colour is a prop and a prop cannot be interpolated on the UI thread. Two
            20pt marks is a cheaper trade than dropping to the JS thread every frame. */}
        <Mark name={mark.glyph} on={fill} />
      </Animated.View>
      {/* Hidden from the reader: the Tap already carries the label, and a caption read as a
          second element makes every tab announce itself twice. */}
      <Animated.Text
        style={caption}
        className={ROLE.label}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {mark.label}
      </Animated.Text>
    </Tap>
  )
}

function Mark({ name, on }: { name: GlyphName; on: SharedValue<number> }) {
  const light = useAnimatedStyle(() => ({ opacity: on.value }))
  const dark = useAnimatedStyle(() => ({ opacity: 1 - on.value }))
  return (
    <View>
      <Animated.View style={dark}>
        <Glyph name={name} size={20} tint={color.inkMid} />
      </Animated.View>
      <Animated.View style={light} className="absolute">
        <Glyph name={name} size={20} tint={color.onInk} />
      </Animated.View>
    </View>
  )
}

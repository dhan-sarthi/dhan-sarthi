// The five-tab bar.
//
// Cleo draws each destination as a circular plate with the mark inside and the label
// beneath, and marks the active one by filling the plate rather than by tinting the
// icon. Filling reads at a glance on a cream ground where a tint would not, and it is
// the same move the primary button makes — dark fill means "this one".
//
// Uday sits in the centre slot Cleo gives its assistant. It keeps a filled plate even
// when inactive: the avatar is the product's first person, and the bar should say so.
//
// The fill crosses rather than snaps, and the plate lifts 2pt as it takes the selection. Two
// pixels is under the threshold at which anyone would call it an animation, which is the point:
// a tab bar is furniture, and furniture that performs is furniture you notice instead of the
// screen. What it buys is continuity — the eye follows the fill from the old plate to the new
// one instead of re-finding it, and that is the difference between navigating and re-reading.
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
    <SafeAreaView edges={['bottom']} className="border-t border-hairline bg-ground">
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
              // Uday's plate is filled whether or not you are on him.
              always={route.name === 'uday'}
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
  always,
  onPress,
}: {
  mark: { glyph: GlyphName; label: string }
  focused: boolean
  always: boolean
  onPress: () => void
}) {
  const filled = focused || always
  // Two values, because they answer two questions. `fill` is whether the plate is dark, which
  // Uday's is regardless. `sel` is whether this is the tab you are on, which is what the label
  // and the lift respond to — otherwise Uday would look permanently selected.
  const fill = useSharedValue(filled ? 1 : 0)
  const sel = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    fill.value = withTiming(filled ? 1 : 0, timing(dur.state))
    sel.value = to.settle(focused ? 1 : 0)
  }, [filled, focused, fill, sel])

  // The dark fill is a layer whose opacity animates, not an interpolated background colour:
  // the "off" end of that interpolation would have to be ink at zero alpha, and a hex written
  // into a component is exactly what tokens.json exists to prevent.
  const plate = useAnimatedStyle(() => ({
    borderColor: interpolateColor(fill.value, [0, 1], [color.inkFaint, color.ink]),
    transform: [{ translateY: sel.value * -2 }],
  }))
  const ink = useAnimatedStyle(() => ({ opacity: fill.value }))
  const caption = useAnimatedStyle(() => ({
    color: interpolateColor(sel.value, [0, 1], [color.inkSoft, color.ink]),
  }))

  return (
    <Tap
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={mark.label}
      haptic="selection"
      onPress={onPress}
      scale={0.92}
      className="flex-1 items-center gap-[3px] py-xs"
    >
      <Animated.View
        style={plate}
        className="h-9 w-9 items-center justify-center overflow-hidden rounded-pill border"
      >
        <Animated.View style={ink} className="absolute inset-0 bg-ink" />
        {/* The glyph is drawn twice and cross-faded rather than re-tinted, because an SVG
            stroke colour is a prop and a prop cannot be interpolated on the UI thread. Two
            18pt marks is a cheaper trade than dropping to the JS thread every frame. */}
        <Mark name={mark.glyph} on={fill} />
      </Animated.View>
      <Animated.Text style={caption} className={ROLE.caption}>
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
        <Glyph name={name} size={18} tint={color.inkSoft} />
      </Animated.View>
      <Animated.View style={light} className="absolute">
        <Glyph name={name} size={18} tint={color.onInk} />
      </Animated.View>
    </View>
  )
}

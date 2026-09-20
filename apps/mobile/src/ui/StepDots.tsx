// The numbered rail across the top of the challenge wizard.
//
// `ProgressRail` already exists and is the wrong shape for this flow. It is four filled bars,
// and it is right where it is used because each step of onboarding is its own route: the rail
// is a fresh mount every time, it cannot remember what it last showed, and it does not need
// to. The challenge wizard is the opposite — one mounted component with `step` in state, four
// questions swapping underneath it — so the rail stays on screen while the number changes, and
// the customer is looking straight at it when it does.
//
// That is what makes this a numbered plate and not a bar. A bar filling says "you are further
// along"; a plate that goes from grey 2 to a green tick says "that one is answered", which is
// the true statement when the four steps are four separate decisions and any of them can be
// walked back to. It is exactly `checklist.tsx`'s three-state plate — done is lime with a
// check, current is ink with a cream numeral, later is ground with a soft one — laid sideways
// and joined up.
//
// Because the rail persists, its states animate, and that is the whole difference from
// `checklist`, where they cannot and do not. Three things move on one shared value: the plate
// colour, the numeral colour, and the crossfade from numeral to check. One value rather than
// three timings for the same reason `Pills` gives — a plate that turns lime a frame before its
// numeral gives way to the tick reads as two events. It interpolates across `[0, 1, 2]`, so a
// plate going from later straight to done travels *through* ink on its way, which is the order
// the customer would have watched it happen in anyway.
//
// The check is the exception and gets a spring, like `SelectCard`'s radio dot. It is the only
// mark in the rail that says a decision is finished, the customer is looking at it, and an
// overshoot is what makes that read as taken rather than recorded.
//
// The connectors are a fixed 16pt rather than `flex-1`. A rail that stretches to the width it
// is given is a progress *bar* again, and this one has to sit between a back arrow and a close
// button in a nav row without either of them moving when the flow gains a step.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Glyph } from '~/ui/Glyph'
import { ROLE } from '~/ui/Text'
import { dur, timing, to } from '~/ui/motion'
import { color } from '@dhan/design'

/** later → current → done. Ordered, because the plate interpolates along it. */
const LATER = 0
const CURRENT = 1
const DONE = 2

export function StepDots({ step, steps }: { step: number; steps: number }) {
  // 1-based and clamped at both ends: a wizard that briefly renders step 0 while its first
  // fetch lands should show step one as current, not four grey plates and no rail at all.
  const total = Math.max(1, Math.round(steps))
  const here = Math.max(1, Math.min(total, Math.round(step)))

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${here} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: here }}
      className="flex-row items-center justify-center"
    >
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        return (
          <View key={n} className="flex-row items-center">
            {i > 0 ? <View className="h-[1px] w-lg bg-hairline" /> : null}
            <Plate n={n} state={n < here ? DONE : n === here ? CURRENT : LATER} />
          </View>
        )
      })}
    </View>
  )
}

function Plate({ n, state }: { n: number; state: number }) {
  // Seeded at rest, not at zero. A wizard resumed on step three should open with two ticks
  // already drawn rather than draw them while the customer watches.
  const at = useSharedValue(state)
  const ticked = useSharedValue(state === DONE ? 1 : 0)

  useEffect(() => {
    at.value = withTiming(state, timing(dur.state))
    ticked.value = to.settle(state === DONE ? 1 : 0)
  }, [state, at, ticked])

  const plate = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      at.value,
      [LATER, CURRENT, DONE],
      [color.groundDeep, color.ink, color.success],
    ),
  }))
  // Cream on ink, soft on ground. Where it lands on `DONE` does not matter — the check has
  // taken the plate by then — so it holds the cream it had rather than crossing to a third
  // colour nothing would ever see.
  const numeral = useAnimatedStyle(() => ({
    color: interpolateColor(
      at.value,
      [LATER, CURRENT, DONE],
      [color.inkSoft, color.onInk, color.onInk],
    ),
    opacity: 1 - ticked.value,
  }))
  const check = useAnimatedStyle(() => ({
    opacity: ticked.value,
    transform: [{ scale: ticked.value }],
  }))

  return (
    <Animated.View
      style={plate}
      className="h-[28px] w-[28px] items-center justify-center rounded-pill"
    >
      <Animated.Text style={numeral} className={ROLE.label}>
        {n}
      </Animated.Text>
      {/* Absolute, so the numeral does not shift sideways as the check takes over from it. */}
      <Animated.View style={check} className="absolute">
        <Glyph name="check" size={15} tint={color.ink} />
      </Animated.View>
    </Animated.View>
  )
}

// The segmented bar across the top of a multi-step flow.
//
// Segments rather than a continuous bar: Cleo uses them because a flow of four steps
// should read as four decisions, not as a percentage. The filled segments are ink so
// they carry the same weight as the primary button the step ends in.
//
// A segment fills left to right as its step is completed, which is the only moment in the flow
// where the customer is told they have made progress rather than shown it.
//
// Only the newest one animates. Every step is its own route, so the rail is a fresh mount each
// time and cannot remember what it last showed — but it does not need to: the segment just won
// is always `step - 1`, and everything before it was already full when the customer arrived.
// Replaying the whole rail on every step would turn a four-field form into a light show.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { dur, timing } from '~/ui/motion'

export function ProgressRail({ step, steps }: { step: number; steps: number }) {
  return (
    <View className="flex-row gap-xs px-pad pt-sm pb-md">
      {Array.from({ length: steps }, (_, i) => (
        <Segment key={i} done={i < step} instant={i < step - 1} />
      ))}
    </View>
  )
}

function Segment({ done, instant }: { done: boolean; instant: boolean }) {
  const filled = useSharedValue(done && instant ? 1 : 0)

  useEffect(() => {
    filled.value = instant ? (done ? 1 : 0) : withTiming(done ? 1 : 0, timing(dur.move))
  }, [done, instant, filled])

  const fill = useAnimatedStyle(() => ({ width: `${filled.value * 100}%` }))

  return (
    <View className="h-[3px] flex-1 overflow-hidden rounded-pill bg-ground-deep">
      <Animated.View style={fill} className="h-full rounded-pill bg-ink" />
    </View>
  )
}

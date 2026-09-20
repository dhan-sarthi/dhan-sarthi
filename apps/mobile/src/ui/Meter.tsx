// A single filled bar.
//
// The fill grows from empty the first time it is seen and travels between values after that,
// on the same clock as the figure printed above it — the two are the same fact said twice, and
// they have to agree. A budget bar that snaps to 80% while the rupee figure beside it counts up
// reads as two unrelated widgets.
//
// Width, not scaleX, and deliberately: the bar is a 6pt capsule with a 999 radius, and scaling
// a capsule horizontally squashes its end caps into ellipses at every fraction below one. The
// layout cost of animating the width of one absolutely-sized child inside a fixed-height row is
// not worth trading a correct shape for, and Reanimated drives the percentage from the UI thread
// either way.
//
// Shared value plus an effect rather than `useDerivedValue`: a derived value whose worklet
// returns an animation has no defined starting point on its first run, and "starts full" is the
// one failure mode this component cannot have.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { cn } from '~/ui/cn'
import { dur, timing } from '~/ui/motion'

export function Meter({
  fraction,
  tone = 'bg-ink',
  track = 'bg-ink/10',
  /** Held back so the bar does not race the entrance of the row it lives in. */
  delay = 0,
}: {
  fraction: number
  tone?: string
  track?: string
  delay?: number
}) {
  const target = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  const grown = useSharedValue(0)

  useEffect(() => {
    grown.value = withDelay(delay, withTiming(target, timing(dur.count)))
  }, [target, delay, grown])

  const fill = useAnimatedStyle(() => ({ width: `${grown.value * 100}%` }))

  return (
    <View className={cn('h-[6px] w-full overflow-hidden rounded-pill', track)}>
      <Animated.View style={fill} className={cn('h-full rounded-pill', tone)} />
    </View>
  )
}

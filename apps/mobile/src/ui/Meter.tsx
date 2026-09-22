// A single filled bar.
//
// The fill grows from empty the first time it is seen and travels between values after that,
// on the same clock as the figure printed above it — the two are the same fact said twice, and
// they have to agree. A budget bar that snaps to 80% while the rupee figure beside it counts up
// reads as two unrelated widgets.
//
// Width, not scaleX, and deliberately: the bar is a capsule with a 999 radius, and scaling a
// capsule horizontally squashes its end caps into ellipses at every fraction below one. The
// layout cost of animating the width of one absolutely-sized child inside a fixed-height row is
// not worth trading a correct shape for, and Reanimated drives the percentage from the UI thread
// either way.
//
// Shared value plus an effect rather than `useDerivedValue`: a derived value whose worklet
// returns an animation has no defined starting point on its first run, and "starts full" is the
// one failure mode this component cannot have.
//
// Two weights. `thin` is the 6pt rule under a category row. `thick` is the hero bar on a
// budget or goal card, and it is Cleo's shape measured: a white capsule with the ink fill
// inset inside it (theirs is 22pt around a 16pt fill; ours is the 20pt token around the same
// 16), so the fill reads as a level in a vessel rather than a stripe. The hero passes
// `track="bg-surface"` for the white; the inset is the bar's own.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { cn } from '~/ui/cn'
import { dur, timing, useReducedMotion } from '~/ui/motion'

const SHAPE = {
  thin: 'h-meter',
  thick: 'h-pad p-xxs',
} as const

/** The smallest fill that still reads as a bar. A 1% fraction drew a 4pt dot that looked like a glitch. */
const FLOOR = 0.02

export function Meter({
  fraction,
  tone = 'bg-ink',
  track = 'bg-ink/10',
  /** Held back so the bar does not race the entrance of the row it lives in. */
  delay = 0,
  size = 'thin',
  /**
   * What the bar measures, for a screen reader — "Budget used", "Goal progress". Given, the
   * track becomes a progressbar announcing its percentage; without it the bar is decoration and
   * the figure beside it carries the fact.
   */
  label,
}: {
  fraction: number
  tone?: string
  track?: string
  delay?: number
  size?: 'thin' | 'thick'
  label?: string
}) {
  const reduced = useReducedMotion()
  const target = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  const visual = target > 0 ? Math.max(target, FLOOR) : 0
  const grown = useSharedValue(reduced ? visual : 0)

  useEffect(() => {
    // Under Reduce Motion the value is set, not animated: `withDelay` would still hold the bar
    // empty for the delay before snapping, which is a pause with nothing to say.
    grown.value = reduced ? visual : withDelay(delay, withTiming(visual, timing(dur.count)))
  }, [visual, delay, grown, reduced])

  const fill = useAnimatedStyle(() => ({ width: `${grown.value * 100}%` }))

  return (
    <View
      className={cn('w-full overflow-hidden rounded-pill', SHAPE[size], track)}
      {...(label === undefined
        ? {}
        : {
            accessible: true,
            accessibilityRole: 'progressbar' as const,
            accessibilityLabel: label,
            accessibilityValue: { min: 0, max: 100, now: Math.round(target * 100) },
          })}
    >
      <Animated.View style={fill} className={cn('h-full rounded-pill', tone)} />
    </View>
  )
}

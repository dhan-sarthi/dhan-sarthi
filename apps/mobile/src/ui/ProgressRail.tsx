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
//
// The welcome carousel is the other rail in the app, and it is this one: white on the photo
// (`tone="light"`), with the current segment filling on the slide's own clock. That clock is the
// caller's `progress`, because the carousel owns the timer that turns the page; the rail only
// draws it. Earlier segments are full and later ones empty either way.
//
// It is one element to a screen reader, "Step 2 of 6" — the segments are a picture of that.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { cn } from '~/ui/cn'
import { dur, timing } from '~/ui/motion'

type Tone = 'ink' | 'light'

const TRACK: Record<Tone, string> = { ink: 'bg-ground-deep', light: 'bg-surface/30' }
const FILL: Record<Tone, string> = { ink: 'bg-ink', light: 'bg-surface' }

export function ProgressRail({
  step,
  steps,
  tone = 'ink',
  progress,
  label,
}: {
  /** 1-based: the step on screen. Its segment and every one before it are filled. */
  step: number
  steps: number
  tone?: Tone
  /** 0–1, driving the current segment's fill instead of the fill-on-arrival. */
  progress?: SharedValue<number>
  /** What the rail announces; "Step {step} of {steps}" by default. */
  label?: string
}) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? `Step ${step} of ${steps}`}
      accessibilityValue={{ min: 0, max: steps, now: step }}
      aria-valuemin={0}
      aria-valuemax={steps}
      aria-valuenow={step}
      className="flex-row gap-xs px-pad pt-sm pb-md"
    >
      {Array.from({ length: steps }, (_, i) =>
        progress !== undefined && i === step - 1 ? (
          <Live key={i} progress={progress} tone={tone} />
        ) : (
          <Segment key={i} done={i < step} instant={i < step - 1} tone={tone} />
        ),
      )}
    </View>
  )
}

function Segment({ done, instant, tone }: { done: boolean; instant: boolean; tone: Tone }) {
  const filled = useSharedValue(done && instant ? 1 : 0)

  useEffect(() => {
    filled.value = instant ? (done ? 1 : 0) : withTiming(done ? 1 : 0, timing(dur.move))
  }, [done, instant, filled])

  const fill = useAnimatedStyle(() => ({ width: `${filled.value * 100}%` }))

  return (
    <View className={cn('h-rail flex-1 overflow-hidden rounded-pill', TRACK[tone])}>
      <Animated.View style={fill} className={cn('h-full rounded-pill', FILL[tone])} />
    </View>
  )
}

function Live({ progress, tone }: { progress: SharedValue<number>; tone: Tone }) {
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }))
  return (
    <View className={cn('h-rail flex-1 overflow-hidden rounded-pill', TRACK[tone])}>
      <Animated.View style={fill} className={cn('h-full rounded-pill', FILL[tone])} />
    </View>
  )
}

// Three dots, meaning the same thing in both places it appears.
//
// The splash already had them: Cleo holds its wordmark in a speech bubble with three pulsing
// dots, the app introducing itself as something that talks. They were local to that screen, and
// then the chat needed a way to say "Uday is working out the answer" and said it with the word
// "Reading…" — which is a label where the splash had a gesture.
//
// Making it one component is not tidying. The dots are this product's way of saying *someone is
// composing a reply*, and an app that says that with a typing indicator on one screen and a
// static word on another has two personalities. The splash is Uday about to speak for the first
// time; the chat is Uday about to answer. Same beat, same three dots.
//
// This is the only loop in the app, and it runs solely while something is actually pending —
// `busy` unmounts it, the splash replaces its route. A loop nobody is waiting on is the kind of
// animation that turns into battery draw and nobody notices it stopped being meaningful.
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { cn } from '~/ui/cn'
import { timing, useReducedMotion } from '~/ui/motion'

const BEAT = 420
const DIM = 0.35

function Dot({ delay, tone, size }: { delay: number; tone: string; size: number }) {
  const reduced = useReducedMotion()
  const t = useSharedValue(DIM)

  useEffect(() => {
    // Reduce Motion leaves them lit and still. The dots are a *presence* indicator before they
    // are an animation, and three grey circles that never brighten read as broken rather than
    // as quiet — so the alternative is on, not off.
    if (reduced) {
      t.value = 1
      return
    }
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, timing(BEAT)), withTiming(DIM, timing(BEAT))),
        -1,
        false,
      ),
    )
  }, [delay, reduced, t])

  const style = useAnimatedStyle(() => ({ opacity: t.value }))
  return (
    <Animated.View
      style={[style, { width: size, height: size }]}
      className={cn('rounded-pill', tone)}
    />
  )
}

/** `tone` is a background class, because the dots sit on ink on the splash and on cream in chat. */
export function Thinking({
  tone = 'bg-ink-soft',
  size = 7,
  className,
}: {
  tone?: string
  size?: number
  className?: string
}) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Working it out"
      className={cn('flex-row gap-sm', className)}
    >
      <Dot delay={0} tone={tone} size={size} />
      <Dot delay={140} tone={tone} size={size} />
      <Dot delay={280} tone={tone} size={size} />
    </View>
  )
}

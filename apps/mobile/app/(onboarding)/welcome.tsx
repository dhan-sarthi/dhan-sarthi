// The pre-login carousel.
//
// Cleo opens on four full-bleed photographs, each making one promise, with the copy
// sitting in a dark band the image fades into rather than on a separate panel. The
// rail at the top fills like a story: the slides advance themselves, so a customer
// who does nothing still sees all four, and a swipe takes over the moment they touch.
//
// The four promises are ordered to end on the refusal. Every other app in this
// category promises to help you buy something; ending on "I'll tell you when not to"
// is the one claim a bank-owned advisor can make and a third-party app cannot.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  ScrollView,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { Type } from '~/ui/Text'
import { PhotoScrim } from '~/ui/PhotoScrim'
import { Button } from '~/ui/Button'
import welcome1 from '../../assets/onboarding/welcome-1.jpg'
import welcome2 from '../../assets/onboarding/welcome-2.jpg'
import welcome3 from '../../assets/onboarding/welcome-3.jpg'
import welcome4 from '../../assets/onboarding/welcome-4.jpg'

const SLIDE_MS = 5200

const SLIDES = [
  {
    image: welcome1,
    title: 'Advice that has\nread your statement',
    body: 'No questionnaire. Two years of your own spending, read properly.',
  },
  {
    image: welcome2,
    title: 'Know where\nit all goes',
    body: 'Every rupee sorted into bills, habits, and what is left for you.',
  },
  {
    image: welcome3,
    title: 'One thing worth\ndoing today',
    body: 'One move, not a list of twenty. And why it is that one.',
  },
  {
    image: welcome4,
    title: 'And when to\ndo nothing',
    body: 'Nine rules stop us selling you the wrong thing.',
  },
]

function Rail({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }))
  return (
    <View className="flex-row gap-xs px-pad pt-sm">
      {SLIDES.map((_, i) => (
        <View key={i} className="h-[3px] flex-1 overflow-hidden rounded-pill bg-surface/30">
          {i < index && <View className="h-full w-full bg-surface" />}
          {i === index && <Animated.View style={fill} className="h-full bg-surface" />}
        </View>
      ))}
    </View>
  )
}

export default function Welcome() {
  const width = Dimensions.get('window').width
  const scroller = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)
  const progress = useSharedValue(0)

  // Each slide restarts the fill and schedules the hand-off to the next one. A swipe
  // changes `index`, which re-runs this effect, so the timer always belongs to the
  // slide actually on screen rather than to the one that started it.
  useEffect(() => {
    progress.value = 0
    progress.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.linear })
    const id = setTimeout(() => {
      const next = (index + 1) % SLIDES.length
      scroller.current?.scrollTo({ x: next * width, animated: true })
      setIndex(next)
    }, SLIDE_MS)
    return () => clearTimeout(id)
  }, [index, width, progress])

  const onSettled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width)
      if (next !== index) setIndex(next)
    },
    [index, width],
  )

  const slide = SLIDES[index] ?? SLIDES[0]!

  return (
    <View className="flex-1 bg-hero">
      <StatusBar style="light" />

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onSettled}
        className="absolute inset-0"
      >
        {SLIDES.map((s, i) => (
          // Page width is a runtime number. It has to land on a core RN view, which
          // react-native-web converts for us; expo-image is cssInterop-registered and would
          // hand the raw number to the style resolver, so sizing lives on the wrapper.
          <View key={i} style={{ width }} className="h-full">
            <Image source={s.image} className="h-full w-full" contentFit="cover" transition={200} />
          </View>
        ))}
      </ScrollView>

      <PhotoScrim />

      {/* The rail, and nothing else. There was a `Log in` pill beside it that pushed
          `/(onboarding)/mobile` — the same route, on the same screen, as `Get started`
          below it. Two controls that cannot lead anywhere different are one control and a
          question the customer has to answer before they can start. */}
      <SafeAreaView edges={['top']} className="absolute left-0 right-0 top-0">
        <Rail index={index} progress={progress} />
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} className="flex-1 justify-end">
        <View className="px-pad pb-sm">
          <Type role="display" tone="onInk">
            {slide.title}
          </Type>
          <Type role="body" tone="onInk" className="mt-md opacity-85">
            {slide.body}
          </Type>
          <View className="mt-xl">
            <Button
              label="Get started"
              variant="light"
              onPress={() => router.push('/(onboarding)/mobile')}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

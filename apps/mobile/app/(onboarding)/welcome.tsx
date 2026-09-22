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
//
// The story has an end. The timer stops on the fourth slide instead of wrapping to the first,
// which took the words out from under someone still reading the refusal. It only runs while
// someone could be watching it move: not while another screen is on top, not while a finger is
// on the photo, and never with Reduce Motion or a screen reader on — a page that turns itself is
// movement that was asked off, and to VoiceOver it is text replaced mid-sentence. Those
// customers turn the page themselves: the carousel is one adjustable control, so a swipe up or
// down moves a slide, and the rail says which one they are on.
//
// The slide follows the scroll, not the settle. Reading the index only when the momentum ended
// left the old headline over the new photograph for the whole glide.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { router, useIsFocused } from 'expo-router'
import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import { cancelAnimation, Easing, useSharedValue, withTiming } from 'react-native-reanimated'
import { Type } from '~/ui/Text'
import { PhotoScrim } from '~/ui/PhotoScrim'
import { ProgressRail } from '~/ui/ProgressRail'
import { Button } from '~/ui/Button'
import { useReducedMotion } from '~/ui/motion'
import welcome1 from '../../assets/onboarding/welcome-1.jpg'
import welcome2 from '../../assets/onboarding/welcome-2.jpg'
import welcome3 from '../../assets/onboarding/welcome-3.jpg'
import welcome4 from '../../assets/onboarding/welcome-4.jpg'

const SLIDE_MS = 5200

const SLIDES = [
  {
    image: welcome1,
    title: 'Advice that has read your statement',
    body: 'No questionnaire. Two years of your own spending, read properly.',
  },
  {
    image: welcome2,
    title: 'Know where it all goes',
    body: "Every rupee sorted into bills, habits and what's left for you.",
  },
  {
    image: welcome3,
    title: 'One thing worth doing today',
    body: "One move, not a list of twenty. And why it's that one.",
  },
  {
    image: welcome4,
    title: 'And when to do nothing',
    body: 'Nine rules stop us selling you the wrong thing.',
  },
]

const LAST = SLIDES.length - 1

/**
 * Whether VoiceOver or TalkBack is running. The web build is left out on purpose: its
 * `isScreenReaderEnabled` answers true on every browser, which would stop the carousel for
 * everyone, and a browser has no honest way to say.
 */
function useScreenReader(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (Platform.OS === 'web') return
    let alive = true
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => {
        if (alive) setOn(v)
      })
      .catch(() => undefined)
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])
  return on
}

export default function Welcome() {
  const { width } = useWindowDimensions()
  const scroller = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)
  const [held, setHeld] = useState(false)
  const [cover, setCover] = useState<number | undefined>(undefined)
  const progress = useSharedValue(0)
  const focused = useIsFocused()
  const reduced = useReducedMotion()
  const screenReader = useScreenReader()

  // Turning the page by hand is always allowed; turning it by timer is what these gate.
  const still = reduced || screenReader
  const running = focused && !still && !held

  // The page a turn the app started is heading for. Its own glide passes back over the page it
  // left, and those scroll events must not flick the headline back for a frame.
  const heading = useRef<number | null>(null)

  const go = useCallback(
    (next: number) => {
      const to = Math.max(0, Math.min(LAST, next))
      heading.current = to
      scroller.current?.scrollTo({ x: to * width, animated: !reduced })
      setIndex(to)
    },
    [width, reduced],
  )

  // Each slide restarts the fill and schedules the hand-off to the next one. A swipe changes
  // `index`, which re-runs this effect, so the timer always belongs to the slide actually on
  // screen rather than to the one that started it. With the timer off for good the current
  // segment simply reads full, the way every other rail in the app marks the step you are on.
  useEffect(() => {
    if (still) {
      cancelAnimation(progress)
      progress.value = 1
      return
    }
    if (!running) {
      cancelAnimation(progress)
      return
    }
    progress.value = 0
    progress.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.linear })
    if (index >= LAST) return
    const id = setTimeout(() => go(index + 1), SLIDE_MS)
    return () => clearTimeout(id)
  }, [still, running, index, go, progress])

  // A rotation or a resized window changes the page width under the offset; keep the page.
  const indexRef = useRef(index)
  useEffect(() => {
    indexRef.current = index
  }, [index])
  useEffect(() => {
    scroller.current?.scrollTo({ x: indexRef.current * width, animated: false })
  }, [width])

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return
      const next = Math.max(0, Math.min(LAST, Math.round(e.nativeEvent.contentOffset.x / width)))
      if (heading.current !== null) {
        if (next !== heading.current) return
        heading.current = null
      }
      setIndex((i) => (i === next ? i : next))
    },
    [width],
  )

  const onAction = useCallback(
    (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'increment') go(index + 1)
      else if (e.nativeEvent.actionName === 'decrement') go(index - 1)
    },
    [go, index],
  )

  // The scrim is built around the copy. The tallest block seen so far is the one it covers,
  // so a one-line headline after a two-line one does not pull the ink down from under the
  // photograph mid-swipe.
  const onCopy = useCallback((e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height)
    setCover((c) => (c !== undefined && c >= h ? c : h))
  }, [])

  const slide = SLIDES[index] ?? SLIDES[0]!

  return (
    <View className="flex-1 bg-hero">
      <StatusBar style="light" />

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={onScroll}
        onScrollBeginDrag={() => {
          heading.current = null
          setHeld(true)
        }}
        onScrollEndDrag={() => setHeld(false)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Introduction"
        accessibilityValue={{ text: `${slide.title}, ${index + 1} of ${SLIDES.length}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        className="absolute inset-0"
      >
        {SLIDES.map((s, i) => (
          // Page width is a runtime number. It has to land on a core RN view, which
          // react-native-web converts for us; expo-image is cssInterop-registered and would
          // hand the raw number to the style resolver, so sizing lives on the wrapper.
          <View key={i} style={{ width }} className="h-full">
            <Image
              source={s.image}
              accessible={false}
              className="h-full w-full"
              contentFit="cover"
              transition={200}
            />
          </View>
        ))}
      </ScrollView>

      <PhotoScrim cover={cover} />

      {/* The rail, and nothing else. There was a `Log in` pill beside it that pushed
          `/(onboarding)/mobile` — the same route, on the same screen, as `Get started`
          below it. Two controls that cannot lead anywhere different are one control and a
          question the customer has to answer before they can start. The overlays let a
          swipe through to the photographs everywhere but the button. */}
      <SafeAreaView
        edges={['top']}
        className="absolute left-0 right-0 top-0"
        style={{ pointerEvents: 'none' }}
      >
        <ProgressRail
          tone="light"
          step={index + 1}
          steps={SLIDES.length}
          progress={progress}
          label={`Slide ${index + 1} of ${SLIDES.length}`}
        />
      </SafeAreaView>

      <SafeAreaView
        edges={['bottom']}
        className="flex-1 justify-end"
        style={{ pointerEvents: 'box-none' }}
      >
        <View onLayout={onCopy} className="px-pad pb-lg" style={{ pointerEvents: 'box-none' }}>
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
              haptic="none"
              onPress={() => router.push('/(onboarding)/mobile')}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

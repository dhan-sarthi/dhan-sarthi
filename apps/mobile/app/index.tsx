// The splash.
//
// Cleo holds its wordmark in a rounded speech bubble on a full-bleed brand field
// with three pulsing dots — the app introducing itself as something that talks.
// Ours is the same gesture in IDBI green, and it doubles as the cover for the first
// API call, so the customer never sees an empty picker.
//
// The bubble settles in rather than being there: it arrives at 94% and springs to size while
// the dots fade up under it, which is the difference between an app that launched and an app
// that opened. The whole entrance is over in under half a second of the 1.4s hold, so it costs
// nothing — the hold was already being spent.
//
// The dots themselves live in `Thinking`, shared with the chat. They mean the same thing in
// both places: someone is composing a reply.
import { useEffect } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { Type } from '~/ui/Text'
import { Thinking } from '~/ui/Thinking'
import { dur, to } from '~/ui/motion'
import { getToken } from '~/api/client'

export default function Splash() {
  const settled = useSharedValue(0)

  useEffect(() => {
    settled.value = to.settle(1)
  }, [settled])

  useEffect(() => {
    let cancelled = false
    // Hold the splash for its own beat even when the answer comes back instantly —
    // a wordmark that flashes for 80ms reads as a glitch rather than as an entrance.
    const ready = Promise.all([getToken(), new Promise((r) => setTimeout(r, 1400))])
    void ready.then(([token]) => {
      if (!cancelled) router.replace(token ? '/(tabs)/spend' : '/(onboarding)/welcome')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const bubble = useAnimatedStyle(() => ({
    opacity: settled.value,
    transform: [{ scale: 0.94 + settled.value * 0.06 }],
  }))

  return (
    <View className="flex-1 items-center justify-center bg-hero">
      <StatusBar style="light" />
      <Animated.View style={bubble} className="rounded-xl bg-on-ink px-xl py-md">
        <Type role="display" tone="ink">
          dhan sarthi
        </Type>
      </Animated.View>
      <Animated.View entering={FadeIn.delay(dur.state).duration(dur.enter)} className="mt-xl">
        <Thinking tone="bg-on-ink" size={9} />
      </Animated.View>
    </View>
  )
}

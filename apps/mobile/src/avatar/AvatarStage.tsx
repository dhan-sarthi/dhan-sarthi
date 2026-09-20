// Where Uday's face goes: the whole screen.
//
// The tile used to be a 220px card above a chat feed, which made the call look like a feature
// of the chat. It is the other way round — the brief asks for an avatar product, and a face you
// have to squint at is not one. So the stage fills its parent, and the screen decides the frame.
//
// Three things it has to get right, all of them about not lying to the customer:
//
//   1. **The portrait is the same still the provider animates.** It fills the stage from the
//      first frame of the tab, so connecting is the picture coming alive rather than one person
//      being replaced by another.
//   2. **Nothing is revealed until a frame is painted.** `videoLive` is set from
//      `requestVideoFrameCallback`, not from a track subscribing, because a subscribed track
//      sits black through keyframe warm-up. Until then the portrait stays up, dimmed.
//   3. **The controls sit over the video, not under it.** A call that fills the screen has
//      nowhere else to put them, and they need to stay legible against whatever the video is
//      doing — at 25fps that is a different colour every 40ms — hence a scrim at each end. The
//      controls themselves belong to the screen, which stacks them above this.
import { useEffect, useRef } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeIn } from 'react-native-reanimated'
import { UDAY_PORTRAIT } from '@dhan/assets'
import { Type } from '~/ui/Text'
import { Glyph } from '~/ui/Glyph'
import { color } from '@dhan/design'
import type { CallState } from '~/avatar/useAvatarCall'

export function AvatarStage({ call }: { call: CallState }) {
  const host = useRef<View | null>(null)

  // react-native-web hands back the real DOM node for a View, which is what the video element
  // gets appended to. On native this ref is a host component and the native stage will render
  // the provider's own video component instead of reaching for the DOM.
  useEffect(() => {
    call.attach(host.current as unknown as HTMLDivElement | null)
    return () => call.attach(null)
  }, [call])

  const connecting = call.mode === 'connecting' || (call.mode === 'live' && !call.videoLive)

  return (
    <View className="flex-1 overflow-hidden bg-hero">
      {/* Under the video, always. It is what the customer looks at while the worker warms up,
          and what they keep looking at if the call never lands. */}
      <Image
        source={UDAY_PORTRAIT}
        className="absolute inset-0 h-full w-full"
        contentFit="cover"
        transition={200}
      />
      {/* Dimmed, not hidden: enough for cream text to hold its contrast anywhere on the frame,
          little enough that it still reads as a photograph of a person rather than a silhouette. */}
      {!call.videoLive && <View className="absolute inset-0 bg-hero/25" />}

      <View ref={host} className="absolute inset-0 h-full w-full" collapsable={false} />

      {connecting && (
        <Animated.View
          entering={FadeIn.duration(240)}
          className="absolute inset-0 items-center justify-center gap-md"
        >
          <View className="h-16 w-16 items-center justify-center rounded-pill bg-on-ink/15">
            <Glyph name="uday" size={30} tint={color.onInk} />
          </View>
          <Type role="label" tone="onInk" className="opacity-90">
            Connecting to Uday…
          </Type>
        </Animated.View>
      )}

      {/* The controls live over the video. Without this the label sits on whatever the frame
          happens to be doing, which at 25fps is a different colour every 40ms. */}
      <LinearGradient
        colors={[color.scrimHeavy, color.scrimFade]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 180 }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[color.scrimFade, color.scrimDeep]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 280 }}
        pointerEvents="none"
      />
    </View>
  )
}

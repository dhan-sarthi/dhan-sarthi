// Where Uday's face goes: the whole screen.
//
// The tile used to be a 220px card above a chat feed, which made the call look like a feature
// of the chat. It is the other way round — the brief asks for an avatar product, and a face you
// have to squint at is not one. So the stage fills its parent, and the screen decides the frame.
//
// Three things it has to get right, all of them about not lying to the customer:
//
//   1. **The still is the provider's own first frame, framed the way the video will be.** It is
//      up from the first moment on the tab, so connecting is the picture coming alive rather
//      than one crop of him being swapped for another.
//   2. **Nothing is revealed until a frame is painted.** `videoLive` is set from
//      `requestVideoFrameCallback`, not from a track subscribing, because a subscribed track
//      sits black through keyframe warm-up. Until then the portrait stays up, dimmed.
//   3. **The controls sit over the video, not under it.** A call that fills the screen has
//      nowhere else to put them, and they need to stay legible against whatever the video is
//      doing — at 25fps that is a different colour every 40ms — hence a scrim at each end. The
//      controls themselves belong to the screen, which stacks them above this. The scrims are
//      fractions of the screen, not fixed heights, so a 320pt phone and a 440pt one both keep
//      the same share of the face clear.
import { useCallback, useEffect, useRef, useState } from 'react'
import { type LayoutChangeEvent, View, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeIn } from 'react-native-reanimated'
import { UDAY_CALL_STILL, UDAY_CALL_STILL_ASPECT } from '@dhan/assets'
import { Type } from '~/ui/Text'
import { Glyph } from '~/ui/Glyph'
import { dur } from '~/ui/motion'
import { color, control, size } from '@dhan/design'
import type { CallState } from '~/avatar/useAvatarCall'
import { frameFor } from '~/avatar/frame'

/**
 * How much of the picture's own height fades into the ink at its top and bottom edges. The top
 * fades only when the picture does not start at the top of the screen; the bottom is kept short,
 * because a long gradient is exactly what made the band read as "half a screen of nothing".
 */
const FEATHER_TOP = 0.08
const FEATHER_BOTTOM = 0.1

export function AvatarStage({ call }: { call: CallState }) {
  const host = useRef<View | null>(null)
  const { width, height } = useWindowDimensions()
  // The stage's own box, not the window's: the tab bar and the safe area take their share first.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout
    setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }))
  }, [])
  // The still's shape until the video reports its own, so the frame does not move when it lands.
  const frame = frameFor(
    box?.w ?? width,
    box?.h ?? height,
    call.videoAspect ?? UDAY_CALL_STILL_ASPECT,
  )
  const { attach } = call

  // react-native-web hands back the real DOM node for a View, which is what the video element
  // gets appended to. On native this ref is a host component and the native stage will render
  // the provider's own video component instead of reaching for the DOM.
  //
  // Keyed on `attach` alone, which is stable for the life of the hook. It was keyed on `call`,
  // a fresh object every render, so the stage detached and re-attached the video on every
  // state change of the call it was showing.
  useEffect(() => {
    attach(host.current as unknown as HTMLDivElement | null)
    return () => attach(null)
  }, [attach])

  const connecting = call.mode === 'connecting' || (call.mode === 'live' && !call.videoLive)

  return (
    <View className="flex-1 overflow-hidden bg-ink" onLayout={onLayout}>
      {/* The picture: the still, then the video over it, in one frame. Outside the frame is the
          ink ground, and the frame's edges fade into it, so a landscape call on a tall screen reads
          as a portrait rather than a letterbox. */}
      <View
        style={{ position: 'absolute', left: 0, right: 0, top: frame.top, height: frame.height }}
      >
        {/* Under the video, always. It is what the customer looks at while the worker warms up,
            and what they keep looking at if the call never lands. */}
        {/* A photograph of the advisor, not content: the screen's title already names him. */}
        <Image
          source={UDAY_CALL_STILL}
          className="absolute inset-0 h-full w-full"
          contentFit="cover"
          transition={dur.state}
          accessible={false}
          accessibilityIgnoresInvertColors
        />
        {/* Dimmed, not hidden: enough for cream text to hold its contrast anywhere on the frame,
            little enough that it still reads as a photograph of a person rather than a silhouette. */}
        {!call.videoLive && <View className="absolute inset-0 bg-hero/25" />}

        <View ref={host} className="absolute inset-0 h-full w-full" collapsable={false} />
        {!frame.fills && (
          <>
            {frame.top > 0 && (
              <LinearGradient
                colors={[color.ink, color.scrimFade]}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: frame.height * FEATHER_TOP,
                }}
                pointerEvents="none"
              />
            )}
            <LinearGradient
              colors={[color.scrimFade, color.ink]}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: frame.height * FEATHER_BOTTOM,
              }}
              pointerEvents="none"
            />
          </>
        )}
      </View>

      {connecting && (
        <Animated.View
          entering={FadeIn.duration(dur.state)}
          className="absolute inset-0 items-center justify-center gap-md"
        >
          <View className="h-plate-xl w-plate-xl items-center justify-center rounded-pill bg-on-ink/15">
            <Glyph name="uday" size={size.plateXl * 0.55} tint={color.onInk} />
          </View>
          <Type role="label" tone="onInk">
            Connecting to Uday…
          </Type>
        </Animated.View>
      )}

      {/* The controls live over the video. Without this the label sits on whatever the frame
          happens to be doing, which at 25fps is a different colour every 40ms. */}
      <LinearGradient
        colors={[color.scrimHeavy, color.scrimFade]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: height * control.scrimTop,
        }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[color.scrimFade, color.scrimDeep]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: height * control.scrimBottom,
        }}
        pointerEvents="none"
      />
    </View>
  )
}

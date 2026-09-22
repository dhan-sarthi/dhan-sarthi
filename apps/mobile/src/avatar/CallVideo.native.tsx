// Uday's video on a phone: react-native-webrtc's view, kept out of sight until it paints.
//
// The rule both transports keep — report video when a frame is painted, not when a track
// arrives — has to be kept here on a phone, because only the view knows. Android's view reports
// the frame's size as the first frame reaches it (`onDimensionsChange`), and that is the signal.
//
// Why a 1×1 corner until then, rather than full size and hidden: the view paints itself black
// from the moment it is given a track until its first frame, and it is a SurfaceView, which does
// not reliably honour opacity. Full size, it would put a black rectangle over the portrait for the
// seconds the worker takes to publish a decodable frame — the exact "broken" look the web stage
// avoids. A single pixel still receives every frame, so the signal still comes.
//
// If the view never reports a size — an event lost on its way through the new architecture's
// interop layer, say — the call is revealed anyway after `REVEAL_BY_MS`. A black moment is a
// better failure than a call you can hear and never see.
//
// The view's module is loaded when a call first has video, not with the screen: every tab is
// bundled with this file, and Expo Go, which has no WebRTC, must still open the rest of the app.
import { type ComponentType, Suspense, lazy, useEffect, useRef } from 'react'
import { StyleSheet } from 'react-native'
import type { RTCVideoViewProps } from '@livekit/react-native-webrtc'
import type { CallVideoProps } from './CallVideo'

/** Runway's worker takes about five seconds from READY to a decodable frame; this is double. */
const REVEAL_BY_MS = 10_000

// Wrapped in a function because `lazy` must resolve to a component, and `RTCView` is a native
// view's registered name, not one: resolving to it directly throws "Lazy element type must
// resolve to a class or function" the moment the first stream arrives.
const RTCView = lazy(() =>
  import('@livekit/react-native-webrtc').then((m) => {
    const Native = m.RTCView as unknown as ComponentType<RTCVideoViewProps>
    return { default: (props: RTCVideoViewProps) => <Native {...props} /> }
  }),
)

export function CallVideo({ streamURL, live, onFrame }: CallVideoProps) {
  const report = useRef(onFrame)
  report.current = onFrame

  useEffect(() => {
    if (live) return
    const late = setTimeout(() => report.current(0, 0), REVEAL_BY_MS)
    return () => clearTimeout(late)
  }, [live, streamURL])

  return (
    <Suspense fallback={null}>
      <RTCView
        streamURL={streamURL}
        objectFit="cover"
        zOrder={0}
        onDimensionsChange={(e) => onFrame(e.nativeEvent.width, e.nativeEvent.height)}
        style={live ? StyleSheet.absoluteFill : styles.warming}
      />
    </Suspense>
  )
}

const styles = StyleSheet.create({
  warming: { position: 'absolute', left: 0, bottom: 0, width: 1, height: 1, opacity: 0 },
})

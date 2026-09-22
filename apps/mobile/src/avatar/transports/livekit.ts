// Runway's transport: a LiveKit room the browser joins.
//
// This is the code that has been through a real billed session. What it knows that is not
// obvious: the worker publishes audio several seconds before a decodable video frame, so
// `videoLive` waits on `requestVideoFrameCallback` rather than on the track subscribing; and a
// room that disconnects under us is a different event from the customer hanging up.
//
// Three things it does the way Runway's own client does (`@runwayml/avatars`), learned the hard
// way on 22 September 2026:
//
//   1. **It publishes the microphone.** It used to join, subscribe and publish nothing, so Uday
//      could be seen and heard and could not hear the customer: he said his opening line and then
//      waited forever. The track is opened on the tap, alongside the grant request, so the
//      permission prompt and the device start are off the critical path.
//   2. **Adaptive stream and dynacast are off.** Adaptive stream holds a video layer back until the
//      element has been laid out and measured, which is exactly the moment the customer is
//      waiting on; dynacast only matters to a publisher of video, and we publish none.
//   3. **It says goodbye.** `END_CALL` on the data channel ends the session cleanly on Runway's
//      side, which is what makes the transcript retrievable, before the room is left.
//
// Web only. A phone runs `livekit.native.ts`, the same rules over `@livekit/react-native`, in the
// APK (`infra/scripts/build-apk.sh`); Expo Go has no WebRTC to run it on.
import type { Connect, LiveConnection } from './types'

/** Start fetching the SDK before anyone taps, so the tap does not wait on a download. */
export const preload = (): Promise<unknown> => import('livekit-client')

export const connect: Connect = async ({ grant, stage, mic, onVideoLive, onVideoSize, onLost }) => {
  const { Room, RoomEvent, Track } = await import('livekit-client')

  let video: HTMLVideoElement | null = null
  const audioEls: HTMLAudioElement[] = []
  let leaving = false

  const room = new Room({ adaptiveStream: false, dynacast: false })

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Video) {
      const el = document.createElement('video')
      el.autoplay = true
      el.playsInline = true
      el.muted = true
      el.style.width = '100%'
      el.style.height = '100%'
      el.style.objectFit = 'cover'
      track.attach(el)
      video = el
      stage?.appendChild(el)

      // The stage frames the call by the track's real shape, not by a guess about the provider.
      const size = (): void => {
        if (el.videoWidth > 0 && el.videoHeight > 0) onVideoSize?.(el.videoWidth, el.videoHeight)
      }
      el.addEventListener('loadedmetadata', size)
      el.addEventListener('resize', size)

      // Wait for a frame to be *presented*. A subscribed track sits black through keyframe
      // warm-up, and revealing it then is the difference between "connecting" and "broken".
      const withCallback = el as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number
      }
      if (typeof withCallback.requestVideoFrameCallback === 'function') {
        withCallback.requestVideoFrameCallback(() => {
          size()
          onVideoLive()
        })
      } else {
        const poll = (): void => {
          if (el.videoWidth > 0 && el.currentTime > 0) {
            size()
            onVideoLive()
          } else window.setTimeout(poll, 120)
        }
        poll()
      }
    }

    if (track.kind === Track.Kind.Audio) {
      const el = track.attach() as HTMLAudioElement
      el.autoplay = true
      document.body.appendChild(el)
      audioEls.push(el)
    }
  })

  room.on(RoomEvent.Disconnected, () => {
    if (leaving) return
    onLost()
  })

  await room.connect(grant.url, grant.token, { autoSubscribe: true })

  // The customer's voice. A refused or missing microphone still leaves a call worth having —
  // Uday talks, and text is one tap away — so a failure here is not a failed call.
  const track = mic?.getAudioTracks()[0]
  try {
    if (track) await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone })
    else await room.localParticipant.setMicrophoneEnabled(true)
  } catch {
    // Nothing to do: the call carries on without it.
  }

  const live: LiveConnection = {
    reattach: (node) => {
      if (node && video && !node.contains(video)) node.appendChild(video)
    },
    disconnect: async () => {
      if (leaving) return
      leaving = true
      try {
        const bye = new TextEncoder().encode(JSON.stringify({ type: 'END_CALL' }))
        await room.localParticipant.publishData(bye, { reliable: true })
      } catch {
        // Best effort: the server's cancel ends the session either way.
      }
      for (const el of audioEls) el.remove()
      audioEls.length = 0
      video?.remove()
      video = null
      await room.disconnect()
    },
  }
  return live
}

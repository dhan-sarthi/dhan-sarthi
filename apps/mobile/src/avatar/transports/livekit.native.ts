// Runway's transport on a phone: the same LiveKit room, joined through react-native-webrtc.
//
// `livekit.ts` is the web twin and the one that has been through billed sessions; this file keeps
// every rule it learned — the microphone is published, adaptive stream and dynacast are off, and a
// hang-up says `END_CALL` before leaving — and differs only where a phone has no DOM:
//
//   - The video is not an element this file builds. The subscribed track's stream goes up through
//     `onVideoStream` and `CallVideo` renders it, and it is the view, not this file, that reports
//     the first painted frame, because only the view knows when one was painted.
//   - Remote audio needs no element: react-native-webrtc plays it through the phone's own audio
//     device. What it does need is the audio session in `phone.ts`, opened before the room is.
//
// `registerGlobals()` from `@livekit/react-native` has run by the time this loads
// (`src/avatar/globals.native.ts`), which is what gives `livekit-client` a WebRTC to drive.
import type { Connect, LiveConnection } from './types'
import { closeAudio, openAudio, streamURL } from './phone'

/** Start loading the SDK before anyone taps, so the tap does not wait on it. */
export const preload = (): Promise<unknown> => import('livekit-client')

export const connect: Connect = async ({ grant, mic, onVideoStream, onLost }) => {
  const { Room, RoomEvent, Track } = await import('livekit-client')
  await openAudio()

  let leaving = false
  const room = new Room({ adaptiveStream: false, dynacast: false })

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Video) onVideoStream?.(streamURL(track.mediaStream))
  })
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    if (track.kind === Track.Kind.Video) onVideoStream?.(null)
  })
  room.on(RoomEvent.Disconnected, () => {
    if (leaving) return
    void closeAudio()
    onLost()
  })

  try {
    await room.connect(grant.url, grant.token, { autoSubscribe: true })
  } catch (err) {
    void closeAudio()
    throw err
  }

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
    // The stage renders the stream by URL wherever it is mounted; there is no node to move.
    reattach: () => undefined,
    disconnect: async () => {
      if (leaving) return
      leaving = true
      try {
        const bye = new TextEncoder().encode(JSON.stringify({ type: 'END_CALL' }))
        await room.localParticipant.publishData(bye, { reliable: true })
      } catch {
        // Best effort: the server's cancel ends the session either way.
      }
      try {
        await room.disconnect()
      } finally {
        await closeAudio()
      }
    },
  }
  return live
}

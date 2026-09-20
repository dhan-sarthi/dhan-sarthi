// Runway's transport: a LiveKit room the browser joins.
//
// This is the code that has been through a real billed session, moved here unchanged in
// behaviour. What it knows that is not obvious: the worker publishes audio several seconds
// before a decodable video frame, so `videoLive` waits on `requestVideoFrameCallback` rather
// than on the track subscribing; and a room that disconnects under us is a different event
// from the customer hanging up.
//
// Web only. The native path needs `@livekit/react-native` and a build containing WebRTC.
import type { Connect, LiveConnection } from './types'

export const connect: Connect = async ({ grant, stage, onVideoLive, onLost }) => {
  const { Room, RoomEvent, Track } = await import('livekit-client')

  let video: HTMLVideoElement | null = null
  const audioEls: HTMLAudioElement[] = []
  let leaving = false

  const room = new Room({ adaptiveStream: true, dynacast: true })

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

      // Wait for a frame to be *presented*. A subscribed track sits black through keyframe
      // warm-up, and revealing it then is the difference between "connecting" and "broken".
      const withCallback = el as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number
      }
      if (typeof withCallback.requestVideoFrameCallback === 'function') {
        withCallback.requestVideoFrameCallback(() => onVideoLive())
      } else {
        const poll = (): void => {
          if (el.videoWidth > 0 && el.currentTime > 0) onVideoLive()
          else window.setTimeout(poll, 120)
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

  await room.connect(grant.url, grant.token)

  const live: LiveConnection = {
    reattach: (node) => {
      if (node && video && !node.contains(video)) node.appendChild(video)
    },
    disconnect: async () => {
      leaving = true
      for (const el of audioEls) el.remove()
      audioEls.length = 0
      video?.remove()
      video = null
      await room.disconnect()
    },
  }
  return live
}

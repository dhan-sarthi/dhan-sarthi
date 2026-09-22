// Anam's transport: no room, no URL — a session token and the provider's own WebRTC signalling.
//
// `streamToVideoElement` takes an element *id*, not a node, so the video element is created
// here with a unique id and put in the document before the call starts. It is the same element
// the LiveKit transport builds by hand, styled identically, so the two look the same on
// screen.
//
// The tool gate is not here. Anam's model reaches our tools by calling the API directly from
// its own servers, so nothing in this file can be asked for a verdict — which is the point, and
// the reason the migration did not weaken the audit trail.
import type { AvatarGrant } from '@dhan/contracts'
import type { Connect, LiveConnection } from './types'

/** The one thing this transport needs that the grant does not carry: somewhere to put a frame. */
function makeVideoElement(): HTMLVideoElement {
  const el = document.createElement('video')
  el.id = `anam-stage-${Math.random().toString(36).slice(2, 10)}`
  el.autoplay = true
  el.playsInline = true
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.objectFit = 'cover'
  return el
}

/** Start fetching the SDK before anyone taps, so the tap does not wait on a download. */
export const preload = (): Promise<unknown> => import('@anam-ai/js-sdk')

export const connect: Connect = async ({ grant, stage, mic, onVideoLive, onVideoSize, onLost }) => {
  const { createClient, AnamEvent } = await import('@anam-ai/js-sdk')

  const video = makeVideoElement()
  // It has to be in the document before streaming starts, because the SDK looks it up by id.
  ;(stage ?? document.body).appendChild(video)

  let leaving = false
  const anam = createClient(grant.token as AvatarGrant['token'])

  // The stage frames the call by the track's real shape: Anam's is portrait, Runway's is not.
  const size = (): void => {
    if (video.videoWidth > 0) onVideoSize?.(video.videoWidth, video.videoHeight)
  }
  video.addEventListener('resize', size)
  anam.addListener(AnamEvent.VIDEO_PLAY_STARTED, () => {
    size()
    onVideoLive()
  })
  anam.addListener(AnamEvent.CONNECTION_CLOSED, () => {
    // The engine closing the session, the cap being reached, the network dropping. Not a hang-up.
    if (leaving) return
    onLost()
  })

  // The microphone opened on the tap, when there is one; otherwise the SDK opens its own.
  await anam.streamToVideoElement(video.id, mic ?? undefined)

  const live: LiveConnection = {
    reattach: (node) => {
      if (node && !node.contains(video)) node.appendChild(video)
    },
    disconnect: async () => {
      leaving = true
      try {
        await anam.stopStreaming()
      } finally {
        video.remove()
      }
    },
  }
  return live
}

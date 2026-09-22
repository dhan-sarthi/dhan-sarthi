// Anam's transport on a phone: the same SDK, asked for its streams instead of an element.
//
// `anam.ts` hands the SDK a `<video>` id and lets it attach the stream itself. There is no
// document on a phone, so this file calls `stream()`, which resolves with the video and audio
// streams once the peer connection has them, and passes the video up to `CallVideo` by URL. The
// SDK itself needs nothing from a browser beyond WebRTC, a WebSocket and `getUserMedia`, and
// `registerGlobals()` (`src/avatar/globals.native.ts`) supplies the WebRTC half.
//
// One difference the web never meets: `stream()` settles only when both tracks have arrived, and
// never rejects if the connection closes first. So a close before the call has started fails the
// connect — the customer is told it could not connect — and a close after it is a dropped call.
//
// The tool gate is not here, as on the web: Anam's model reaches our tools from its own servers.
import type { AvatarGrant } from '@dhan/contracts'
import type { Connect, LiveConnection } from './types'
import { closeAudio, openAudio, streamURL } from './phone'

/** Start loading the SDK before anyone taps, so the tap does not wait on it. */
export const preload = (): Promise<unknown> => import('@anam-ai/js-sdk')

export const connect: Connect = async ({ grant, mic, onVideoStream, onLost }) => {
  const { createClient, AnamEvent } = await import('@anam-ai/js-sdk')
  await openAudio()

  let leaving = false
  let started = false
  let closedEarly: (err: Error) => void = () => undefined
  const closedBeforeStart = new Promise<never>((_, reject) => {
    closedEarly = reject
  })

  const anam = createClient(grant.token as AvatarGrant['token'])
  anam.addListener(AnamEvent.VIDEO_STREAM_STARTED, (stream) => {
    onVideoStream?.(streamURL(stream))
  })
  anam.addListener(AnamEvent.CONNECTION_CLOSED, () => {
    // The engine closing the session, the cap being reached, the network dropping. Not a hang-up.
    if (leaving) return
    void closeAudio()
    if (started) onLost()
    else closedEarly(new Error('anam: the connection closed before the call started'))
  })

  try {
    // The microphone opened on the tap, when there is one; otherwise the SDK opens its own.
    await Promise.race([anam.stream(mic ?? undefined), closedBeforeStart])
    started = true
  } catch (err) {
    leaving = true
    void anam.stopStreaming().catch(() => undefined)
    void closeAudio()
    throw err
  }

  const live: LiveConnection = {
    // The stage renders the stream by URL wherever it is mounted; there is no node to move.
    reattach: () => undefined,
    disconnect: async () => {
      if (leaving) return
      leaving = true
      try {
        await anam.stopStreaming()
      } finally {
        await closeAudio()
      }
    },
  }
  return live
}

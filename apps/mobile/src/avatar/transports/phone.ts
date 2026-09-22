// What a call needs from a phone that a browser hands the web transports for free.
//
// Imported only by the `.native.ts` transports, so the web bundle never reaches the native
// WebRTC module behind it. Two things:
//
//   1. **An audio session.** Without one Android plays the call through the earpiece, as a phone
//      call, and a customer holding the phone at arm's length to see Uday hears nothing. LiveKit's
//      session picks a Bluetooth or wired headset first and the loudspeaker otherwise, and puts the
//      phone in communication mode, which is what turns on the hardware echo canceller — without
//      it the microphone hears Uday through the loudspeaker and he answers himself. The Anam
//      transport uses the same session: it is the phone's audio routing, not LiveKit's room.
//   2. **A name for a stream.** A native video view is handed a stream by URL, not by object.
import { AudioSession } from '@livekit/react-native'

export async function openAudio(): Promise<void> {
  await AudioSession.startAudioSession()
}

/** Best effort: a session left open is louder than it should be, not broken. */
export async function closeAudio(): Promise<void> {
  try {
    await AudioSession.stopAudioSession()
  } catch {
    // Nothing to do: the next call starts its own.
  }
}

/**
 * The URL a WebRTC video view looks a stream up by. The SDKs type their streams as the DOM's
 * `MediaStream`, which has no `toURL`; the object they hold on a phone is react-native-webrtc's,
 * which does.
 */
export function streamURL(stream: unknown): string | null {
  const native = stream as { toURL?: () => string } | null | undefined
  return native?.toURL?.() ?? null
}

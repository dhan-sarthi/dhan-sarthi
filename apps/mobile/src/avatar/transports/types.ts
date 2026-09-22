// The seam between "a call is running" and "which company's SDK is running it".
//
// The screen does not know there are two providers, and `useAvatarCall` barely does: it reads
// one field off the grant and picks a module. Everything either transport is allowed to differ
// about lives behind this interface, so adding a third provider is a file, not a refactor.
//
// Two rules both transports keep, learned from a billed Runway call and confirmed on a billed
// Anam one:
//
//   1. **Report video when a frame is painted, not when a track arrives.** Both providers
//      publish audio seconds before the first decodable video frame, and revealing the tile on
//      subscription shows a black rectangle that reads as broken.
//   2. **Losing the connection is not hanging up.** The customer ending a call and the stream
//      dying under them look identical to the DOM and must not look identical on screen.
//
// Each transport has a web module and a `.native.ts` twin, picked by Metro. On the web the
// transport builds a `<video>` and puts it in `stage`; on a phone there is no DOM, so it hands
// the stream up through `onVideoStream` and the stage renders it (`src/avatar/CallVideo`). The
// first rule holds either way: native reports the painted frame from the video view itself.
import type { AvatarGrant } from '@dhan/contracts'

export interface ConnectOptions {
  grant: AvatarGrant
  /** Where the video goes, on the web. May be null if the screen has not laid out yet. */
  stage: HTMLDivElement | null
  /**
   * Native only: the remote video, as the stream URL a WebRTC view renders, or null when it goes
   * away. The web transports never call it; they put a `<video>` in `stage` instead.
   */
  onVideoStream?: (streamURL: string | null) => void
  /**
   * The customer's microphone, opened on the tap while the grant was being fetched. Null when it
   * was refused or is unavailable; the call goes ahead without it.
   */
  mic: MediaStream | null
  /** Called once, when a frame has actually been presented. */
  onVideoLive: () => void
  /** The video's real size, so the stage can frame the call by its shape. May repeat. */
  onVideoSize?: (width: number, height: number) => void
  /** The stream went away on its own. Never called for a hang-up we initiated. */
  onLost: () => void
}

export interface LiveConnection {
  /** The stage node changed — a remount, a rotation. Move the video, do not rebuild the call. */
  reattach: (node: HTMLDivElement | null) => void
  /** Idempotent. Tears down the SDK and removes every element it put in the document. */
  disconnect: () => Promise<void>
}

export type Connect = (opts: ConnectOptions) => Promise<LiveConnection>

/** What each transport module exports: the call, and a way to fetch its SDK ahead of the tap. */
export interface TransportModule {
  connect: Connect
  preload: () => Promise<unknown>
}

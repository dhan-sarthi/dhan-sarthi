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
import type { AvatarGrant } from '@dhan/contracts'

export interface ConnectOptions {
  grant: AvatarGrant
  /** Where the video goes. May be null if the screen has not laid out yet. */
  stage: HTMLDivElement | null
  /** Called once, when a frame has actually been presented. */
  onVideoLive: () => void
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

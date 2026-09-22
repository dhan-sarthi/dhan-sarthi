// Uday's video on the web: nothing to render.
//
// A web transport builds its own `<video>` and puts it in the stage's host view, which
// react-native-web hands over as a real DOM node, so the stage has no video of its own to draw.
// The phone has no DOM; `CallVideo.native.tsx` is the view that draws the call there, and this
// file exists so the stage can render one component on both.

export type CallVideoProps = {
  /** The remote stream, by the URL the native video view looks it up by. */
  streamURL: string
  /** A frame has been painted; until then the view keeps out of sight. */
  live: boolean
  /** A frame was painted at this size. Width and height are zero if the size never came. */
  onFrame: (width: number, height: number) => void
}

export function CallVideo(_: CallVideoProps) {
  return null
}

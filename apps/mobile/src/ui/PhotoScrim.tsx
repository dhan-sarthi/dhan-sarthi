// The contrast the copy carries on top of a photograph, rather than borrowing the photo's.
//
// Two stops: a short one under the status bar so the rail stays legible over a bright sky,
// and a tall one the headline block sits inside, terminating in ink so the copy never sits on
// bare image. Written once because welcome.tsx and ready.tsx had it byte-identical, ten lines
// each, and keeping two copies of a ramp in step by hand is exactly how `#0E3329` came to be
// written out twice in a codebase whose rule is that a hex never appears in a component.
//
// Both are measured from the screen, not fixed. The top one is a share of the window
// (`control.scrimTop`), so a 568pt phone does not spend a third of itself on a shadow. The
// bottom one is built around the copy it protects: the caller measures its headline block and
// passes it as `cover`, the ramp above it is a share of the window (`control.scrimBottom`), and
// the ramp reaches its deepest stop exactly where the copy begins. A fixed share of the screen
// did that on an 812pt phone and nowhere else — at 568pt with three lines of title, or at the
// largest text size, the headline rose off the dark band onto the photograph. Until the first
// measurement lands the band is assumed to be one ramp tall, which errs on the side of more ink.
//
// AvatarStage's pair is deliberately not folded in: different alphas, no ink terminator at the
// bottom, and nothing of its own to cover. It shares the two fractions, not the component.
import { useWindowDimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, control } from '@dhan/design'

/** The status-bar ramp, as a share of the window's height. */
const SCRIM_TOP = control.scrimTop
/** The ramp above the copy, as a share of the window's height. */
const SCRIM_BOTTOM = control.scrimBottom

export function PhotoScrim({ cover }: { cover?: number | undefined }) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const ramp = height * SCRIM_BOTTOM
  // The copy's block sits on the home-indicator inset, so the band runs to the screen's edge.
  const band = (cover ?? ramp) + insets.bottom
  const total = Math.min(height, ramp + band)
  const deep = Math.max(0, Math.min(1, (total - band) / total))

  return (
    <>
      <LinearGradient
        colors={[color.scrim, color.scrimFade]}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: height * SCRIM_TOP,
          pointerEvents: 'none',
        }}
      />
      <LinearGradient
        colors={[color.scrimFade, color.scrimDeep, color.ink]}
        locations={[0, deep, 1]}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: total,
          pointerEvents: 'none',
        }}
      />
    </>
  )
}

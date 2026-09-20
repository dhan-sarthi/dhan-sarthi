// The contrast the copy carries on top of a photograph, rather than borrowing the photo's.
//
// Two stops: a short one under the status bar so the rail stays legible over a bright sky,
// and a tall one the headline block sits inside, terminating in ink so the copy never sits on
// bare image. Written once because welcome.tsx and ready.tsx had it byte-identical, ten lines
// each, and keeping two copies of a ramp in step by hand is exactly how `#0E3329` came to be
// written out twice in a codebase whose rule is that a hex never appears in a component.
//
// AvatarStage's pair is deliberately not folded in: different alphas, different heights, and
// no ink terminator at the bottom. Parameterising those would be three props serving one
// caller, which makes this module shallower rather than deeper.
import { LinearGradient } from 'expo-linear-gradient'
import { color } from '@dhan/design'

export function PhotoScrim() {
  return (
    <>
      <LinearGradient
        colors={[color.scrim, color.scrimFade]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160 }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[color.scrimFade, color.scrimDeep, color.ink]}
        locations={[0, 0.55, 1]}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '58%' }}
        pointerEvents="none"
      />
    </>
  )
}

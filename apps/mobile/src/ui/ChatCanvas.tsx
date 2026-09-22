// The lit ground the conversation sits on.
//
// Every other screen in this app is flat cream, and that is right for them: a list of
// transactions is paper. The chat is not paper — it is the one screen where the product is
// a presence rather than a document, and a flat fill gives it nowhere to be. The reference
// solves this with a single wide bloom of warm light centred behind the conversation, and
// the whole depth system on that screen is built on it: the sheet, the pills and the
// composer are each a further wash of white over the *same* bloom, so five planes are
// separated by about ten points of lightness and never by a colour or a shadow.
//
// Three things about this that are easy to get wrong, and were:
//
//   1. **The bloom is wider than the phone.** Horizontal radius is 113% of the screen, so
//      its left and right edges are always off-screen and the eye never finds the boundary
//      of the effect. What you read is light falling on a surface, not a gradient applied
//      to one. Narrow it and it immediately becomes a coloured blob.
//   2. **The bloom is warm, and it is not green.** This is the counter-intuitive one. IDBI
//      is a green brand and the instinct is a green glow, but light at this lightness with
//      any real saturation lands in mint — the sickly wash — because a green tint that
//      stays above L*88 has nowhere to go but pistachio. So the bloom is `streak`, the
//      palette's own gold, at about 30% over the cream; the green enters as the *floor*
//      (`budget` at ~12%, a cool shadow under a warm core) and as the ink. Warm light,
//      cool shadow, green ink is how real light behaves, and it is also what the reference
//      does at its own bottom edge.
//   3. **It never moves.** Not with scroll, not with message count, not while Uday is
//      thinking. A ground that shifts under scrolling text is the fastest way to make a
//      chat feel cheap; holding it still is what lets it be this strong without distracting.
//      The motion budget on this screen belongs to the answer.
//
// Drawn in SVG because expo-linear-gradient is linear only and this shape is an ellipse.
// No className anywhere on the Svg — that would need a `cssInterop` registration, and a
// plain `style` reaches the same place without one.
//
// The falloff is sampled off the reference rather than left to SVG's linear interpolation: a
// straight ramp from 1 to 0 bands visibly across 800-odd points of screen and reads as a cone
// rather than as light. The five eased stops live with `ScoreGlow`, which pulls this same bloom
// in to a circle behind the credit figure, so the two lights cannot drift apart.
import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'
import { GLOW_FALLOFF } from '~/ui/ScoreGlow'
import { color } from '@dhan/design'

export const ChatCanvas = memo(function ChatCanvas() {
  return (
    // The accessibility props live on a View rather than on the Svg: react-native-svg's web
    // build forwards anything it does not recognise straight onto the DOM node, so
    // `accessibilityElementsHidden` and `importantForAccessibility` reach React as unknown
    // attributes and it warns on every render. A View implements both properly on all three
    // targets, and the Svg inside it inherits the result. `pointerEvents` is a style for the
    // same reason: the web build warns on the prop form.
    <View
      style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          {/* The base: a touch lighter than cream at the top, the cream itself through the
            middle, and the cool green floor at the bottom. */}
          <LinearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.canvasTop} />
            <Stop offset="0.47" stopColor={color.ground} />
            <Stop offset="1" stopColor={color.canvasFloor} />
          </LinearGradient>

          {/* The bloom. `ry` at 38% keeps the vertical falloff on screen; `rx` at 113% pushes
            the horizontal one off it. */}
          <RadialGradient id="bloom" cx="50%" cy="47%" rx="113%" ry="38%">
            {GLOW_FALLOFF.map(([offset, opacity]) => (
              <Stop
                key={offset}
                offset={offset}
                stopColor={color.canvasBloom}
                stopOpacity={opacity}
              />
            ))}
          </RadialGradient>
        </Defs>

        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ground)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bloom)" />
      </Svg>
    </View>
  )
})

// The light behind a big number: Cleo's money-health score, "63 out of 100" in a warm bloom.
//
// A score on a flat card is a statistic. The same figure standing in its own light is a result
// — something that was worked out about you — and that is the one thing a score screen has to
// say before anything else. So the glow is not decoration around the figure; it is how the
// figure is told apart from every other number in the app. So it is used for one figure per
// screen and never behind a list.
//
// It is ChatCanvas's bloom, pulled in to a circle: the same warm `canvasBloom`, so the chat and
// the score read as lit by one light. The ramp ends at zero opacity of the bloom itself rather
// than at a transparent white, so it dissolves into cream and into ink alike without a grey rim.
// `lime` swaps in `success` for a figure that is good news. On ink, keep the words inside the
// middle half, where the light is strong enough for ink type; the edge is dark again by design.
//
// The curve is not the canvas's, though. The canvas bloom is a wash across a whole light screen
// and its edge is never seen; this one is a disc on the ink hero, and there the canvas curve
// showed two faults. Its linear last quarter ended with a kink at the rim that the eye reads as a
// drawn ring, and its long middle spent a third of the radius half-lit, where warm cream over
// green mixes to olive-grey. `SCORE_FALLOFF` holds the light flatter across the figure, falls
// through the half-lit band faster, and eases into zero, so the rim has no edge to find.
//
// The sparkles are two gold marks off the figure's corners, drawn at fixed offsets, never
// animated, and hidden from assistive tech with the glow — they add nothing to what a screen
// reader should hear, which is the figure and its caption, in the caller's own words. Nothing
// here moves, so there is nothing for Reduce Motion to take away.
//
// SVG, because the shape is a circle and expo-linear-gradient is linear only. No className on
// the Svg: it would need a cssInterop registration, and `style` reaches the same place.
import { useId, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Glyph } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'

/**
 * The falloff ChatCanvas samples off the reference: five stops on an eased curve, because a
 * straight ramp bands into a cone. The canvas imports it from here.
 */
export const GLOW_FALLOFF: ReadonlyArray<readonly [string, number]> = [
  ['0', 1],
  ['0.25', 0.85],
  ['0.5', 0.63],
  ['0.75', 0.3],
  ['1', 0],
]

/**
 * The score's own curve: nearly full across the figure, through the half-lit band in a quarter
 * of the radius instead of a half, then three stops easing the tail so the rim has no kink.
 */
const SCORE_FALLOFF: ReadonlyArray<readonly [string, number]> = [
  ['0', 1],
  ['0.3', 0.92],
  ['0.5', 0.72],
  ['0.65', 0.45],
  ['0.78', 0.2],
  ['0.88', 0.07],
  ['0.95', 0.02],
  ['1', 0],
]

export function ScoreGlow({
  children,
  size = 260,
  tone = 'warm',
  sparkles = false,
  className,
}: {
  children: ReactNode
  /** The glow's diameter; the figure and its caption sit in the middle of it. */
  size?: number
  tone?: 'warm' | 'lime'
  sparkles?: boolean
  className?: string
}) {
  // One gradient id per instance: on web every Svg shares the document, and a second glow would
  // otherwise paint with the first one's stops.
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const bloom = tone === 'lime' ? color.success : color.canvasBloom

  return (
    <View
      className={cn('items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <View
        style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={id} cx="50%" cy="50%" r="50%">
              {SCORE_FALLOFF.map(([offset, opacity]) => (
                <Stop key={offset} offset={offset} stopColor={bloom} stopOpacity={opacity} />
              ))}
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
        </Svg>
        {sparkles ? (
          <>
            <View style={{ position: 'absolute', top: size * 0.24, right: size * 0.22 }}>
              <Glyph name="sparkle" size={16} tint={color.streak} />
            </View>
            <View style={{ position: 'absolute', bottom: size * 0.28, left: size * 0.22 }}>
              <Glyph name="sparkle" size={12} tint={color.streak} />
            </View>
          </>
        ) : null}
      </View>
      {children}
    </View>
  )
}

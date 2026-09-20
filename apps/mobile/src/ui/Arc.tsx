// The credit industry's own gauge, drawn properly and left empty.
//
// **Why a curve at all.** Every other fraction in this product is rectilinear, and on purpose:
// `Meter` is a capsule, `SpendBars` is `Meter` stood on end, `ProgressRail` is four of them in a
// row, `DayGrid` is a dot a day. `SpendBars.tsx:3-9` argues why — NativeWind registers no SVG
// component, so a shape drawn in SVG is a shape whose every colour, radius and gutter is a prop
// carrying a raw value, and it becomes the one surface in the app whose fill is not the same
// lookup as the thing beside it. That rule is right, and this is the case it anticipates. The
// semicircular gauge is the category's icon; a customer knows what it is before reading a word
// of the card, and it is the one shape here that cannot be assembled from views at any quality
// worth shipping. It also has to be the *real* shape rather than an approximation of one,
// because the whole argument of the screen it sits on is that the gauge everybody else fills
// with a number is one we have not earned the right to fill. A blank rectangle is a widget that
// failed to load; a blank gauge, drawn correctly at full size, is a statement.
//
// **Exactly 180°, where the reference sweeps 214°.** A semicircle is self-evidently a
// left-to-right scale: its two ends sit on one horizontal line, so the two end labels sit flat
// under the two caps and nothing has to explain where the scale begins. Past 180° both ends
// drop below that line and the drawing owes the customer an explanation of its own geometry —
// which on this card would be spent explaining a gauge rather than explaining why it is empty.
// The extra 34° buys nothing here anyway: there is no needle, no number and no sweep to give
// room to. A semicircle's box is also exactly half its circle, so the card's height is
// predictable at every width, and the three fact lines underneath stay in the same viewport as
// the arc at 375pt — which is an acceptance criterion for this card, not a hope.
//
// **The caps are inside the viewBox, and that is what the extra `STROKE` of height buys.** A
// 16pt stroke with round caps bulges 8pt past the chord at each end. A box of `2r + STROKE` by
// `r` — the obvious one — clips both caps flat at exactly the two points the end labels draw
// the eye to, and a shape sheared off at its ends reads as a rendering bug rather than as a
// deliberately empty gauge. So the centre line sits at `r + STROKE / 2` and the box is
// `r + STROKE` tall: the bulge is inside it, nothing else moves, and the cost is 8pt.
//
// **The progress stroke is thinner than the track, 8 against 16.** Measured off the reference
// at @3x, which runs 17 and 9, leaving about 4pt of track showing each side. Concentric and
// equal would hide the track entirely wherever the value reached, and a gauge whose scale
// disappears under its own reading has stopped being a scale. Leaving the track visible on both
// flanks is the same idea as `Meter`'s fill sitting *inside* its capsule rather than replacing
// it, and it is the single detail that stops this reading as a stock donut chart.
//
// The progress stroke is drawn only when `value !== null`, which today is never: no bureau pull
// has been made, so there is nothing to sweep. When one lands, this file does not change.
import { useEffect, useState } from 'react'
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { Type } from '~/ui/Text'
import { dur, timing } from '~/ui/motion'
import { color, space } from '@dhan/design'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/** The track, and therefore the height the caps need. See the header. */
const STROKE = 16

/** The sweep. Half the track, so about 4pt of track stays visible on each flank. */
const PROGRESS = 8

/**
 * The radius is measured, then clamped at both ends.
 *
 * The floor is what keeps the arc a gauge rather than a bangle on a 320pt phone, where the
 * card's interior is 248pt. The ceiling is the layout rule: at 128 the drawing is 144pt tall,
 * and the eyebrow, headline, body and three fact lines that follow it still land above the fold
 * of a 375 × 812 viewport. A hard-coded radius fails at one end or the other — this is the
 * arithmetic the card cannot be allowed to get wrong on a device nobody tested on.
 */
const R_MIN = 96
const R_MAX = 128

export function Arc({
  value,
  chord,
  startLabel,
  endLabel,
  delay = 0,
}: {
  /** 0..1 of the sweep. Null draws the track alone, which is the shipping state. */
  value: number | null
  /** The label in the aperture under the figure. */
  chord: string
  /** Flat under the two caps. */
  startLabel: string
  endLabel: string
  /** Held back so the sweep does not race the card's entrance. */
  delay?: number
}) {
  const { width: windowWidth } = useWindowDimensions()
  const [measured, setMeasured] = useState(0)

  // Seeded from the window and the two gutters it sits inside, so the first painted frame is
  // already the right size and the measurement only ever replaces an assumption with a fact —
  // `InsightCarousel.tsx:96-105`'s rule. Seeding from zero instead would paint one frame of a
  // collapsed arc, which on a card whose subject is an empty gauge is indistinguishable from
  // the thing having failed.
  const width = measured > 0 ? measured : windowWidth - 2 * space.pad - 2 * space.lg

  const r = Math.max(R_MIN, Math.min(R_MAX, (width - STROKE) / 2))
  const boxWidth = 2 * r + STROKE
  const boxHeight = r + STROKE
  const centre = r + STROKE / 2
  const half = Math.PI * r

  /*
   * Half a circle, cut out of a whole one with the dash pattern.
   *
   * `[half, 2 * half]` rather than the obvious `[half, half]`: the path is a full circle, so an
   * off-segment of exactly `half` puts the *next* on-segment back on the path, and every point
   * the offset pushes off the top of the arc reappears along the bottom of the circle as a
   * second stroke nobody asked for. An off-segment as long as the whole circumference has
   * nowhere to repeat inside the path, so the only ink is the sweep.
   *
   * Rotated 180° about the centre because a circle starts at 3 o'clock and runs clockwise: half
   * a turn puts the start at 9 o'clock, so the pattern is laid down left to right over the top —
   * the direction the two end labels promise.
   */
  const dash: readonly number[] = [half, 2 * half]

  const target = value === null ? 0 : Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))

  // Shared value seeded at 0 and moved by an effect, never a `useDerivedValue` returning an
  // animation: a derived value has no defined first frame, and the one failure mode this
  // component cannot have is a full arc for a frame. `Meter.tsx:12-16` states the rule; here
  // the flash would be the app telling somebody we pulled their score.
  const drawn = useSharedValue(0)

  useEffect(() => {
    drawn.value = withDelay(delay, withTiming(target, timing(dur.count)))
  }, [target, delay, drawn])

  // `dur.count`, like `Meter` and `SpendBars`: an arc filling is a number being said.
  const sweep = useAnimatedProps(() => ({ strokeDashoffset: half * (1 - drawn.value) }))

  return (
    // The a11y props live on a View rather than on the `Svg`, for `ChatCanvas.tsx:53-58`'s
    // reason: react-native-svg forwards what it does not recognise straight at the platform, so
    // they never reach it as accessibility at all. `accessible` on the wrapper also collapses
    // the dash, the chord and the two end labels into one announcement, which is what the
    // drawing is — one object saying one thing.
    //
    // The noun is composed here rather than taken as a prop because the three strings it names
    // are props already, and a fourth restating them is how a label and a drawing drift apart.
    // When a second caller exists, it becomes a prop; today there is one, and it is a gauge of
    // exactly one thing.
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`A credit bureau's score, on a scale of ${startLabel} to ${endLabel}. ${chord}.`}
      className="w-full items-center"
      onLayout={(e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width)}
    >
      <View style={{ width: boxWidth, height: boxHeight }}>
        <Svg width={boxWidth} height={boxHeight} viewBox={`0 0 ${boxWidth} ${boxHeight}`}>
          {/* Colours are props read from `@dhan/design`, never classes: `interop.ts` registers
              no SVG component, and a `className` here would be dropped in silence. */}
          <Circle
            cx={centre}
            cy={centre}
            r={r}
            fill="none"
            stroke={color.hairline}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={dash}
            rotation={180}
            originX={centre}
            originY={centre}
          />
          {value !== null && (
            <AnimatedCircle
              cx={centre}
              cy={centre}
              r={r}
              fill="none"
              stroke={color.brand}
              strokeWidth={PROGRESS}
              strokeLinecap="round"
              strokeDasharray={dash}
              // The static value is the empty state, so a frame rendered before the worklet
              // first runs is an empty arc rather than a full one.
              strokeDashoffset={half}
              animatedProps={sweep}
              rotation={180}
              originX={centre}
              originY={centre}
            />
          )}
        </Svg>

        {/* React Native text over the drawing, not `Text` from react-native-svg. SVG text
            resolves its own font and takes a free-form size, and these three strings would
            become the only ones in the app outside the seven roles — on the card whose job is
            to look like it belongs. */}
        <View pointerEvents="none" className="absolute inset-0 items-center justify-end pb-lg">
          {/* An em dash and not a numeral, because there is no numeral: the only figure that
              belongs in this aperture is a bureau score, and the card exists to say we have not
              pulled one. `value` is the sweep alone. When a pull lands this gains a figure and
              the dash is what it replaces. */}
          <Type role="display">—</Type>
          <Type role="label" tone="soft" className="mt-xs">
            {chord}
          </Type>
        </View>
      </View>

      {/* Flat under the caps, at the box's own width — the cap centres sit `STROKE / 2` inside
          each edge, which is closer to the label than any nudge would be worth. */}
      <View className="mt-sm flex-row justify-between" style={{ width: boxWidth }}>
        <Type role="caption" tone="faint">
          {startLabel}
        </Type>
        <Type role="caption" tone="faint">
          {endLabel}
        </Type>
      </View>
    </View>
  )
}

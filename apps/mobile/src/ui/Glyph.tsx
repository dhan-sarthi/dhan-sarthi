// A tiny stroked icon set.
//
// Drawing them here rather than shipping an icon package is what keeps the stroke weight
// consistent with the chevrons in NavRow, and it is still cheaper than the smallest package
// that would cover this many marks. The set has grown a long way past the four it started
// with, and the rule that kept it coherent has not moved: one 24 grid, one 1.7 stroke, round
// caps and joins, no fills. A glyph that needs a different weight to read is a glyph drawn
// wrong, not a reason for a second weight.
import Svg, { Path, Circle } from 'react-native-svg'
import { View } from 'react-native'
import { color } from '@dhan/design'

export type GlyphName =
  | 'ledger'
  | 'shield'
  | 'compass'
  | 'check'
  | 'lock'
  | 'spend'
  | 'plan'
  | 'uday'
  | 'grow'
  | 'bell'
  | 'person'
  | 'chevronRight'
  | 'chevronDown'
  | 'send'
  // The budget set. Drawn on the same 24 grid at the same weight as everything above.
  | 'sliders'
  | 'plus'
  | 'minus'
  | 'thumbUp'
  | 'thumbDown'
  | 'arrowRight'
  | 'paycheck'
  | 'receipt'
  | 'gauge'
  | 'basket'
  | 'sparkle'
  // The save and challenge set. `chevronDown` is not repeated here — the sheet handle above
  // is the same mark and the same drawing, and a second entry for it would be two glyphs the
  // app could drift apart.
  | 'clock'
  | 'star'
  | 'moneybag'
  | 'flame'
  | 'target'
  | 'info'
  | 'pencil'
  | 'calendar'
  | 'chevronLeft'
  | 'coins'

const PATHS: Record<GlyphName, React.ReactNode> = {
  ledger: <Path d="M5 4h11l3 3v13H5V4zM8 9h8M8 13h8M8 17h5" />,
  shield: <Path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3z" />,
  compass: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M15 9l-2 5-4 1 2-5 4-1z" />
    </>
  ),
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  lock: (
    <>
      <Path d="M6 11h12v9H6v-9zM9 11V8a3 3 0 016 0v3" />
    </>
  ),
  // The five tab marks. Drawn on the same 24 grid with the same stroke so they read as
  // one set inside the circular plates of the tab bar.
  spend: <Path d="M8 16L16 8M9.5 8H16v6.5" />,
  plan: <Path d="M4 18h4l3-9 3 13 3-8h3" />,
  uday: (
    <>
      <Circle cx={12} cy={9.5} r={3.5} />
      <Path d="M5.5 20a6.5 6.5 0 0113 0" />
    </>
  ),
  grow: <Path d="M4 17l5-5 3.5 3.5L20 8M20 8h-4.5M20 8v4.5" />,
  bell: <Path d="M6 17h12l-1.5-2.5V11a4.5 4.5 0 10-9 0v3.5L6 17zM10.5 20h3" />,
  person: (
    <>
      <Circle cx={12} cy={9} r={3.5} />
      <Path d="M5.5 20a6.5 6.5 0 0113 0" />
    </>
  ),
  chevronRight: <Path d="M9 5l7 7-7 7" />,
  // The sheet's handle. Wider and shallower than `chevronRight` turned on its side,
  // because it is read as a direction of travel rather than as a control's affordance —
  // it points down at what is hidden and rotates to point up once it is shown.
  chevronDown: <Path d="M4 10l8 4.5L20 10" />,
  send: <Path d="M12 19V6M6 12l6-6 6 6" />,
  // Sliders rather than a gear. A gear small enough to sit on a 36pt plate is a hub with
  // eight short rays, which is a drawing of the sun — it was read as one. Two rails and two
  // knobs stay legible at 18px and say the truer thing anyway: what is behind this control
  // is values to adjust, not a settings menu.
  sliders: (
    <>
      <Path d="M4 9h6M14.2 9H20M4 15h2.4M10.6 15H20" />
      <Circle cx={12.1} cy={9} r={2.1} />
      <Circle cx={8.5} cy={15} r={2.1} />
    </>
  ),
  plus: <Path d="M12 6v12M6 12h12" />,
  minus: <Path d="M6 12h12" />,
  thumbUp: (
    <Path d="M7 20V10l4.5-6 1 .7a2 2 0 01.8 2L12.5 10H18a2 2 0 012 2.4l-1.2 5.6a2 2 0 01-2 1.6H7zM7 10H4v10h3" />
  ),
  thumbDown: (
    <Path d="M17 4v10l-4.5 6-1-.7a2 2 0 01-.8-2l.8-3.3H6a2 2 0 01-2-2.4l1.2-5.6A2 2 0 017.2 4H17zM17 14h3V4h-3" />
  ),
  arrowRight: <Path d="M4 12h15M13 6l6 6-6 6" />,
  paycheck: (
    <>
      <Path d="M3 7h18v10H3V7z" />
      <Circle cx={12} cy={12} r={2.5} />
      <Path d="M6.5 12h.01M17.5 12h.01" />
    </>
  ),
  receipt: <Path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21V3zM9.5 8h5M9.5 12h5" />,
  gauge: (
    <>
      <Path d="M4 17a8 8 0 1116 0" />
      <Path d="M12 17l4-5" />
    </>
  ),
  basket: <Path d="M4 9h16l-1.6 9.2a2 2 0 01-2 1.8H7.6a2 2 0 01-2-1.8L4 9zM9 9l2-5M15 9l-2-5" />,
  sparkle: (
    <Path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
  ),
  // The save and challenge set.
  clock: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 7.6V12l2.9 1.9" />
    </>
  ),
  star: (
    <Path d="M12 3.6l2.6 5.3 5.9.8-4.3 4.2 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.2 5.9-.8L12 3.6z" />
  ),
  // A bag with a cinched neck and a rupee mark. The mark is two bars and a leg rather than a
  // true ₹ — the glyph's interior is six points tall at 22px, and a faithful ₹ closes up into
  // a blot at that size. Two bars and a leg is what survives, and it is still unmistakably the
  // right currency next to a Latin S or a dollar bar.
  moneybag: (
    <>
      <Path d="M9.6 3.5h4.8l-1.3 2.9h-2.2L9.6 3.5z" />
      <Path d="M10.9 6.4C7.9 7.8 5.6 10.8 5.6 14.1c0 3.7 2.6 6.4 6.4 6.4s6.4-2.7 6.4-6.4c0-3.3-2.3-6.3-5.3-7.7" />
      <Path d="M10.3 11.3h3.4M10.3 13.1h3.4M12.9 11.3c1 0 1.6.9 1 1.7l-1.8 2.9" />
    </>
  ),
  // One closed outline, not an outer flame with an inner one. The inner tongue is the first
  // thing to disappear when this is drawn at the 14px a bar-chart plate gives it, and a flame
  // with a mysterious blob inside is worse than a flame with none. The kink on the left edge
  // is what stops the remaining silhouette reading as a teardrop.
  flame: (
    <Path d="M13.4 3.2c.7 2.5-.4 4-1.9 5.4-1.8 1.7-3.9 3.3-3.9 6.1a5.4 5.4 0 0010.8 0c0-2.4-1.1-4-2.5-5.6-.2 1.3-.9 2.1-1.8 2.4.5-2.9-.1-5.6-.7-8.3z" />
  ),
  target: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Circle cx={12} cy={12} r={4.4} />
      <Circle cx={12} cy={12} r={1.3} />
    </>
  ),
  info: (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 11.2v4.9M12 8.2h.01" />
    </>
  ),
  pencil: (
    <>
      <Path d="M4 20l1-4L16.4 4.6a2.1 2.1 0 013 3L8 19l-4 1z" />
      <Path d="M14.4 6.6l3 3" />
    </>
  ),
  calendar: <Path d="M4.5 6.5h15v14h-15v-14zM8 3.8v5.4M16 3.8v5.4M4.5 11.4h15" />,
  chevronLeft: <Path d="M15 5l-7 7 7 7" />,
  // Two coins, the back one offset up and left, because a single stack of ellipses reads as a
  // barrel. The front coin is a closed ellipse drawn over the back one's side, which is what
  // gives the overlap without either outline being clipped.
  coins: (
    <>
      <Path d="M4 7.6c0-1.5 2.6-2.6 5.8-2.6s5.8 1.1 5.8 2.6-2.6 2.7-5.8 2.7S4 9.1 4 7.6z" />
      <Path d="M4 7.6v3.6c0 1.5 2.6 2.7 5.8 2.7.9 0 1.8-.1 2.6-.3" />
      <Path d="M14.2 10.8c3.2 0 5.8 1.2 5.8 2.7s-2.6 2.7-5.8 2.7-5.8-1.2-5.8-2.7 2.6-2.7 5.8-2.7z" />
      <Path d="M8.4 13.5v2.9c0 1.5 2.6 2.7 5.8 2.7s5.8-1.2 5.8-2.7v-2.9" />
    </>
  ),
}

export function Glyph({
  name,
  tint = color.ink,
  size = 22,
}: {
  name: GlyphName
  tint?: string
  size?: number
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={tint}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </Svg>
  )
}

/** The circular tinted plate Cleo puts behind a row glyph. */
export function GlyphPlate({
  name,
  fill = 'bg-ground-deep',
  tint,
  size = 40,
}: {
  name: GlyphName
  fill?: string
  tint?: string
  size?: number
}) {
  return (
    <View
      className={`items-center justify-center rounded-pill ${fill}`}
      style={{ width: size, height: size }}
    >
      <Glyph name={name} size={Math.round(size * 0.55)} {...(tint === undefined ? {} : { tint })} />
    </View>
  )
}

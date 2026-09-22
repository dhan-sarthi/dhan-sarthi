// A tiny stroked icon set.
//
// Drawing them here rather than shipping an icon package is what keeps the stroke weight
// consistent with the chevrons in NavRow, and it is still cheaper than the smallest package
// that would cover this many marks. The set has grown a long way past the four it started
// with, and the rule that kept it coherent has not moved: one 24 grid, one 1.7 stroke, round
// caps and joins, no fills. A glyph that needs a different weight to read is a glyph drawn
// wrong, not a reason for a second weight.
//
// A glyph is always decorative. It never carries a label of its own: the row, button or plate
// around it says what it means, and a screen reader that also announced "image" for every mark
// would say everything twice. So the root hides itself from assistive tech on every platform —
// `aria-hidden` on web, where react-native-svg hands unknown props straight to the DOM and
// React would warn about the native spellings, and the two native props everywhere else.
import { Platform, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { color, size as SIZE } from '@dhan/design'
import { cn } from '~/ui/cn'

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
  // The save and challenge set.
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
  // The polish set: what Cleo's menus, sheets, notices and category plates need. Same grid,
  // same stroke — `close` beside `chevronLeft` is the test, and they weigh the same.
  | 'close'
  | 'logout'
  | 'link'
  | 'external'
  | 'card'
  | 'wallet'
  | 'chat'
  | 'refresh'
  | 'eye'
  | 'repeat'
  | 'tag'
  | 'alert'
  | 'bank'
  | 'phone'
  | 'heart'
  | 'umbrella'
  | 'fork'
  | 'bus'
  | 'bag'
  | 'home'
  | 'film'

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
  // The same chevron as `chevronRight`, turned a quarter. One drawing for every direction,
  // so a disclosure that opens downward and a row that leads right cannot drift into two
  // weights of the same mark.
  chevronDown: <Path d="M6 9l6 6 6-6" />,
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
  // The polish set. Sheets and modals close with a cross; a menu row leaves the app with a
  // link or an arrow out of its box; the rest are the marks a profile menu, a notice card and a
  // spending category need to be told apart at a glance.
  close: <Path d="M6 6l12 12M18 6L6 18" />,
  logout: <Path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />,
  link: (
    <Path d="M10 14a4 4 0 010-5.7l2.3-2.3a4 4 0 015.7 5.7L17 12.7M14 10a4 4 0 010 5.7l-2.3 2.3a4 4 0 01-5.7-5.7L7 11.3" />
  ),
  external: <Path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6" />,
  card: <Path d="M3 7h18v11H3V7zM3 11h18M7 15h4" />,
  wallet: <Path d="M4 8h14a2 2 0 012 2v8H6a2 2 0 01-2-2V8zM4 8V6a1 1 0 011-1h11M15.5 14h.01" />,
  chat: <Path d="M5 5h14v10H10l-5 4V5z" />,
  refresh: <Path d="M20 12a8 8 0 01-14.5 4.6M4 12A8 8 0 0118.5 7.4M18 3v4.5h-4.5M6 21v-4.5h4.5" />,
  eye: (
    <>
      <Path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <Circle cx={12} cy={12} r={3} />
    </>
  ),
  repeat: <Path d="M17 3l3 3-3 3M20 6H8a4 4 0 00-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 004-4v-1" />,
  tag: (
    <>
      <Path d="M3 12V4h8l9 9-8 8-9-9z" />
      <Path d="M7.5 7.5h.01" />
    </>
  ),
  alert: <Path d="M12 4l9 16H3l9-16zM12 10v4M12 17h.01" />,
  bank: <Path d="M3 10l9-6 9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 20h18" />,
  phone: (
    <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />
  ),
  heart: <Path d="M12 20s-7-4.6-7-10a3.8 3.8 0 017-2 3.8 3.8 0 017 2c0 5.4-7 10-7 10z" />,
  umbrella: (
    <>
      <Path d="M3 12a9 9 0 0118 0H3z" />
      <Path d="M12 12v6a2 2 0 004 0" />
      <Path d="M12 3v1" />
    </>
  ),
  // The category plates. A fork and a knife for eating out, a bus for getting about, a bag for
  // shopping, a house for rent and bills, a film frame for entertainment.
  fork: (
    <>
      <Path d="M7 3v5a2 2 0 004 0V3M9 3v18" />
      <Path d="M17 3a3 5 0 00-2 5v3h2v10" />
    </>
  ),
  bus: (
    <>
      <Path d="M5 5h14a1 1 0 011 1v10a2 2 0 01-2 2H6a2 2 0 01-2-2V6a1 1 0 011-1z" />
      <Path d="M4 11h16" />
      <Path d="M7.5 15h.01M16.5 15h.01" />
      <Path d="M7 18v2M17 18v2" />
    </>
  ),
  bag: (
    <>
      <Path d="M5 8h14l-1 12H6L5 8z" />
      <Path d="M9 8V6a3 3 0 016 0v2" />
    </>
  ),
  home: (
    <>
      <Path d="M4 11l8-7 8 7" />
      <Path d="M6 10v10h12V10" />
      <Path d="M10 20v-6h4v6" />
    </>
  ),
  film: (
    <>
      <Path d="M4 5h16v14H4z" />
      <Path d="M4 9h16M4 15h16M8 5v14M16 5v14" />
    </>
  ),
}

// Hidden from assistive tech, in each platform's own spelling. react-native-svg's web layer
// builds its element through react-native-web, which turns `aria-hidden` into the attribute
// and would pass the native names through to the DOM untouched.
const DECORATIVE =
  Platform.OS === 'web'
    ? ({ 'aria-hidden': true } as const)
    : ({
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
      } as const)

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
      {...DECORATIVE}
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

/**
 * The tinted plate Cleo puts behind a row glyph.
 *
 * `plain` keeps the box and drops the fill: Section's ⓘ sits inside a 44pt Tap and wants the
 * mark, not a disc. With no plate edge to keep clear of, the glyph takes the whole box —
 * Cleo's ⓘ ring measures 19pt, and `info` drawn at the 28pt ring size lands on 18.7.
 * `bubble` is the plate on a smart-insight card: three round corners and a square bottom-left,
 * the shape of something said. Both are the same 40pt plate otherwise, and the plate is what a
 * `hitSlop` is measured from when it sits inside a Tap.
 */
export function GlyphPlate({
  name,
  fill = 'bg-ground-deep',
  tint,
  size = SIZE.plateLg,
  plain = false,
  shape = 'circle',
  className,
}: {
  name: GlyphName
  fill?: string
  tint?: string
  size?: number
  plain?: boolean
  shape?: 'circle' | 'bubble'
  className?: string
}) {
  return (
    <View
      className={cn(
        'items-center justify-center',
        shape === 'bubble' ? 'rounded-lg rounded-bl-none' : 'rounded-pill',
        !plain && fill,
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Glyph
        name={name}
        size={plain ? size : Math.round(size * 0.55)}
        {...(tint === undefined ? {} : { tint })}
      />
    </View>
  )
}

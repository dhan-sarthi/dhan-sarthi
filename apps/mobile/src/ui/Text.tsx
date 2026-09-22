// Typography, as eight named roles rather than free-form sizes.
//
// Cleo's onboarding only ever uses a handful of text sizes, and the rhythm of the
// screens comes from that restraint. Exposing roles instead of a size prop keeps
// the restraint enforceable: a screen that needs another size is a design question,
// not something to solve inline with text-[17px].
//
// React Native's own TextProps already carries a `role` (the ARIA one, whose union
// includes 'heading'), so ours has to displace it or the two intersect down to that
// single value. Displacing it is the better trade anyway: the roles that are visually
// headings announce themselves as headings, without every call site remembering to.
import { Text as RNText, type TextProps } from 'react-native'
import { cn } from '~/ui/cn'

// `answer` is the sixth role, and it was a design decision rather than an inline size.
//
// The chat is the app's only long-form reading surface: an answer runs four to six lines
// of dense rupee figures, and the other five roles all fail it in a specific way. `title`
// (26/31 bold) was what the screen used, and six lines of it is not emphasis — it is a
// wall, and it left no room for the evidence underneath. `body` (15/22) is the transaction
// row's size and makes the one thing the customer asked for look like a list item. 18/26 is
// the measured shape of the reference's answer text, with the leading opened from its 20 to
// 26 because our sentences carry more numerals per line than English prose does.
// `figure` is the eighth, and it was argued in the same way.
//
// Cleo sets its one headline number — the money-health score, the budget left — as the largest
// thing on the screen, several times the size of the title above it, and the number *is* the
// screen. `display` (32/36) is a page title and cannot do that job: set in the credit score's
// glow it filled a quarter of the glow and read as a caption, which the Impeccable finish review
// failed twice against Cleo's reference. 72/72 bold with tight tracking is the measured shape of
// the reference figure at 375pt. It is for a single hero number per screen and nothing else — a
// balance on a card is `title`, a figure in a sentence is the sentence's own role.
export type Role =
  'figure' | 'display' | 'title' | 'answer' | 'heading' | 'body' | 'label' | 'caption'

// Exported so an Animated.Text — which cannot be a `Type`, because its colour is a shared
// value rather than a tone class — still draws its size and weight from the same seven roles.
// Without this a pill label animating its colour would quietly become a free-form size.
export const ROLE: Record<Role, string> = {
  figure: 'text-figure font-bold tracking-figure',
  display: 'text-display font-bold tracking-display',
  title: 'text-title font-bold tracking-title',
  answer: 'text-answer font-normal tracking-answer',
  heading: 'text-heading font-semibold',
  body: 'text-body font-normal',
  label: 'text-label font-medium',
  caption: 'text-caption font-medium',
}

const STYLE = ROLE

const HEADINGS: ReadonlySet<Role> = new Set<Role>(['display', 'title', 'heading'])

// A weight on top of a role, never a size. `body` at semibold is the row-title idiom — the
// size the row already reads at, made to lead — and it is what stops an eighth role appearing
// the first time a title has to share a line with its value. The role's own weight is swapped
// out rather than joined: two `font-*` classes on one node resolve by stylesheet order on web,
// where `font-bold` beats a later `font-normal` every time.
export type Weight = 'regular' | 'medium' | 'semibold' | 'bold'

const WEIGHT: Record<Weight, string> = {
  regular: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}

const WEIGHT_CLASS = /\bfont-(normal|medium|semibold|bold)\b/

/**
 * How far Dynamic Type may grow each role.
 *
 * Never `allowFontScaling={false}`: a customer who set large type gets large type. But a
 * display figure at 2× is 64pt and no longer fits a 375pt card beside its own label, so the
 * big roles are capped and the small ones — the body a customer actually reads — scale all
 * the way. A call site can still pass its own `maxFontSizeMultiplier` where a layout allows
 * more.
 */
export const FONT_CAP: Record<Role, number> = {
  // Already the largest thing on the screen; its label beside it carries Dynamic Type.
  figure: 1,
  display: 1.2,
  title: 1.3,
  heading: 1.5,
  answer: 1.6,
  body: 2,
  label: 2,
  caption: 2,
}

const TONE = {
  ink: 'text-ink',
  mid: 'text-ink-mid',
  soft: 'text-ink-soft',
  faint: 'text-ink-faint',
  onInk: 'text-on-ink',
  brand: 'text-brand',
  danger: 'text-danger',
} as const

export type TypeProps = Omit<TextProps, 'role'> & {
  role?: Role
  tone?: keyof typeof TONE
  weight?: Weight
  /**
   * Announce as text even at a heading size. A figure typeset at `display` — a balance, a
   * score, a rate — is a value, not a section, and it must not fill the headings rotor.
   */
  plain?: boolean
  className?: string
}

export function Type({
  role = 'body',
  tone = 'ink',
  weight,
  plain = false,
  className,
  ...rest
}: TypeProps) {
  const style =
    weight === undefined ? STYLE[role] : STYLE[role].replace(WEIGHT_CLASS, WEIGHT[weight])
  return (
    <RNText
      accessibilityRole={!plain && HEADINGS.has(role) ? 'header' : 'text'}
      maxFontSizeMultiplier={FONT_CAP[role]}
      {...rest}
      className={cn(style, TONE[tone], className)}
    />
  )
}

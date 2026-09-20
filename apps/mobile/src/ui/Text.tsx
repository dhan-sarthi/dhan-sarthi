// Typography, as seven named roles rather than free-form sizes.
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
export type Role = 'display' | 'title' | 'answer' | 'heading' | 'body' | 'label' | 'caption'

// Exported so an Animated.Text — which cannot be a `Type`, because its colour is a shared
// value rather than a tone class — still draws its size and weight from the same seven roles.
// Without this a pill label animating its colour would quietly become a free-form size.
export const ROLE: Record<Role, string> = {
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
  className?: string
}

export function Type({ role = 'body', tone = 'ink', className, ...rest }: TypeProps) {
  return (
    <RNText
      accessibilityRole={HEADINGS.has(role) ? 'header' : 'text'}
      {...rest}
      className={cn(STYLE[role], TONE[tone], className)}
    />
  )
}

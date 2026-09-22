// A question you are about to ask, and the shapes it shares with the one you asked.
//
// Three things changed from what this was, and the first is the one that carries the look.
//
// **It flushes right.** The wrap used to default to `justify-start`, so three questions of
// different lengths began at the same x and the sheet read as a settings list. In the
// reference the right edge is the only aligned edge — which puts the choices on the same
// side as your own message bubble, and that is the whole reason they read as things *you*
// are about to say rather than as navigation the app is offering.
//
// **It rests lighter than the sheet, not darker.** It was `bg-ground` — cream — on a white
// sheet, which made every pill a well sunk *into* the surface it sits on, exactly inverting
// the depth system. The canvas, the sheet and the pill are now three stacked washes of
// white over one bloom, each a step lighter than the last, which is how the reference gets
// five planes out of ten points of lightness without a single shadow.
//
// **It is 46pt and it is a speech bubble.** It was 42pt — under the 44pt touch minimum —
// and a full capsule. A capsule is a tag, something that labels a thing; a 16pt-radius
// rectangle with one square corner is an utterance. Measured on Cleo (393pt): the chips and
// the customer's own bubble share one silhouette, square at the bottom right — the tail that
// points at the speaker — so that tapping one visibly turns it into the other. `Bubble` is
// that silhouette, and both of them are drawn from it.
//
// Uday's side of the same idea is `lead`: his portrait at the foot of a white bubble whose
// square corner points at him, which is how Cleo offers "Need help? Ask Cleo" on a page that
// is not the chat. A lead with `ask` and no `onPress` is a door into the Uday tab with the
// question already asked, so any screen can offer one without knowing how the chat works.
import type { ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'
import { Image } from 'expo-image'
import { UDAY_PORTRAIT } from '@dhan/assets'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { Section } from '~/ui/Section'
import { useToTab } from '~/ui/NavRow'
import { cn } from '~/ui/cn'

const BUBBLE_TONE = {
  /** A choice on the chat sheet: the lightest wash over the bloom. */
  pill: 'border border-hairline-soft bg-pill-wash',
  /** What you said: the one opaque near-white on the chat screen. */
  raised: 'border border-hairline-soft bg-surface-raised',
} as const

/** The customer's side of the conversation: rounded, with the tail at the bottom right. */
export function Bubble({
  tone,
  className,
  children,
  ...rest
}: Omit<ViewProps, 'children'> & {
  tone: keyof typeof BUBBLE_TONE
  className?: string
  children: ReactNode
}) {
  return (
    <View
      {...rest}
      className={cn('rounded-chip rounded-br-none px-lg py-md', BUBBLE_TONE[tone], className)}
    >
      {children}
    </View>
  )
}

type SuggestionProps = {
  /** What the pill says. The chat shortens its openers; the full question goes in the label. */
  label: string
  /** What VoiceOver says, when the pill's words are a shortening of the question. */
  accessibilityLabel?: string
  accessibilityHint?: string
  /** `chip` sits on the chat sheet, flushed right; `lead` is Uday's bubble with his face. */
  variant?: 'chip' | 'lead'
  disabled?: boolean
} & (
  | { onPress: () => void; ask?: string }
  /** No `onPress`: pressing opens the Uday tab and asks this. */
  | { onPress?: undefined; ask: string }
)

export function Suggestion({
  label,
  accessibilityLabel,
  accessibilityHint,
  variant = 'chip',
  disabled,
  onPress,
  ask,
}: SuggestionProps) {
  // Asks Uday from wherever the bubble is drawn — /credit as well as the tabs — by switching to
  // his tab, which asks once and clears the param.
  const toTab = useToTab()
  const press =
    onPress ?? (() => toTab({ pathname: '/(tabs)/uday', params: { ask: ask ?? label } }))

  if (variant === 'lead') {
    return (
      <Tap
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint ?? (onPress ? undefined : 'Asks Uday')}
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        // Opening another tab is navigation, which carries no haptic in this app.
        haptic="none"
        onPress={press}
        scale={0.98}
        className="max-w-full flex-row items-end gap-sm self-start"
      >
        <Image
          source={UDAY_PORTRAIT}
          className="h-ring w-ring rounded-pill"
          contentFit="cover"
          accessible={false}
          accessibilityIgnoresInvertColors
        />
        {/* `flex-shrink`, so a long question wraps inside the bubble instead of pushing it
            past the gutter. */}
        <View className="shrink rounded-lg rounded-bl-none bg-surface px-lg py-md">
          <Type role="body" tone="ink">
            {label}
          </Type>
        </View>
      </Tap>
    )
  }

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      // Choosing between things, which is the haptic Pills and the TabBar already use for
      // the same gesture.
      haptic="selection"
      onPress={press}
    >
      {/* `body` rather than `label`: 13pt is the app's metadata size, and the things the
          customer is meant to choose between were typeset smaller than the evidence.
          15/22 with py-md lands the pill on exactly 46pt. */}
      <Bubble tone="pill">
        <Type role="body" tone="ink">
          {label}
        </Type>
      </Bubble>
    </Tap>
  )
}

/**
 * "Need help? Ask Uday": a heading and a column of Uday's bubbles, one per question.
 *
 * Cleo closes a page with three of these (request-tab-lower) — questions the page raises,
 * offered in the assistant's own voice. Each one opens the Uday tab and asks it, under the same
 * tab bar you left: a jump from inside the tabs, a pop back to them from /credit (`useToTab`).
 */
export function AskUdayRows({
  questions,
  title = 'Need help? Ask Uday',
  className,
}: {
  questions: string[]
  title?: string
  className?: string
}) {
  if (questions.length === 0) return null
  return (
    <View className={className}>
      <Section title={title} />
      <View className="mt-md gap-sm">
        {questions.map((q) => (
          <Suggestion key={q} variant="lead" label={q} ask={q} />
        ))}
      </View>
    </View>
  )
}

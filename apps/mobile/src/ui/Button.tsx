// The pill button.
//
// One radius, four intents, two sizes. Cleo's primary is a full-width ink pill pinned to the
// bottom of the step; secondary is the same pill with a hairline and no fill; `light` is the
// cream pill that sits on a saturated card; `outlineLight` is the pale outline Cleo draws on a
// dark card ("Play for free"), which the Uday screen used to hand-roll. `sm` is the small
// outlined pill Cleo puts inside a card ("Invite a friend", "See my insights"): it hugs its
// label and sits to the left rather than spanning the card.
//
// The shell is `min-h`, not `h`: a label that wraps at a large type setting — or is simply long,
// at 320pt — grows the pill rather than escaping it. Every box between the pill and the words may
// shrink for that to happen, so the stack and the label carry `shrink`: a row in React Native
// measures its children at their full width unless they are allowed to give some back.
// The label is typeset at heading size but announced as text, because "Save, button" is what the
// customer should hear — not "Save, heading, button".
//
// Two things move. The pill takes 3% off itself under a finger, which `Tap` handles for every
// pressable in the app. And the label and the spinner cross-fade in place rather than swapping,
// because a button whose contents are replaced between two frames reads as the button being
// rebuilt — the thing you pressed disappearing is the last thing you want to see after pressing
// it. They are stacked, so the pill also cannot change width when it starts working. The spinner
// is hidden from assistive tech: the button's own busy state is what says it is working, and on
// the web a spinner left in the tree reads as an unlabelled progress bar inside every button.
//
// Disabled is an outline with a mid label — visibly a different state from loading, which keeps
// its fill and shows the spinner. A primary at 30% ink read as "loading" to half the people who
// saw it, and its label fell under 3:1.
import { ActivityIndicator, View } from 'react-native'
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated'
import { Tap, type TapProps } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { Glyph, type GlyphName } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { dur, timing } from '~/ui/motion'
import { color } from '@dhan/design'

export type ButtonVariant = 'primary' | 'secondary' | 'light' | 'outlineLight'
export type ButtonSize = 'md' | 'sm'

export type ButtonProps = {
  label: string
  onPress?: () => void
  /** An external URL. With no `onPress`, pressing opens it — see `Tap`. */
  href?: string
  /** Called when `href` could not be opened; the caller decides what to say. */
  onOpenFail?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  /** A trailing mark, tinted like the label. */
  glyph?: GlyphName
  disabled?: boolean
  loading?: boolean
  /** `light` is the default: a button commits. Navigation buttons pass `none`. */
  haptic?: TapProps['haptic']
  className?: string
  accessibilityHint?: string
}

const SHELL: Record<ButtonVariant, string> = {
  primary: 'bg-ink',
  secondary: 'border border-ink bg-transparent',
  light: 'bg-ground',
  outlineLight: 'border border-on-ink/35 bg-transparent',
}

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-control w-full px-lg py-md',
  sm: 'min-h-target self-start px-lg py-sm',
}

export function Button({
  label,
  onPress,
  href,
  onOpenFail,
  variant = 'primary',
  size = 'md',
  glyph,
  disabled = false,
  loading = false,
  haptic = 'light',
  className,
  accessibilityHint,
}: ButtonProps) {
  const inert = disabled || loading
  // Loading keeps the filled shell — the customer just pressed it and it is working. Only a
  // button that cannot be pressed at all takes the outline.
  const off = disabled && !loading
  // `outlineLight` is the one variant that stands on a dark card, so its outline and label stay
  // pale even when off. A primary that is off loses its fill and stands on the cream ground
  // like every other outline, and its label goes mid — 6.9:1, and visibly not "loading".
  const onDark = variant === 'outlineLight'
  const filled = variant === 'primary' && !off
  const shell = off
    ? onDark
      ? 'border border-on-ink/35 bg-transparent'
      : 'border border-hairline bg-transparent'
    : SHELL[variant]
  const pale = onDark || filled
  const tone = pale ? 'onInk' : off ? 'mid' : 'ink'
  const tint = pale ? color.onInk : off ? color.inkMid : color.ink

  // A plain derived value, not a shared value seeded in an effect: there is nothing to get
  // wrong on the first frame here, because a button that mounts already loading should show
  // the spinner immediately rather than fade it in.
  const busy = useDerivedValue(() => withTiming(loading ? 1 : 0, timing(dur.feedback)), [loading])
  const word = useAnimatedStyle(() => ({ opacity: 1 - busy.value }))
  const spin = useAnimatedStyle(() => ({ opacity: busy.value }))

  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      // react-native-web ignores `accessibilityState`; `disabled` reaches the DOM through the
      // Pressable, and busy needs saying in its own attribute.
      aria-busy={loading}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      disabled={inert}
      haptic={haptic}
      onPress={onPress}
      {...(href === undefined ? {} : { href })}
      {...(onOpenFail === undefined ? {} : { onOpenFail })}
      className={cn(
        'flex-row items-center justify-center rounded-pill',
        SIZE[size],
        shell,
        className,
      )}
    >
      <View className="shrink">
        <Animated.View style={word} className="flex-row items-center justify-center">
          {size === 'md' ? (
            <Type role="heading" plain tone={tone} className="shrink text-center">
              {label}
            </Type>
          ) : (
            <Type role="body" weight="semibold" plain tone={tone} className="shrink text-center">
              {label}
            </Type>
          )}
          {glyph === undefined ? null : (
            <View className="ml-sm">
              <Glyph name={glyph} size={18} tint={tint} />
            </View>
          )}
        </Animated.View>
        <Animated.View
          style={spin}
          aria-hidden
          className="absolute inset-0 items-center justify-center"
        >
          <ActivityIndicator color={tint} />
        </Animated.View>
      </View>
    </Tap>
  )
}

/** Stacks a primary over a secondary with the gap Cleo uses between them. */
export function ButtonStack({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <View className={cn('gap-md', className)}>{children}</View>
}

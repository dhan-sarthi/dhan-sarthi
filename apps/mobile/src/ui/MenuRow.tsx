// The rows of a settings page: Cleo's profile sheet, its "Links" group, its benefits list.
//
// A row is a way somewhere, and it is shaped for being scanned rather than read: a mark on the
// left to find it by, a heading-size label, and the chevron that says it goes on. Measured on
// Cleo (393pt): the mark is an outline glyph on a 36pt plate the colour of the page — cream on
// the white card, the lightest plate there is — inset 16 from the card, 16 to the label, 16
// above and below, so a row is 68pt. The hairline between rows is inset 16 at both ends; it
// belongs to the list, not to the card. The label is ~19pt semibold, which is our `heading`.
//
// Four trailing marks, one per kind of destination. `chevron` goes to another screen in the app.
// `link` and `external` leave it, and sit on the same cream plate as the leading mark, the way
// Cleo draws its T&Cs rows — a mark the eye can tell apart from a chevron at a glance, because
// leaving the app is a different promise. `none` is for a row whose trailing value is the point.
//
// With `href` the row opens the page outside the app, and when nothing on the device can, it
// says so in a toast rather than doing nothing — a dead row is the one thing a settings page
// must never have. A row with neither `onPress` nor `href` is not a button at all: it renders
// as a static line, because a control that does nothing is worse than none (D4).
//
// VoiceOver hears the label and the detail as the name, the value and any badge as the value
// ("Budget settings, On"), and whether the row is a link or a button.
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { Card } from '~/ui/Card'
import { Glyph, type GlyphName } from '~/ui/Glyph'
import { Section } from '~/ui/Section'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { useToast } from '~/ui/Toast'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'

const OPEN_FAILED = "Couldn't open the link"

/** A mark by name, or any element — a chip, a switch — in the trailing slot. */
export type MenuTrailing = 'chevron' | 'link' | 'external' | 'none' | ReactElement

export type MenuRowProps = {
  glyph?: GlyphName
  label: string
  /** One line under the label: what is behind the row. */
  detail?: string
  /** A short figure or state on the right — "On", "₹12,000", "2 accounts". */
  value?: string
  /** A chip under the label, Cleo's "Active". */
  badge?: ReactNode
  trailing?: MenuTrailing
  onPress?: () => void
  /** A page outside the app. Announced as a link. */
  href?: string
  disabled?: boolean
  accessibilityHint?: string
  /** `danger` for the one row that ends something. */
  tone?: 'ink' | 'danger'
  /** A hairline above the row. MenuGroup sets it on every row after the first. */
  divide?: boolean
}

export function MenuRow({
  glyph,
  label,
  detail,
  value,
  badge,
  trailing = 'chevron',
  onPress,
  href,
  disabled = false,
  accessibilityHint,
  tone = 'ink',
  divide = false,
}: MenuRowProps) {
  const toast = useToast()
  const tint = tone === 'danger' ? color.danger : color.ink
  const name = detail === undefined ? label : `${label}. ${detail}`
  const said = [value, spoken(badge)].filter(Boolean).join(', ')
  // iOS and Android read `accessibilityValue` after the name. React Native Web does not carry
  // it to the DOM at all, so there the value joins the name instead of going unsaid.
  const a11y = {
    accessibilityLabel: said !== '' && Platform.OS === 'web' ? `${name}, ${said}` : name,
    ...(said === '' ? {} : { accessibilityValue: { text: said } }),
    ...(accessibilityHint === undefined ? {} : { accessibilityHint }),
  }

  const body = (
    <View
      className={cn('flex-row items-center gap-lg py-lg', divide && 'border-t border-hairline')}
    >
      {glyph === undefined ? null : <Mark name={glyph} tint={tint} />}
      <View className="flex-1">
        <Type role="heading" plain tone={tone}>
          {label}
        </Type>
        {detail === undefined ? null : (
          <Type role="body" tone="mid">
            {detail}
          </Type>
        )}
        {badge === undefined || badge === null ? null : (
          <View className="mt-sm self-start">{badge}</View>
        )}
      </View>
      {value === undefined ? null : (
        // Half the row at most, so a long value truncates instead of squeezing out the label.
        <Type
          role="body"
          tone="mid"
          numberOfLines={1}
          className="shrink text-right"
          style={{ maxWidth: '50%' }}
        >
          {value}
        </Type>
      )}
      <Trailing mark={trailing} />
    </View>
  )

  if (onPress === undefined && href === undefined) {
    return (
      <View accessible {...a11y} className="px-lg">
        {body}
      </View>
    )
  }

  return (
    <Tap
      accessibilityRole={href === undefined ? 'button' : 'link'}
      {...a11y}
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic="none"
      scale={0.98}
      {...(onPress === undefined ? {} : { onPress })}
      {...(href === undefined ? {} : { href })}
      onOpenFail={() => toast.show(OPEN_FAILED)}
      className={cn('px-lg', disabled && 'opacity-60')}
    >
      {body}
    </Tap>
  )
}

/**
 * A titled white card of MenuRows. The rows are given their hairlines here — every row after the
 * first — so a screen lists rows and never counts them, and a row that renders conditionally
 * does not leave a rule hanging at the top of the card.
 */
export function MenuGroup({
  title,
  className,
  children,
}: {
  title?: string
  className?: string
  children: ReactNode
}) {
  const rows = Children.toArray(children).filter(isValidElement)
  return (
    <View className={className}>
      {title === undefined ? null : <Section title={title} />}
      <Card className={title === undefined ? undefined : 'mt-md'}>
        {rows.map((row, i) =>
          cloneElement(row as ReactElement<{ divide?: boolean }>, { divide: i > 0 }),
        )}
      </Card>
    </View>
  )
}

/**
 * The underlined line at the foot of a page — Cleo's "Logout", "What's this transaction?".
 *
 * Text, not a button, because it is the quiet way out rather than the thing the page is for;
 * the target is still 44pt tall, and it dims under a finger since 3% of a line of text is not
 * a visible press. `tone="ink"` is for a saturated fill (the streak and budget cards), where the
 * mid tone falls under 4.5:1 and is not drawn.
 */
export function MenuLink({
  label,
  onPress,
  href,
  hint,
  tone = 'mid',
  className,
}: {
  label: string
  onPress?: () => void
  href?: string
  /** What pressing it does, when the label alone does not say — "Asks Uday: …". */
  hint?: string
  tone?: 'mid' | 'ink'
  className?: string
}) {
  const toast = useToast()
  return (
    <Tap
      accessibilityRole="link"
      accessibilityLabel={label}
      {...(hint === undefined ? {} : { accessibilityHint: hint })}
      haptic="none"
      dim
      {...(onPress === undefined ? {} : { onPress })}
      {...(href === undefined ? {} : { href })}
      onOpenFail={() => toast.show(OPEN_FAILED)}
      className={cn('min-h-target justify-center self-start', className)}
    >
      <Type role="body" weight="semibold" tone={tone} className="underline">
        {label}
      </Type>
    </Tap>
  )
}

function Trailing({ mark }: { mark: MenuTrailing }) {
  if (mark === 'none') return null
  if (mark === 'chevron') return <Glyph name="chevronRight" size={22} tint={color.ink} />
  if (mark === 'link' || mark === 'external') return <Mark name={mark} tint={color.ink} />
  return mark
}

// Cleo draws the mark at about half its plate — an 18pt glyph on 36 — which is larger than
// GlyphPlate's proportion for a category disc, so the menu plate is drawn here: the 36pt plate
// from the size tokens, and the glyph at 24, the size a bare row mark is drawn at elsewhere.
function Mark({ name, tint }: { name: GlyphName; tint: string }) {
  return (
    <View className="h-plate-md w-plate-md items-center justify-center rounded-pill bg-ground">
      <Glyph name={name} size={24} tint={tint} />
    </View>
  )
}

/** What a badge says, when it is text or a Chip — so it can be read out with the value. */
function spoken(node: ReactNode): string | undefined {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (isValidElement<{ label?: unknown; children?: unknown }>(node)) {
    const { label, children } = node.props
    if (typeof label === 'string') return label
    if (typeof children === 'string' || typeof children === 'number') return String(children)
  }
  return undefined
}

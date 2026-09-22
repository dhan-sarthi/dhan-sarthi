// The dark card with a picture: Cleo's "Play Money IQ now" and "Request up to $500".
//
// It is the one place a screen is allowed to raise its voice, so it is used for one thing at a
// time — an offer or a door the customer has not opened yet, never a figure they already own.
// Copy on the left, the picture bleeding off the right edge, a pale outlined pill under the
// words. The pill is `outlineLight`, not a filled button: the card is already the loud surface,
// and a filled pill on it would make two.
//
// Measured on Cleo: the copy column is inset 16 on every side, the picture takes 40% of the
// card at full height, the pill sits 16 under the body. The corner is the card's 24 — Cleo's
// promo corner measures 16, but a second radius for one card is how a set stops being a set.
//
// Every word is cream on ink (12.3:1) or on brand (5.9:1), with no opacity: a softened line on a
// saturated card is exactly where contrast is lost. The picture is decoration and is hidden from
// assistive tech; the title says what the card is.
//
// `onPress` makes the whole card a target for someone who aims at the picture. The pill inside
// stays its own target, and for a screen reader the card is one button named by its title — so
// when both are given they should go to the same place. `action.href` opens outside the app, and
// says so with a toast when nothing on the device can.
import { View } from 'react-native'
import { Image, type ImageProps } from 'expo-image'
import { Button } from '~/ui/Button'
import { Chip, type ChipTone } from '~/ui/Chip'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { useToast } from '~/ui/Toast'
import { cn } from '~/ui/cn'

export type PromoAction = {
  label: string
  onPress?: () => void
  /** A page outside the app, opened when there is no `onPress`. */
  href?: string
  accessibilityHint?: string
}

/** Anything expo-image takes: a bundled asset (`UDAY_PORTRAIT`), a URI, a source object. */
export type PromoImage = ImageProps['source']

export function PromoCard({
  title,
  body,
  chip,
  chipTone = 'surface',
  action,
  image,
  tone = 'ink',
  onPress,
  className,
}: {
  title: string
  body: string
  /** A short status above the title — "Ends Sunday", "New". */
  chip?: string
  chipTone?: ChipTone
  action: PromoAction
  image?: PromoImage
  tone?: 'ink' | 'brand'
  /** The whole card as a target. Should lead where `action` leads. */
  onPress?: () => void
  className?: string
}) {
  const toast = useToast()
  const shell = cn(
    'flex-row overflow-hidden rounded-card',
    tone === 'brand' ? 'bg-brand' : 'bg-ink',
    className,
  )

  const content = (
    <>
      <View className="flex-1 gap-sm p-lg">
        {chip === undefined ? null : <Chip tone={chipTone} size="sm" label={chip} />}
        {/* A heading when the card is a panel; plain text inside a button, where a heading
            would announce itself twice. */}
        <Type role="heading" tone="onInk" plain={onPress !== undefined}>
          {title}
        </Type>
        <Type role="body" tone="onInk">
          {body}
        </Type>
        <Button
          size="sm"
          variant="outlineLight"
          label={action.label}
          {...(action.onPress === undefined ? {} : { onPress: action.onPress })}
          {...(action.href === undefined ? {} : { href: action.href })}
          onOpenFail={() => toast.show("Couldn't open the link")}
          {...(action.accessibilityHint === undefined
            ? {}
            : { accessibilityHint: action.accessibilityHint })}
          haptic="none"
          className="mt-sm"
        />
      </View>
      {image == null ? null : (
        <Image source={image} contentFit="cover" className="w-2/5" accessible={false} />
      )}
    </>
  )

  if (onPress === undefined) return <View className={shell}>{content}</View>

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={body}
      haptic="none"
      scale={0.99}
      onPress={onPress}
      className={shell}
    >
      {content}
    </Tap>
  )
}

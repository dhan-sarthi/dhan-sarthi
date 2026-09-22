// A heading over a list, and the two things Cleo lets it carry.
//
// A chevron when the list continues on another screen ("Recent transactions ›"), and an ⓘ
// when the heading names something that wants a sentence of explanation ("APY ⓘ"). They
// never appear together: a row that is both a way in and a question is two targets sharing
// one line, and the customer hits the wrong one.
//
// With `onMore` the whole row is the target, not the chevron — the chevron is 22pt and a
// heading is what you actually aim at. The row keeps 44pt so it is hit on the first try, and
// the title wraps to a second line rather than pushing the chevron off the screen at a large
// type setting. The heading is announced as text inside the button so VoiceOver says
// "Since last week — see all, button" once, not a heading and then a button.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { Glyph, GlyphPlate } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color, size } from '@dhan/design'

export function Section({
  title,
  subtitle,
  trailing,
  onMore,
  moreLabel,
  onInfo,
  className,
}: {
  title: string
  /** One short line under the title: what the list counts, or what it is measured in. */
  subtitle?: string
  /** Something on the right that is not a way in — a chip, a count, a stamp. */
  trailing?: ReactNode
  /** The list continues elsewhere; the row becomes the way there. */
  onMore?: () => void
  /** What the row announces after the title. Defaults to "see all". */
  moreLabel?: string
  /** The heading wants explaining; draws the ⓘ. Ignored when `onMore` is given. */
  onInfo?: () => void
  className?: string
}) {
  return (
    <View className={cn('mt-xl mb-xs', className)}>
      {onMore === undefined ? (
        <View className="flex-row items-center justify-between gap-md">
          <Type role="heading" className="flex-1" numberOfLines={2}>
            {title}
          </Type>
          {onInfo === undefined ? (
            trailing
          ) : (
            <Tap
              accessibilityRole="button"
              accessibilityLabel={`About ${title}`}
              onPress={onInfo}
              hitSlop={8}
              scale={0.92}
              className="min-h-target min-w-target items-center justify-center"
            >
              <GlyphPlate name="info" size={size.ring} plain />
            </Tap>
          )}
        </View>
      ) : (
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`${title} — ${moreLabel ?? 'see all'}`}
          onPress={onMore}
          haptic="none"
          scale={0.98}
          className="min-h-target flex-row items-center justify-between gap-md py-sm"
        >
          <Type role="heading" plain className="flex-1" numberOfLines={2}>
            {title}
          </Type>
          <Glyph name="chevronRight" tint={color.ink} />
        </Tap>
      )}
      {subtitle === undefined ? null : (
        <Type role="body" tone="mid">
          {subtitle}
        </Type>
      )}
    </View>
  )
}

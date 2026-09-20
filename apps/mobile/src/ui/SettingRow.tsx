// The settings row: a mark, a name, a fact about it, and a way in.
//
// This was `budget-settings.tsx`'s private `Row` and it stayed private for exactly as long as
// one screen used it. Four screens use it now — budget settings, save settings, the save-hacks
// list and the goal editor — and four copies of a row is how a product ends up with three
// different chevron sizes on three screens that are meant to read as the same sheet.
//
// Promoting it cost it three required props. The original demanded `glyph`, `detail` and
// `value` because budget settings has all three on every row; the save-hacks list has a title,
// a pitch and an `On` chip and no figure at all, and save settings has titles and nothing else.
// So all three are optional and each one is *absent* rather than empty when it is not given —
// an empty `<Type>` still claims a line box, and a row whose caption slot is blank sits 15pt
// taller than the row above it for no reason anyone can see.
//
// `badge` rather than a `chip` prop typed to `Chip`'s tones: what goes there is a chip today
// and could be a count or a spinner tomorrow, and the row has no business knowing which. It
// sits in the trailing cluster beside `value`, before the chevron, because that is the only
// place on the row where the eye is already looking for the row's current state.
//
// The haptic is `none` and stays `none`. Every one of these rows opens another screen, and the
// navigator's own transition is the feedback — a tap tick on top of it is one event announced
// twice. The press scale is the default rather than the 0.985 a full-width surface usually
// takes, because this row is a *card's* row: it is inset, it is short, and 3% of it reads.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { Tap } from '~/ui/Tap'
import { Glyph, GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'

export function SettingRow({
  glyph,
  title,
  detail,
  value,
  badge,
  onPress,
  divide = false,
}: {
  glyph?: GlyphName
  title: string
  detail?: string
  value?: string
  badge?: ReactNode
  onPress: () => void
  divide?: boolean
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={detail === undefined ? title : `${title}. ${detail}`}
      {...(value === undefined ? {} : { accessibilityValue: { text: value } })}
      haptic="none"
      onPress={onPress}
      className={cn('px-lg py-md', divide && 'border-t border-hairline')}
    >
      <View className="flex-row items-center gap-md">
        {glyph === undefined ? null : <GlyphPlate name={glyph} size={36} />}
        <View className="flex-1">
          <Type role="body">{title}</Type>
          {detail === undefined ? null : (
            <Type role="caption" tone="soft" className="mt-0.5">
              {detail}
            </Type>
          )}
        </View>
        {badge}
        {value === undefined ? null : (
          <Type role="label" tone="mid">
            {value}
          </Type>
        )}
        <Glyph name="chevronRight" size={16} tint={color.inkFaint} />
      </View>
    </Tap>
  )
}

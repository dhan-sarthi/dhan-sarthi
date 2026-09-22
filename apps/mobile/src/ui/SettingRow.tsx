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
// The shape is Cleo's budget settings, measured: a bare outline mark rather than a filled plate
// (a plate is how this app says a category or a live state; a settings row is neither), a
// semibold name over a soft line of fact, the figure on the right, and a full-weight ink chevron
// — the same chevron MenuRow draws, so a profile sheet and a settings sheet read as one family.
// `mark="plate"` keeps the old 36pt plate for a list whose marks are subjects in their own right.
//
// The type is where this departs from the reference. Cleo set a 17pt name beside a 22pt figure,
// on a 393pt screen, with names two words long. Our nearest roles are 19 and 19, and at those, on
// 375 with our names, "Linked paycheck" folded in two beside its own salary and "7 categories"
// lost its last letters. So the row takes the idiom every other row in the app already uses —
// body at semibold for the name and for the figure, the soft body line under the name — which is
// Cleo's hierarchy (weight and ink lead, the fact recedes) at a size our rows can hold.
//
// A value in words is held to one line and two fifths of the words' width. A goal named at length
// used to take the whole trailing side and fold the row's own description into three lines beside
// it; the name of the row is the thing being read, and the figure is the thing being checked. A
// figure itself is never cut: at 320pt "₹1,92,000" needs more than two fifths, and "₹1,92,0…" is
// a wrong number, not a shorter one — so a figure keeps its width and the words beside it wrap.
//
// `badge` rather than a `chip` prop typed to `Chip`'s tones: what goes there is a chip today
// and could be a count or a spinner tomorrow, and the row has no business knowing which. It
// sits in the trailing cluster beside `value`, before the chevron, because that is the only
// place on the row where the eye is already looking for the row's current state. A badge is a
// picture of the state, so the state is also given in words (`state`, "On") for VoiceOver,
// which reads it as the row's value.
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
import { color, size } from '@dhan/design'

// The most of the text column a value in words may take. A goal's name reaches it, and is cut to
// one line before the row's own description is.
const TRAILING = '40%'

// A figure — "₹1,92,000", "₹3.68L", "12%" — as opposed to a value in words. It takes its own width.
const FIGURE = /^[−+-]?₹?[\d,.]+\s?(?:L|Cr|%)?$/

export function SettingRow({
  glyph,
  mark = 'glyph',
  title,
  detail,
  value,
  badge,
  state,
  onPress,
  divide = false,
  disabled = false,
  accessibilityHint,
}: {
  glyph?: GlyphName
  /** `glyph` is the bare 24pt outline mark; `plate` sets it on the 36pt plate. */
  mark?: 'plate' | 'glyph'
  title: string
  detail?: string
  value?: string
  badge?: ReactNode
  /** The row's state in words, read after the value: "On", "Off", "Not set". */
  state?: string
  onPress: () => void
  divide?: boolean
  disabled?: boolean
  /** Defaults to `detail`, which is what the row would otherwise say under its name. */
  accessibilityHint?: string
}) {
  const said = [value, state].filter(Boolean).join(', ')
  const hint = accessibilityHint ?? detail
  const figure = value !== undefined && FIGURE.test(value)

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={title}
      {...(hint === undefined ? {} : { accessibilityHint: hint })}
      {...(said === '' ? {} : { accessibilityValue: { text: said } })}
      accessibilityState={{ disabled }}
      disabled={disabled}
      haptic="none"
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-md px-lg py-lg',
        divide && 'border-t border-hairline',
        disabled && 'opacity-60',
      )}
    >
      {glyph === undefined ? null : mark === 'plate' ? (
        <GlyphPlate name={glyph} size={size.plateMd} />
      ) : (
        <Glyph name={glyph} size={24} tint={color.ink} />
      )}
      <View className="flex-1 flex-row items-center gap-md">
        <View className="flex-1">
          <Type role="body" weight="semibold" plain tone={disabled ? 'soft' : 'ink'}>
            {title}
          </Type>
          {detail === undefined ? null : (
            <Type role="body" tone="soft" className="mt-xxs">
              {detail}
            </Type>
          )}
        </View>
        {badge === undefined && value === undefined ? null : (
          // Measured against the text and the figure together, not the whole row: the mark and
          // the chevron are fixed, and a share of the row is a share of space the words never
          // had. A style rather than a class for it, because a bracketed width is the one kind of
          // size this app keeps out of its class names.
          <View
            className={cn('items-end gap-xs', figure ? 'shrink-0' : 'shrink')}
            style={figure ? undefined : { maxWidth: TRAILING }}
          >
            {badge}
            {value === undefined ? null : (
              <Type role="body" weight="semibold" plain numberOfLines={1} className="text-right">
                {value}
              </Type>
            )}
          </View>
        )}
      </View>
      <Glyph name="chevronRight" size={22} tint={color.ink} />
    </Tap>
  )
}

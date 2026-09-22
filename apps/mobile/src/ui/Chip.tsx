// The small pill Cleo uses for reassurance ("Secured by…"), status ("On", "Paid") and the
// eyebrow-free label on a promo card ("Ends Sun, 6pm").
//
// Seven fills, one rule: the text is ink on every light fill and cream on the ink fill. The
// two fills without a tint of their own are for placing a chip on a surface that already has
// one — `ink` for a chip on a dark card, `surface` for a white chip on a coloured card.
// `danger` is the soft red, not the solid one, for the same reason: ink has to sit on it.
//
// `sm` is the default and the size the badge sites already used. `md` is Cleo's On/Off pill on
// a save-hack row, which is a tappable size (≈38pt) rather than a badge size; a row that is
// itself the target uses `md` so the chip reads as the control it is standing next to.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Type } from '~/ui/Text'
import { Glyph, type GlyphName } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color } from '@dhan/design'

export type ChipTone = 'success' | 'streak' | 'budget' | 'ground' | 'danger' | 'ink' | 'surface'
export type ChipSize = 'sm' | 'md'

const FILL: Record<ChipTone, string> = {
  success: 'bg-success',
  streak: 'bg-streak',
  budget: 'bg-budget',
  ground: 'bg-ground-deep',
  danger: 'bg-danger-soft',
  ink: 'bg-ink',
  surface: 'bg-surface',
}

const PAD: Record<ChipSize, string> = { sm: 'px-md py-xs', md: 'px-lg py-sm' }

export function Chip({
  children,
  label,
  tone = 'success',
  size = 'sm',
  glyph,
  className,
}: {
  children?: ReactNode
  /** The text, for a call site that has a string rather than children. */
  label?: string
  tone?: ChipTone
  size?: ChipSize
  /** A leading mark at caption scale, tinted like the text. */
  glyph?: GlyphName
  className?: string
}) {
  const onInk = tone === 'ink'
  const text = onInk ? 'onInk' : 'ink'
  const content = children ?? label
  return (
    <View
      className={cn(
        'flex-row items-center self-start rounded-pill',
        PAD[size],
        FILL[tone],
        className,
      )}
    >
      {glyph === undefined ? null : (
        <View className="mr-xs">
          <Glyph name={glyph} size={14} tint={onInk ? color.onInk : color.ink} />
        </View>
      )}
      {size === 'md' ? (
        <Type role="body" weight="semibold" tone={text}>
          {content}
        </Type>
      ) : (
        <Type role="label" tone={text}>
          {content}
        </Type>
      )}
    </View>
  )
}

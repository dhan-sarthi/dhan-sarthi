// A label on the left, a figure on the right. The row five screens were each declaring.
//
// `divide` draws the hairline Cleo puts between stacked rows, so a Card's first row leaves it
// off and every row under it turns it on. The tone union is the union of what the callers
// ask for: `brand` on a projection figure, `danger` on a shortfall, `soft` on the record's
// provenance, `ink` everywhere else.
//
// The value shrinks and wraps; the label flexes. A hash or a date range on the record screen
// is longer than the column it sits in at 320pt, and a figure that overflows its card is a
// figure the customer cannot read. Two lines, right-aligned, is what Cleo's own table rows do.
// The label keeps a floor of about a third of the row while it does: with nothing holding it,
// a value long enough to want the whole width took it, and "Account" folded one letter a line.
//
// The extras are Cleo's row furniture, each for one measured shape: `leader` is the dotted
// rule between "Spent" and its amount on the budget hero; `dot` is the legend swatch before a
// series name; `glyph` on a plate is the category row; `trailing` is a chip or a switch where
// a figure would be; `onPress` makes the row a way in and adds the chevron.
//
// `emphasis` says which side carries the weight. A figure row leans on its value — "Spent" is a
// quiet word and ₹4,820 is the point. A detail table leans the other way: Cleo's transaction
// detail sets "Status", "Payment date", "Payment method" semibold in ink and the answers
// regular, because there the labels are what the eye runs down to find its line.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Tap } from '~/ui/Tap'
import { Type } from '~/ui/Text'
import { Glyph, GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { cn } from '~/ui/cn'
import { color, size } from '@dhan/design'

export type RowTone = 'ink' | 'brand' | 'danger' | 'soft' | 'mid'
export type RowDot = 'ink' | 'brand' | 'streak' | 'danger'

/** The least of the row the label gives up to a long value. A leader row's label hugs its words. */
const LABEL_FLOOR = '35%'

const DOT: Record<RowDot, string> = {
  ink: 'bg-ink',
  brand: 'bg-brand',
  streak: 'bg-streak',
  danger: 'bg-danger',
}

export function Row({
  label,
  value,
  detail,
  divide = false,
  tone = 'ink',
  leader = false,
  dot,
  onPress,
  glyph,
  plate,
  trailing,
  emphasis = 'value',
}: {
  label: string
  /** The figure. Optional only when `trailing` stands in for it. */
  value?: string
  /** A second line under the label, at caption weight. */
  detail?: string
  divide?: boolean
  tone?: RowTone
  /** A dotted rule from the label to the value, Cleo's budget-hero row. */
  leader?: boolean
  /** A legend swatch before the label. */
  dot?: RowDot
  /** Makes the row a button with a chevron; announced as "label, value". */
  onPress?: () => void
  /** A leading mark on a plate. */
  glyph?: GlyphName
  /** The plate's fill class behind `glyph`; the default is the grey plate. */
  plate?: string
  /** Rendered in place of the value; the value then only feeds the announcement. */
  trailing?: ReactNode
  /**
   * Which side is set semibold. `value` (the default) is the figure row; `label` is a detail
   * table's row — label semibold in ink, value regular — Cleo's transaction detail.
   */
  emphasis?: 'value' | 'label'
}) {
  const heavyLabel = emphasis === 'label'
  const body = (
    <>
      {dot === undefined ? null : <View className={cn('h-sm w-sm rounded-pill', DOT[dot])} />}
      {glyph === undefined ? null : (
        <GlyphPlate
          name={glyph}
          size={size.plateMd}
          {...(plate === undefined ? {} : { fill: plate })}
        />
      )}
      <View
        className={leader ? 'shrink' : 'flex-1'}
        {...(leader ? {} : { style: { minWidth: LABEL_FLOOR } })}
      >
        {heavyLabel ? (
          <Type role="body" weight="semibold" plain>
            {label}
          </Type>
        ) : (
          <Type role="body" tone="mid">
            {label}
          </Type>
        )}
        {detail === undefined ? null : (
          <Type role="label" tone="soft">
            {detail}
          </Type>
        )}
      </View>
      {leader ? <View className="mb-xs flex-1 border-b border-dotted border-hairline" /> : null}
      {trailing !== undefined ? (
        trailing
      ) : value === undefined ? null : (
        <Type
          role="body"
          weight={heavyLabel ? 'regular' : 'semibold'}
          plain
          tone={tone}
          className="shrink text-right"
          numberOfLines={2}
        >
          {value}
        </Type>
      )}
      {onPress === undefined ? null : <Glyph name="chevronRight" size={20} tint={color.ink} />}
    </>
  )

  const shell = cn(
    'flex-row gap-md px-lg py-md',
    leader ? 'items-end' : 'items-center',
    divide && 'border-t border-hairline',
  )

  if (onPress === undefined) return <View className={shell}>{body}</View>
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={value === undefined ? label : `${label}, ${value}`}
      haptic="none"
      scale={0.98}
      onPress={onPress}
      className={cn(shell, 'min-h-target')}
    >
      {body}
    </Tap>
  )
}

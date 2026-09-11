/**
 * A card's state, said at its foot.
 *
 * SmartWealth's primary status treatment is not a chip. It is a tinted strip that fills the
 * bottom of the card edge to edge and is clipped by the card's own corners — label at the left,
 * a circular ⓘ at the right — and it is what makes a list of jars scannable: the eye runs down a
 * column of coloured feet rather than hunting for a badge inside each card's padding.
 * `COMPONENT-GAP.md` has it as the more distinctive of the two and the more used, and `Pill` is
 * already the floating version, so this is the band and nothing else.
 *
 * **Three tints and a solid.** The tints come straight off `03-PALETTE-MAP.md`: Needs Attention
 * onto `danger-soft`/`danger`, In Process onto `accent-soft`/`accent-text`, On Track onto
 * `legend-chip` with `brand-deep` ink rather than the map's `good` — `good` is `#00836c`, which
 * is 4.5:1 on that tint where `brand-deep` is 9-and-change, and this is 13.5px semibold copy.
 * The solid is the reference's green success block (`#09985E`, white), which lands on
 * `brand-deep` for the same reason every dark surface in this app does.
 *
 * **It is a footer, so it is positioned as one**: negative margins that cancel a 16px-padded
 * card, and bottom corners of its own. Inside a `Card` that is exact; inside a card that sets
 * `overflow-hidden` the clip is the parent's and the radius here is belt and braces.
 */
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { IconButton } from './ui.tsx'

const TONE = {
  good: 'bg-legend-chip text-brand-deep',
  warn: 'bg-accent-soft text-accent-text',
  bad: 'bg-danger-soft text-danger',
  solid: 'bg-brand-deep text-on-dark',
} as const

export type BandTone = keyof typeof TONE

export function StatusBand({
  tone,
  label,
  children,
  onInfo,
  infoLabel,
  live = false,
  flush = false,
}: {
  tone: BandTone
  /** The state, in two or three words. Carries the weight even when a sentence follows it. */
  label: string
  /**
   * The rest of the sentence, in regular weight, wrapping under the label. The reference does
   * this on `rebalance-additional-investment` — "With current investments, you **may miss your
   * target** by 10%" is one band, not a band plus a caption.
   */
  children?: ReactNode
  /** The ⓘ. Left out, no glyph is drawn — a button that goes nowhere is worse than no button. */
  onInfo?: () => void
  infoLabel?: string
  /**
   * Announce the band when it changes. For a band that flips while the customer types — the
   * funding screen's feasibility line — and off for a list, where three status regions on mount
   * is three interruptions.
   */
  live?: boolean
  /**
   * The band is already at the card's edge — a sibling inside a clipped card rather than the last
   * child of a padded one — so it should not cancel a padding it never had. Both shapes are
   * legitimate: a card whose body is one big pressable button cannot also wrap the band, because
   * the ⓘ would be a button inside a button.
   */
  flush?: boolean
}): ReactNode {
  return (
    <div
      {...(live ? { role: 'status' } : {})}
      className={`flex min-h-[42px] items-center gap-2 rounded-b-md px-4 py-2.5 ${
        flush ? '' : '-mx-4 -mb-4 mt-4'
      } ${TONE[tone]}`}
    >
      <p className="m-0 min-w-0 flex-1 text-[13.5px] leading-snug">
        <span className="font-semibold">{label}</span>
        {children ? <> {children}</> : null}
      </p>
      {onInfo ? (
        <IconButton label={infoLabel ?? `About "${label}"`} tone="ghost" size="sm" onClick={onInfo}>
          <Info size={17} strokeWidth={2.2} />
        </IconButton>
      ) : null}
    </div>
  )
}

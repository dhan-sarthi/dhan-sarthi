/**
 * A card's state, said at its foot.
 *
 * SmartWealth's primary status treatment is not a chip. It is a tinted strip that fills the
 * bottom of the card edge to edge and is clipped by the card's own corners — the state at the
 * left, one small control at the right — and it is what makes a list of cards scannable: the eye
 * runs down a column of coloured feet rather than hunting for a badge inside each card's padding.
 * `Pill` is the floating version of the same information and we have it; this is the band and
 * nothing else.
 *
 * Three surfaces reached for it independently and each of them cut its own — the jars, the
 * Dashboard's Holdings pane, and the commitments list. This is the one they now share, so what
 * each of them needed is recorded here rather than in three places.
 *
 * **Four tints and a solid.** Three come straight off `03-PALETTE-MAP.md`: Needs Attention onto
 * `danger-soft`/`danger`, In Process onto `accent-soft`/`accent-text`, On Track onto
 * `legend-chip` with `brand-deep` ink rather than the map's `good` — `good` is `#00836c`, which
 * is 4.5:1 on that tint where `brand-deep` is 9-and-change, and this is 13.5px semibold copy.
 * `quiet` is the fourth and has no row in that table because the reference has no such state: it
 * is the `ground-deep` / `ink-mid` pairing that `Button tone="quiet"` and every grouping band in
 * the app already use, and it is for a state nobody *chose* — a mandate that has simply gone
 * silent, which is an observation and should be quieter than the three that are verdicts. The
 * solid is the reference's green success block (`#09985E`, white), which lands on `brand-deep`
 * for the same reason every dark surface in this app does. No hex from a screen spec reaches
 * this file, and `warn` is deliberately the soft pairing rather than a solid orange: the
 * reference's action strip is a full-bleed vivid blue, and the palette map sends its action blue
 * to `--accent`, but a solid orange strip across the foot of every card would read as a row of
 * buttons. `accent-soft` with `accent-text` is what IDBI uses for "this needs you" everywhere
 * else, and what `RibbonTab` and `InfoBanner` already chose for the same colour.
 *
 * **One control at the right, or none.** The reference has two shapes for it — the circular ⓘ on
 * a jar card, and a bare action word on its "67 unmapped investments found · Review" strip — and
 * they are the same slot, so they are one prop and cannot both be passed. Either takes the band's
 * own ink, so the control is legible on all five tints without knowing which one it is on.
 *
 * **It is a footer, so it is positioned as one**: negative margins that cancel a 16px-padded
 * card, and bottom corners of its own. Inside a `Card` that is exact; inside a card that sets
 * `overflow-hidden` the clip is the parent's and the radius here is belt and braces. `flush` is
 * for the second shape, where the band is already at the edge.
 *
 * Nothing here is an element a `<button>` may not contain, because one caller is a card whose
 * whole body is pressable and the band sits inside it. Such a card must not pass `action` — that
 * would be a button inside a button — and `.ds-press` on it clips the band's corners for free
 * (`DESIGN.md`, gotcha 3).
 */
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { IconButton } from './ui.tsx'
import { useRipple } from '../lib/motion.ts'

const TONE = {
  good: 'bg-legend-chip text-brand-deep',
  warn: 'bg-accent-soft text-accent-text',
  bad: 'bg-danger-soft text-danger',
  quiet: 'bg-ground-deep text-ink-mid',
  solid: 'bg-brand-deep text-on-dark',
} as const

export type BandTone = keyof typeof TONE

/**
 * The band's one control. A word, or the ⓘ — never both, which is why it is one prop and a
 * union rather than two pairs of optional props that could disagree.
 */
export type BandAction =
  /** A word, drawn at the right of the band: "Review", "Add it". */
  | { label: string; onClick: () => void }
  /**
   * The circular ⓘ. Nothing is drawn but the glyph, so `info` is its accessible name and should
   * read as the question the ⓘ answers rather than as a caption.
   */
  | { info: string; onClick: () => void }

export function StatusBand({
  tone,
  label,
  children,
  action,
  live = false,
  flush = false,
}: {
  tone: BandTone
  /** The state, in a few words. Carries the weight even when the rest of a sentence follows it. */
  label: string
  /**
   * The rest of the sentence, in regular weight, wrapping under the label. The reference does
   * this on `rebalance-additional-investment` — "With current investments, you **may miss your
   * target** by 10%" is one band, not a band plus a caption.
   */
  children?: ReactNode
  /**
   * The word or the ⓘ at the right. Left out, no control is drawn — one that goes nowhere is
   * worse than none at all.
   */
  action?: BandAction
  /**
   * Announce the band when it changes. For a band that flips while the customer types — the
   * funding screen's feasibility line — and off for a list, where three status regions on mount
   * is three interruptions.
   */
  live?: boolean
  /**
   * The band is already at the card's edge — a sibling inside a clipped card rather than the last
   * child of a padded one — so it should not cancel a padding it never had.
   */
  flush?: boolean
}): ReactNode {
  const ripple = useRipple()
  return (
    <div
      {...(live ? { role: 'status' } : {})}
      className={`flex min-h-[42px] items-center gap-2 rounded-b-md px-4 py-2.5 ${
        flush ? '' : '-mx-4 -mb-4 mt-4'
      } ${TONE[tone]}`}
    >
      {/* A `<span>` rather than a `<p>`: a paragraph is not phrasing content and this band is
          sometimes rendered inside a pressable card. Blockified by the flex parent either way. */}
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug">
        <span className="font-semibold">{label}</span>
        {children ? <> {children}</> : null}
      </span>
      {action === undefined ? null : 'info' in action ? (
        <IconButton label={action.info} tone="ghost" size="sm" onClick={action.onClick}>
          <Info size={17} strokeWidth={2.2} />
        </IconButton>
      ) : (
        <button
          type="button"
          onPointerDown={ripple}
          onClick={action.onClick}
          className="ds-press h-9 shrink-0 whitespace-nowrap rounded-pill border-0 bg-transparent px-2 text-[13px] font-bold text-inherit underline-offset-2 hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

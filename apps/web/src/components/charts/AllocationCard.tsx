/**
 * A legend column beside a small donut — the source's canonical "here is the mix" card.
 *
 * Measured off `rebalance-align-portfolio`: white card, hairline border, a two-column split with
 * the legend taking roughly 55% and a ~95px donut the rest, legend rows separated by hairlines
 * that stop at the column edge and never run under the chart. The analytics build of the same
 * card adds a title and a divider above the split; `title` is that.
 *
 * The donut does not shrink — a squashed ring is worse than a clipped label, so the legend
 * truncates instead. 95px is the default and fits any phone; `donutSize={138}`, the measured
 * analytics chart, wants 360px of viewport or more.
 *
 * The `Recommended` tab is `RibbonBadge` from `COMPONENT-GAP.md`, and it is a tab rather than a
 * floating pill: squared top corners sitting flush on the card's own top edge, 16px in from the
 * left, which is where `Card`'s padding already puts a first child once the padding is pulled
 * back off it. The source's gold becomes `accent-soft` with `accent-text` ink — the IDBI reading
 * of it, and no new token.
 *
 * Three states the source never shows, decided here:
 *
 * - **Empty.** No slices, or every value zero: the ring draws once in the track grey and the
 *   legend column carries a line of copy. A donut that renders nothing at all looks like a
 *   failed fetch; a grey ring looks like an account with nothing in it, which is the truth.
 * - **Single slice.** One colour, a closed ring, and no gap — a gap needs something on both
 *   sides of it, and a 2px notch in an otherwise solid ring reads as a rendering fault.
 * - **Long tail.** Anything past `max` folds into a grey "Others" at the end. Five is the ramp.
 *
 * And the fourth, which the source got wrong rather than skipped: a series that does not sum to
 * its total leaves the remainder in the track grey. Pass `total={100}` when the values are
 * percentages and 60/20/10/05 draws as 95% of a ring with a visible 5% hole, which is what the
 * source's own demo data says and what its demo build hid by inventing a fifth slice.
 */
import type { ReactNode } from 'react'
import { Card } from '../ui.tsx'
import { SegmentedBar } from './Bars.tsx'
import { DonutChart } from './DonutChart.tsx'
import { LegendRow } from './LegendRow.tsx'
import { collapse, RAMP, series, type Slice } from './series.ts'

/** The corner tab. Belongs in Signals eventually; it lives here because this card needs it. */
export function RibbonTab({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="-mt-4 mb-3">
      <span className="inline-flex rounded-b-sm bg-accent-soft px-2.5 pb-1.5 pt-2 text-[11px] font-bold leading-none text-accent-text">
        {children}
      </span>
    </div>
  )
}

export function AllocationCard({
  slices,
  total,
  title,
  ribbon,
  max = RAMP,
  donutSize = 95,
  bar = false,
  empty = 'No allocation to show.',
}: {
  slices: readonly Slice[]
  /** The whole. Omit for quantities — the sum is the whole. Pass `100` for percentages. */
  total?: number | undefined
  /** A card header above the split, with a divider under it. */
  title?: string | undefined
  /** The corner tab: `Recommended` on the upper card of an `AllocationCompare`. */
  ribbon?: string | undefined
  max?: number | undefined
  donutSize?: number | undefined
  /** Also lay the same series out flat under the split. Off by default; the source is donut-only. */
  bar?: boolean | undefined
  empty?: string | undefined
}): ReactNode {
  /* `series` is pure, so deriving it here for the legend and again inside `DonutChart` for the
     arcs cannot produce two different charts — as long as both get the same `total` and `max`. */
  const resolved = series(collapse(slices, max), total)

  return (
    <Card>
      {ribbon !== undefined && <RibbonTab>{ribbon}</RibbonTab>}
      {title !== undefined && (
        <>
          <h2>{title}</h2>
          <div className="mb-1 mt-3 border-b border-solid border-hairline-mint" />
        </>
      )}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 divide-y divide-solid divide-hairline-mint">
          {resolved.empty ? (
            <p className="m-0 py-2 text-sm text-ink-soft">{empty}</p>
          ) : (
            resolved.portions.map((p, i) => (
              <LegendRow key={`${i}-${p.label}`} tone={p.tone} label={p.label} value={p.display} />
            ))
          )}
        </div>
        <DonutChart slices={slices} total={total} max={max} size={donutSize} className="shrink-0" />
      </div>
      {bar && <SegmentedBar slices={slices} total={total} max={max} className="mt-4" />}
    </Card>
  )
}

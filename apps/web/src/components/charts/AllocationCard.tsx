/**
 * A legend column beside a small donut — the source's canonical "here is the mix" card.
 *
 * Measured off `rebalance-align-portfolio`: white card, hairline border, a two-column split with
 * the legend taking roughly 55% and a ~95px donut the rest, legend rows separated by hairlines
 * that stop at the column edge and never run under the chart. The analytics build of the same
 * card adds a title and a divider above the split; `title` is that.
 *
 * `icon` is the rest of that head, and the frames are unambiguous about it: every chart card on
 * `14-analytics` opens with a **46px rounded icon tile** carrying a line-art glyph, then the
 * title at 18px bold, then the divider. A bare `<h2>` was the first pass reading "title" in the
 * spec and stopping there — the tile is what makes four cards in a column read as one family
 * rather than four headings. Ours is 40px in `legend-chip` with `brand-deep` ink, which is the
 * tile `ListRow` and the dashboard's own card heads already draw.
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

/**
 * The corner tab. Belongs in Signals eventually; it lives here because this card needs it.
 *
 * `corner` is the geometry the reference actually draws, which the first pass missed by reading
 * "badge" and stopping there: `10-diy-otp/04-add-scheme-invest.md` measures the `Recommended` tab
 * as *flush into the card's top-left corner* — "it sits on the card's edge, not inside its
 * padding". Inset by the card's 16px gutter it reads as a chip someone left at the top of the
 * card; flush to the corner, carrying the card's own radius on that corner, it reads as a ribbon
 * stuck to the card, which is the whole point of the shape.
 */
export function RibbonTab({
  children,
  corner = false,
}: {
  children: ReactNode
  /** Pull the tab out to the card's top-left corner instead of leaving it on the text gutter. */
  corner?: boolean
}): ReactNode {
  return (
    <div className={corner ? '-ml-4 -mt-4 mb-3' : '-mt-4 mb-3'}>
      <span
        className={`inline-flex bg-accent-soft px-2.5 pb-1.5 pt-2 text-[11px] font-bold leading-none text-accent-text ${
          corner ? 'rounded-br-sm rounded-tl-md' : 'rounded-b-sm'
        }`}
      >
        {children}
      </span>
    </div>
  )
}

export function AllocationCard({
  slices,
  total,
  title,
  icon,
  note,
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
  /** The glyph in the head's tile. Given one, the head becomes the reference's tile + title row. */
  icon?: ReactNode | undefined
  /** A quiet second line under the title. Only drawn with an `icon`. */
  note?: string | undefined
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
      {title !== undefined &&
        (icon === undefined ? (
          <>
            <h2>{title}</h2>
            <div className="mb-1 mt-3 border-b border-solid border-hairline-mint" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-10 flex-none place-items-center rounded-sm bg-legend-chip text-brand-deep"
              >
                {icon}
              </span>
              <span className="min-w-0 flex-1">
                <h2 className="truncate">{title}</h2>
                {note !== undefined && (
                  <span className="mt-0.5 block truncate text-[13px] text-ink-soft">{note}</span>
                )}
              </span>
            </div>
            <div className="mb-1 mt-3.5 border-b border-solid border-hairline-mint" />
          </>
        ))}
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

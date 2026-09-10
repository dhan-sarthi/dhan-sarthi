/**
 * Current against recommended: two `AllocationCard`s under their own section labels, the upper
 * one wearing the `Recommended` tab.
 *
 * The source's drift view, and — per `12-rebalancing.md` — the same component in Model Portfolios
 * and in Analytics, so it is built once here rather than three times in three screens.
 *
 * The thing that makes it a comparison and not just two donuts is `align`. Colour in this family
 * is positional, which only carries meaning across two charts if both charts run the same
 * positions: Equity has to be the same green in both rings or the pair is actively misleading.
 * So the two series are matched by label onto the recommended one's order before either is drawn,
 * a category missing from one side becomes a zero there — and still earns its legend row, because
 * "recommended 10%, you hold none" is exactly what this screen is for — and if the union is too
 * long for the ramp, both sides fold the *same* categories into "Others".
 *
 * That is alignment, not sorting. Neither series is ever re-ordered by weight; the ramp is
 * order-independent by design and does not need it.
 *
 * The source never shows the two cards agreeing, so nothing here highlights a drift or a delta —
 * it has no number for one. The comparison is left to the two columns of figures, as it is in the
 * source.
 */
import type { ReactNode } from 'react'
import { AllocationCard } from './AllocationCard.tsx'
import { align, RAMP, type Slice } from './series.ts'

export function AllocationCompare({
  recommended,
  current,
  recommendedLabel = 'Here is our recommended allocation',
  currentLabel = 'Current allocation',
  ribbon = 'Recommended',
  total,
  max = RAMP,
  donutSize = 95,
  empty = 'No allocation to show.',
}: {
  recommended: readonly Slice[]
  current: readonly Slice[]
  recommendedLabel?: string | undefined
  currentLabel?: string | undefined
  ribbon?: string | undefined
  /** The whole, applied to both cards. Pass `100` when the values are percentages. */
  total?: number | undefined
  max?: number | undefined
  donutSize?: number | undefined
  empty?: string | undefined
}): ReactNode {
  const [top, bottom] = align(recommended, current, max)
  return (
    <>
      <p className="mb-2 mt-1 text-[15px] font-semibold text-ink">{recommendedLabel}</p>
      <AllocationCard
        slices={top}
        total={total}
        max={max}
        donutSize={donutSize}
        ribbon={ribbon}
        empty={empty}
      />
      <p className="mb-2 mt-5 text-[15px] font-semibold text-ink">{currentLabel}</p>
      <AllocationCard slices={bottom} total={total} max={max} donutSize={donutSize} empty={empty} />
    </>
  )
}

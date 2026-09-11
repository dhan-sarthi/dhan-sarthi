/**
 * The chart family.
 *
 * `DonutChart` → `LegendRow` → `SegmentedBar` → `AllocationCard` → `AllocationCompare`, which is
 * the dependency chain `COMPONENT-GAP.md` calls the one hard one in the build. All of them draw
 * the model in `series.ts` and take their colours from the ramp in `tokens.css` by position.
 */
export { AllocationCard, RibbonTab } from './AllocationCard.tsx'
export { AllocationCompare } from './AllocationCompare.tsx'
export { BarList, SegmentedBar } from './Bars.tsx'
export { DonutChart } from './DonutChart.tsx'
export { LegendRow } from './LegendRow.tsx'
export { align, bgOf, collapse, OTHERS_LABEL, pct, RAMP, series } from './series.ts'
export type { Portion, Series, Slice, Tone } from './series.ts'

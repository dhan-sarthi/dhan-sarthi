/**
 * The chart family. Two halves, and the split is worth knowing before you pick one.
 *
 * **Composition** — a whole cut into slices, all of it drawing the model in `series.ts` and taking
 * its colours from the ramp in `tokens.css` by position:
 * `DonutChart` → `LegendRow` → `SegmentedBar` → `AllocationCard` → `AllocationCompare`, which is
 * the dependency chain `COMPONENT-GAP.md` calls the one hard one in the build.
 *
 * **Change** — a value that moves along a run of months or years, drawing the scales and paths in
 * `plot.ts`: `Sparkline` / `SparkRow` over a real statement, `PaceBar` / `PaceRow` over a target
 * and a calendar, `StageTrack` over the roadmap, `GrowthCurve` / `GrowthCard` over the projection.
 * These separate their marks by weight, dash and form rather than by rung, because each of them
 * has one series and a one-hue ramp has nothing to say about a single line.
 *
 * The feeds are in `months.ts` (statement lines folded into months), `pace.ts` (dates against a
 * target) and `growth.ts` (the projection, evaluated between its endpoints). None of them invents
 * a number; `months.test.ts` and `growth.test.ts` are where that is held to.
 */
export { AllocationCard, RibbonTab } from './AllocationCard.tsx'
export { AllocationCompare } from './AllocationCompare.tsx'
export { BarList, SegmentedBar } from './Bars.tsx'
export { DonutChart } from './DonutChart.tsx'
export { GrowthCard, GrowthCurve } from './GrowthCurve.tsx'
export { LegendRow } from './LegendRow.tsx'
export { PaceBar, PaceRow } from './PaceBar.tsx'
export { Sparkline, SparkRow } from './Sparkline.tsx'
export { StageTrack } from './StageTrack.tsx'
export type { TrackStage } from './StageTrack.tsx'
export { earnedShare, growthOf, marksFor } from './growth.ts'
export type { Growth, GrowthLine } from './growth.ts'
export { lowOf, monthKey, monthLabel, monthlyClose, monthlyTotals, windowKeys } from './months.ts'
export type { MonthPoint, MonthSeries, MonthWindow } from './months.ts'
export { lanesOf, paceOf } from './pace.ts'
export type { Lane, Pace, PaceInput, PaceStatus } from './pace.ts'
export { bounds, deltaShare, median } from './plot.ts'
export { align, bgOf, collapse, OTHERS_LABEL, pct, RAMP, series } from './series.ts'
export type { Portion, Series, Slice, Tone } from './series.ts'

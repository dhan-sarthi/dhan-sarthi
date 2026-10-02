import type { Kpi } from '@dhan/contracts'
import { cn } from '../../lib/cn.ts'
import { Card, Stat } from '../../ui/index.ts'
import { kpiLabel } from './derive.ts'

/** Figures where fewer is better, so a fall is drawn as good news. */
const FEWER_IS_BETTER = new Set(['open_handoffs'])

/**
 * The strip's grid, measured against its own card rather than the window: one figure a row on a
 * phone, where a tile beside another could not hold Book value's figure and its line, a 2×2 from
 * about 580px, and one row of four once the card is about 900px wide (a 1280 laptop beside the
 * full sidebar). Book value comes first and is the only figure with a chart under it, so it gets the
 * wider track: its change and the name of its line then sit on one line each at 1280 instead of
 * wrapping into a tile twice as tall as the rest. The card that holds it is the `@container`.
 */
export const KPI_GRID =
  'grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]'

/**
 * Hairlines between neighbours only. A step less padding under 1440, where the strip would
 * otherwise push the queue's second row below the fold.
 */
export function kpiCellClass(index: number): string {
  return cn(
    'min-w-0 border-hairline-soft px-5 py-3 min-[90rem]:py-4',
    // One a row: a rule over each after the first.
    index > 0 && 'border-t',
    // Two by two: the second sits beside the first, the right-hand pair takes a rule on its left.
    index === 1 && '@xl:border-t-0',
    index % 2 === 1 && '@xl:border-l',
    // One row of four: rules between neighbours only.
    '@4xl:border-t-0',
    index === 2 && '@4xl:border-l',
  )
}

/**
 * Four answers in one band, hairlines between them rather than four floating cards: the strip is
 * one glance at the book, and the queue under it is where the eye should go next. Each figure is
 * the kit's `Stat`: a count that is part of the book reads "9 of 38", the line a sparkline draws
 * is named under it in the API's own words, and the caption wraps rather than losing its meaning
 * to an ellipsis at 1280.
 */
export function KpiStrip({ kpis }: { kpis: readonly Kpi[] }) {
  return (
    <Card padded={false} className="@container overflow-hidden">
      <ul className={KPI_GRID}>
        {kpis.map((kpi, i) => (
          <li key={kpi.id} className={kpiCellClass(i)}>
            <Stat
              label={kpiLabel(kpi)}
              value={kpi.value}
              unit={kpi.unit}
              outOf={kpi.outOf}
              delta={kpi.delta}
              // A part of a whole says its own denominator ("9 of 38"); the API's caption for it
              // ("of 38 customers") would say it a second time.
              deltaLabel={kpi.outOf === null ? kpi.deltaLabel : null}
              invert={FEWER_IS_BETTER.has(kpi.id)}
              series={kpi.series}
              seriesLabel={kpi.seriesLabel}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}

import type { Kpi } from '@dhan/contracts'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatPct } from '../../lib/format.ts'
import { Card, DeltaPill, Money, Sparkline } from '../../ui/index.ts'
import { kpiLabel } from './derive.ts'

/** Figures where fewer is better, so a fall is drawn as good news. */
const FEWER_IS_BETTER = new Set(['open_handoffs'])

/**
 * The strip's grid: a 2×2 below xl, one row of four above it. Book value comes first and is the
 * only figure with a chart under it, so it gets the wider track: its change and the name of its
 * line then sit on one line each at 1280 instead of wrapping into a tile twice as tall as the rest.
 */
export const KPI_GRID = 'grid grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]'

/**
 * Hairlines between neighbours only. A step less padding under 1440, where the strip would
 * otherwise push the queue's second row below the fold.
 */
export function kpiCellClass(index: number): string {
  return cn(
    'min-w-0 px-5 py-3 min-[90rem]:py-4',
    index % 2 === 1 && 'border-l border-hairline-soft',
    index >= 2 && 'border-t border-hairline-soft xl:border-t-0',
    index === 2 && 'xl:border-l',
  )
}

/**
 * Four answers in one band, hairlines between them rather than four floating cards: the strip is
 * one glance at the book, and the queue under it is where the eye should go next.
 */
export function KpiStrip({ kpis }: { kpis: readonly Kpi[] }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <ul className={KPI_GRID}>
        {kpis.map((kpi, i) => (
          <li key={kpi.id} className={kpiCellClass(i)}>
            <KpiTile kpi={kpi} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * One KPI, drawn like the kit's `Stat` (quiet label, big tabular figure, what it is measured
 * against) with three things the strip needs that `Stat` does not do yet:
 *
 * - a count that is part of the book reads "9 of 38", never a percentage of it;
 * - the line a sparkline draws is named under it, in the API's own words, as a legend;
 * - the caption wraps to a second line instead of losing its meaning to an ellipsis at 1280.
 */
function KpiTile({ kpi }: { kpi: Kpi }) {
  const series = kpi.series && kpi.series.length > 1 ? kpi.series : null
  // A part of a whole says its own denominator ("9 of 38"); the API's caption for it ("of 38
  // customers") would say it a second time.
  const caption = kpi.outOf === null ? kpi.deltaLabel : null

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-label text-ink-soft">{kpiLabel(kpi)}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="text-display text-ink">
          <Figure kpi={kpi} />
        </p>
        {series ? <Sparkline values={series} width={96} height={28} area className="mb-1" /> : null}
      </div>
      {kpi.delta !== null || caption ? (
        <p className="flex min-h-5 items-center gap-2 text-caption text-ink-faint">
          {kpi.delta !== null ? (
            <DeltaPill
              value={kpi.delta}
              unit={kpi.unit === 'pct' ? 'pp' : kpi.unit}
              invert={FEWER_IS_BETTER.has(kpi.id)}
              className="shrink-0"
            />
          ) : null}
          {caption ? <span className="min-w-0">{caption}</span> : null}
        </p>
      ) : null}
      {series && kpi.seriesLabel ? (
        <p className="flex items-center gap-1.5 text-caption text-ink-hint">
          <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full bg-chart-1" />
          {kpi.seriesLabel}
        </p>
      ) : null}
    </div>
  )
}

function Figure({ kpi }: { kpi: Kpi }) {
  if (kpi.unit === 'inr') return <Money value={kpi.value} short />
  if (kpi.unit === 'pct') return <span className="tabular">{formatPct(kpi.value)}</span>
  return (
    <span className="tabular">
      {formatCount(kpi.value)}
      {kpi.outOf !== null ? (
        <span className="ml-1.5 text-title text-ink-faint">of {formatCount(kpi.outOf)}</span>
      ) : null}
    </span>
  )
}

import type { Kpi } from '@dhan/contracts'
import { cn } from '../../lib/cn.ts'
import { Card, Stat } from '../../ui/index.ts'

/*
 * The book value's sparkline is twelve month-end balances, not book value: holdings are flat
 * before the anchor, so a book-value line would draw growth that never happened. The tile says
 * which line it is drawing, right above the line.
 */
const SERIES_CAPTION: Readonly<Record<string, string>> = {
  book_value: 'Balances, 12 months',
}

/** Figures where fewer is better, so a fall is drawn as good news. */
const FEWER_IS_BETTER = new Set(['open_handoffs'])

/** Hairlines between neighbours only: a 2×2 grid below xl, one row of four above it. */
export function kpiCellClass(index: number): string {
  return cn(
    'min-w-0 px-5 py-4',
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
      <ul className="grid grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, i) => {
          const caption = kpi.series && kpi.series.length > 1 ? SERIES_CAPTION[kpi.id] : undefined
          return (
            <li key={kpi.id} className={kpiCellClass(i)}>
              <Stat
                label={
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate">{kpi.label}</span>
                    {caption ? (
                      <span className="shrink-0 text-caption font-normal text-ink-hint">
                        {caption}
                      </span>
                    ) : null}
                  </span>
                }
                value={kpi.value}
                unit={kpi.unit}
                delta={kpi.delta}
                // Stat truncates its delta label; at 1280 "20 of 38 customers investing
                // monthly" does not fit a quarter of the strip, and an ellipsis would cut the
                // figure's meaning in half. Wrapping inside the label keeps every word.
                deltaLabel={
                  kpi.deltaLabel ? (
                    <span className="whitespace-normal">{kpi.deltaLabel}</span>
                  ) : null
                }
                series={kpi.series}
                invert={FEWER_IS_BETTER.has(kpi.id)}
              />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

import type { ReactNode } from 'react'

export interface ChartTooltipRow {
  label: string
  value: string
  /** The series' colour, as a CSS colour: `var(--color-chart-1)`. */
  swatch: string
}

/**
 * The dark card a chart shows for the point under the pointer: a title (the month) and one row
 * per series. Every chart on the console draws this one, whether it is a Recharts chart
 * (`charts.tsx`) or a hand-drawn month tile (`MonthChart.tsx`).
 */
export function ChartTooltipCard({
  title,
  rows,
}: {
  title: ReactNode
  rows: readonly ChartTooltipRow[]
}) {
  return (
    <div className="min-w-40 rounded-md bg-chart-tooltip px-3 py-2 text-caption text-chart-tooltip-text shadow-popover">
      <p className="mb-1.5 font-semibold">{title}</p>
      <div className="grid gap-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-5">
            <span className="inline-flex items-center gap-1.5 text-chart-tooltip-muted">
              <span
                aria-hidden
                className="h-2.5 w-0.5 rounded-full"
                style={{ background: row.swatch }}
              />
              {row.label}
            </span>
            <span className="tabular font-semibold">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

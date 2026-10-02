import { useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatMonth } from '../../lib/format.ts'
import { ChartTooltipCard } from '../../ui/index.ts'
import { AXIS_BAND, FloatingTip, HoverStrips, MonthTicks, SIDE, monthLeft } from './monthFrame.tsx'

/*
 * Monthly counts as thin columns, drawn in the same frame as the line tiles (`monthFrame.tsx`):
 * the twelve months at the same positions, the same labels counted back from the latest month,
 * the same dark hover card. Grey columns, the latest month in green: the one the tile is titled
 * with, and always named on the axis under it.
 *
 * Counts are read from zero, so these keep their gridlines and their baseline; the columns'
 * heights are the counts.
 *
 * Every value is in the figure's accessible name, so the hover card is never the only way to
 * read one.
 */

const TOP = 8

export function MonthColumns({
  months,
  values,
  seriesLabel,
  height,
  label,
}: {
  months: readonly string[]
  values: readonly number[]
  /** What the hover card calls the count: "Refusals". */
  seriesLabel: string
  height: number
  label: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...values)
  const plot = height - TOP - AXIS_BAND
  const n = months.length
  const described = months
    .map((m, i) => `${formatMonth(m)}: ${formatCount(values[i] ?? 0)}`)
    .join(', ')
  const activeMonth = active === null ? undefined : months[active]
  const activeValue = active === null ? undefined : values[active]

  return (
    <figure
      role="img"
      aria-label={`${label}. ${described}`}
      className="relative w-full select-none"
      style={{ height }}
      onPointerLeave={() => setActive(null)}
    >
      {/* Gridlines and baseline, recessive: the top, the middle and zero. */}
      <div
        aria-hidden
        className="absolute"
        style={{ top: TOP, height: plot, left: SIDE, right: SIDE }}
      >
        <span className="absolute inset-x-0 top-0 h-px bg-chart-grid" />
        <span className="absolute inset-x-0 top-1/2 h-px bg-chart-grid" />
        <span className="absolute inset-x-0 bottom-0 h-px bg-chart-baseline" />
      </div>

      <div
        aria-hidden
        className="absolute"
        style={{ top: TOP, height: plot, left: SIDE, right: SIDE }}
      >
        {months.map((month, i) => {
          const v = values[i] ?? 0
          const latest = i === n - 1
          return (
            <span
              key={month}
              className="absolute bottom-0 flex h-full w-6 -translate-x-1/2 items-end justify-center"
              style={{ left: monthLeft(i, n) }}
            >
              <span
                className={cn(
                  'block w-2.5 rounded-t-[3px] transition-opacity duration-150',
                  latest ? 'bg-chart-1' : 'bg-chart-neutral-300',
                  active !== null && active !== i && 'opacity-55',
                )}
                // A zero month draws nothing above the baseline: no column is the honest zero.
                style={{ height: v === 0 ? 0 : `max(${(v / max) * 100}%, 2px)` }}
              />
            </span>
          )
        })}
      </div>

      <HoverStrips months={months} top={TOP} height={plot} onActive={setActive} />
      <MonthTicks months={months} />

      {activeMonth !== undefined && activeValue !== undefined && active !== null ? (
        <FloatingTip index={active} n={n} top={TOP}>
          <ChartTooltipCard
            title={formatMonth(activeMonth)}
            rows={[
              {
                label: seriesLabel,
                value: formatCount(activeValue),
                swatch: 'var(--color-chart-1)',
              },
            ]}
          />
        </FloatingTip>
      ) : null}
    </figure>
  )
}

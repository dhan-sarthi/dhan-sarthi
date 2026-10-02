import { useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatMonth } from '../../lib/format.ts'
import { ChartTooltipCard } from '../../ui/index.ts'

/*
 * Monthly counts as thin columns, drawn to sit in the same grid as the kit's `AreaChart` tiles:
 * the same 14px side margins, the twelve months at the same positions, the same every-other-month
 * labels and the same dark tooltip. The kit's `BarChart` always draws a y axis, which pushed its
 * months out of line with the tile above and dropped September from the axis; this keeps the
 * multiples reading as one set. Grey columns, the latest month in green, as the kit's own bar
 * chart does.
 *
 * Every value is in the figure's accessible name, so the hover tooltip is never the only way to
 * read one.
 */

const SIDE = 14
const TOP = 8
/** Recharts' default x-axis height, so the baselines of column and area tiles line up. */
const AXIS_BAND = 30

export function MonthColumns({
  months,
  values,
  seriesLabel,
  height,
  label,
}: {
  months: readonly string[]
  values: readonly number[]
  /** What the tooltip calls the count: "Refusals". */
  seriesLabel: string
  height: number
  label: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...values)
  const plot = height - TOP - AXIS_BAND
  const n = months.length
  const at = (i: number): string => (n <= 1 ? '50%' : `${(i / (n - 1)) * 100}%`)
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
      {/* Gridlines and baseline, recessive, at the same three heights the area tiles draw. */}
      <div aria-hidden className="absolute inset-x-[14px]" style={{ top: TOP, height: plot }}>
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
              style={{ left: at(i) }}
              onPointerEnter={() => setActive(i)}
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

      <div
        aria-hidden
        className="absolute text-micro leading-none font-normal tracking-normal text-chart-axis"
        style={{ left: SIDE, right: SIDE, bottom: 7 }}
      >
        {months.map((month, i) =>
          i % 2 === 0 ? (
            <span
              key={month}
              className="absolute bottom-0 -translate-x-1/2"
              style={{ left: at(i) }}
            >
              {formatMonth(month, { year: false })}
            </span>
          ) : null,
        )}
      </div>

      {activeMonth !== undefined && activeValue !== undefined && active !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10"
          style={{
            top: TOP,
            left: `calc(${SIDE}px + (100% - ${SIDE * 2}px) * ${n <= 1 ? 0.5 : active / (n - 1)})`,
            transform: `translate(${active > (n - 1) / 2 ? 'calc(-100% - 10px)' : '10px'}, 0)`,
          }}
        >
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
        </div>
      ) : null}
    </figure>
  )
}

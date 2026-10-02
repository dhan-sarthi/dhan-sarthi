import type { RmInsights } from '@dhan/contracts'
import { ChevronRight } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { cn } from '../../lib/cn.ts'
import { formatMonth, formatPct } from '../../lib/format.ts'
import { Avatar, Card, CardHeader, DeltaPill, EmptyState, Money } from '../../ui/index.ts'
import { MOVER_WINDOW_POINTS, moverBase } from './derive.ts'

type Mover = RmInsights['topMovers'][number]

/*
 * The customers whose balances moved most over the last three months, up or down. Each row is
 * the customer, twelve month-ends of balances with the three months that were measured drawn in
 * colour and the rest in grey, the change, and the rupees either side of it. A 38% fall on
 * ₹89k and on ₹89L are different calls, so the figures sit beside the percentage.
 */
export function TopMovers({ insights }: { insights: RmInsights }) {
  const { topMovers, months } = insights
  const last = months[months.length - 1]
  const base = months[months.length - MOVER_WINDOW_POINTS]
  const lastLabel = last ? formatMonth(last, { year: false }) : null
  const baseLabel = base ? formatMonth(base, { year: false }) : null

  return (
    <Card aria-labelledby="insights-movers" className="pb-3">
      <CardHeader
        title={<span id="insights-movers">Top movers</span>}
        actions={
          <span className="text-caption text-ink-faint">
            Biggest change in balances over three months
          </span>
        }
      />
      {topMovers.length === 0 ? (
        <EmptyState
          title="No movers to rank yet"
          body="A customer needs balances from three months back before a change can be measured."
        />
      ) : (
        <div>
          {/* Column names for the eye; each row is a link that reads in full on its own. */}
          <div
            aria-hidden
            className="grid grid-cols-[minmax(11rem,1fr)_minmax(7rem,1.25fr)_6.5rem_9rem_1rem] items-end gap-x-5 border-b border-hairline-soft px-2 pb-2 text-micro tracking-micro text-ink-faint uppercase"
          >
            <span>Customer</span>
            <span>Balances, 12 months</span>
            <span className="text-right">3 months</span>
            <span className="text-right">{lastLabel ? `End of ${lastLabel}` : 'Latest'}</span>
            <span />
          </div>
          <ul className="grid" aria-label="Customers whose balances moved most over three months">
            {topMovers.map((mover) => (
              <MoverRow key={mover.cif} mover={mover} baseLabel={baseLabel} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function MoverRow({ mover, baseLabel }: { mover: Mover; baseLabel: string | null }) {
  const latest = mover.series[mover.series.length - 1] ?? null
  const from = moverBase(mover.series)
  const falling = mover.changePct < 0
  return (
    <li className="border-b border-hairline-soft last:border-0">
      <Link
        to={`/customers/${encodeURIComponent(mover.cif)}`}
        className="group grid grid-cols-[minmax(11rem,1fr)_minmax(7rem,1.25fr)_6.5rem_9rem_1rem] items-center gap-x-5 rounded-md px-2 py-2.5 transition-colors duration-150 hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="contents">
            <Avatar name={mover.name} size="md" />
          </span>
          <span className="grid min-w-0">
            <span className="truncate text-label text-ink" title={mover.name}>
              {mover.name}
            </span>
            <span className="truncate text-caption font-normal text-ink-faint tabular">
              {mover.cif}
            </span>
          </span>
        </span>
        <span className="min-w-0">
          <WindowSparkline
            values={mover.series}
            tone={falling ? 'danger' : 'brand'}
            label={`${mover.name}'s balances over 12 months, ${falling ? 'down' : 'up'} ${formatPct(Math.abs(mover.changePct))} in the last three`}
          />
        </span>
        <span className="flex justify-end">
          <DeltaPill value={mover.changePct} />
        </span>
        <span className="grid justify-items-end">
          {latest === null ? (
            <span className="text-label text-ink-hint">—</span>
          ) : (
            <Money value={latest} className="text-label text-ink" />
          )}
          {from !== null ? (
            <span className="text-caption font-normal whitespace-nowrap text-ink-faint">
              from <Money value={from} />
              {baseLabel ? ` in ${baseLabel}` : null}
            </span>
          ) : null}
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 text-ink-hint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink-soft"
        />
      </Link>
    </li>
  )
}

/**
 * A sparkline that shows which part of the line the change measures: the months before the
 * window in grey, the last three months in the row's colour over a soft wash of it. The kit's
 * `Sparkline` draws one tone end to end, which made a customer whose year fell but whose last
 * quarter rose look like a faller beside a green "+35%".
 *
 * It stretches to its cell: the path is drawn in a 0–100 box with a non-scaling stroke, and the
 * end dot is an HTML dot placed by percentage so it stays round at any width.
 */
function WindowSparkline({
  values,
  tone,
  label,
  height = 36,
}: {
  values: readonly number[]
  tone: 'brand' | 'danger'
  label: string
  height?: number
}) {
  const gradientId = useId()
  if (values.length < 2) {
    return <span className="block h-8" aria-hidden />
  }
  const pad = 3
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = 100 / (values.length - 1)
  const points = values.map((v, i) => {
    const y = max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2)
    return [i * step, y] as const
  })
  const path = (from: number, to: number): string =>
    points
      .slice(from, to)
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join('')
  const windowStart = Math.max(0, points.length - MOVER_WINDOW_POINTS)
  const windowX = points[windowStart]?.[0] ?? 0
  const lastPoint = points[points.length - 1]
  const context = path(0, windowStart + 1)
  const window = path(windowStart, points.length)
  const fill = `${window}L100,${height}L${windowX.toFixed(2)},${height}Z`
  const colour = tone === 'danger' ? 'text-danger' : 'text-chart-1'

  return (
    <span role="img" aria-label={label} className="relative block w-full" style={{ height }}>
      <svg
        aria-hidden
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          {/* The colour class sits on the gradient itself: `currentColor` in a stop resolves
              where the gradient is defined, not where it is used. */}
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1" className={colour}>
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.2} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {windowStart > 0 ? (
          <path
            d={context}
            fill="none"
            className="text-chart-neutral-400"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <g className={colour}>
          <path d={fill} fill={`url(#${gradientId})`} />
          <path
            d={window}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      {lastPoint ? (
        <span
          aria-hidden
          className={cn(
            'absolute size-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-surface',
            colour,
          )}
          style={{ right: 0, top: `${(lastPoint[1] / height) * 100}%` }}
        />
      ) : null}
    </span>
  )
}

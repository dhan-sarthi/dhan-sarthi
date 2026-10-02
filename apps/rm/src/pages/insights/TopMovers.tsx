import type { BookRow, RmInsights } from '@dhan/contracts'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useBook } from '../../api/queries.ts'
import { cn } from '../../lib/cn.ts'
import { formatMonth, formatPct } from '../../lib/format.ts'
import { Avatar, Card, CardHeader, DeltaPill, EmptyState, Money } from '../../ui/index.ts'
import { MOVER_WINDOW_POINTS, moverBase } from './derive.ts'

type Mover = RmInsights['topMovers'][number]

type Who = Pick<BookRow, 'age' | 'city'>

/*
 * The customers whose balances moved most over the last three months, up or down. Each row is
 * the customer, twelve month-ends of balances with the three months that were measured drawn in
 * colour and the rest in grey, the change, and the rupees either side of it. A 38% fall on
 * ₹89k and on ₹89L are different calls, so the figures sit beside the percentage. The change is
 * month-end to month-end, the same as the Book's 3-month column.
 *
 * Under each name is "age · city", as on every other list of customers. Insights does not carry
 * them, so they come from the book, which is one cached read the Book page shares. Until it
 * arrives the line is left empty, never filled with the CIF; the CIF is on the row's hover.
 */
export function TopMovers({ insights }: { insights: RmInsights }) {
  const { topMovers, months } = insights
  const book = useBook()
  const who = useMemo(
    () => new Map<string, Who>((book.data?.rows ?? []).map((r) => [r.cif, r])),
    [book.data],
  )
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
            Biggest 3-month change in month-end balances
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
            <span>Month-end balances, 12 months</span>
            <span className="text-right">3 months</span>
            <span className="text-right">{lastLabel ? `End of ${lastLabel}` : 'Latest'}</span>
            <span />
          </div>
          <ul className="grid" aria-label="Customers whose balances moved most over three months">
            {topMovers.map((mover) => (
              <MoverRow
                key={mover.cif}
                mover={mover}
                who={who.get(mover.cif)}
                baseLabel={baseLabel}
              />
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function MoverRow({
  mover,
  who,
  baseLabel,
}: {
  mover: Mover
  who: Who | undefined
  baseLabel: string | null
}) {
  const latest = mover.series[mover.series.length - 1] ?? null
  const from = moverBase(mover.series)
  const falling = mover.changePct < 0
  return (
    <li className="border-b border-hairline-soft last:border-0">
      <Link
        to={`/customers/${encodeURIComponent(mover.cif)}`}
        title={`${mover.name} · ${mover.cif}`}
        className="group grid grid-cols-[minmax(11rem,1fr)_minmax(7rem,1.25fr)_6.5rem_9rem_1rem] items-center gap-x-5 rounded-md px-2 py-2.5 transition-colors duration-150 hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="contents">
            <Avatar name={mover.name} size="md" />
          </span>
          <span className="grid min-w-0">
            <span className="truncate text-label text-ink">{mover.name}</span>
            <span className="h-4 truncate text-caption font-normal text-ink-faint">
              {who ? `${who.age} · ${who.city}` : null}
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
 * window in grey, the last three months in the row's colour over a faint band that marks those
 * months. The band is a span of time, full height, not a fill under the line: the line is not
 * read from zero, and a fill would draw a 38% fall as most of the balance gone. The kit's
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
  const colour = tone === 'danger' ? 'text-danger' : 'text-chart-1'

  return (
    <span role="img" aria-label={label} className="relative block w-full" style={{ height }}>
      <svg
        aria-hidden
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <rect
          x={windowX}
          y={0}
          width={100 - windowX}
          height={height}
          className={colour}
          fill="currentColor"
          fillOpacity={0.07}
        />
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

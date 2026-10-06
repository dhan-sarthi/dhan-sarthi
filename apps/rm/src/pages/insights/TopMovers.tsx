import type { BookRow, RmInsights } from '@dhan/contracts'
import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useBook } from '../../api/queries.ts'
import { cn } from '../../lib/cn.ts'
import { formatMonth, formatPct } from '../../lib/format.ts'
import {
  Avatar,
  Card,
  CardHeader,
  DeltaPill,
  EmptyState,
  Money,
  Sparkline,
  columnHeaderClass,
} from '../../ui/index.ts'
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
 *
 * The rows measure the card, not the window: in a narrow card (a tablet held upright, a phone)
 * the twelve-month line steps aside, and the change rides on the figure's line, so the name keeps
 * the room it needs: the customer on the left, the change and the rupees on the right.
 */
const ROW_GRID =
  'grid grid-cols-[minmax(0,1fr)_auto_1rem] gap-x-3 @3xl:grid-cols-[minmax(11rem,1fr)_minmax(7rem,1.25fr)_6.5rem_9rem_1rem] @3xl:gap-x-5'

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
    <Card aria-labelledby="insights-movers" className="@container pb-3">
      <CardHeader
        title={<span id="insights-movers">Top movers</span>}
        actions={
          <span className="hidden text-caption text-ink-faint @xl:inline">
            Biggest 3-month change in month-end balances
          </span>
        }
        className="@max-xl:mb-1"
      />
      <p className="mb-3 text-caption text-ink-faint @xl:hidden">
        Biggest 3-month change in month-end balances
      </p>
      {topMovers.length === 0 ? (
        <EmptyState
          title="No movers to rank yet"
          body="A customer needs balances from three months back before a change can be measured."
        />
      ) : (
        <div>
          {/* Column names for the eye; each row is a link that reads in full on its own. */}
          <div aria-hidden className={cn(ROW_GRID, columnHeaderClass, 'items-center px-2')}>
            <span>Customer</span>
            <span className="hidden @3xl:block">Month-end balances, 12 months</span>
            <span className="hidden text-right @3xl:block">3 months</span>
            <span className="text-right">
              <span className="@3xl:hidden">3 months · </span>
              {lastLabel ? `End of ${lastLabel}` : 'Latest'}
            </span>
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
        className={cn(
          ROW_GRID,
          'group items-center rounded-md px-2 py-2.5 transition-colors duration-feedback hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="hidden @sm:contents">
            <Avatar name={mover.name} size="md" />
          </span>
          <span className="grid min-w-0">
            <span className="truncate text-label text-ink">{mover.name}</span>
            <span className="h-4 truncate text-caption-plain text-ink-faint">
              {who ? `${who.age} · ${who.city}` : null}
            </span>
          </span>
        </span>
        {/* The months before the measured window in grey, the window itself in the row's colour
            over a faint band, so a customer whose year fell but whose quarter rose does not read
            as a faller beside a green "+35%". */}
        <span className="hidden min-w-0 @3xl:block">
          <Sparkline
            values={mover.series}
            window={MOVER_WINDOW_POINTS}
            fluid
            height={36}
            tone={falling ? 'danger' : 'brand'}
            label={`${mover.name}'s balances over 12 months, ${falling ? 'down' : 'up'} ${formatPct(Math.abs(mover.changePct))} in the last three`}
          />
        </span>
        <span className="hidden justify-end @3xl:flex">
          <DeltaPill value={mover.changePct} />
        </span>
        <span className="grid justify-items-end">
          <span className="flex items-center gap-2">
            <span className="@3xl:hidden">
              <DeltaPill value={mover.changePct} />
            </span>
            {latest === null ? (
              <span className="text-label text-ink-hint">—</span>
            ) : (
              <Money value={latest} className="text-label text-ink" />
            )}
          </span>
          {from !== null ? (
            <span className="text-caption-plain whitespace-nowrap text-ink-faint">
              from <Money value={from} />
              {baseLabel ? ` in ${baseLabel}` : null}
            </span>
          ) : null}
        </span>
        <ChevronRight
          aria-hidden
          className="size-4 text-ink-hint transition-transform duration-feedback group-hover:translate-x-0.5 group-hover:text-ink-soft"
        />
      </Link>
    </li>
  )
}

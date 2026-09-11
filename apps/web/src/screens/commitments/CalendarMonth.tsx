/**
 * The month grid — the one component on this screen rebuilt rather than ported.
 *
 * `spec/screens/07-sip-calendar/01-systematic-calendar.md` measures the reference's calendar
 * precisely and, to its credit, says what is wrong with it: a 7×4 grid of the numbers 1 to 28 in
 * reading order, "no leading blank cells", "day 1 always sits in column 1". No month name, no
 * previous or next control, no weekday header, no 29th, 30th or 31st, and no legend for the four
 * colours it does draw. Its own banner reads *"Tap on dates to see SIP details"* and the flow
 * file records that across every frame in the video, no such detail ever appears.
 *
 * So it is not a calendar. It is a picture of one, and every date on it is in the wrong place
 * for eleven months of the year. What is worth keeping is the *idea* — a compact month card
 * where the colour of a day says whether that money has gone, is coming, or has not arrived when
 * it should have — and the compact card treatment itself. Both are kept. The rest is rebuilt:
 *
 * - real weekday alignment, from the actual weekday of the 1st;
 * - the real length of the month, leap years included, five rows or six as the month needs;
 * - a weekday header row, and a month label that says which month you are looking at;
 * - previous / next month, bounded by the evidence — see `monthRange`;
 * - the per-date detail the reference promises, which the caller draws under the grid;
 * - a legend, because four unexplained colours is not a state machine anybody can read.
 *
 * **Colour is never the only channel.** Each state carries a glyph as well as a fill, the day's
 * charge count and amount are in every cell's accessible name, and the legend names all three.
 * `DESIGN.md` requires that of charts and it is more important here, where the difference between
 * two colours is the difference between money that has gone and money that has not.
 *
 * **Keyboard.** A real `role="grid"` with roving tabindex: one day is tabbable, arrows move by
 * day and week, Home and End reach the ends of the week, PageUp/PageDown change month. That is
 * the standard date-grid pattern, and without it a calendar is 31 tab stops.
 */
import { useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { AlertTriangle, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import { monthGrid, monthLabel, WEEKDAYS } from './calendar.ts'
import type { DayCell, Due, DueState } from './calendar.ts'

/*
 * The three states, on IDBI tokens.
 *
 * `03-PALETTE-MAP.md`: On Track goes to `legend-chip` / `good`, In Process to `accent-soft` /
 * `accent-text`, Needs Attention to `danger-soft` / `danger`. The reference's green check, amber
 * fill and blue fill land on the first three of those; its fourth colour — the "selected" blue —
 * is not a fill here at all, because selection is interaction state and belongs on a ring.
 */
const CELL: Record<DueState, { fill: string; glyph: ReactNode; word: string }> = {
  paid: {
    fill: 'bg-brand text-on-dark',
    glyph: <Check size={11} strokeWidth={3.4} />,
    word: 'paid',
  },
  /* A tick, a dot and a triangle: three shapes, so the states survive the colour being wrong,
     printed in grey, or read by somebody who cannot tell the mint from the peach. */
  due: {
    fill: 'bg-accent-soft text-accent-text',
    glyph: <span className="block size-[5px] rounded-pill bg-current" />,
    word: 'due',
  },
  late: {
    fill: 'bg-danger-soft text-danger',
    glyph: <AlertTriangle size={10} strokeWidth={3} />,
    word: 'expected and not charged',
  },
}

const LEGEND: readonly { state: DueState; label: string }[] = [
  { state: 'paid', label: 'Charged' },
  { state: 'due', label: 'To come' },
  { state: 'late', label: 'Not arrived' },
]

function describe(cell: DayCell, label: string): string {
  if (cell.dues.length === 0) return `${cell.day} ${label}, nothing due`
  const state = cell.state === null ? '' : `, ${CELL[cell.state].word}`
  const what =
    cell.dues.length === 1 ? (cell.dues[0]?.label ?? '') : `${cell.dues.length} commitments`
  return `${cell.day} ${label}, ${inr(cell.total)}${state}, ${what}`
}

export function CalendarMonth({
  year,
  month,
  asOf,
  dues,
  selected,
  onSelect,
  onMonth,
  canPrev,
  canNext,
}: {
  year: number
  month: number
  asOf: string
  dues: readonly Due[]
  /** The ISO date currently open in the detail panel, or null. */
  selected: string | null
  onSelect: (date: string | null) => void
  onMonth: (by: number) => void
  canPrev: boolean
  canNext: boolean
}): ReactNode {
  const cells = monthGrid(year, month, asOf, dues)
  const label = monthLabel(year, month)
  const grid = useRef<HTMLDivElement>(null)

  /*
   * Which day the Tab key lands on: the selection, else wherever the arrows were left, else
   * today, else the 1st.
   *
   * Stored *with the month it belongs to* rather than reset by an effect when the month changes.
   * Same outcome — a month you arrowed into opens with its tab stop on a day that exists — with
   * no cascading render, and nothing to go stale between the state write and the paint.
   */
  const ym = `${year}-${String(month).padStart(2, '0')}`
  const [roving, setRoving] = useState<{ ym: string; day: number } | null>(null)
  const fallback = asOf.slice(0, 7) === ym ? Number(asOf.slice(8, 10)) : 1
  const active =
    selected !== null && selected.slice(0, 7) === ym
      ? Number(selected.slice(8, 10))
      : roving?.ym === ym
        ? roving.day
        : fallback

  const last = cells.filter((c) => c.date !== null).length
  /* The padding cells at the head of the grid are exactly the weekday index of the 1st, which
     is what Home and End need to find the ends of a week. */
  const lead = cells.length - last

  function move(to: number): void {
    const clamped = Math.min(Math.max(to, 1), last)
    setRoving({ ym, day: clamped })
    /* Focus follows the roving index; the cell is addressed by its day so the query is stable
       across the padding cells at the head of the grid. */
    requestAnimationFrame(() => {
      grid.current?.querySelector<HTMLElement>(`[data-day="${clamped}"]`)?.focus()
    })
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>): void {
    const jumps: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 7,
      ArrowUp: -7,
    }
    const jump = jumps[e.key]
    if (jump !== undefined) {
      e.preventDefault()
      move(active + jump)
      return
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const weekday = (lead + active - 1) % 7
      move(e.key === 'Home' ? active - weekday : active + (6 - weekday))
      return
    }
    if (e.key === 'PageUp' || e.key === 'PageDown') {
      const forward = e.key === 'PageDown'
      if (forward ? !canNext : !canPrev) return
      e.preventDefault()
      onMonth(forward ? 1 : -1)
    }
  }

  return (
    <section className="mb-3 rounded-md border border-solid border-hairline-mint bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <IconButton
          label="Previous month"
          size="sm"
          tone="bordered"
          disabled={!canPrev}
          onClick={() => onMonth(-1)}
        >
          <ChevronLeft size={17} strokeWidth={2.4} />
        </IconButton>
        {/* Announced, because changing month with the chevrons otherwise changes nothing a
            screen reader is told about — the grid's contents move and its name does not. */}
        <h2 aria-live="polite" className="m-0 text-[15px] font-semibold text-ink">
          {label}
        </h2>
        <IconButton
          label="Next month"
          size="sm"
          tone="bordered"
          disabled={!canNext}
          onClick={() => onMonth(1)}
        >
          <ChevronRight size={17} strokeWidth={2.4} />
        </IconButton>
      </div>

      <div
        ref={grid}
        role="grid"
        aria-label={`Commitments in ${label}`}
        onKeyDown={onKey}
        className="mt-3"
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map((d) => (
            /* The full name is the accessible one; the single letter is what fits a 46px column
               and is meaningless to a screen reader on its own. */
            <div
              key={d}
              role="columnheader"
              aria-label={d}
              className="pb-1.5 text-center text-[11px] font-semibold text-ink-soft"
            >
              <span aria-hidden="true">{d.slice(0, 1)}</span>
            </div>
          ))}
        </div>

        {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
          <div key={row} role="row" className="grid grid-cols-7">
            {cells.slice(row * 7, row * 7 + 7).map((cell, i) =>
              cell.date === null ? (
                /* An empty cell, not a hidden one: the row still has to have seven columns for
                   the grid's own arithmetic, and "blank" is the right thing to hear. */
                <div key={`pad-${String(i)}`} role="gridcell" />
              ) : (
                <div key={cell.date} role="gridcell" className="p-[3px]">
                  <button
                    type="button"
                    data-day={cell.day}
                    tabIndex={cell.day === active ? 0 : -1}
                    aria-pressed={cell.date === selected}
                    aria-current={cell.today ? 'date' : undefined}
                    aria-label={describe(cell, label)}
                    onFocus={() => setRoving({ ym, day: cell.day })}
                    onClick={() => onSelect(cell.date === selected ? null : cell.date)}
                    className={`grid aspect-square w-full place-items-center rounded-sm border-0 text-[13.5px] tabular-nums transition-colors duration-150 ${
                      cell.state === null ? 'bg-transparent text-ink-mid' : CELL[cell.state].fill
                    } ${cell.today ? 'font-bold ring-[1.5px] ring-brand-deep' : 'font-medium'} ${
                      cell.date === selected ? 'ring-2 ring-accent' : ''
                    }`}
                  >
                    <span className="leading-none">{cell.day}</span>
                    {/* The second channel. A 10px glyph under the numeral, in the cell's own ink,
                        so the three states are told apart with the colour turned off. */}
                    <span aria-hidden="true" className="mt-[1px] grid h-3 place-items-center">
                      {cell.state === null ? null : CELL[cell.state].glyph}
                    </span>
                  </button>
                </div>
              ),
            )}
          </div>
        ))}
      </div>

      <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-3 gap-y-1.5 p-0">
        {LEGEND.map((l) => (
          <li key={l.state} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
            <span
              aria-hidden="true"
              className={`grid size-[18px] flex-none place-items-center rounded-[6px] ${CELL[l.state].fill}`}
            >
              {CELL[l.state].glyph}
            </span>
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <span
            aria-hidden="true"
            className="size-[18px] flex-none rounded-[6px] ring-[1.5px] ring-brand-deep"
          />
          Today
        </li>
      </ul>
    </section>
  )
}

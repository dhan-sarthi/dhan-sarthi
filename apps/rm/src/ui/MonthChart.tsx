import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { formatCount, formatInr, formatMonth, formatPct } from '../lib/format.ts'
import { endLabelSide, isLabelledMonth, lineY, monthShare } from '../lib/months.ts'
import { ChartTooltipCard } from './ChartTooltipCard.tsx'

/*
 * Twelve months, drawn small: a line tile (`MonthLines`) and a column tile (`MonthColumns`) in one
 * frame, so both put the twelve months at the same x positions, label the same months (counted
 * back from the latest, which is the one each tile is titled with), and float their card the
 * same way. Plain HTML and SVG, no chart library: a grid of these costs nothing.
 *
 * A line is never filled. A balance that does not start at zero must not be shaded down to a
 * floor as if it did: a 25% rise would read as a five-fold one. Counts are read from zero, so
 * columns keep their gridlines and baseline.
 *
 * Hover shows a month's values; under a finger a tap selects a month and keeps it until a tap
 * elsewhere, and a sideways drag scrubs along the months instead of scrolling the page
 * (`touch-action: pan-y`). Every value is also in the figure's accessible name, so the card is
 * never the only way to read one.
 */

export type MonthFormat = 'inr' | 'count' | 'pct'

function full(v: number, format: MonthFormat): string {
  if (format === 'inr') return formatInr(v)
  if (format === 'pct') return formatPct(v)
  return formatCount(v)
}

function short(v: number, format: MonthFormat): string {
  if (format === 'inr') return formatInr(v, { short: true })
  return full(v, format)
}

/** Side margin inside the tile, so the first and last month labels are not cut by the edge. */
const SIDE = 14
/** Room under the plot for the month labels. */
const AXIS_BAND = 26

/** A month's position (see `monthShare`) as a CSS length inside the plot box. */
function monthLeft(i: number, n: number): string {
  return `${monthShare(i, n) * 100}%`
}

/** The month labels along the bottom of a tile. */
function MonthTicks({ months }: { months: readonly string[] }) {
  const n = months.length
  return (
    <div
      aria-hidden
      className="absolute text-axis leading-none text-chart-axis"
      style={{ left: SIDE, right: SIDE, bottom: 6 }}
    >
      {months.map((month, i) =>
        isLabelledMonth(i, n) ? (
          <span
            key={month}
            className="absolute bottom-0 -translate-x-1/2"
            style={{ left: monthLeft(i, n) }}
          >
            {formatMonth(month, { year: false })}
          </span>
        ) : null,
      )}
    </div>
  )
}

/**
 * The card, beside the active month and on whichever side has room, so it never covers the
 * point it describes or runs off the tile.
 */
function FloatingTip({
  index,
  n,
  top,
  children,
}: {
  index: number
  n: number
  top: number
  children: ReactNode
}) {
  const share = monthShare(index, n)
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-10 w-max"
      style={{
        top,
        left: `calc(${SIDE}px + (100% - ${SIDE * 2}px) * ${share})`,
        transform: `translate(${share > 0.5 ? 'calc(-100% - 10px)' : '10px'}, 0)`,
      }}
    >
      {children}
    </div>
  )
}

/** How far a finger moves sideways before a touch is a scrub along the months, not a tap. */
const SCRUB_PX = 6

/**
 * The active month, by mouse or by finger. A mouse sets it on entering a month's strip and clears
 * it on leaving the tile. A finger sets it with a tap or a sideways drag, keeps it after lifting,
 * and clears it with a tap anywhere outside the tile; an up-and-down swipe that starts on the
 * tile scrolls the page and selects nothing (the browser takes it and cancels the pointer).
 */
function useActiveMonth(n: number) {
  const [active, setActive] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)
  const figure = useRef<HTMLElement>(null)
  const gesture = useRef<{ x: number; y: number; scrubbing: boolean } | null>(null)

  useEffect(() => {
    if (!touched || active === null) return
    function onOutside(event: globalThis.PointerEvent) {
      if (figure.current && event.target instanceof Node && figure.current.contains(event.target))
        return
      setActive(null)
      setTouched(false)
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [touched, active])

  /** The month under a pointer, from its x across the plot. */
  function indexAt(event: PointerEvent<HTMLElement>): number {
    const box = event.currentTarget.getBoundingClientRect()
    const share = box.width > 0 ? (event.clientX - box.left) / box.width : 0
    return Math.min(n - 1, Math.max(0, Math.round(share * (n - 1))))
  }

  const strips = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse') return
      gesture.current = { x: event.clientX, y: event.clientY, scrubbing: false }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const g = gesture.current
      if (event.pointerType === 'mouse' || !g) return
      const dx = Math.abs(event.clientX - g.x)
      if (!g.scrubbing && dx > SCRUB_PX && dx > Math.abs(event.clientY - g.y)) g.scrubbing = true
      if (!g.scrubbing) return
      setTouched(true)
      setActive(indexAt(event))
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const g = gesture.current
      gesture.current = null
      if (event.pointerType === 'mouse' || !g || g.scrubbing) return
      setTouched(true)
      setActive(indexAt(event))
    },
    onPointerCancel: () => {
      gesture.current = null
    },
  }
  const onMouseEnterMonth = (i: number) => {
    if (!touched) setActive(i)
  }
  const onPointerLeave = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse') setActive(null)
  }
  return { active, figure, strips, onMouseEnterMonth, onPointerLeave }
}

/**
 * One invisible strip per month, full height, that makes it the active month on hover. Strips
 * meet halfway between months, so the pointer is always over exactly one.
 */
function MonthStrips({
  months,
  top,
  height,
  onMouseEnterMonth,
  handlers,
}: {
  months: readonly string[]
  top: number
  height: number
  onMouseEnterMonth: (index: number) => void
  handlers: ReturnType<typeof useActiveMonth>['strips']
}) {
  const n = months.length
  const half = n <= 1 ? 50 : 50 / (n - 1)
  return (
    <div
      aria-hidden
      className="absolute touch-pan-y"
      style={{ top, height, left: SIDE, right: SIDE }}
      {...handlers}
    >
      {months.map((month, i) => {
        const centre = monthShare(i, n) * 100
        const from = Math.max(0, centre - half)
        const to = Math.min(100, centre + half)
        return (
          <span
            key={month}
            className="absolute inset-y-0"
            style={{ left: `${from}%`, width: `${to - from}%` }}
            onPointerEnter={(event) => {
              if (event.pointerType === 'mouse') onMouseEnterMonth(i)
            }}
          />
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- Lines */

export interface MonthLine {
  key: string
  /** What the card and the screen reader call this line: "Money in". */
  label: string
  values: readonly number[]
  /** `comparison` is context, a dashed grey line under the primary one. */
  role?: 'primary' | 'comparison'
}

const LINE_TOP = 4
/** Room above and below the line for an end label, when the ends are labelled. */
const LABEL_ROOM = 22

const STROKE = {
  primary: { className: 'text-chart-1', width: 2, dash: undefined, swatch: 'var(--color-chart-1)' },
  comparison: {
    className: 'text-chart-comparison',
    width: 1.5,
    dash: '4 3',
    swatch: 'var(--color-chart-comparison)',
  },
} as const

export interface MonthLinesProps {
  months: readonly string[]
  lines: readonly MonthLine[]
  height: number
  /** What the chart shows; every month's values are appended for a screen reader. */
  label: string
  format?: MonthFormat
  /** Print the primary line's first and last values at its ends. */
  endLabels?: boolean
  /** The points are month-end balances: the card says "End of Aug 2026". */
  monthEnd?: boolean
  className?: string
}

/**
 * Series over the months as lines with no fill and no y axis: a line that is not read from zero
 * claims only its shape, and with `endLabels` the first and last values are printed at its ends,
 * so the size of the change is read in figures, not guessed from the height of the tile.
 */
export function MonthLines({
  months,
  lines,
  height,
  label,
  format = 'inr',
  endLabels = false,
  monthEnd = false,
  className,
}: MonthLinesProps) {
  const n = months.length
  const { active, figure, strips, onMouseEnterMonth, onPointerLeave } = useActiveMonth(n)
  const plot = height - LINE_TOP - AXIS_BAND
  const y = lineY(
    lines.flatMap((l) => l.values),
    plot,
    endLabels ? LABEL_ROOM : 6,
  )
  const primary = lines.find((l) => l.role !== 'comparison') ?? lines[0]
  // Comparison lines first, so the primary line is drawn over them where they cross.
  const ordered = [...lines].sort(
    (a, b) => (a.role === 'comparison' ? 0 : 1) - (b.role === 'comparison' ? 0 : 1),
  )
  const x = (i: number): number => monthShare(i, n) * 100
  const left = (i: number): string =>
    `calc(${SIDE}px + (100% - ${SIDE * 2}px) * ${monthShare(i, n)})`

  const described = months
    .map((m, i) => {
      const parts = lines.map((l) => {
        const v = l.values[i]
        return v === undefined
          ? null
          : `${lines.length > 1 ? `${l.label} ` : ''}${short(v, format)}`
      })
      return `${formatMonth(m)}: ${parts.filter(Boolean).join(', ')}`
    })
    .join('; ')

  const last = primary ? primary.values[primary.values.length - 1] : undefined
  const first = primary ? primary.values[0] : undefined

  return (
    <figure
      ref={figure}
      role="img"
      aria-label={`${label}. ${described}`}
      className={cn('relative w-full select-none', className)}
      style={{ height }}
      onPointerLeave={onPointerLeave}
    >
      {/* The month axis only. There is no y axis and no gridline: a gridline under a line that
          is not read from zero would invite reading the gaps between them as amounts. */}
      <span
        aria-hidden
        className="absolute h-px bg-chart-baseline"
        style={{ left: SIDE, right: SIDE, top: LINE_TOP + plot }}
      />

      <svg
        aria-hidden
        viewBox={`0 0 100 ${plot}`}
        preserveAspectRatio="none"
        className="absolute overflow-visible"
        style={{ left: SIDE, top: LINE_TOP, width: `calc(100% - ${SIDE * 2}px)`, height: plot }}
      >
        {active !== null ? (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={0}
            y2={plot}
            className="text-chart-baseline"
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {ordered.map((line) => {
          const stroke = STROKE[line.role ?? 'primary']
          const d = line.values
            .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(3)},${y(v).toFixed(2)}`)
            .join('')
          return (
            <path
              key={line.key}
              d={d}
              fill="none"
              className={stroke.className}
              stroke="currentColor"
              strokeWidth={stroke.width}
              strokeDasharray={stroke.dash}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>

      {/* The latest point, marked, as the tile's figure is the latest month. HTML, so it stays
          round however wide the tile is. */}
      {primary && last !== undefined ? (
        <Dot left={left(primary.values.length - 1)} top={LINE_TOP + y(last)} tone="primary" />
      ) : null}

      {endLabels && primary && first !== undefined && last !== undefined && n > 1 ? (
        <>
          <EndLabel
            text={short(first, format)}
            side={endLabelSide(primary.values, 'first')}
            top={LINE_TOP + y(first)}
            align="start"
          />
          <EndLabel
            text={short(last, format)}
            side={endLabelSide(primary.values, 'last')}
            top={LINE_TOP + y(last)}
            align="end"
          />
        </>
      ) : null}

      {active !== null
        ? lines.map((line) => {
            const v = line.values[active]
            return v === undefined ? null : (
              <Dot
                key={line.key}
                left={left(active)}
                top={LINE_TOP + y(v)}
                tone={line.role ?? 'primary'}
                ring
              />
            )
          })
        : null}

      <MonthStrips
        months={months}
        top={LINE_TOP}
        height={plot}
        onMouseEnterMonth={onMouseEnterMonth}
        handlers={strips}
      />
      <MonthTicks months={months} />

      {active !== null && months[active] !== undefined ? (
        <FloatingTip index={active} n={n} top={LINE_TOP}>
          <ChartTooltipCard
            title={`${monthEnd ? 'End of ' : ''}${formatMonth(months[active] ?? '')}`}
            rows={lines.flatMap((line) => {
              const v = line.values[active]
              return v === undefined
                ? []
                : [
                    {
                      label: line.label,
                      value: full(v, format),
                      swatch: STROKE[line.role ?? 'primary'].swatch,
                    },
                  ]
            })}
          />
        </FloatingTip>
      ) : null}
    </figure>
  )
}

function Dot({
  left,
  top,
  tone,
  ring = false,
}: {
  left: string
  top: number
  tone: 'primary' | 'comparison'
  ring?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface',
        tone === 'primary' ? 'bg-chart-1' : 'bg-chart-comparison',
        ring && 'size-2.5',
      )}
      style={{ left, top }}
    />
  )
}

/** A value printed at one end of the line, on the side the line leaves clear. */
function EndLabel({
  text,
  side,
  top,
  align,
}: {
  text: string
  side: 'above' | 'below'
  top: number
  align: 'start' | 'end'
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute text-caption leading-none whitespace-nowrap tabular',
        align === 'end' ? 'text-ink' : 'text-ink-soft',
      )}
      style={{
        top: side === 'above' ? top - 6 : top + 6,
        ...(align === 'start' ? { left: SIDE - 2 } : { right: SIDE - 2 }),
        transform: side === 'above' ? 'translateY(-100%)' : undefined,
      }}
    >
      {text}
    </span>
  )
}

/* ---------------------------------------------------------------- Columns */

const COLUMN_TOP = 8

export interface MonthColumnsProps {
  months: readonly string[]
  values: readonly number[]
  /** What the card calls the count: "Refusals". */
  seriesLabel: string
  height: number
  label: string
  className?: string
}

/**
 * Monthly counts as thin columns: grey for context, the latest month in green, the one the tile
 * is titled with and always named on the axis under it. A zero month draws no column: no column
 * is the honest zero.
 */
export function MonthColumns({
  months,
  values,
  seriesLabel,
  height,
  label,
  className,
}: MonthColumnsProps) {
  const n = months.length
  const { active, figure, strips, onMouseEnterMonth, onPointerLeave } = useActiveMonth(n)
  const max = Math.max(1, ...values)
  const plot = height - COLUMN_TOP - AXIS_BAND
  const described = months
    .map((m, i) => `${formatMonth(m)}: ${formatCount(values[i] ?? 0)}`)
    .join(', ')
  const activeMonth = active === null ? undefined : months[active]
  const activeValue = active === null ? undefined : values[active]

  return (
    <figure
      ref={figure}
      role="img"
      aria-label={`${label}. ${described}`}
      className={cn('relative w-full select-none', className)}
      style={{ height }}
      onPointerLeave={onPointerLeave}
    >
      {/* Gridlines and baseline, recessive: the top, the middle and zero. */}
      <div
        aria-hidden
        className="absolute"
        style={{ top: COLUMN_TOP, height: plot, left: SIDE, right: SIDE }}
      >
        <span className="absolute inset-x-0 top-0 h-px bg-chart-grid" />
        <span className="absolute inset-x-0 top-1/2 h-px bg-chart-grid" />
        <span className="absolute inset-x-0 bottom-0 h-px bg-chart-baseline" />
      </div>

      <div
        aria-hidden
        className="absolute"
        style={{ top: COLUMN_TOP, height: plot, left: SIDE, right: SIDE }}
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
                  'block w-2.5 rounded-t-xs transition-opacity duration-feedback',
                  latest ? 'bg-chart-1' : 'bg-chart-context-bar',
                  active !== null && active !== i && 'opacity-55',
                )}
                style={{ height: v === 0 ? 0 : `max(${(v / max) * 100}%, 2px)` }}
              />
            </span>
          )
        })}
      </div>

      <MonthStrips
        months={months}
        top={COLUMN_TOP}
        height={plot}
        onMouseEnterMonth={onMouseEnterMonth}
        handlers={strips}
      />
      <MonthTicks months={months} />

      {activeMonth !== undefined && activeValue !== undefined && active !== null ? (
        <FloatingTip index={active} n={n} top={COLUMN_TOP}>
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

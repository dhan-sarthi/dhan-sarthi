import { useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatInr, formatMonth } from '../../lib/format.ts'
import { ChartTooltipCard } from '../../ui/index.ts'
import { endLabelSide, lineY, monthShare } from './derive.ts'
import { AXIS_BAND, FloatingTip, HoverStrips, MonthTicks, SIDE } from './monthFrame.tsx'

/*
 * Rupee series over the twelve months as lines with no fill. These balances run from ₹4.3Cr to
 * ₹5.4Cr, so a y axis from zero would flatten the change into a ruler-straight line, and an area
 * shaded down to a floor that is not zero would draw a 25% rise as a five-fold one. A bare line
 * claims only its shape; the first and last values are printed at its ends, so the size of the
 * change is read in rupees, not guessed from the height of the tile.
 *
 * Every value is in the figure's accessible name, so the hover card is never the only way to
 * read one.
 */

export interface MonthLine {
  key: string
  /** What the hover card and the screen reader call this line: "Money in". */
  label: string
  values: readonly number[]
  /** `comparison` is context, a dashed grey line under the primary one. */
  role?: 'primary' | 'comparison'
}

const TOP = 4
/** Room above and below the line for an end label, when the ends are labelled. */
const LABEL_ROOM = 22

const STROKE = {
  primary: { className: 'text-chart-1', width: 2, dash: undefined, swatch: 'var(--color-chart-1)' },
  comparison: {
    className: 'text-chart-neutral-400',
    width: 1.5,
    dash: '4 3',
    swatch: 'var(--color-chart-neutral-400)',
  },
} as const

export function MonthLines({
  months,
  lines,
  height,
  label,
  endLabels = false,
  monthEnd = false,
}: {
  months: readonly string[]
  lines: readonly MonthLine[]
  height: number
  label: string
  /** Print the primary line's first and last values at its ends. */
  endLabels?: boolean
  /** The points are month-end balances: the hover card says "End of Aug 2026". */
  monthEnd?: boolean
}) {
  const [active, setActive] = useState<number | null>(null)
  const n = months.length
  const plot = height - TOP - AXIS_BAND
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
        return v === undefined ? null : `${lines.length > 1 ? `${l.label} ` : ''}${short(v)}`
      })
      return `${formatMonth(m)}: ${parts.filter(Boolean).join(', ')}`
    })
    .join('; ')

  const last = primary ? primary.values[primary.values.length - 1] : undefined
  const first = primary ? primary.values[0] : undefined

  return (
    <figure
      role="img"
      aria-label={`${label}. ${described}`}
      className="relative w-full select-none"
      style={{ height }}
      onPointerLeave={() => setActive(null)}
    >
      {/* The month axis only. There is no y axis and no gridline: a gridline under a line that
          is not read from zero would invite reading the gaps between them as amounts. */}
      <span
        aria-hidden
        className="absolute h-px bg-chart-baseline"
        style={{ left: SIDE, right: SIDE, top: TOP + plot }}
      />

      <svg
        aria-hidden
        viewBox={`0 0 100 ${plot}`}
        preserveAspectRatio="none"
        className="absolute overflow-visible"
        style={{ left: SIDE, top: TOP, width: `calc(100% - ${SIDE * 2}px)`, height: plot }}
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
        <Dot left={left(primary.values.length - 1)} top={TOP + y(last)} tone="primary" />
      ) : null}

      {endLabels && primary && first !== undefined && last !== undefined && n > 1 ? (
        <>
          <EndLabel
            value={first}
            side={endLabelSide(primary.values, 'first')}
            top={TOP + y(first)}
            align="start"
          />
          <EndLabel
            value={last}
            side={endLabelSide(primary.values, 'last')}
            top={TOP + y(last)}
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
                top={TOP + y(v)}
                tone={line.role ?? 'primary'}
                ring
              />
            )
          })
        : null}

      <HoverStrips months={months} top={TOP} height={plot} onActive={setActive} />
      <MonthTicks months={months} />

      {active !== null && months[active] !== undefined ? (
        <FloatingTip index={active} n={n} top={TOP}>
          <ChartTooltipCard
            title={`${monthEnd ? 'End of ' : ''}${formatMonth(months[active] ?? '')}`}
            rows={lines.flatMap((line) => {
              const v = line.values[active]
              return v === undefined
                ? []
                : [
                    {
                      label: line.label,
                      value: formatInr(v),
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

function short(v: number): string {
  return formatInr(v, { short: true })
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
        tone === 'primary' ? 'bg-chart-1' : 'bg-chart-neutral-400',
        ring && 'size-2.5',
      )}
      style={{ left, top }}
    />
  )
}

/** A value printed at one end of the line, on the side the line leaves clear. */
function EndLabel({
  value,
  side,
  top,
  align,
}: {
  value: number
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
      {short(value)}
    </span>
  )
}

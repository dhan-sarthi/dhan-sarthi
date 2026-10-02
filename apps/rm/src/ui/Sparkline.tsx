import { useId } from 'react'
import { cn } from '../lib/cn.ts'

export interface SparklineProps {
  values: readonly number[]
  /** The drawing's width in px. Ignored when `fluid`. */
  width?: number
  height?: number
  /** Stretch to the container's width: a table cell, a tile. The end dot stays round. */
  fluid?: boolean
  /** `brand` for the figure that matters, `neutral` for context, `danger` for a fall worth seeing. */
  tone?: 'brand' | 'neutral' | 'danger'
  /** A soft fill under the line. Off in dense table cells, where the line alone reads faster. */
  area?: boolean
  /** A dot on the latest value, where the eye should land. */
  endDot?: boolean
  /**
   * The last `window` points are the ones the figure beside it measures (a three-month change,
   * say): drawn in the tone over a faint band, with the months before them in the context grey,
   * so a mover whose year fell but whose quarter rose does not read as a faller.
   */
  window?: number
  /** What the line shows, for a screen reader: "Balances over 12 months, up 4%". */
  label?: string
  className?: string
}

const STROKE = {
  brand: 'text-chart-1',
  neutral: 'text-chart-comparison',
  danger: 'text-danger',
} as const

/**
 * A tiny inline line, drawn as plain SVG rather than through the chart library: a table of fifty
 * rows draws fifty of these, and each must cost nothing. No axis, no tooltip; the figure beside
 * it is the number, the line is only its shape.
 */
export function Sparkline({
  values,
  width = 88,
  height = 24,
  fluid = false,
  tone = 'brand',
  area = false,
  endDot = true,
  window,
  label,
  className,
}: SparklineProps) {
  const gradientId = useId()
  const pad = fluid ? 3 : 2
  // A fluid line is drawn in a 0–100 box and stretched; its stroke does not scale with it.
  const w = fluid ? 100 : width
  const xPad = fluid ? 0 : pad
  if (values.length < 2) {
    return (
      <svg
        width={fluid ? '100%' : width}
        height={height}
        className={cn('block text-hairline', className)}
        aria-hidden
      >
        <line
          x1={fluid ? '0' : pad}
          x2={fluid ? '100%' : width - pad}
          y1={height / 2}
          y2={height / 2}
          stroke="currentColor"
          strokeDasharray="2 3"
        />
      </svg>
    )
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat series draws a flat line in the middle, not a line pinned to the floor.
  const span = max - min || 1
  const step = (w - xPad * 2) / (values.length - 1)
  const points = values.map((v, i) => {
    const x = xPad + i * step
    const y = max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2)
    return [x, y] as const
  })
  const path = (from: number, to: number): string =>
    points
      .slice(from, to)
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
      .join('')
  const windowStart =
    window !== undefined && window < values.length ? Math.max(0, values.length - window) : 0
  const windowX = points[windowStart]?.[0] ?? 0
  const last = points[points.length - 1]
  const line = path(windowStart, points.length)
  const context = windowStart > 0 ? path(0, windowStart + 1) : null
  const fill = `${path(0, points.length)}L${(w - xPad).toFixed(1)},${height}L${xPad},${height}Z`

  const svg = (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio={fluid ? 'none' : undefined}
      className={cn(
        'shrink-0 overflow-visible',
        fluid ? 'absolute inset-0 block h-full w-full' : STROKE[tone],
        !fluid && className,
      )}
      {...(label && !fluid ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {window !== undefined && windowStart > 0 ? (
        <rect
          x={windowX}
          y={0}
          width={w - xPad - windowX}
          height={height}
          className={STROKE[tone]}
          fill="currentColor"
          fillOpacity={0.07}
        />
      ) : null}
      {area ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={fill} fill={`url(#${gradientId})`} className={STROKE[tone]} />
        </>
      ) : null}
      {context ? (
        <path
          d={context}
          fill="none"
          className="text-chart-comparison"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <path
        d={line}
        fill="none"
        className={STROKE[tone]}
        stroke="currentColor"
        strokeWidth={window !== undefined ? 2 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {endDot && last && !fluid ? (
        <circle
          cx={last[0]}
          cy={last[1]}
          r={2.25}
          className={STROKE[tone]}
          fill="currentColor"
          stroke="var(--color-surface)"
          strokeWidth={1.5}
        />
      ) : null}
    </svg>
  )

  if (!fluid) return svg
  return (
    <span
      className={cn('relative block w-full', className)}
      style={{ height }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {svg}
      {endDot && last ? (
        // HTML, so the dot stays round however wide the line is stretched.
        <span
          aria-hidden
          className={cn(
            'absolute size-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-surface',
            STROKE[tone],
          )}
          style={{ right: 0, top: `${(last[1] / height) * 100}%` }}
        />
      ) : null}
    </span>
  )
}

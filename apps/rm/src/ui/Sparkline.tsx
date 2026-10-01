import { useId } from 'react'
import { cn } from '../lib/cn.ts'

export interface SparklineProps {
  values: readonly number[]
  width?: number
  height?: number
  /** `brand` for the figure that matters, `neutral` for context, `danger` for a fall worth seeing. */
  tone?: 'brand' | 'neutral' | 'danger'
  /** A soft fill under the line. Off in dense table cells, where the line alone reads faster. */
  area?: boolean
  /** A dot on the latest value, where the eye should land. */
  endDot?: boolean
  /** What the line shows, for a screen reader: "Balances over 12 months, up 4%". */
  label?: string
  className?: string
}

const STROKE = {
  brand: 'text-chart-1',
  neutral: 'text-chart-neutral-500',
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
  tone = 'brand',
  area = false,
  endDot = true,
  label,
  className,
}: SparklineProps) {
  const gradientId = useId()
  const pad = 2
  if (values.length < 2) {
    return (
      <svg width={width} height={height} className={cn('text-hairline', className)} aria-hidden>
        <line
          x1={pad}
          x2={width - pad}
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
  const step = (width - pad * 2) / (values.length - 1)
  const points = values.map((v, i) => {
    const x = pad + i * step
    const y = max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2)
    return [x, y] as const
  })
  const line = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join('')
  const last = points[points.length - 1]
  const fill = `${line}L${(width - pad).toFixed(1)},${height}L${pad},${height}Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('shrink-0 overflow-visible', STROKE[tone], className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {area ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={fill} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {endDot && last ? (
        <circle
          cx={last[0]}
          cy={last[1]}
          r={2.25}
          fill="currentColor"
          stroke="var(--color-surface)"
          strokeWidth={1.5}
        />
      ) : null}
    </svg>
  )
}

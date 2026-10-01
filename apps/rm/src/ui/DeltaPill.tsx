import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '../lib/cn.ts'
import { formatCount, formatInr, formatPct } from '../lib/format.ts'

export type DeltaUnit = 'pct' | 'inr' | 'count' | 'pp'

export interface DeltaPillProps {
  value: number
  unit?: DeltaUnit
  /** For figures where down is good (refusals pending, days waiting): flips the colour only. */
  invert?: boolean
  /** Show the colour of good or bad news. Off draws every delta in neutral ink. */
  tone?: 'auto' | 'neutral'
  className?: string
}

function text(value: number, unit: DeltaUnit): string {
  switch (unit) {
    case 'inr':
      return formatInr(Math.abs(value), { short: true })
    case 'count':
      return formatCount(Math.abs(value))
    case 'pp':
      return `${formatPct(Math.abs(value)).replace('%', '')} pts`
    default:
      return formatPct(Math.abs(value))
  }
}

/**
 * A small rounded chip with an arrow: "↗ 2.4%". The arrow and the sign carry the direction, so
 * the colour can be read as a bonus rather than the message.
 */
export function DeltaPill({
  value,
  unit = 'pct',
  invert = false,
  tone = 'auto',
  className,
}: DeltaPillProps) {
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  const good = direction === 'flat' ? null : (direction === 'up') !== invert
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus
  const sign = direction === 'up' ? '+' : direction === 'down' ? '−' : ''
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-0.5 rounded-sm px-1.5 text-caption tabular whitespace-nowrap [&_svg]:size-3',
        tone === 'neutral' || good === null
          ? 'bg-ground-deep text-ink-soft'
          : good
            ? 'bg-brand-soft text-brand-deep'
            : 'bg-danger-soft text-danger',
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={2.25} />
      <span>
        {sign}
        {text(value, unit)}
      </span>
    </span>
  )
}

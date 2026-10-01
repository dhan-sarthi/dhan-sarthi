import { cn } from '../lib/cn.ts'
import { formatInr, splitInr } from '../lib/format.ts'

export interface MoneyProps {
  value: number
  /** ₹4.8L. The exact figure is kept as the hover title, so nothing is lost by shortening. */
  short?: boolean
  /** Superscript paise (₹6⁴¹). Off by default: the console counts whole rupees. */
  paise?: boolean
  /** A leading + on positive values. */
  signed?: boolean
  /** Colour by sign: positive in brand green, negative in danger. Off by default. */
  toned?: boolean
  className?: string
}

/**
 * A rupee figure: Indian grouping, tabular numerals so columns line up, never wrapped across
 * lines. Every rupee on the console is drawn by this component.
 */
export function Money({
  value,
  short = false,
  paise = false,
  signed = false,
  toned = false,
  className,
}: MoneyProps) {
  const tone = toned
    ? value > 0
      ? 'text-brand'
      : value < 0
        ? 'text-danger'
        : undefined
    : undefined
  const full = formatInr(value, { paise, signed })

  if (short) {
    return (
      <span title={full} className={cn('tabular whitespace-nowrap', tone, className)}>
        {formatInr(value, { short: true, signed })}
      </span>
    )
  }
  if (paise) {
    const p = splitInr(value)
    const sign = p.sign || (signed && value > 0 ? '+' : '')
    return (
      <span aria-label={full} className={cn('tabular whitespace-nowrap', tone, className)}>
        <span aria-hidden>
          {sign}₹{p.rupees}
          <sup className="ml-px align-[0.42em] text-[0.58em] font-semibold">.{p.paise}</sup>
        </span>
      </span>
    )
  }
  return <span className={cn('tabular whitespace-nowrap', tone, className)}>{full}</span>
}

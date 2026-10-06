import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { formatCount, formatPct } from '../lib/format.ts'
import { DeltaPill, type DeltaUnit } from './DeltaPill.tsx'
import { Money } from './Money.tsx'
import { Sparkline } from './Sparkline.tsx'

export type StatUnit = 'inr' | 'count' | 'pct'

export interface StatProps {
  label: ReactNode
  value: number
  unit: StatUnit
  /**
   * A count that is part of a whole reads "9 of 38", never a percentage of it. Counts only; the
   * caption should then not say the denominator a second time.
   */
  outOf?: number | null
  /** In the stat's own unit (rupees, a count, points for `pct`) unless `deltaUnit` says otherwise. */
  delta?: number | null
  /** For a rupee figure whose change reads better as a percentage: "↗ 1.3%". */
  deltaUnit?: DeltaUnit
  /** What the delta is measured against: "vs 1 Aug, balances". Wraps rather than truncating. */
  deltaLabel?: ReactNode
  /** For a figure where falling is good. */
  invert?: boolean
  series?: readonly number[] | null
  /** What the sparkline draws, named under it as a legend: "12 month-ends, Sep 2025 to Aug 2026". */
  seriesLabel?: ReactNode
  /** The full rupee figure rather than ₹48.2L. */
  exact?: boolean
  /**
   * `lg` for the one headline on a page, `md` for a KPI strip, `sm` for a compact strip of
   * figures (the Book's band): label over value, the `deltaLabel` as a quiet note beside the
   * value, and the value itself allowed to shrink and truncate rather than overprint its
   * neighbour when the strip is narrow.
   */
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function deltaUnit(unit: StatUnit): DeltaUnit {
  return unit === 'pct' ? 'pp' : unit
}

/**
 * A KPI: a quiet label, a big tabular figure, and what it is measured against. The figure is
 * the hierarchy; everything else is smaller and greyer so the eye lands there first. Today's
 * KPI strip and the Book's band draw their figures with this.
 */
export function Stat({
  label,
  value,
  unit,
  outOf = null,
  delta = null,
  deltaUnit: deltaUnitOverride,
  deltaLabel,
  invert = false,
  series = null,
  seriesLabel,
  exact = false,
  size = 'md',
  className,
}: StatProps) {
  const figure =
    unit === 'inr' ? (
      <Money value={value} short={!exact} />
    ) : unit === 'pct' ? (
      <span className="tabular">{formatPct(value)}</span>
    ) : (
      <span className="tabular">
        {formatCount(value)}
        {outOf !== null ? (
          <span className="ml-1.5 text-title text-ink-faint">of {formatCount(outOf)}</span>
        ) : null}
      </span>
    )
  const line = series && series.length > 1 ? series : null

  if (size === 'sm') {
    return (
      <div className={cn('min-w-0', className)}>
        <div className="truncate text-caption text-ink-soft">{label}</div>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-heading text-ink">{figure}</span>
          {delta !== null ? (
            <DeltaPill
              value={delta}
              unit={deltaUnitOverride ?? deltaUnit(unit)}
              invert={invert}
              className="shrink-0"
            />
          ) : null}
          {deltaLabel ? (
            <span className="min-w-0 truncate text-caption-plain text-ink-faint">{deltaLabel}</span>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className="text-label text-ink-soft">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className={cn('text-ink', size === 'lg' ? 'text-figure' : 'text-display')}>
          {figure}
        </div>
        {line ? (
          <Sparkline
            values={line}
            width={size === 'lg' ? 120 : 96}
            height={size === 'lg' ? 36 : 28}
            area
            className="mb-1"
          />
        ) : null}
      </div>
      {delta !== null || deltaLabel ? (
        <div className="flex min-h-5 items-center gap-2 text-caption text-ink-faint">
          {delta !== null ? (
            <DeltaPill
              value={delta}
              unit={deltaUnitOverride ?? deltaUnit(unit)}
              invert={invert}
              className="shrink-0"
            />
          ) : null}
          {deltaLabel ? <span className="min-w-0">{deltaLabel}</span> : null}
        </div>
      ) : null}
      {line && seriesLabel ? (
        <p className="flex items-center gap-1.5 text-caption text-ink-faint">
          <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full bg-chart-1" />
          {seriesLabel}
        </p>
      ) : null}
    </div>
  )
}

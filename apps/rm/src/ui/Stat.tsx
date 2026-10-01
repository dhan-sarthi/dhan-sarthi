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
  /** In the stat's own unit (rupees, a count, points for `pct`) unless `deltaUnit` says otherwise. */
  delta?: number | null
  /** For a rupee figure whose change reads better as a percentage: "↗ 1.3%". */
  deltaUnit?: DeltaUnit
  /** What the delta is measured against: "vs 1 Aug, balances". */
  deltaLabel?: ReactNode
  /** For a figure where falling is good. */
  invert?: boolean
  series?: readonly number[] | null
  /** The full rupee figure rather than ₹48.2L. */
  exact?: boolean
  /** `lg` for the one headline on a page, `md` for a KPI strip. */
  size?: 'md' | 'lg'
  className?: string
}

function deltaUnit(unit: StatUnit): DeltaUnit {
  return unit === 'pct' ? 'pp' : unit
}

/**
 * A KPI: a quiet label, a big tabular figure, and what it is measured against. The figure is
 * the hierarchy; everything else is smaller and greyer so the eye lands there first.
 */
export function Stat({
  label,
  value,
  unit,
  delta = null,
  deltaUnit: deltaUnitOverride,
  deltaLabel,
  invert = false,
  series = null,
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
      <span className="tabular">{formatCount(value)}</span>
    )

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="text-label text-ink-soft">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className={cn('text-ink', size === 'lg' ? 'text-figure' : 'text-display')}>
          {figure}
        </div>
        {series && series.length > 1 ? (
          <Sparkline
            values={series}
            width={size === 'lg' ? 120 : 84}
            height={size === 'lg' ? 36 : 28}
            area
            className="mb-1.5"
          />
        ) : null}
      </div>
      {delta !== null || deltaLabel ? (
        <div className="flex min-h-5 items-center gap-2 text-caption text-ink-faint">
          {delta !== null ? (
            <DeltaPill value={delta} unit={deltaUnitOverride ?? deltaUnit(unit)} invert={invert} />
          ) : null}
          {deltaLabel ? <span className="truncate">{deltaLabel}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Axis ticks the console can label without repeating itself.
 *
 * Recharts picks its own ticks and the formatter shortens each one alone, so two ticks a few
 * thousand rupees apart near a unit boundary both printed "₹1Cr". Here the ticks are chosen first
 * (round steps of 1, 2, 2.5 or 5 times a power of ten) and each label is written with exactly as
 * many decimals as the tick needs, so two different ticks can never read the same.
 *
 * Pure, no React, no DOM: `scale.test.ts` runs it under `node --test`.
 */
import { formatCount, formatPct } from './format.ts'

const MINUS = '−'

export interface NiceScale {
  /** Ascending, evenly spaced, first and last bracketing the data. */
  ticks: number[]
  step: number
}

export interface NiceScaleOptions {
  /** Roughly how many intervals to cut the range into. The result has this many, give or take one. */
  count?: number
  /** Stretch the range to include zero (bars, counts, anything read against a baseline). */
  zero?: boolean
  /** Whole-number steps only, for counts. */
  integer?: boolean
}

/** Floating-point noise off a computed tick: 0.30000000000000004 → 0.3. */
function clean(n: number): number {
  return Number(n.toPrecision(12))
}

/** A round step that cuts `span` into about `count` intervals. */
export function niceStep(span: number, count: number, integer = false): number {
  const raw = span / Math.max(1, count)
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / magnitude
  // 2.5 only where it lands on a whole number when whole numbers are required.
  const multipliers = integer && magnitude < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10]
  const multiplier = multipliers.find((m) => norm <= m + 1e-9) ?? 10
  const step = clean(multiplier * magnitude)
  return integer ? Math.max(1, Math.round(step)) : step
}

/**
 * Ticks for the values on a chart. Null when there is nothing finite to scale, so the caller can
 * leave the axis to the chart library.
 *
 * A flat series (every value the same) gets a band of ±2% around it rather than a step of
 * nothing, so the line sits in the middle of the plot with sensible labels either side.
 */
export function niceScale(
  values: readonly number[],
  options: NiceScaleOptions = {},
): NiceScale | null {
  const { count = 4, zero = false, integer = false } = options
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return null

  let min = Math.min(...finite)
  let max = Math.max(...finite)
  if (zero) {
    min = Math.min(0, min)
    max = Math.max(0, max)
  }
  if (max - min < Math.abs(max) * 1e-6 || max === min) {
    const pad = max === 0 ? 1 : Math.abs(max) * 0.02
    min = zero && min >= 0 ? 0 : min - pad
    max = max + pad
  }

  const step = niceStep(max - min, count, integer)
  const first = Math.floor(clean(min / step)) * step
  const last = Math.ceil(clean(max / step)) * step
  const ticks: number[] = []
  for (let i = 0; first + i * step <= last + step * 1e-9 && i < 50; i += 1) {
    ticks.push(clean(first + i * step))
  }
  return { ticks, step }
}

/** How many decimals `n` needs to be written exactly (0.25 → 2, 2.5 → 1, 40 → 0), up to 6. */
export function decimalsOf(n: number): number {
  const abs = Math.abs(n)
  for (let d = 0; d < 6; d += 1) {
    const scaled = abs * 10 ** d
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6 * Math.max(1, scaled)) return d
  }
  return 6
}

/** "1.50" → "1.5", "2.00" → "2". */
function trim(fixed: string): string {
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

const UNITS: readonly (readonly [number, string])[] = [
  [1e7, 'Cr'],
  [1e5, 'L'],
  [1e3, 'k'],
]

/**
 * A rupee tick: the unit the figure itself reaches (₹96L, ₹1Cr, ₹48k) and as many decimals as the
 * figure needs in that unit (₹1.02Cr, ₹1Cr), up to three. Ticks are multiples of a round step,
 * so in practice every label is exact, and two ticks on one axis cannot print the same text.
 */
export function formatInrTick(value: number): string {
  if (value === 0) return '₹0'
  const sign = value < 0 ? MINUS : ''
  const abs = Math.abs(value)
  for (const [size, suffix] of UNITS) {
    if (abs >= size - 1e-6) {
      const scaled = abs / size
      return `${sign}₹${trim(scaled.toFixed(Math.min(decimalsOf(scaled), 3)))}${suffix}`
    }
  }
  return `${sign}₹${formatCount(Math.round(abs))}`
}

/** A percentage tick with the decimals it needs: 62%, 62.5%. */
export function formatPctTick(value: number): string {
  return formatPct(value, { digits: Math.min(decimalsOf(value), 2) })
}

/**
 * Labels for a set of ticks, guaranteed distinct: if a format ever rounds two ticks to the same
 * text, the later one is written as the plain figure at whatever precision tells it apart. The
 * formats above are exact for round ticks, so this is a guard, not a path.
 */
export function distinctLabels(ticks: readonly number[], label: (v: number) => string): string[] {
  const seen = new Set<string>()
  return ticks.map((t) => {
    let text = label(t)
    for (let precision = 3; seen.has(text) && precision <= 15; precision += 1) {
      text = String(Number(t.toPrecision(precision)))
    }
    seen.add(text)
    return text
  })
}

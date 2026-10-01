/**
 * Every figure the console prints goes through here, so ₹4,82,448 reads the same on every page.
 *
 * Indian grouping (lakh, crore), whole rupees by default, a true minus sign, and a short form for
 * dense places (₹4.8L, ₹1.2Cr). Dates are the simulation's calendar dates (`YYYY-MM-DD`), parsed
 * as UTC so a browser west of Greenwich never shows the day before.
 *
 * Pure, no React, no DOM: `format.test.ts` runs it under `node --test`.
 */

const MINUS = '−'

const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const paiseFmt = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "1.0" → "1", "4.80" → "4.8": a short figure never carries a trailing zero. */
function trim(n: number, digits: number): string {
  const fixed = n.toFixed(digits)
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

export interface InrOptions {
  /** ₹4.8L / ₹1.2Cr / ₹48k instead of the full figure. */
  short?: boolean
  /** Two decimals (₹4,82,448.41). Ignored in short mode. */
  paise?: boolean
  /** A leading + on positive values, for deltas. */
  signed?: boolean
}

/** ₹4,82,448 · ₹4.8L · −₹1,200 · +₹3.1L */
export function formatInr(value: number, options: InrOptions = {}): string {
  const sign = value < 0 ? MINUS : options.signed && value > 0 ? '+' : ''
  const abs = Math.abs(value)
  if (options.short) return `${sign}₹${shortNumber(abs)}`
  const body = options.paise ? paiseFmt.format(abs) : whole.format(Math.round(abs))
  return `${sign}₹${body}`
}

/**
 * The magnitude part of a short figure: 4.8L, 48.2L, 1.2Cr, 48k, 950. Units are tried largest
 * first and kept once the figure *rounds* to at least one of them, so ₹99,96,000 reads "1Cr",
 * never "100L".
 */
export function shortNumber(abs: number): string {
  // [size, suffix, decimals once the figure reaches 10 of the unit]: ₹48.2L keeps its
  // decimal because a lakh is a lot of money; ₹48k does not need one.
  const units: readonly (readonly [number, string, number])[] = [
    [1e7, 'Cr', 1],
    [1e5, 'L', 1],
    [1e3, 'k', 0],
  ]
  for (const [size, suffix, atTen] of units) {
    const scaled = abs / size
    const digits = scaled >= 100 ? 0 : scaled >= 10 ? atTen : 1
    if (Number(scaled.toFixed(digits)) >= 1) return `${trim(scaled, digits)}${suffix}`
  }
  return whole.format(Math.round(abs))
}

/**
 * The parts a `<Money>` draws: sign, the rupee figure, and paise for the superscript.
 * Paise are always two digits ("05"), never rounded into the rupees.
 */
export function splitInr(value: number): {
  sign: '' | typeof MINUS
  rupees: string
  paise: string
} {
  const abs = Math.abs(value)
  const totalPaise = Math.round(abs * 100)
  const rupees = Math.floor(totalPaise / 100)
  const paise = totalPaise % 100
  return {
    sign: value < 0 ? MINUS : '',
    rupees: whole.format(rupees),
    paise: String(paise).padStart(2, '0'),
  }
}

/** 62% · 34.8% · −4.2% · +1.5% (signed) */
export function formatPct(
  value: number,
  options: { digits?: number; signed?: boolean } = {},
): string {
  const digits = options.digits ?? (Number.isInteger(value) ? 0 : 1)
  const sign = value < 0 ? MINUS : options.signed && value > 0 ? '+' : ''
  return `${sign}${trim(Math.abs(value), digits)}%`
}

/** 1,284 */
export function formatCount(value: number): string {
  return whole.format(value)
}

/* ---------------------------------------------------------------- Dates */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `YYYY-MM-DD` or a full ISO timestamp, read as a calendar date in UTC. */
function parts(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso)
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3] ?? '1') }
}

/** "1 Sep 2026"; `{ year: false }` gives "1 Sep". */
export function formatDate(iso: string, options: { year?: boolean } = {}): string {
  const p = parts(iso)
  if (!p) return iso
  const month = MONTHS[p.m - 1] ?? ''
  return options.year === false ? `${p.d} ${month}` : `${p.d} ${month} ${p.y}`
}

/** `YYYY-MM` → "Sep 2026"; `{ year: false }` gives "Sep". */
export function formatMonth(month: string, options: { year?: boolean } = {}): string {
  const p = parts(month)
  if (!p) return month
  const name = MONTHS[p.m - 1] ?? ''
  return options.year === false ? name : `${name} ${p.y}`
}

/** Whole days from `from` to `to`, both calendar dates. Positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  const a = parts(from)
  const b = parts(to)
  if (!a || !b) return 0
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)
  return Math.round(ms / 86_400_000)
}

/**
 * "Today", "Yesterday", "6 days ago", "3 weeks ago", "4 months ago", relative to the RM's
 * as-of date, never the wall clock: the book lives on the simulation's calendar.
 */
export function formatAgo(iso: string, asOf: string): string {
  const days = daysBetween(iso, asOf)
  if (days <= 0) return days === 0 ? 'Today' : `In ${formatDuration(-days)}`
  if (days === 1) return 'Yesterday'
  return `${formatDuration(days)} ago`
}

/** "in 12 days", used for maturities and deadlines. */
export function formatIn(iso: string, asOf: string): string {
  const days = daysBetween(asOf, iso)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 0) return `${formatDuration(-days)} ago`
  return `In ${formatDuration(days)}`
}

/** 1 day · 6 days · 3 weeks · 4 months · 2 years */
export function formatDuration(days: number): string {
  const n = Math.abs(days)
  const unit = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`
  if (n < 14) return unit(n, 'day')
  if (n < 60) return unit(Math.round(n / 7), 'week')
  if (n < 730) return unit(Math.round(n / 30.44), 'month')
  return unit(Math.round(n / 365.25), 'year')
}

/* ---------------------------------------------------------------- Names */

/** "Karan Mehta" → "KM". Used only when the API has not sent initials. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

/**
 * A stable small integer for a string, so the same customer always gets the same avatar tint
 * on every page and every visit. FNV-1a: tiny, and spreads short names well.
 */
export function stableIndex(key: string, buckets: number): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % Math.max(1, buckets)
}

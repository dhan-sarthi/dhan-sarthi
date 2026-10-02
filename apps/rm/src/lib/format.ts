/**
 * Every figure the console prints goes through here, so ₹4,82,448 reads the same on every page.
 *
 * Indian grouping (lakh, crore), whole rupees by default, a true minus sign, and a short form for
 * dense places (₹4.82L, ₹1.2Cr). Dates are the simulation's calendar dates (`YYYY-MM-DD`), parsed
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
  /** ₹4.82L / ₹1.2Cr / ₹48k instead of the full figure. */
  short?: boolean
  /** Two decimals (₹4,82,448.41). Ignored in short mode. */
  paise?: boolean
  /** A leading + on positive values, for deltas. */
  signed?: boolean
}

/** ₹4,82,448 · ₹4.82L · −₹1,200 · +₹3.1L */
export function formatInr(value: number, options: InrOptions = {}): string {
  const sign = value < 0 ? MINUS : options.signed && value > 0 ? '+' : ''
  const abs = Math.abs(value)
  if (options.short) return `${sign}₹${shortNumber(abs)}`
  const body = options.paise ? paiseFmt.format(abs) : whole.format(Math.round(abs))
  return `${sign}₹${body}`
}

/**
 * Where a sentence switches from the full figure to the short one: one lakh. Below it the full
 * figure reads easily (₹22,501); above it the digits stop being read (₹2,27,70,000 is ₹2.28Cr).
 */
export const SHORT_FROM_INR = 100_000

/** True when a figure is big enough that prose should say it short. */
export function prefersShort(value: number): boolean {
  return Math.abs(value) >= SHORT_FROM_INR
}

/**
 * A rupee figure for a sentence: in full under ₹1 lakh, short from there up. "₹22,501 a month
 * left after spending", "₹2.28Cr short on life cover". `<Money short="auto">` draws the same.
 */
export function formatInrProse(value: number, options: { signed?: boolean } = {}): string {
  return formatInr(value, { short: prefersShort(value), ...options })
}

/**
 * The magnitude part of a short figure: 4.82L, 48.2L, 1.2Cr, 48k, 950. Units are tried largest
 * first and kept once the figure *rounds* to at least one of them, so ₹99,96,000 reads "1Cr",
 * never "100L", and ₹99,960 reads "1L", never "100k". Three significant figures at most, so
 * ₹1,23,45,67,890 is "123Cr".
 *
 * This is the console's one short rupee formatter: `<Money short>`, `formatInr(…, { short })`
 * and `formatInrProse` all come through it, and so must any figure a page prints in a sentence
 * (rather than `@dhan/core`'s `rupeesShort`, which picks the unit before rounding and prints a
 * hyphen for a minus). `format.cases.ts` is the table every short figure on the console must
 * match. Lakhs and crores keep two decimals under ten of the unit, so a figure drawn beside one
 * of the API's sentences ("card at 34.8% — ₹1.86L outstanding") never reads ₹1.9L.
 */
export function shortNumber(abs: number): string {
  // [size, suffix, decimals under 10 of the unit, decimals from 10]: ₹48.2L keeps its decimal
  // because a lakh is a lot of money; ₹48k does not need one.
  const units: readonly (readonly [number, string, number, number])[] = [
    [1e7, 'Cr', 2, 1],
    [1e5, 'L', 2, 1],
    [1e3, 'k', 1, 0],
  ]
  for (const [size, suffix, underTen, atTen] of units) {
    const scaled = abs / size
    // The unit is chosen at one decimal, so ₹99,500 is "1L" and not "100k"; the figure is then
    // printed at the unit's own precision, and never below the one it was chosen for.
    if (Number(scaled.toFixed(1)) < 1) continue
    const digits = scaled >= 100 ? 0 : scaled >= 10 ? atTen : underTen
    const text = trim(scaled, digits)
    return `${Number(text) < 1 ? '1' : text}${suffix}`
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
 * When a customer was last active: "Today", "Yesterday", "31 days ago". The one formatter for that
 * fact, on every page, so the Book row, the preview, the customer's highlight and the strength
 * reason beside it all read the same words.
 *
 * Whole days, never weeks or months, for two reasons. The strength reason the API writes
 * (`relationshipStrength` in `@dhan/core`: "Active 31 days ago · 4 IDBI products · …") counts in
 * days, and this has to agree with it word for word. And the thresholds behind that reason are
 * in days (fully active within 30, lapsing within 90, the attrition watch past 60), so "31 days
 * ago" tells the RM why a customer just dropped to Medium where "4 weeks ago" hides it.
 *
 * Measured to the RM's as-of date, never the wall clock: the book lives on the simulation's
 * calendar. A date after the as-of date (a reviewer who moved their own clock on) reads "Today",
 * as the API's reason does.
 */
export function formatLastActive(iso: string, asOf: string): string {
  const days = Math.max(0, daysBetween(iso, asOf))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  // No digit grouping: the API's reason prints `${days}`, and the two must match exactly.
  return `${days} days ago`
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

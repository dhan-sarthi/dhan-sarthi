/**
 * Rupee formatting.
 *
 * Indian digit grouping is not the western one — ₹1,22,841, not ₹122,841 — and getting it wrong
 * is the sort of detail a banker notices in the first two seconds. `Intl` with `en-IN` handles
 * it, so nothing here reimplements the grouping.
 */

const GROUP = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export const inr = (n: number): string => `₹${GROUP.format(Math.round(n))}`

/** Split for the display treatment: currency small, integer large, paise small and raised. */
export function parts(n: number): { cur: string; int: string; frac: string | null } {
  const rounded = Math.round(Math.abs(n) * 100) / 100
  const int = Math.floor(rounded)
  const paise = Math.round((rounded - int) * 100)
  return {
    cur: n < 0 ? '−₹' : '₹',
    int: GROUP.format(int),
    frac: paise > 0 ? `.${String(paise).padStart(2, '0')}` : null,
  }
}

/**
 * Rounded to lakh or crore where that is how someone would actually say it.
 *
 * "₹2.4 crore" is a number a customer can hold in their head; "₹2,40,00,000" is a number they
 * have to count the digits of. Used for projections and targets, never for a balance — a balance
 * has to be exact or it looks like an estimate.
 */
export function approx(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(abs >= 10_00_00_000 ? 0 : 2)} crore`
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(abs >= 10_00_000 ? 1 : 2)} lakh`
  return inr(n)
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export const monthName = (iso: string): string => MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''

/** "18 September" — how a date is spoken, not ISO. */
export const dayMonth = (iso: string): string =>
  `${Number(iso.slice(8, 10))} ${monthName(iso)}`

export const monthYear = (iso: string): string =>
  `${monthName(iso)} ${iso.slice(0, 4)}`

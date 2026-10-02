/**
 * Rupees and dates the way the relationship manager's console prints them.
 *
 * `rupees` and `rupeesShort` are ported from the mobile app's `src/lib/money.ts`, which is
 * app-local. They live here so the console, the API's deterministic sentences and the signals
 * below print one figure one way: an RM who reads ₹1.86L on the queue and ₹1,86,240 on the
 * customer page is reading the same rounding, not two formatters that happen to agree.
 *
 * Dates are formatted by hand rather than through `toLocaleDateString`, because core has no
 * clock and no locale: the same input has to print the same string on a laptop in Pune and on
 * a Fargate task in UTC.
 */

// Intl's en-IN locale already groups 2,2,3 rather than 3,3,3, so ₹1,02,00,000 comes out right
// without hand-rolling the grouping. What it will not do is the lakh/crore short form.
const FULL = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** ₹4,82,448 — for anything the RM might check against a statement. */
export function rupees(n: number): string {
  // `|| 0` folds negative zero: Math.round(-0.4) is -0, and Intl prints that as "-₹0".
  return FULL.format(Math.round(n) || 0)
}

/**
 * ₹4.82L, ₹1.02Cr, ₹12k — for headline figures, where the magnitude matters and the paise do not.
 *
 * The unit is chosen from the figure rounded to the rupee, not from the raw one. ₹999.50 is
 * printed as a thousand, so it has to be *called* a thousand: choosing the unit first and
 * rounding after gave "₹1000", and ₹99,999.60 came out as "₹100k" beside a card that says "₹1L".
 */
export function rupeesShort(n: number): string {
  const abs = Math.round(Math.abs(n))
  const sign = n < 0 && abs > 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}k`
  return `${sign}₹${abs}`
}

function trim(n: number): string {
  const s = n.toFixed(n < 10 ? 2 : 1)
  return s.replace(/\.?0+$/, '')
}

/**
 * The figure a title leads with: short from a lakh up, exact below it.
 *
 * "₹1.86L outstanding" reads at a glance; "₹1.8k a year" does not, and at that size the exact
 * figure is no longer to count than the short one.
 */
export function rupeesTitle(n: number): string {
  return Math.abs(n) >= 1e5 ? rupeesShort(n) : rupees(n)
}

/** "KM" for Karan Mehta: first and last word. One word gives one letter. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.charAt(0) ?? ''
  const last = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

/** The name an RM opens a call with. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "11 Sep", or "11 Sep 2027" when `asOf` is given and the year differs from it. */
export function shortDate(iso: string, asOf?: string): string {
  const day = Number(iso.slice(8, 10))
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7)
  const year = iso.slice(0, 4)
  return asOf !== undefined && asOf.slice(0, 4) !== year
    ? `${day} ${month} ${year}`
    : `${day} ${month}`
}

/** "Sep 2026" for a 'YYYY-MM' key or a full date. */
export function monthLabel(isoOrMonth: string): string {
  const month = MONTHS[Number(isoOrMonth.slice(5, 7)) - 1] ?? isoOrMonth.slice(5, 7)
  return `${month} ${isoOrMonth.slice(0, 4)}`
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "August" for a 'YYYY-MM' key or a full date. */
export function monthName(isoOrMonth: string): string {
  return MONTH_NAMES[Number(isoOrMonth.slice(5, 7)) - 1] ?? isoOrMonth.slice(5, 7)
}

/** "1 month", "3 months". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`
}

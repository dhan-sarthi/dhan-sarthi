// Rupees, written the way India writes them.
//
// Intl's en-IN locale already groups 2,2,3 rather than 3,3,3, so ₹1,02,00,000 comes out
// right without hand-rolling the grouping. What it will not do is the lakh/crore short
// form, which is what a balance card needs — ₹4.82L reads instantly where ₹4,82,447.85
// has to be counted.
const FULL = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** ₹4,82,448 — for anything the customer might check against a statement. */
export function rupees(n: number): string {
  return FULL.format(Math.round(n))
}

/**
 * ₹4.82L, ₹1.02Cr — for headline figures, where the magnitude matters and the paise do not.
 *
 * The unit is chosen from the figure rounded to the rupee, not from the raw one. ₹999.50 is
 * printed as a thousand, so it has to be *called* a thousand: choosing the unit first and rounding
 * after gave "₹1000", and ₹99,999.60 came out as "₹100k" beside a card that says "₹1L".
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
 * Splits for a big balance: "₹2,82,447" and ".85", so the paise can sit smaller.
 *
 * The rounding carries. Taking the whole rupees off the unrounded figure and rounding the
 * remainder on its own let the two halves disagree: ₹99.999 came out as "₹99" and ".100",
 * a hundredth that is not a hundredth beside a rupee figure a rupee short.
 *
 * The sign rides on the rupees. An overdrawn balance split from its absolute value printed as
 * money the customer has, which is the one error a balance card cannot make. A figure that
 * rounds to nothing carries no sign: "-₹0" is not an amount.
 */
export function splitAmount(n: number): { whole: string; paise: string } {
  const hundredths = Math.round(Math.abs(n) * 100)
  const paise = hundredths % 100
  const sign = n < 0 && hundredths > 0 ? '-' : ''
  return {
    whole: `${sign}${FULL.format(Math.floor(hundredths / 100))}`,
    paise: paise ? `.${String(paise).padStart(2, '0')}` : '',
  }
}

/**
 * A wire date as the day it names, wherever the phone is.
 *
 * `new Date('2026-09-11')` is midnight *UTC*, which is 11 Sep in Mumbai and 10 Sep in Los
 * Angeles, so a date-only string printed a day early for anyone west of Greenwich. Read as local
 * midnight instead, it is the same calendar day everywhere. A full timestamp already names its
 * own zone and is parsed as it stands.
 */
export function parseDay(iso: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso)
}

/** "11 Sep 2029" — for dates whose year carries meaning, like a consent expiry. */
export function fullDate(iso: string): string {
  return parseDay(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "11 Sep" / "11 Sep 2027" when the year is not this one. */
export function shortDate(iso: string, asOf?: string): string {
  const d = parseDay(iso)
  const sameYear = asOf ? parseDay(asOf).getFullYear() === d.getFullYear() : true
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "Aug 2027" — the month a plan lands in, where naming the day would be false precision. */
export function monthYear(iso: string): string {
  return parseDay(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

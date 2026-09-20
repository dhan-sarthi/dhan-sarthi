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

/** ₹4.82L, ₹1.02Cr — for headline figures, where the magnitude matters and the paise do not. */
export function rupeesShort(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}k`
  return `${sign}₹${Math.round(abs)}`
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
 */
export function splitAmount(n: number): { whole: string; paise: string } {
  const abs = Math.abs(n)
  const hundredths = Math.round(abs * 100)
  const paise = hundredths % 100
  return {
    whole: FULL.format(Math.floor(hundredths / 100)),
    paise: paise ? `.${String(paise).padStart(2, '0')}` : '',
  }
}

/** "11 Sep 2029" — for dates whose year carries meaning, like a consent expiry. */
export function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "11 Sep" / "11 Sep 2027" when the year is not this one. */
export function shortDate(iso: string, asOf?: string): string {
  const d = new Date(iso)
  const sameYear = asOf ? new Date(asOf).getFullYear() === d.getFullYear() : true
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

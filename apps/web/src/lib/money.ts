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

/* ---------------------------------------------------------------- Words */

/*
 * The amount, spelled out. Indian system, not the western one.
 *
 * Every money field in SmartWealth carries `Rupees Two Thousand Four Hundred Sixteen Only` under
 * the figure, and it is not decoration: it is the cheque convention, and it is the one control a
 * customer has against a mistyped digit — ₹50,000 and ₹5,00,000 look alike at a glance and read
 * nothing alike aloud.
 *
 * The grouping is the whole difference. Western words break every three digits (thousand,
 * million, billion); Indian words break at two after the first three (thousand, lakh, crore). So
 * 1,22,841 is "One Lakh Twenty Two Thousand Eight Hundred Forty One" and never "One Hundred
 * Twenty Two Thousand …". `Intl` groups the *digits* for us and has nothing to say about the
 * words, so this is written out.
 *
 * Past ninety-nine crore the ladder officially continues into arab and kharab, which nobody
 * says. Modern usage keeps counting crores — "One Thousand Crore" — so the crore count recurses
 * through the same function and the scale never runs out.
 */
const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

/** 1–99. Below twenty the names are their own; above it they are tens plus a unit. */
function underHundred(n: number): string {
  if (n < 20) return ONES[n] ?? ''
  const tens = TENS[Math.floor(n / 10)] ?? ''
  const unit = ONES[n % 10] ?? ''
  return unit ? `${tens} ${unit}` : tens
}

/** A whole number in words, Title Case, Indian grouping. `0` is `Zero`. */
export function words(n: number): string {
  const whole = Math.floor(Math.abs(n))
  if (whole === 0) return 'Zero'

  const crore = Math.floor(whole / 1_00_00_000)
  const lakh = Math.floor((whole % 1_00_00_000) / 1_00_000)
  const thousand = Math.floor((whole % 1_00_000) / 1_000)
  const hundred = Math.floor((whole % 1_000) / 100)
  const rest = whole % 100

  const out: string[] = []
  // Recursion, so a hundred crore is "One Hundred Crore" rather than a scale nobody uses.
  if (crore > 0) out.push(`${words(crore)} Crore`)
  if (lakh > 0) out.push(`${underHundred(lakh)} Lakh`)
  if (thousand > 0) out.push(`${underHundred(thousand)} Thousand`)
  if (hundred > 0) out.push(`${ONES[hundred] ?? ''} Hundred`)
  if (rest > 0) out.push(underHundred(rest))
  return out.join(' ')
}

/**
 * The line that sits under a money field: `Rupees Five Thousand Only`.
 *
 * Paise are named separately and only when there are any, which is the cheque convention and
 * also the honest one — "and Zero Paise" on a round figure is noise.
 */
export function inWords(n: number): string {
  const rounded = Math.round(Math.abs(n) * 100) / 100
  const rupees = Math.floor(rounded)
  const paise = Math.round((rounded - rupees) * 100)
  const tail = paise > 0 ? ` and ${words(paise)} Paise` : ''
  return `Rupees ${words(rupees)}${tail} Only`
}

const MONTHS = [
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

export const monthName = (iso: string): string => MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''

/** "18 September" — how a date is spoken, not ISO. */
export const dayMonth = (iso: string): string => `${Number(iso.slice(8, 10))} ${monthName(iso)}`

export const monthYear = (iso: string): string => `${monthName(iso)} ${iso.slice(0, 4)}`

/** "18 September 2025" — for the places a year matters, like one line of a statement. */
export const longDate = (iso: string): string => `${dayMonth(iso)} ${iso.slice(0, 4)}`

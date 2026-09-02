/**
 * Calendar arithmetic over 'YYYY-MM-DD' strings.
 *
 * Duplicated deliberately rather than imported from `@dhan/fixtures`: core may not depend on
 * the fixtures, or the production build would ship synthetic customers, and the dependency
 * would point the wrong way — fixtures are data *for* the domain, not part of it.
 *
 * Strings rather than Date objects throughout. A bank statement has no time of day worth
 * trusting, and the moment a Date crosses a timezone boundary the 1st becomes the 31st and the
 * salary lands in the wrong month.
 */
const MS_PER_DAY = 86_400_000

export function parse(iso: string): Date {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) throw new Error(`not a date: ${iso}`)
  return d
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(parse(iso).getTime() + days * MS_PER_DAY))
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / MS_PER_DAY)
}

export function ymd(iso: string): { year: number; month: number; day: number } {
  const d = parse(iso)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

export function fromYmd(year: number, month: number, day: number): string {
  return toIso(new Date(Date.UTC(year, month - 1, day)))
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function isWeekend(iso: string): boolean {
  const d = parse(iso).getUTCDay()
  return d === 0 || d === 6
}

/** 'YYYY-MM' — the key everything monthly groups by. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** Add months, clamping the day so 31 Jan + 1 month is 28 Feb rather than 3 March. */
export function addMonths(iso: string, months: number): string {
  const { year, month, day } = ymd(iso)
  const target = month - 1 + months
  const y = year + Math.floor(target / 12)
  const m = (((target % 12) + 12) % 12) + 1
  return fromYmd(y, m, Math.min(day, daysInMonth(y, m)))
}

/**
 * Salary day, adjusted backwards off a weekend.
 *
 * Indian payroll credits on the last working day, so a salary due on the 1st when the 1st is a
 * Sunday lands on the preceding Friday. Getting this wrong shifts "days until salary", which is
 * the denominator of the number on the Today screen.
 */
export function payDay(year: number, month: number, nominalDay: number): string {
  const clamped = Math.min(nominalDay, daysInMonth(year, month))
  const nominal = fromYmd(year, month, clamped)

  // Shift back to the preceding working day, which is what Indian payroll does — but never out
  // of the month. A salary nominally due on the 1st would otherwise land on the previous
  // month's 30th whenever the 1st is a Sunday, giving that month two credits and this one
  // none. Roughly two months in seven, and it makes "monthly income" quietly wrong for both.
  // Where shifting back would leave the month, shift forward instead: paid on the Monday.
  let back = nominal
  while (isWeekend(back)) back = addDays(back, -1)
  if (ymd(back).month === ymd(nominal).month) return back

  let forward = nominal
  while (isWeekend(forward)) forward = addDays(forward, 1)
  return forward
}

/** The next salary date at or after `asOf`, given the nominal pay day of the month. */
export function nextPayDay(asOf: string, nominalDay: number): string {
  const { year, month } = ymd(asOf)
  const thisMonth = payDay(year, month, nominalDay)
  if (thisMonth > asOf) return thisMonth
  const next = addMonths(fromYmd(year, month, 1), 1)
  const n = ymd(next)
  return payDay(n.year, n.month, nominalDay)
}

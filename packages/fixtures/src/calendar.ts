/**
 * Date arithmetic over 'YYYY-MM-DD' strings.
 *
 * Strings rather than Date objects throughout: a bank statement has no time of day worth
 * trusting, and the moment a Date crosses a timezone boundary the 1st becomes the 31st and
 * the salary lands in the wrong month. Everything here is UTC and calendar-only.
 */

const MS_PER_DAY = 86_400_000

export function toIso(d: Date): string {
  const iso = d.toISOString().slice(0, 10)
  return iso
}

export function parse(iso: string): Date {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) throw new Error(`not a date: ${iso}`)
  return d
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(parse(iso).getTime() + days * MS_PER_DAY))
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / MS_PER_DAY)
}

/** Months are 1-12 here, not the 0-11 that has caused every off-by-one in date code ever. */
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

/** 0 = Sunday. */
export function dayOfWeek(iso: string): number {
  return parse(iso).getUTCDay()
}

export function isWeekend(iso: string): boolean {
  const d = dayOfWeek(iso)
  return d === 0 || d === 6
}

/** 'YYYY-MM' — the key everything monthly is grouped by. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** Add months, clamping the day so 31 Jan + 1 month is 28 Feb rather than 3 March. */
export function addMonths(iso: string, months: number): string {
  const { year, month, day } = ymd(iso)
  const target = month - 1 + months
  const y = year + Math.floor(target / 12)
  const m = ((target % 12) + 12) % 12 + 1
  return fromYmd(y, m, Math.min(day, daysInMonth(y, m)))
}

/**
 * Salary day, adjusted backwards off a weekend.
 *
 * Indian payroll credits on the last working day, so a salary due on the 1st when the 1st is
 * a Sunday lands on the preceding Friday. Getting this wrong is visible: it shifts the whole
 * spending cluster and breaks the "days until salary" arithmetic that the daily plan runs on.
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

/**
 * Festival windows that visibly move Indian spending. Approximate dates — they follow the
 * lunar calendar and shift year to year, and for a synthetic ledger "late October" is close
 * enough. A banker recognises the *shape*: a shopping and gifting spike, then a lean month.
 */
export interface FestivalWindow {
  name: string
  /** Inclusive ISO range. */
  from: string
  to: string
  /** Multiplier applied to discretionary spending inside the window. */
  intensity: number
}

export function festivalsFor(year: number): FestivalWindow[] {
  return [
    { name: 'Diwali', from: fromYmd(year, 10, 18), to: fromYmd(year, 11, 4), intensity: 2.4 },
    { name: 'Holi', from: fromYmd(year, 3, 6), to: fromYmd(year, 3, 12), intensity: 1.4 },
    { name: 'Wedding season', from: fromYmd(year, 11, 20), to: fromYmd(year, 12, 15), intensity: 1.6 },
  ]
}

export function festivalMultiplier(iso: string): number {
  const { year } = ymd(iso)
  // A window can straddle the new year, so check the neighbouring years too.
  for (const y of [year - 1, year, year + 1]) {
    for (const w of festivalsFor(y)) {
      if (iso >= w.from && iso <= w.to) return w.intensity
    }
  }
  return 1
}

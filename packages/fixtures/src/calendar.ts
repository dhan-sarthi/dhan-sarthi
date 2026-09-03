/**
 * Date arithmetic over 'YYYY-MM-DD' strings.
 *
 * Strings rather than Date objects throughout: a bank statement has no time of day worth
 * trusting, and the moment a Date crosses a timezone boundary the 1st becomes the 31st and
 * the salary lands in the wrong month. Everything here is UTC and calendar-only.
 */
import { FESTIVAL_DAYS, WEDDING_SEASON } from './calibration.ts'

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

/** 1-366. The middle three digits of every NPCI reference number are this. */
export function dayOfYear(iso: string): number {
  return daysBetween(fromYmd(ymd(iso).year, 1, 1), iso) + 1
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
  const m = (((target % 12) + 12) % 12) + 1
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
 * Festival windows that visibly move Indian spending.
 *
 * These used to be a fixed slice of the Gregorian calendar — "18 October to 4 November is
 * Diwali" — which is wrong every year and obviously wrong to anybody who lives here. Diwali
 * 2025 was 20 October and Diwali 2026 is 8 November, nineteen days apart, so a fixed window
 * puts the spike in the wrong month roughly half the time. The dates now come from
 * `calibration.ts`, one row per festival per year, with the regional ones scoped to the city
 * they actually move money in: Onam empties a Kochi account and does nothing in Nagpur.
 */
export interface FestivalWindow {
  name: string
  /** Inclusive ISO range. */
  from: string
  to: string
  /** Multiplier applied to discretionary spending inside the window. */
  intensity: number
  /** The city it moves money in, or null where it is national. */
  city: string | null
}

export function festivalsFor(year: number): FestivalWindow[] {
  const windows: FestivalWindow[] = FESTIVAL_DAYS.filter((f) => ymd(f.on).year === year).map(
    (f) => ({
      name: f.name,
      from: addDays(f.on, -f.leadDays),
      to: addDays(f.on, f.trailDays),
      intensity: f.intensity,
      city: f.city,
    }),
  )

  // Wedding season is the one that is not a day: a stretch of the calendar every year, and the
  // reason November and December carry gifting and clothes on every Indian statement.
  windows.push({
    name: 'Wedding season',
    from: `${year}-${WEDDING_SEASON.fromMonthDay}`,
    to: `${year}-${WEDDING_SEASON.toMonthDay}`,
    intensity: WEDDING_SEASON.intensity,
    city: null,
  })

  return windows
}

/**
 * The multiplier in force on a date for a customer in a city.
 *
 * The strongest window wins rather than the first, because Diwali and wedding season overlap
 * and the answer should be Diwali.
 */
export function festivalMultiplier(iso: string, city?: string): number {
  const { year } = ymd(iso)
  let best = 1
  // A window can straddle the new year, so check the neighbouring years too.
  for (const y of [year - 1, year, year + 1]) {
    for (const w of festivalsFor(y)) {
      if (w.city !== null && w.city !== city) continue
      if (iso >= w.from && iso <= w.to && w.intensity > best) best = w.intensity
    }
  }
  return best
}

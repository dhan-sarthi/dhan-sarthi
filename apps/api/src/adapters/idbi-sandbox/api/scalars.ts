/**
 * IDBI's scalars, read the way the sandbox actually writes them.
 *
 * Three of these exist because a capture proved the obvious reading wrong. Money arrives as a
 * string and is parsed to integer paise by moving the point, never through `Number`, because
 * `Number('56780.25') * 100` is 5678024.999999999 and a ledger that rounds its way to a rupee
 * is a ledger nobody trusts. The same lien is `"5000.00"` in 365 and `"5000"` in 433, so the
 * scale is whatever the string carries and not two places by assumption.
 *
 * Dates are worse than the naive-ISO trap we wrote down. The captures hold six formats:
 * `2018-04-18T00:00:00.000` (365, 393), `2018-04-18` (595, the lien), `31-12-2099` (442),
 * `23-Jul-2019` (`ckycGenDate`), `20061995` (`cibilDob`) and `2026-06-22T17:30:45Z` (591) —
 * and only the last states a zone. So a naive stamp is read as a wall-clock date in the
 * bank's own day and never shifted, while the one zoned format is converted before its date is
 * taken. Everything leaves here as `YYYY-MM-DD`, and no `Date` is constructed from a naive
 * string, which is where a timezone would otherwise creep in.
 *
 * And 402 writes a missing date as the four characters `NULL`, so absent has three spellings:
 * the key missing, the empty string, and that.
 */
import { daysInMonth, fromYmd } from '@dhan/core'
import type { IsoDate } from '@dhan/contracts'

/** A value the schema admitted but that cannot be honoured: a deviation to read, not to guess at. */
export class IdbiScalarError extends Error {
  readonly field: string
  readonly raw: unknown

  constructor(field: string, raw: unknown, reason: string) {
    super(`${field}: ${reason} (got ${JSON.stringify(raw)})`)
    this.name = 'IdbiScalarError'
    this.field = field
    this.raw = raw
  }
}

/* ------------------------------------------------------------------ *
 * Absence
 * ------------------------------------------------------------------ */

/**
 * The three ways this sandbox says "no value": the key absent, `""`, and the literal string
 * `NULL` that 402 puts in `npaDate` and `overdueDate`.
 */
export function isBlank(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true
  if (typeof raw !== 'string') return false
  const s = raw.trim()
  return s === '' || s.toUpperCase() === 'NULL'
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/** Integer paise. The unit every amount is held in between the wire and the domain. */
export type Paise = number

const PAISE_SAFE_LIMIT = Number.MAX_SAFE_INTEGER

/**
 * A decimal money string to exact integer paise, by shifting the point rather than multiplying.
 *
 * Accepts any scale the wire happens to use — `"5000"`, `"5000.0"`, `"5000.00"` — and refuses
 * anything finer than paise instead of rounding it away, because a third decimal place in a
 * money field means the feed is not what we think it is. A bare JSON number is accepted too
 * (nothing in the captures sends one, but 433's `amount` is `10000` unquoted, so the door has
 * to be open) and goes through its own decimal rendering, never through arithmetic.
 */
export function toPaise(raw: unknown, field = 'amount'): Paise {
  if (isBlank(raw)) throw new IdbiScalarError(field, raw, 'expected an amount')

  const text =
    typeof raw === 'number'
      ? Number.isFinite(raw)
        ? // `toFixed` is exact for the magnitudes money reaches and never yields exponent form.
          raw.toFixed(2)
        : (() => {
            throw new IdbiScalarError(field, raw, 'expected a finite amount')
          })()
      : typeof raw === 'string'
        ? raw.trim()
        : (() => {
            throw new IdbiScalarError(field, raw, 'expected an amount')
          })()

  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text)
  if (!m) throw new IdbiScalarError(field, raw, 'expected a decimal amount')
  const sign = m[1] === '-' ? -1 : 1
  const whole = m[2] ?? '0'
  const frac = m[3] ?? ''
  if (frac.length > 2 && /[1-9]/.test(frac.slice(2))) {
    throw new IdbiScalarError(field, raw, 'finer than paise')
  }
  const paise = `${whole}${frac.slice(0, 2).padEnd(2, '0')}`
  const value = Number(paise)
  if (!Number.isSafeInteger(value) || value > PAISE_SAFE_LIMIT) {
    throw new IdbiScalarError(field, raw, 'amount too large to hold exactly')
  }
  return sign * value
}

/** Paise back to the rupee figure the domain carries. Exact for every amount a bank holds. */
export function paiseToRupees(paise: Paise): number {
  return Math.round(paise) / 100
}

/** The wire's money object, `{amountValue, currencyCode}`, as paise. */
export interface WireAmountLike {
  amountValue?: unknown
  currencyCode?: unknown
}

export function amountToPaise(raw: WireAmountLike | null | undefined, field = 'amount'): Paise {
  if (raw === null || raw === undefined) throw new IdbiScalarError(field, raw, 'expected an amount')
  return toPaise(raw.amountValue, `${field}.amountValue`)
}

/** The same, where the bank is entitled to send nothing. */
export function optionalAmountToPaise(
  raw: WireAmountLike | null | undefined,
  field = 'amount',
): Paise | null {
  if (raw === null || raw === undefined || isBlank(raw.amountValue)) return null
  return toPaise(raw.amountValue, `${field}.amountValue`)
}

/** A bare decimal field where the bank is entitled to send nothing. */
export function optionalPaise(raw: unknown, field = 'amount'): Paise | null {
  return isBlank(raw) ? null : toPaise(raw, field)
}

/* ------------------------------------------------------------------ *
 * Rates and counts
 * ------------------------------------------------------------------ */

/**
 * A rate or percentage as written. 538 sends `"7.000000"` and 433 `"12.75"`, so the scale
 * varies; six decimals of an interest rate is noise, and four is more than any product needs.
 */
export function toRate(raw: unknown, field = 'rate'): number {
  if (isBlank(raw)) throw new IdbiScalarError(field, raw, 'expected a rate')
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n)) throw new IdbiScalarError(field, raw, 'expected a rate')
  return Math.round(n * 10_000) / 10_000
}

export function optionalRate(raw: unknown, field = 'rate'): number | null {
  return isBlank(raw) ? null : toRate(raw, field)
}

/** A whole number: `dpd`, `txnSrlNo`, `noOfInstalmnts`, `numOfAccounts`. */
export function toInt(raw: unknown, field = 'count'): number {
  if (isBlank(raw)) throw new IdbiScalarError(field, raw, 'expected an integer')
  const text = String(raw).trim()
  if (!/^-?\d+$/.test(text)) throw new IdbiScalarError(field, raw, 'expected an integer')
  const n = Number(text)
  if (!Number.isSafeInteger(n)) throw new IdbiScalarError(field, raw, 'integer too large')
  return n
}

export function optionalInt(raw: unknown, field = 'count'): number | null {
  return isBlank(raw) ? null : toInt(raw, field)
}

/* ------------------------------------------------------------------ *
 * Booleans
 * ------------------------------------------------------------------ */

const TRUTHY = new Set(['y', 'yes', 'true', 't', '1'])
const FALSY = new Set(['n', 'no', 'false', 'f', '0'])

/**
 * `hasMoreData: "Y"`, `isDeleted: "N"`, `ckycCompliance: "true"`, `firstTimeFetch: "false"` —
 * the sandbox writes a flag four different ways and one of them is already a boolean.
 */
export function toBool(raw: unknown, field = 'flag'): boolean {
  if (typeof raw === 'boolean') return raw
  if (isBlank(raw)) throw new IdbiScalarError(field, raw, 'expected a flag')
  const s = String(raw).trim().toLowerCase()
  if (TRUTHY.has(s)) return true
  if (FALSY.has(s)) return false
  throw new IdbiScalarError(field, raw, 'expected a flag')
}

export function optionalBool(raw: unknown, field = 'flag'): boolean | null {
  return isBlank(raw) ? null : toBool(raw, field)
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

/** A string field, trimmed, with the sandbox's three spellings of absent collapsed to null. */
export function optionalText(raw: unknown): string | null {
  if (isBlank(raw)) return null
  return String(raw).trim()
}

export function toText(raw: unknown, field = 'text'): string {
  const t = optionalText(raw)
  if (t === null) throw new IdbiScalarError(field, raw, 'expected a value')
  return t
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

/** Which of the six shapes a stamp was written in. Recorded so a mapping report can show the spread. */
export type IdbiDateFormat =
  'iso-naive' | 'iso-zoned' | 'iso-date' | 'dd-mm-yyyy' | 'dd-mon-yyyy' | 'ddmmyyyy'

export interface ParsedDate {
  date: IsoDate
  format: IdbiDateFormat
  /**
   * The wall-clock time of day, where the stamp carried one and did not state a zone. Kept
   * because 393's `pstdDate` is `T10:00:00.000` against a `txnDate` of midnight, and the pair
   * is the only ordering signal within a day. Never used to shift the date.
   */
  timeOfDay: string | null
}

function checked(year: number, month: number, day: number, raw: unknown, field: string): IsoDate {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new IdbiScalarError(field, raw, 'not a calendar date')
  }
  return fromYmd(year, month, day)
}

/**
 * Any of the six stamps to a calendar date, with the format it came in.
 *
 * A naive stamp is a date in the bank's own day and is taken apart as text, so no host
 * timezone can move it. `...Z` is the one format that states a zone, and 591 uses it for
 * consent timestamps, so it is converted to UTC's calendar date deliberately rather than by
 * accident.
 */
export function parseIdbiDate(raw: unknown, field = 'date'): ParsedDate {
  if (isBlank(raw)) throw new IdbiScalarError(field, raw, 'expected a date')
  const text = String(raw).trim()

  // 2018-04-18T00:00:00.000 — naive, no zone. Read as written.
  const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(text)
  if (naive) {
    return {
      date: checked(Number(naive[1]), Number(naive[2]), Number(naive[3]), raw, field),
      format: 'iso-naive',
      timeOfDay: `${naive[4] ?? '00'}:${naive[5] ?? '00'}:${naive[6] ?? '00'}`,
    }
  }

  // 2026-06-22T17:30:45Z or +05:30 — the only zoned shape. Converted, then its date taken.
  const zoned =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:?\d{2})$/.exec(
      text,
    )
  if (zoned) {
    const ms = Date.parse(text)
    if (!Number.isFinite(ms)) throw new IdbiScalarError(field, raw, 'not a calendar date')
    const d = new Date(ms)
    return {
      date: checked(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), raw, field),
      format: 'iso-zoned',
      timeOfDay: `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`,
    }
  }

  // 2018-04-18 — a bare date, which 595 and the lien use.
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (bare) {
    return {
      date: checked(Number(bare[1]), Number(bare[2]), Number(bare[3]), raw, field),
      format: 'iso-date',
      timeOfDay: null,
    }
  }

  // 31-12-2099 — 442's limit windows.
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text)
  if (dmy) {
    return {
      date: checked(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]), raw, field),
      format: 'dd-mm-yyyy',
      timeOfDay: null,
    }
  }

  // 23-Jul-2019 — ckycGenDate and its siblings.
  const dMonY = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(text)
  if (dMonY) {
    const month = MONTHS[(dMonY[2] ?? '').toLowerCase()]
    if (month === undefined) throw new IdbiScalarError(field, raw, 'unknown month name')
    return {
      date: checked(Number(dMonY[3]), month, Number(dMonY[1]), raw, field),
      format: 'dd-mon-yyyy',
      timeOfDay: null,
    }
  }

  // 20061995 — cibilDob, DDMMYYYY with no separators at all.
  const packed = /^(\d{2})(\d{2})(\d{4})$/.exec(text)
  if (packed) {
    return {
      date: checked(Number(packed[3]), Number(packed[2]), Number(packed[1]), raw, field),
      format: 'ddmmyyyy',
      timeOfDay: null,
    }
  }

  throw new IdbiScalarError(field, raw, 'not a date in any format the sandbox uses')
}

/** The calendar date alone, which is all most callers want. */
export function toIsoDate(raw: unknown, field = 'date'): IsoDate {
  return parseIdbiDate(raw, field).date
}

export function optionalIsoDate(raw: unknown, field = 'date'): IsoDate | null {
  return isBlank(raw) ? null : toIsoDate(raw, field)
}

/** `YYYY-MM-DD` to the naive stamp 393 and 365 want in a request body. */
export function isoDateToNaiveStamp(iso: IsoDate): string {
  return `${iso}T00:00:00.000`
}

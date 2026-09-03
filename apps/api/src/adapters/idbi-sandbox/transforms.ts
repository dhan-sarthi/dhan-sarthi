/**
 * The named transform library: the small set of functions a field mapping may cite.
 *
 * Week one of the sandbox (schema README §E.2) is declarative: each `staging.field_mappings`
 * row names a source path, a target column and one of these transforms. Keeping them here as
 * plain functions, named as the README names them, means the mapping table in `mapping.ts`
 * reads like the rows that will one day be inserted, and a new transform is a function added
 * below rather than a schema change.
 *
 * Dates are the one place the bank's format is never trusted: the organisers' sample schema
 * writes `01-08-25`, the date-of-birth sample writes `14-06-1991`, and a two-digit year has to
 * be pivoted somewhere. Everything downstream is `YYYY-MM-DD` strings; nothing here makes a
 * `Date` cross a timezone.
 */
import { daysInMonth, fromYmd, ymd } from '@dhan/core'
import type { IsoDate } from '@dhan/contracts'

export const TRANSFORM_NAMES = [
  'ddmmyy_to_date',
  'age_to_dob',
  'inr_18_2',
  'paise_to_inr',
  'rate_5_2',
  'int',
  'bool',
  'text',
  'json_map',
  'code_map:txn_type',
  'code_map:txn_mode',
  'code_map:spend_category',
  'code_map:account_type',
  'code_map:employment_type',
  'code_map:risk_profile',
  'code_map:holding_type',
  'code_map:asset_class',
  'code_map:product_category',
  'code_map:riskometer',
  'code_map:consent_status',
] as const
export type TransformName = (typeof TRANSFORM_NAMES)[number]

/** A value the wire schema admitted but the transform cannot honour: a spec deviation to read on day one. */
export class WireFormatError extends Error {
  readonly field: string
  readonly raw: unknown

  constructor(field: string, raw: unknown, reason: string) {
    super(`${field}: ${reason} (got ${JSON.stringify(raw)})`)
    this.name = 'WireFormatError'
    this.field = field
    this.raw = raw
  }
}

/**
 * Two-digit years pivot into this century. Every date the spec samples — consent windows,
 * account vintages, statement lines — is 2016 or later, and a date of birth arrives with
 * its century. Marked to confirm against a real payload on day one.
 */
const CENTURY = 2000

/** `DD-MM-YY` or `DD-MM-YYYY` → `YYYY-MM-DD`, validated against the calendar. */
export function ddmmyyToDate(raw: string, field = 'date'): IsoDate {
  const m = /^(\d{2})-(\d{2})-(\d{2}|\d{4})$/.exec(raw.trim())
  if (!m) throw new WireFormatError(field, raw, 'expected DD-MM-YY')
  const day = Number(m[1])
  const month = Number(m[2])
  const year = m[3]?.length === 4 ? Number(m[3]) : CENTURY + Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new WireFormatError(field, raw, 'not a calendar date')
  }
  return fromYmd(year, month, day)
}

/** The reverse, for the offline sandbox and the request parameters. `century` writes DD-MM-YYYY. */
export function dateToDdmmyy(iso: IsoDate, options: { century?: boolean } = {}): string {
  const { year, month, day } = ymd(iso)
  const yy = options.century ? String(year) : String(year % 100).padStart(2, '0')
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${yy}`
}

/**
 * A date of birth from an age, when the bank withholds the date: the same calendar day
 * `age` years before `asOf`, so every age computation downstream lands on the stated age.
 */
export function ageToDob(age: number, asOf: IsoDate): IsoDate {
  if (!Number.isInteger(age) || age < 0 || age > 130) {
    throw new WireFormatError('age', age, 'expected an age in years')
  }
  const { year, month, day } = ymd(asOf)
  return fromYmd(year - age, month, Math.min(day, daysInMonth(year - age, month)))
}

export type AmountUnit = 'inr' | 'paise'

/** `18,2` money in rupees. The spec's figures carry paise as decimals; a feed that sends integer paise flips the unit. */
export function money(value: number, unit: AmountUnit = 'inr'): number {
  const rupees = unit === 'paise' ? value / 100 : value
  // Two places is what the wire promised; anything finer is noise from a float serialiser.
  return Math.round(rupees * 100) / 100
}

export const paiseToInr = (paise: number): number => money(paise, 'paise')

/** `5,2` / `7,2` rates and percentages, as given. */
export const rate = (value: number): number => Math.round(value * 100) / 100

/** Block 07's JSON-in-a-string map (`{"Food":184000,"Rent":420000}`), or null when it does not parse as one. */
export function jsonMap(raw: string): Record<string, number> | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const n = typeof v === 'number' ? v : Number(v)
      if (Number.isFinite(n)) out[k] = n
    }
    return out
  } catch {
    return null
  }
}

/** Fixed two decimals, the way the reference samples write money: `184500.00`. */
export const fixed2 = (n: number): string => n.toFixed(2)

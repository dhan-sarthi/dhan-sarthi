// An evidence line in the customer's words.
//
// The lines arrive in the engine's words, and some of those words are the database's rather
// than the customer's: ISO dates ("Looked at 2026-08-01 to 2026-09-01") and series ids
// ("coming in (salary-series)"). The engine's strings are its audit trail and stay as they are
// on the wire; the screen is where they are read aloud, so this is where they are put into
// English. The figures are never touched.
//
// A range is the one place where rewording can say something false. The engine counts a window
// as half-open, from its first day up to but not including its last (`sumIn` in
// `packages/core/src/query.ts` keeps `txnDate < to`), so August arrives as "2026-08-01 to
// 2026-09-01". Printed as it stands that read "1 Aug to 1 Sept", which tells the customer a
// day in September was counted in an answer about August. So a range ends on the last day it
// actually covers.
//
// Kept apart from `Evidence.tsx` so a node test can reach it without React Native.
import { shortDate } from './money.ts'

const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g
/** Two wire dates as the engine writes a window: the first day, then the day after the last. */
const ISO_RANGE = /\b(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})\b/g
/** A machine id in brackets: "(salary-series)", "(monthly-credits)". */
const SOURCE_ID = /\s*\(([a-z]+(?:-[a-z]+)+)\)/g

/** "salary-series" → "Salary", "monthly-credits" → "Monthly credits". */
function sourceName(id: string): string {
  const words = id.replace(/-series$/, '').replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The day before a wire date. Counted in UTC, so no time zone can move it. */
export function dayBefore(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

/** A half-open window as the days it covers: "1 Aug to 31 Aug"; one day names that day. */
function coveredRange(from: string, to: string, asOf: string | undefined): string {
  const last = dayBefore(to)
  if (last <= from) return shortDate(from, asOf)
  return `${shortDate(from, asOf)} to ${shortDate(last, asOf)}`
}

/**
 * One evidence line in the customer's words. A line that is nothing but a date and its source
 * reads source-first ("Salary · 1 Aug"), because the date is the value; anywhere else the
 * source trails the figure it qualifies.
 */
export function evidenceLine(line: string, asOf?: string | null): string {
  const today = asOf ?? undefined
  const sources: string[] = []
  const bare = line.replace(SOURCE_ID, (_match, id: string) => {
    sources.push(sourceName(id))
    return ''
  })
  const onlyDate = /^\d{4}-\d{2}-\d{2}$/.test(bare.trim())
  const text = bare
    .replace(ISO_RANGE, (_match, from: string, to: string) => coveredRange(from, to, today))
    .replace(ISO_DATE, (iso) => shortDate(iso, today))
    .trim()
  const source = sources.join(', ')
  if (source === '') return text
  return onlyDate ? `${source} · ${text}` : `${text} · ${source}`
}

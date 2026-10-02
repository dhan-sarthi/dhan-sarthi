/**
 * The access log's vocabulary: what each action is called, as a sentence in the table and as a
 * word on a tab, and how a real instant is read back to the RM.
 */
import type { AccessAction, AccessEntry } from '@dhan/contracts'
import {
  Eye,
  KeyRound,
  Lock,
  MessageCircleQuestion,
  Phone,
  ShieldCheck,
  Sparkles,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'

export interface ActionWords {
  /** In the table: what the RM did. */
  sentence: string
  /** On the filter tab. */
  tab: string
  icon: LucideIcon
}

/**
 * In the order the tabs run: the everyday open first, the sensitive reveal right after it, and
 * the refused attempt last, where a reviewer looking for one finds it.
 */
export const ACTIONS: readonly AccessAction[] = [
  'viewed',
  'revealed',
  'checked',
  'briefed',
  'asked',
  'noted',
  'contacted',
  'denied',
]

export const ACTION_WORDS: Record<AccessAction, ActionWords> = {
  viewed: { sentence: 'Opened the file', tab: 'Opened', icon: Eye },
  revealed: { sentence: 'Unmasked a field', tab: 'Revealed', icon: KeyRound },
  checked: { sentence: 'Checked a product', tab: 'Checked', icon: ShieldCheck },
  briefed: { sentence: 'Asked for a brief', tab: 'Briefs', icon: Sparkles },
  asked: { sentence: 'Asked the copilot', tab: 'Questions', icon: MessageCircleQuestion },
  noted: { sentence: 'Wrote on the journey', tab: 'Notes', icon: StickyNote },
  contacted: { sentence: 'Updated a request', tab: 'Requests', icon: Phone },
  // Not "Refused": that word is Uday's verdict on a product everywhere else on the console.
  denied: { sentence: 'Access denied', tab: 'Denied', icon: Lock },
}

/**
 * The purpose the API writes when the console opens a file without asking for one. The console
 * does not ask yet, so on an open it is a default, and the log says so rather than presenting
 * it as a reason the RM gave.
 */
export const DEFAULT_PURPOSE = 'Relationship review'

export function isDefaultPurpose(
  entry: Pick<AccessEntry, 'action' | 'purpose' | 'detail'>,
): boolean {
  if (entry.purpose !== DEFAULT_PURPOSE) return false
  return (
    entry.action === 'viewed' || (entry.action === 'denied' && entry.detail === 'Customer file')
  )
}

/** One row of the log: an entry, or a run of the same thing done to the same file. */
export interface LogRow {
  id: string
  /** The newest entry of the run; every one in it shares its action, customer and purpose. */
  entry: AccessEntry
  /** Newest first. One entry for a row that is not a run. */
  entries: AccessEntry[]
}

/** Two of the same thing more than this apart are two visits, not a reload. */
const RUN_GAP_MS = 30 * 60_000

function sameThing(a: AccessEntry, b: AccessEntry): boolean {
  return (
    a.action === b.action &&
    a.cif === b.cif &&
    a.purpose === b.purpose &&
    (a.detail ?? null) === (b.detail ?? null)
  )
}

/**
 * Consecutive identical entries, folded. Reloads and tab hops write an open each time, and eight
 * "Opened the file · Karan Deshpande" rows within a minute buried the reveal between them. The
 * entries are kept, every one: the row says how many and from when to when, and opens to list
 * each instant. Entries arrive newest first; a run breaks on anything different, or a gap of
 * half an hour.
 */
export function foldRuns(entries: readonly AccessEntry[]): LogRow[] {
  const rows: LogRow[] = []
  for (const entry of entries) {
    const last = rows[rows.length - 1]
    const previous = last?.entries[last.entries.length - 1]
    if (
      last &&
      previous &&
      sameThing(previous, entry) &&
      Math.abs(Date.parse(previous.at) - Date.parse(entry.at)) <= RUN_GAP_MS
    ) {
      last.entries.push(entry)
    } else {
      rows.push({ id: entry.id, entry, entries: [entry] })
    }
  }
  return rows
}

/** "dateOfBirth" → "Date of birth". A field id reads as words; any other detail passes through. */
export function detailWords(detail: string): string {
  if (!/^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(detail)) return detail
  const words = detail.replace(/([A-Z])/g, ' $1').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/**
 * The day of a real instant, against the wall clock rather than the book's simulated one: the
 * log records when the RM actually looked. "Today", "Yesterday", then "Tue 29 Sep".
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (dayKey(d) === dayKey(now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** "8:14–8:15 am" for a run; the single time for one entry. Oldest to newest. */
export function spanLabel(entries: readonly AccessEntry[]): string {
  const newest = entries[0]
  const oldest = entries[entries.length - 1]
  if (!newest || !oldest) return ''
  if (entries.length === 1) return timeLabel(newest.at)
  const short = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  const from = short(oldest.at)
  const to = short(newest.at)
  // A run inside one minute keeps its seconds: "10:59:39–10:59:42 am" says more than "10:59 am".
  if (from === to) {
    const first = timeLabel(oldest.at)
    const last = timeLabel(newest.at)
    const suffix = /\s?[ap]m$/i.exec(last)?.[0] ?? ''
    return suffix && first.endsWith(suffix)
      ? `${first.slice(0, first.length - suffix.length)}–${last}`
      : `${first}–${last}`
  }
  // "8:14 am–8:15 am" reads as "8:14–8:15 am" when both share the half of the day.
  const suffix = /\s?[ap]m$/i.exec(to)?.[0] ?? ''
  return suffix && from.endsWith(suffix.trim())
    ? `${from.slice(0, from.length - suffix.length)}–${to}`
    : `${from}–${to}`
}

/** "7:03:12 am": to the second, because two opens a minute apart are two entries. */
export function timeLabel(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

/** The full instant with its zone, for the hover title: nothing is lost by the short form. */
export function fullInstant(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'long' })
}

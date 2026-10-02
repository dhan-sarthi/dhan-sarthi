/**
 * The access log's vocabulary: what each action is called, as a sentence in the table and as a
 * word on a tab, and how a real instant is read back to the RM.
 */
import type { AccessAction } from '@dhan/contracts'
import {
  Eye,
  KeyRound,
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

/** In the order the tabs run: the everyday open first, the sensitive reveal right after it. */
export const ACTIONS: readonly AccessAction[] = [
  'viewed',
  'revealed',
  'checked',
  'briefed',
  'asked',
  'noted',
  'contacted',
]

export const ACTION_WORDS: Record<AccessAction, ActionWords> = {
  viewed: { sentence: 'Opened the file', tab: 'Opened', icon: Eye },
  revealed: { sentence: 'Unmasked a field', tab: 'Revealed', icon: KeyRound },
  checked: { sentence: 'Checked a product', tab: 'Checked', icon: ShieldCheck },
  briefed: { sentence: 'Asked for a brief', tab: 'Briefs', icon: Sparkles },
  asked: { sentence: 'Asked the copilot', tab: 'Questions', icon: MessageCircleQuestion },
  noted: { sentence: 'Wrote on the journey', tab: 'Notes', icon: StickyNote },
  contacted: { sentence: 'Updated a request', tab: 'Requests', icon: Phone },
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

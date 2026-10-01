import type { JourneyEventKind, JourneySource } from '@dhan/contracts'
import {
  ArrowRight,
  Ban,
  CircleCheck,
  FileText,
  Hand,
  Landmark,
  MessageSquareText,
  Phone,
  Route,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { formatDate } from '../lib/format.ts'

/*
 * The journey's building blocks, after Attio's activity feed: events grouped by month down a
 * hairline spine, each with an icon for its kind, and a plan change drawn as before → after rows.
 */

export const EVENT_ICON: Record<JourneyEventKind, LucideIcon> = {
  joined: UserPlus,
  plan: Route,
  decision: CircleCheck,
  advice: FileText,
  handoff: Hand,
  call: Phone,
  note: MessageSquareText,
  contact: Phone,
  ledger: Landmark,
}

export const SOURCE_LABEL: Record<JourneySource, string> = {
  engine: 'Plan engine',
  customer: 'Customer',
  uday: 'Uday',
  rm: 'You',
  ledger: 'Ledger',
}

/** A month heading with its events under it. The heading sticks while its events scroll. */
export function TimelineMonth({
  label,
  count,
  children,
  stickyTop = 56,
}: {
  /** "September 2026" */
  label: ReactNode
  count?: number
  children: ReactNode
  stickyTop?: number
}) {
  return (
    <section className="relative">
      <header
        className="sticky z-[1] -mx-1 mb-1 flex items-center gap-2 bg-surface px-1 py-2"
        style={{ top: stickyTop }}
      >
        <h3 className="text-label text-ink">{label}</h3>
        {count !== undefined ? (
          <span className="text-caption tabular text-ink-hint">{count}</span>
        ) : null}
        <span aria-hidden className="h-px flex-1 bg-hairline-soft" />
      </header>
      <ol className="relative">{children}</ol>
    </section>
  )
}

export interface TimelineEventProps {
  kind: JourneyEventKind
  title: ReactNode
  /** Calendar date of the event (`YYYY-MM-DD`). */
  at: string
  source?: JourneySource
  detail?: ReactNode
  /** A refusal draws its icon in danger and its title in full ink; nothing else changes. */
  tone?: 'default' | 'refused' | 'passed'
  /** Trailing meta on the title line: an amount, a verdict chip. */
  aside?: ReactNode
  children?: ReactNode
  /** The last event in a month draws no spine below its icon. */
  last?: boolean
}

export function TimelineEvent({
  kind,
  title,
  at,
  source,
  detail,
  tone = 'default',
  aside,
  children,
  last = false,
}: TimelineEventProps) {
  const Icon =
    tone === 'refused'
      ? Ban
      : kind === 'advice' && tone === 'passed'
        ? CircleCheck
        : EVENT_ICON[kind]
  return (
    <li className="relative flex gap-3 pb-5">
      {!last ? (
        <span aria-hidden className="absolute top-7 bottom-0 left-[13px] w-px bg-hairline" />
      ) : null}
      <span
        aria-hidden
        className={cn(
          'relative z-[1] mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3.5',
          tone === 'refused'
            ? 'border-danger/25 bg-danger-soft text-danger'
            : kind === 'note' || kind === 'call' || kind === 'contact'
              ? 'border-brand/20 bg-brand-soft text-brand-deep'
              : 'border-hairline bg-surface text-ink-soft',
        )}
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 text-label text-ink">{title}</p>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
        <p className="mt-0.5 text-caption font-normal text-ink-faint">
          {source ? `${SOURCE_LABEL[source]} · ` : ''}
          <time dateTime={at}>{formatDate(at)}</time>
        </p>
        {detail ? (
          <p className="mt-1.5 max-w-prose text-label font-normal text-ink-soft">{detail}</p>
        ) : null}
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
    </li>
  )
}

export interface DiffRow {
  field: string
  before: string | number | null
  after: string | number | null
}

/**
 * What a plan version changed: one row per field, before → after. A field that appeared has no
 * before ("—"); one that went away has no after. Figures are formatted by the caller, so a rupee
 * value arrives here already as "₹12,000".
 */
export function TimelineDiff({
  rows,
  className,
}: {
  rows: readonly DiffRow[]
  className?: string
}) {
  return (
    <dl
      className={cn(
        'grid gap-1 rounded-md border border-hairline-soft bg-canvas-top/70 px-3 py-2',
        className,
      )}
    >
      {rows.map((row) => (
        <div
          key={row.field}
          className="grid grid-cols-[minmax(8rem,auto)_1fr] items-baseline gap-3 text-label"
        >
          <dt className="font-normal text-ink-faint">{row.field}</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-1.5 tabular">
            <span
              className={cn(
                row.before === null
                  ? 'text-ink-hint'
                  : 'text-ink-soft line-through decoration-ink-hint/50',
              )}
            >
              {row.before ?? '—'}
            </span>
            <ArrowRight aria-label="changed to" className="size-3 shrink-0 text-ink-hint" />
            <span className={cn(row.after === null ? 'text-ink-hint' : 'font-medium text-ink')}>
              {row.after ?? '—'}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Used where Uday wrote something: a quiet mark rather than a badge. */
export function UdayMark() {
  return <Sparkles aria-hidden className="inline size-3 text-brand" />
}

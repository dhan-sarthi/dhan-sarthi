import type { PhrasedBy } from '@dhan/contracts'
import { BookOpenCheck, Info, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { formatCount } from '../lib/format.ts'
import { Tooltip } from './Tooltip.tsx'

/*
 * The labels compliance asks the screen to carry: what is illustration, what a model wrote, and
 * whether the record still verifies. Each is small and quiet, and each is always there.
 */

/**
 * The mandatory line under a projection or any figure that is illustration, not promise. The
 * words come from the caller (the API sends the core's own disclaimer), so this only draws them.
 */
export function Disclaimer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn('flex items-start gap-1.5 text-caption font-normal text-ink-faint', className)}
    >
      <Info aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

const AI_TEXT = 'AI-written from the record — check before advising'

/**
 * Who wrote the words. A model's sentences say so every time; the rules' sentences say they came
 * straight from the record. Facts and verdicts are the engine's either way.
 */
export function AiLabel({
  phrasedBy = 'model',
  className,
}: {
  phrasedBy?: PhrasedBy
  className?: string
}) {
  if (phrasedBy === 'rules') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-caption text-ink-faint', className)}
      >
        <BookOpenCheck aria-hidden className="size-3.5" />
        Written by the rules from the record
      </span>
    )
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-caption text-brand-deep', className)}
    >
      <Sparkles aria-hidden className="size-3.5" />
      {AI_TEXT}
    </span>
  )
}

export interface VerifiedBadgeProps {
  /** `unchecked` until the RM runs the check in this view. */
  status: 'verified' | 'broken' | 'unchecked'
  /** Records walked. */
  records?: number
  /** When the check ran (a real instant). */
  checkedAt?: string
  className?: string
}

function timeOf(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

/**
 * The hash chain's state. "Chain verified" is only ever shown after the real verification ran
 * and passed; a chain nobody has checked says so rather than borrowing the green.
 */
export function VerifiedBadge({ status, records, checkedAt, className }: VerifiedBadgeProps) {
  const detail = [
    records !== undefined
      ? `${formatCount(records)} record${records === 1 ? '' : 's'} walked`
      : null,
    checkedAt ? `checked at ${timeOf(checkedAt)}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  const badge = (
    <span
      tabIndex={detail ? 0 : undefined}
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-label whitespace-nowrap focus-visible:outline-2 focus-visible:outline-focus [&_svg]:size-3.5',
        status === 'verified' && 'bg-brand-soft text-brand-deep',
        status === 'broken' && 'bg-danger-soft text-danger',
        status === 'unchecked' && 'border border-hairline bg-surface text-ink-soft',
        className,
      )}
    >
      {status === 'broken' ? <ShieldAlert aria-hidden /> : <ShieldCheck aria-hidden />}
      {status === 'verified'
        ? 'Chain verified'
        : status === 'broken'
          ? 'Chain broken'
          : 'Not checked yet'}
    </span>
  )
  return detail ? <Tooltip content={`Hash chain ${detail}.`}>{badge}</Tooltip> : badge
}

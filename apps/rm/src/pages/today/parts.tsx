import type { QueueItem, SignalSeverity } from '@dhan/contracts'
import { SIGNAL_LABELS } from '@dhan/core'
import { CircleAlert, Eye, Hand, Lightbulb } from 'lucide-react'
import { cn } from '../../lib/cn.ts'
import { Chip, SEVERITY, Tooltip } from '../../ui/index.ts'
import { figureRuns } from './derive.ts'

/*
 * Small pieces Today's cards share. Page-local: they are habits of this page's lists, not kit
 * vocabulary, and the kit's own status components are used wherever one fits.
 */

/**
 * An engine sentence with its figures set in full ink and the words around them a step quieter,
 * so "₹14,200" is what the eye reads first. The sentence itself is printed exactly as sent.
 */
export function Figures({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {figureRuns(text).map((run, i) =>
        run.figure ? (
          <span key={i} className="font-semibold whitespace-nowrap text-ink tabular">
            {run.text}
          </span>
        ) : (
          run.text
        ),
      )}
    </span>
  )
}

const SEVERITY_ICON: Record<SignalSeverity, typeof CircleAlert> = {
  urgent: CircleAlert,
  important: Eye,
  opportunity: Lightbulb,
}

const SEVERITY_INK: Record<SignalSeverity, string> = {
  urgent: 'text-danger',
  important: 'text-streak-ink',
  opportunity: 'text-ink-faint',
}

/**
 * Why a customer is in the queue. A request to talk is the customer's own words, so it gets the
 * brand fill; a signal names its kind in a quiet outline chip, with the severity carried by the
 * icon's shape and colour and spelled out on hover, so ten urgent rows do not become ten red
 * blocks down the page.
 */
export function SourceChip({ item }: { item: QueueItem }) {
  if (item.source === 'handoff') {
    return (
      <Chip tone="brand" icon={<Hand aria-hidden />}>
        Asked for you
      </Chip>
    )
  }
  if (item.signal === null) return null
  const { severity, kind } = item.signal
  const Icon = SEVERITY_ICON[severity]
  return (
    <Tooltip content={SEVERITY[severity].label}>
      <span
        tabIndex={0}
        aria-label={`${SIGNAL_LABELS[kind]}. ${SEVERITY[severity].label}`}
        className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Chip tone="outline" icon={<Icon aria-hidden className={cn(SEVERITY_INK[severity])} />}>
          {SIGNAL_LABELS[kind]}
        </Chip>
      </span>
    </Tooltip>
  )
}

import type { Handoff, QueueItem } from '@dhan/contracts'
import { SIGNAL_LABELS } from '@dhan/core'
import { Check, Hand } from 'lucide-react'
import { Chip, SEVERITY, SeverityMark, Tooltip, useBadgeTabIndex } from '../../ui/index.ts'
import { askedLabel, figureRuns } from './derive.ts'

/*
 * Small pieces Today's cards share. Page-local: they are habits of this page's lists, not kit
 * vocabulary, and the kit's own status components are used wherever one fits.
 */

/**
 * An engine sentence with its figures set in full ink and the words around them a step quieter,
 * so "₹14,200" is what the eye reads first. The sentence itself is printed exactly as sent.
 */
export function Figures({
  text,
  className,
  id,
}: {
  text: string
  className?: string
  id?: string
}) {
  return (
    <span id={id} className={className}>
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

/**
 * Why a customer is in the queue. A request to talk is the customer's own, so it gets the brand
 * fill and says how long they have waited ("Asked 6 days ago"), which leaves the row's line free
 * to lead with a figure. A signal names its kind in a quiet outline chip, with the severity
 * carried by the kit's bare mark (its shape and colour, and its word for a screen reader) and
 * spelled out on hover, so ten urgent rows do not become ten red blocks down the page.
 *
 * Inside a queue row (an `InteractiveRow`) the signal chip gives up its own Tab stop; the row's
 * button names it through `aria-describedby`, by the `id` passed here.
 */
export function SourceChip({
  item,
  request,
  id,
}: {
  item: QueueItem
  request: Handoff | null
  id?: string
}) {
  const tabIndex = useBadgeTabIndex()
  if (item.source === 'handoff') {
    const contacted = request?.status === 'contacted'
    return (
      <Chip
        id={id}
        tone="brand"
        icon={contacted ? <Check aria-hidden /> : <Hand aria-hidden />}
        className="tabular"
      >
        {contacted ? 'Contacted' : request ? askedLabel(request.waitingDays) : 'Asked for a call'}
      </Chip>
    )
  }
  if (item.signal === null) return null
  const { severity, kind } = item.signal
  // The chip's own text names both, the severity in visually hidden words before the kind
  // ("Act now. Expensive card debt"), so the row's description reads it without an
  // `aria-label` on a span, which most screen readers drop.
  return (
    <Tooltip content={SEVERITY[severity].label}>
      <span
        id={id}
        tabIndex={tabIndex}
        className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Chip
          tone="outline"
          icon={<SeverityMark severity={severity} variant="bare" size="xs" labelSuffix=". " />}
        >
          {SIGNAL_LABELS[kind]}
        </Chip>
      </span>
    </Tooltip>
  )
}

import type { JourneyEvent } from '@dhan/contracts'
import { ArrowRight, ChevronDown, ShieldX } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '../../../lib/cn.ts'
import { Chip, Money, TimelineDiff, TimelineEvent } from '../../../ui/index.ts'
import { RULE_COUNT, ruleIndex, ruleName } from '../../record/advice.ts'
import { VerdictChip } from '../../record/AdviceLedger.tsx'
import { diffSummary, diffValue, splitDecision, type Outcome } from './group.ts'

/*
 * One journey event, drawn by kind on the kit's timeline row. The kit draws the icon, the spine,
 * the source and the date; this decides what goes in the title, beside it and under it.
 *
 * A refusal is the one row built to stop the eye: a danger icon, the verdict beside the title,
 * and a tinted block with the rule in plain words and Uday's reason, linked to the exact
 * wording on the advice record. A plan version is the opposite: one quiet line saying what
 * moved, with the before → after rows a click away.
 */
export function EventRow({
  event,
  cif,
  last,
  expanded,
  onToggle,
  fresh,
}: {
  event: JourneyEvent
  cif: string
  last: boolean
  /** Plan versions only: whether the before → after rows are open. */
  expanded: boolean
  onToggle: () => void
  /** The note the RM has just added, marked until the page is left. */
  fresh: boolean
}) {
  const base = { kind: event.kind, at: event.at, source: event.source, last } as const
  const amount =
    event.amount !== null ? (
      <Money value={event.amount} className="text-label text-ink-soft" />
    ) : null

  switch (event.kind) {
    case 'plan':
      return (
        <TimelineEvent
          {...base}
          title={event.title}
          detail={event.diff && event.diff.length > 0 ? null : event.detail}
        >
          {event.diff && event.diff.length > 0 ? (
            <PlanDiff event={event} expanded={expanded} onToggle={onToggle} />
          ) : null}
        </TimelineEvent>
      )

    case 'decision': {
      const { outcome, rest } = splitDecision(event.title)
      return (
        <TimelineEvent
          {...base}
          title={
            <>
              {outcome ? <OutcomeWord outcome={outcome} /> : null}
              {rest}
            </>
          }
          aside={amount}
          detail={event.detail}
        />
      )
    }

    case 'advice':
      if (event.verdict === 'BLOCKED') {
        return (
          <TimelineEvent
            {...base}
            tone="refused"
            title={event.title}
            aside={<VerdictChip verdict="BLOCKED" />}
          >
            <Refusal event={event} cif={cif} />
          </TimelineEvent>
        )
      }
      return (
        <TimelineEvent
          {...base}
          tone={event.verdict === 'PASS' ? 'passed' : 'default'}
          title={event.title}
          aside={event.verdict ? <VerdictChip verdict={event.verdict} /> : amount}
          detail={event.detail}
        />
      )

    case 'note':
    case 'call':
    case 'contact':
      return (
        <TimelineEvent
          {...base}
          title={event.title}
          aside={
            fresh ? (
              <Chip tone="brand" size="sm">
                Just added
              </Chip>
            ) : null
          }
        >
          {event.detail ? (
            <p
              className={cn(
                'max-w-prose text-label font-normal whitespace-pre-line text-ink',
                event.source === 'rm' && 'rounded-md bg-canvas-top px-3 py-2',
              )}
            >
              {event.detail}
            </p>
          ) : null}
        </TimelineEvent>
      )

    default:
      return <TimelineEvent {...base} title={event.title} aside={amount} detail={event.detail} />
  }
}

function OutcomeWord({ outcome }: { outcome: Outcome }) {
  return (
    <Chip tone={outcome === 'Did it' ? 'brand' : 'neutral'} className="mr-2 align-[1px]">
      {outcome}
    </Chip>
  )
}

function PlanDiff({
  event,
  expanded,
  onToggle,
}: {
  event: JourneyEvent
  expanded: boolean
  onToggle: () => void
}) {
  const diff = event.diff ?? []
  const id = `diff-${event.id}`
  return (
    <div className="grid gap-2 pt-0.5">
      {/* The summary is the toggle: "Changed current stage" says what moved, and opening it
          shows by how much. */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={onToggle}
        className="-ml-0.5 inline-flex w-fit items-center gap-1 rounded-sm text-label font-normal text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-ink-faint transition-transform duration-200',
            !expanded && '-rotate-90',
          )}
        />
        {diffSummary(diff)}
      </button>
      {expanded ? (
        <div id={id} className="grid gap-1.5">
          <TimelineDiff
            rows={diff.map((d) => ({
              field: d.field,
              before: diffValue(d.field, d.before),
              after: diffValue(d.field, d.after),
            }))}
          />
          {event.detail ? (
            <p className="text-caption font-normal text-ink-faint">{event.detail}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The refusal block. The reason here is Uday's sentence turned to the third person for the RM;
 * the word-for-word sentence the customer heard is on the advice record, one link away, and the
 * link says so rather than passing this paraphrase off as the quote.
 */
function Refusal({ event, cif }: { event: JourneyEvent; cif: string }) {
  const at = event.ruleId ? ruleIndex(event.ruleId) : null
  return (
    <div className="max-w-[44rem] rounded-md bg-danger-soft/45 px-3.5 py-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label">
        <ShieldX aria-hidden className="size-3.5 shrink-0 text-danger" />
        <span className="text-danger">
          {event.ruleId ? ruleName(event.ruleId) : 'Refused by the rules'}
        </span>
        <span className="font-normal text-ink-faint">
          {at !== null ? (
            <span className="tabular">
              · Rule {at} of {RULE_COUNT}
            </span>
          ) : null}
          {event.amount !== null ? (
            <>
              {' '}
              · <Money value={event.amount} /> asked about
            </>
          ) : null}
        </span>
      </p>
      {event.detail ? (
        <p className="mt-1.5 text-label font-normal text-ink">{event.detail}</p>
      ) : null}
      <Link
        to={`/customers/${encodeURIComponent(cif)}/record?record=${encodeURIComponent(event.id)}`}
        className="group mt-2 inline-flex items-center gap-1 rounded-sm text-caption text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        The exact words they heard, on the advice record
        <ArrowRight
          aria-hidden
          className="size-3 transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </Link>
    </div>
  )
}

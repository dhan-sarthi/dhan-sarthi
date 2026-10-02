import type { JourneyEvent } from '@dhan/contracts'
import { ArrowRight, ChevronDown, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '../../../lib/cn.ts'
import { formatCount, formatDate, formatMonth } from '../../../lib/format.ts'
import { Chip, Money, TimelineDiff, TimelineEvent } from '../../../ui/index.ts'
import { RULE_COUNT, ruleIndex, ruleName } from '../../record/advice.ts'
import { VerdictChip } from '../../record/AdviceLedger.tsx'
import {
  OUTCOME_WORDS,
  diffSummary,
  diffValue,
  isRoutineReview,
  netChange,
  splitDecision,
  titleHasAmount,
  type Outcome,
} from './group.ts'

/*
 * One journey event, drawn by kind on the kit's timeline row. The kit draws the icon, the spine,
 * the source and the date; this decides what goes in the title, beside it and under it.
 *
 * A refusal is the one row built to stop the eye: the "Refused" verdict beside the title, and a
 * block in the brand's wash with the rule in plain words and Uday's reason, linked to the exact
 * wording on the advice record. It is drawn as the rules working, never in red: red on the
 * journey would tell the RM something went wrong. A plan version is the opposite: one quiet line
 * saying what moved, with the before → after rows a click away.
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
          // The engine's own monthly re-plan reads as what it is; "Plan updated" stays for a
          // version that changed what the plan is.
          title={isRoutineReview(event) ? 'Monthly review' : event.title}
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
          // "Pay ₹21,126 off the card" already says the figure; the column would say it twice.
          aside={titleHasAmount(rest, event.amount) ? null : amount}
          detail={event.detail}
        />
      )
    }

    case 'advice':
      if (event.verdict === 'BLOCKED') {
        // The kit's `refused` tone draws a red ban; the default tone keeps the advice mark, and
        // the verdict chip and the block below carry the refusal.
        return (
          <TimelineEvent {...base} title={event.title} aside={<VerdictChip verdict="BLOCKED" />}>
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
  const { word, meaning } = OUTCOME_WORDS[outcome]
  return (
    <Chip
      tone={outcome === 'Did it' ? 'brand' : 'neutral'}
      title={meaning}
      className="mr-2 align-[1px]"
    >
      {word}
      <span className="sr-only">: {meaning}</span>
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
    <div className="max-w-[44rem] rounded-md bg-brand-wash px-3.5 py-3 ring-1 ring-brand/15 ring-inset">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label">
        <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-brand" />
        <span className="text-ink">
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

/**
 * A run of monthly reviews, folded into one row: how many, since when, and what they moved in
 * all, with each review a click away. The engine re-plans from every month's statements, and a
 * year of those rows one by one hid the decisions and refusals around them.
 */
export function ReviewsRow({
  reviews,
  last,
  expanded,
  onToggle,
}: {
  /** Newest first, as the journey lists them. */
  reviews: readonly JourneyEvent[]
  last: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const newest = reviews[0]
  const oldest = reviews[reviews.length - 1]
  if (!newest || !oldest) return null
  const id = `reviews-${newest.id}`
  const net = netChange(reviews)
  return (
    <TimelineEvent
      kind="plan"
      at={newest.at}
      source={newest.source}
      last={last}
      title={
        <>
          Plan reviewed monthly, <span className="tabular">{formatCount(reviews.length)}</span>{' '}
          times since {formatMonth(oldest.at.slice(0, 7))}
        </>
      }
    >
      <div className="grid gap-2 pt-0.5">
        {net.length > 0 ? (
          <TimelineDiff
            rows={net.map((d) => ({
              field: d.field,
              before: diffValue(d.field, d.before),
              after: diffValue(d.field, d.after),
            }))}
          />
        ) : null}
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
          {expanded ? 'Hide each review' : `Show each review`}
        </button>
        {expanded ? (
          <ol
            id={id}
            className="grid gap-1 rounded-md border border-hairline-soft bg-canvas-top/70 px-3 py-2"
          >
            {reviews.map((review) => (
              <li
                key={review.id}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-3 text-label"
              >
                <time dateTime={review.at} className="font-normal text-ink-faint tabular">
                  {formatDate(review.at)}
                </time>
                <span className="grid min-w-0 gap-0.5 font-normal text-ink-soft">
                  {(review.diff ?? []).map((d) => (
                    <span key={d.field} className="min-w-0 tabular">
                      {d.field} {diffValue(d.field, d.before) ?? '—'}{' '}
                      <span aria-label="changed to" className="text-ink-hint">
                        →
                      </span>{' '}
                      <span className="text-ink">{diffValue(d.field, d.after) ?? '—'}</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </TimelineEvent>
  )
}

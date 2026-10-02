import type { RmBrief } from '@dhan/contracts'
import { ChevronDown, FileText, RotateCw } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { cn } from '../../lib/cn.ts'
import {
  AiLabel,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingRegion,
  SectionLabel,
  SEVERITY,
  Skeleton,
  SkeletonText,
  describeError,
} from '../../ui/index.ts'
import { CitedText, OtherFacts, SourcesList } from './Citations.tsx'
import { leadOf, notesFor, numberCitations, splitQuestion, uncited } from './cite.ts'
import { possessive, writtenAt } from './names.ts'
import { PulseDot } from './PulseDot.tsx'
import { useBriefSession, type BriefEntry } from './session.ts'
import { useElapsed } from './useElapsed.ts'

interface BriefProps {
  cif: string
  /** First name, as the copy uses it. */
  name: string
  /** The record's date, already formatted: "1 Sep 2026". */
  asOf: string
  onAsk: () => void
}

/**
 * Brief me: a meeting-prep brief, every sentence footnoted to the facts it rests on. It is written
 * the moment the RM asks for it (opening this tab is the asking), and kept for the session so
 * flicking between tabs costs nothing. "Write again" asks for a fresh one and keeps this one on
 * screen until it lands.
 */
export function BriefView({ cif, name, asOf, onAsk }: BriefProps) {
  const { entry, generate } = useBriefSession(cif)

  useEffect(() => {
    if (!entry) generate()
  }, [entry, generate])

  if (!entry || (entry.status === 'loading' && !entry.previous)) {
    return (
      <BriefLoading name={name} startedAt={entry?.status === 'loading' ? entry.startedAt : null} />
    )
  }
  if (entry.status === 'error' && !entry.previous) {
    return (
      <ErrorState
        title="The brief did not come back"
        error={entry.error}
        onRetry={generate}
        className="py-16"
      />
    )
  }
  const brief = entry.status === 'ready' ? entry.brief : entry.previous
  if (!brief) return null
  return (
    <BriefBody
      brief={brief}
      entry={entry}
      name={name}
      asOf={asOf}
      onRegenerate={generate}
      onAsk={onAsk}
    />
  )
}

function BriefBody({
  brief,
  entry,
  name,
  asOf,
  onRegenerate,
  onAsk,
}: {
  brief: RmBrief
  entry: BriefEntry
  name: string
  asOf: string
  onRegenerate: () => void
  onAsk: () => void
}) {
  const sections = useMemo(
    () => brief.sections.filter((s) => s.sentences.length > 0),
    [brief.sections],
  )
  const all = useMemo(() => sections.flatMap((s) => s.sentences), [sections])
  const notes = useMemo(() => numberCitations(all, brief.facts), [all, brief.facts])
  const rest = useMemo(() => uncited(brief.facts, notes), [brief.facts, notes])
  const rewriting = entry.status === 'loading'

  return (
    <div className="grid gap-7">
      <BriefMeta brief={brief} entry={entry} asOf={asOf} onRegenerate={onRegenerate} />

      {sections.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No brief this time"
          body={`No sentence could be written and checked against ${possessive(name)} record. A question may still find what you need.`}
          action={
            <Button size="sm" onClick={onAsk}>
              Ask about {name}
            </Button>
          }
        />
      ) : (
        <div
          aria-busy={rewriting || undefined}
          className={cn('grid gap-7 transition-opacity duration-200', rewriting && 'opacity-50')}
        >
          {sections.map((section) => (
            <BriefSection
              key={section.title}
              title={section.title}
              sentences={section.sentences}
              notes={notes}
              asOf={asOf}
            />
          ))}
        </div>
      )}

      {notes.size > 0 ? (
        <section aria-label="Sources" className="border-t border-hairline-soft pt-5">
          <SectionLabel as="h3" className="mb-3">
            Sources
          </SectionLabel>
          <SourcesList notes={notes} />
          {rest.length > 0 ? <MoreFacts facts={rest} total={brief.facts.length} /> : null}
        </section>
      ) : null}
    </div>
  )
}

/**
 * Who wrote it, when, and from what. The model-or-rules label is always first: an RM reading a
 * model's sentence must know it before they read it, not after.
 */
function BriefMeta({
  brief,
  entry,
  asOf,
  onRegenerate,
}: {
  brief: RmBrief
  entry: BriefEntry
  asOf: string
  onRegenerate: () => void
}) {
  const rewriting = entry.status === 'loading'
  const elapsed = useElapsed(rewriting ? entry.startedAt : null)
  return (
    <div className="grid gap-1.5">
      <div className="flex min-h-control-sm items-center justify-between gap-3">
        <AiLabel phrasedBy={brief.phrasedBy} />
        <IconButton
          label="Write the brief again"
          size="sm"
          icon={<RotateCw aria-hidden className={cn(rewriting && 'animate-spin')} />}
          onClick={onRegenerate}
          disabled={rewriting}
          className="-mr-1.5"
        />
      </div>
      {rewriting ? (
        <p role="status" className="flex items-center gap-2 text-caption text-ink-soft">
          <PulseDot />
          Writing a fresh brief
          {elapsed >= 2 ? <span className="tabular text-ink-faint">· {elapsed} s</span> : null}
        </p>
      ) : entry.status === 'error' ? (
        <p role="alert" className="text-caption font-normal text-ink-soft">
          <span className="font-medium text-danger">A fresh brief did not come back.</span>{' '}
          {describeError(entry.error)} The one below was written {writtenAt(brief.generatedAt)}.
        </p>
      ) : (
        <p className="text-caption font-normal text-ink-faint">
          Written {writtenAt(brief.generatedAt)} from {brief.facts.length} facts, as at {asOf}.
        </p>
      )}
    </div>
  )
}

function BriefSection({
  title,
  sentences,
  notes,
  asOf,
}: {
  title: string
  sentences: RmBrief['sections'][number]['sentences']
  notes: ReturnType<typeof numberCitations>
  asOf: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <SectionLabel as="h3" id={id} className="mb-3">
        {title}
      </SectionLabel>
      <ul className="grid gap-3">
        {sentences.map((sentence, i) => (
          <li key={i} className="grid grid-cols-[0.75rem_minmax(0,1fr)] text-body text-ink">
            <span aria-hidden className="mt-[0.5625rem] size-1 rounded-full bg-ink-hint" />
            <p className="text-pretty">
              <Sentence text={sentence.text} notes={notesFor(sentence, notes)} asOf={asOf} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One brief sentence. A talking point that opens "Urgent:" gets that word as a tag; a "They may
 * ask" line that opens with a question gets the question in weight. Either way the words are the
 * server's, in the server's order.
 */
function Sentence({
  text,
  notes,
  asOf,
}: {
  text: string
  notes: ReturnType<typeof notesFor>
  asOf: string
}) {
  const lead = leadOf(text)
  if (lead.lead) {
    return (
      <CitedText
        text={lead.rest}
        notes={notes}
        asOf={asOf}
        prefix={
          <Chip tone={SEVERITY[lead.lead].tone} className="mr-1.5 -translate-y-px align-middle">
            {lead.word}
          </Chip>
        }
      />
    )
  }
  const qa = splitQuestion(text)
  if (qa) {
    return (
      <CitedText
        text={qa.answer}
        notes={notes}
        asOf={asOf}
        prefix={<span className="font-semibold">{qa.question} </span>}
      />
    )
  }
  return <CitedText text={text} notes={notes} asOf={asOf} />
}

/** The facts no sentence cited: there to show what the brief was written from, folded away. */
function MoreFacts({ facts, total }: { facts: RmBrief['facts']; total: number }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="mt-5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-sm text-caption text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <ChevronDown
          aria-hidden
          className={cn('size-3.5 transition-transform duration-150', open && 'rotate-180')}
        />
        {open ? 'Hide' : 'Show'} the other {facts.length} of {total} facts it was written from
      </button>
      {open ? (
        <div id={id} className="mt-3">
          <OtherFacts facts={facts} />
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Loading */

/**
 * While the brief is written: what is happening, how long it has taken, and the shape of what is
 * coming. The seconds are real; nothing pretends to type words that do not exist yet.
 */
function BriefLoading({ name, startedAt }: { name: string; startedAt: number | null }) {
  const elapsed = useElapsed(startedAt)
  return (
    <LoadingRegion label={`Writing ${possessive(name)} brief`} className="grid gap-7">
      <div className="grid gap-2">
        <p className="flex items-center gap-2 text-label text-ink">
          <PulseDot />
          Writing {possessive(name)} brief
          {elapsed >= 2 ? (
            <span className="font-normal tabular text-ink-faint">· {elapsed} s</span>
          ) : null}
        </p>
        <p className="text-caption font-normal text-ink-faint">
          {elapsed >= 9
            ? 'Taking longer than usual. Each sentence is still checked against its facts.'
            : 'From the facts on the record. Each sentence is checked against the facts it cites before it is shown.'}
        </p>
      </div>
      {[3, 3, 2, 3].map((lines, i) => (
        <div key={i} className="grid gap-3">
          <Skeleton className="h-3 w-32" />
          <SkeletonText lines={lines} />
        </div>
      ))}
    </LoadingRegion>
  )
}

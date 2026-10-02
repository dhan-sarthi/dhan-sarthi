import type { CitedSentence, FactId, RmBrief } from '@dhan/contracts'
import { ChevronDown, FileText, RotateCw } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { cn } from '../../lib/cn.ts'
import {
  AiLabel,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingRegion,
  SectionLabel,
  SEVERITY,
  SEVERITY_ICON,
  SeverityChip,
  Skeleton,
  SkeletonText,
  describeError,
} from '../../ui/index.ts'
import { CitedText, OtherFacts, SourcesList } from './Citations.tsx'
import { leadOf, notesFor, numberCitations, splitQuestion, uncited, type Footnote } from './cite.ts'
import { possessive, writtenAt } from './names.ts'
import { PulseDot } from './PulseDot.tsx'
import { useBriefSession, type BriefEntry } from './session.ts'
import { briefTiles, type BriefTile, type TileSource } from './tiles.ts'
import { useElapsed } from './useElapsed.ts'

interface BriefProps {
  cif: string
  /** First name, as the copy uses it. */
  name: string
  /** The record's date, already formatted: "1 Sep 2026". */
  asOf: string
  /** The open file, for the tiles: the signals, the plan, the money. */
  file: TileSource
  onAsk: () => void
}

/** Points shown per section before "Show all": three is what an RM takes in before dialling. */
const SECTION_MAX = 3

type Notes = ReadonlyMap<FactId, Footnote>

/**
 * Brief me: a meeting-prep brief, every sentence footnoted to the facts it rests on. It is written
 * the moment the RM asks for it (opening this tab is the asking), and kept for the session so
 * flicking between tabs costs nothing. "Write again" asks for a fresh one and keeps this one on
 * screen until it lands.
 */
export function BriefView({ cif, name, asOf, file, onAsk }: BriefProps) {
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
      file={file}
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
  file,
  onRegenerate,
  onAsk,
}: {
  brief: RmBrief
  entry: BriefEntry
  name: string
  asOf: string
  file: TileSource
  onRegenerate: () => void
  onAsk: () => void
}) {
  const sections = useMemo(
    () => brief.sections.filter((s) => s.sentences.length > 0),
    [brief.sections],
  )
  const tiles = useMemo(() => briefTiles(file, brief.facts), [file, brief.facts])
  // The tiles are read first, so their facts take the first numbers; the sentences follow, down
  // the page, whether or not a section is folded.
  const notes = useMemo(
    () =>
      numberCitations(
        [
          ...tiles.map((t) => ({ text: t.value, cites: t.cites })),
          ...sections.flatMap((s) => s.sentences),
        ],
        brief.facts,
      ),
    [tiles, sections, brief.facts],
  )
  const rest = useMemo(() => uncited(brief.facts, notes), [brief.facts, notes])
  const rewriting = entry.status === 'loading'

  return (
    <div className="grid gap-6">
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
          className={cn('grid gap-6 transition-opacity duration-200', rewriting && 'opacity-50')}
        >
          {tiles.length > 0 ? <TileRow tiles={tiles} notes={notes} asOf={asOf} /> : null}
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

/* ---------------------------------------------------------------- Tiles */

/**
 * Three things to have in hand before dialling, after Rox's footnoted report tiles: each is one
 * word or figure, the record's line under it, and the footnote that vouches for both.
 */
function TileRow({ tiles, notes, asOf }: { tiles: BriefTile[]; notes: Notes; asOf: string }) {
  return (
    <ul
      aria-label="At a glance"
      className={cn('grid gap-2', tiles.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}
    >
      {tiles.map((tile) => (
        <li
          key={tile.id}
          className="grid min-w-0 content-start gap-1 rounded-lg bg-ground px-2.5 pt-2.5 pb-3"
        >
          <p className="flex items-center gap-1 text-micro tracking-micro text-ink-faint uppercase">
            {tile.severity ? <SeverityMark severity={tile.severity} /> : null}
            {tile.label}
          </p>
          <p
            className={cn('text-heading text-balance text-ink', /\d/.test(tile.value) && 'tabular')}
          >
            {tile.value}
          </p>
          <p className="text-caption font-normal text-pretty text-ink-soft">
            <CitedText
              text={tile.detail}
              notes={notesFor({ text: tile.detail, cites: tile.cites }, notes)}
              asOf={asOf}
            />
          </p>
        </li>
      ))}
    </ul>
  )
}

/**
 * The severity's shape and colour beside the eyebrow, with its word for a screen reader: a tile
 * has no room for the chip, and the value below it needs the full width.
 */
function SeverityMark({ severity }: { severity: NonNullable<BriefTile['severity']> }) {
  const Icon = SEVERITY_ICON[severity]
  const tone =
    severity === 'urgent'
      ? 'text-danger'
      : severity === 'important'
        ? 'text-streak-ink'
        : 'text-brand'
  return (
    <>
      <Icon aria-hidden className={cn('size-3.5 shrink-0', tone)} />
      <span className="sr-only">{SEVERITY[severity].label}: </span>
    </>
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
  sentences: readonly CitedSentence[]
  notes: Notes
  asOf: string
}) {
  const id = useId()
  const listId = `${id}-list`
  const [all, setAll] = useState(false)
  const hidden = sentences.length - SECTION_MAX
  const shown = all || hidden <= 0 ? sentences : sentences.slice(0, SECTION_MAX)
  return (
    <section aria-labelledby={id}>
      <SectionLabel as="h3" id={id} className="mb-3">
        {title}
      </SectionLabel>
      <ul id={listId} className="grid gap-2.5">
        {shown.map((sentence, i) => (
          <li key={i} className="grid grid-cols-[0.75rem_minmax(0,1fr)] text-body text-ink">
            <span aria-hidden className="mt-[0.5625rem] size-1 rounded-full bg-ink-hint" />
            <p className="text-pretty">
              <Sentence text={sentence.text} notes={notesFor(sentence, notes)} asOf={asOf} />
            </p>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={all}
          aria-controls={listId}
          onClick={() => setAll((v) => !v)}
          className="mt-2 ml-3 inline-flex items-center gap-1 rounded-sm text-caption text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
        >
          <ChevronDown
            aria-hidden
            className={cn('size-3.5 transition-transform duration-150', all && 'rotate-180')}
          />
          {all ? 'Show fewer' : `Show all ${sentences.length}`}
        </button>
      ) : null}
    </section>
  )
}

/**
 * One brief sentence. A talking point the server tagged "Urgent:" (from the signal's own
 * severity) gets the console's severity chip in its place, the same "Act now" as everywhere else;
 * a "They may ask" line that opens with a question gets the question in weight. Either way the
 * words are the server's, in the server's order.
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
          <SeverityChip severity={lead.lead} className="mr-1.5 -translate-y-px align-middle" />
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

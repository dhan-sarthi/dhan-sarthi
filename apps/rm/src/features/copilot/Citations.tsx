import type { Fact, FactId } from '@dhan/contracts'
import { SIGNAL_LABELS } from '@dhan/core'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/index.ts'
import { SOURCE_KIND_LABEL, sourceRef, type Footnote } from './cite.ts'

/*
 * Footnotes, after Rox's report: every sentence ends in the numbers of the facts it rests on, and
 * each number opens the fact itself and where it came from. The facts are the server's, assembled
 * before any model saw them, so this is the RM's way to check a sentence without leaving the panel.
 */

/** "Signal · Expensive card debt", "Advice record", "Statement". */
export function sourceKindLine(fact: Fact): string {
  const kind = SOURCE_KIND_LABEL[fact.source.kind]
  if (fact.source.kind === 'insight' && fact.source.ref) {
    // The ref is the insight's kind; a kind the label table does not know is shown as the kind.
    const label = (SIGNAL_LABELS as Readonly<Record<string, string | undefined>>)[fact.source.ref]
    return label ? `${kind} · ${label}` : kind
  }
  return kind
}

const HOVER_OPEN_MS = 120
const HOVER_CLOSE_MS = 180

/**
 * One footnote number. It opens on hover for a mouse, and on click or Enter for everyone; a click
 * on a number already opened by hover keeps it open rather than closing it, since that is what
 * the RM meant. Focus stays on the number, so arrowing through a sentence is not interrupted, and
 * Esc closes the note without closing the panel around it.
 */
export function FootnoteMarker({ note, asOf }: { note: Footnote; asOf: string }) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function later(next: boolean, ms: number) {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(next), ms)
  }

  function onOpenChange(next: boolean) {
    window.clearTimeout(timer.current)
    setOpen(next)
    setPinned(next)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) event.stopPropagation()
  }

  const { fact, n } = note
  const ref = sourceRef(fact.source)
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Source ${n}: ${fact.text}`}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse' && !pinned) later(true, HOVER_OPEN_MS)
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse' && !pinned) later(false, HOVER_CLOSE_MS)
          }}
          onClick={(e) => {
            // Opened by hover: the click pins it instead of toggling it shut.
            if (open && !pinned) {
              e.preventDefault()
              setPinned(true)
            }
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'relative -top-px mx-px inline-flex h-4 min-w-4 items-center justify-center rounded-xs px-1 align-baseline',
            'text-micro leading-none tracking-normal tabular',
            'bg-ground-deep text-ink-soft transition-colors duration-150',
            'hover:bg-brand-soft hover:text-brand-deep',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
            'data-[state=open]:bg-brand data-[state=open]:text-on-brand',
          )}
        >
          {n}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-80 p-0"
        // Focus never moves for a footnote: it holds no controls, and pulling focus into it (or
        // back to the number on close) would scroll the panel and draw a ring nobody asked for.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={() => window.clearTimeout(timer.current)}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse' && !pinned) later(false, HOVER_CLOSE_MS)
        }}
        onKeyDown={onKeyDown}
      >
        <div className="grid gap-1.5 px-4 pt-3.5 pb-3">
          <p className="flex items-center gap-2 text-caption text-ink-faint">
            <NumberPill n={n} />
            {sourceKindLine(fact)}
          </p>
          <p className="text-label font-normal text-ink">{fact.text}</p>
        </div>
        <p className="flex items-center justify-between gap-3 rounded-b-lg border-t border-hairline-soft bg-canvas-top/60 px-4 py-2 text-caption font-normal text-ink-faint">
          <span>From the record as at {asOf}</span>
          <span className="tabular">{ref ? `${ref} · ${fact.id}` : fact.id}</span>
        </p>
      </PopoverContent>
    </Popover>
  )
}

function NumberPill({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-xs bg-ground-deep px-1 text-micro leading-none tracking-normal tabular text-ink-soft',
        className,
      )}
    >
      {n}
    </span>
  )
}

/**
 * A sentence and its footnotes. The last word travels with the numbers, so a line never breaks
 * between a sentence and the markers that vouch for it. `prefix` is drawn before the text (a
 * severity tag, a question in bold) and is part of the same sentence the server checked.
 */
export function CitedText({
  text,
  notes,
  asOf,
  prefix,
}: {
  text: string
  notes: readonly Footnote[]
  asOf: string
  prefix?: ReactNode
}) {
  const words = text.trim()
  if (notes.length === 0) {
    return (
      <>
        {prefix}
        {words}
      </>
    )
  }
  const cut = words.lastIndexOf(' ')
  return (
    <>
      {prefix}
      {cut > 0 ? words.slice(0, cut + 1) : ''}
      <span className="whitespace-nowrap">
        {cut > 0 ? words.slice(cut + 1) : words}
        <span className="ml-1 inline-flex gap-0.5">
          {notes.map((note) => (
            <FootnoteMarker key={note.fact.id} note={note} asOf={asOf} />
          ))}
        </span>
      </span>
    </>
  )
}

/**
 * The cited facts in footnote order, each with where it came from: what an RM reads to check the
 * brief end to end, or prints for the file.
 */
export function SourcesList({
  notes,
  className,
}: {
  notes: ReadonlyMap<FactId, Footnote>
  className?: string
}) {
  const list = [...notes.values()].sort((a, b) => a.n - b.n)
  return (
    <ol className={cn('grid gap-3', className)}>
      {list.map(({ n, fact }) => (
        <li key={fact.id} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
          <NumberPill n={n} className="mt-px" />
          <div className="min-w-0">
            <p className="text-label font-normal text-ink-soft">{fact.text}</p>
            <p className="mt-0.5 text-caption font-normal text-ink-hint">
              {sourceKindLine(fact)}
              {sourceRef(fact.source) ? ` · ${sourceRef(fact.source) ?? ''}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Facts the server assembled that no sentence used: shown on request, never numbered. */
export function OtherFacts({ facts }: { facts: readonly Fact[] }) {
  return (
    <ul className="grid gap-3">
      {facts.map((fact) => (
        <li key={fact.id} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
          <span aria-hidden className="mt-2 size-1 justify-self-center rounded-full bg-ink-hint" />
          <div className="min-w-0">
            <p className="text-label font-normal text-ink-soft">{fact.text}</p>
            <p className="mt-0.5 text-caption font-normal text-ink-hint">{sourceKindLine(fact)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

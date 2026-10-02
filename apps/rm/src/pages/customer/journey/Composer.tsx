import type { JourneyEvent, RmJourney } from '@dhan/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { CircleAlert } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { keys, useAddNote } from '../../../api/queries.ts'
import { useSession } from '../../../api/session.ts'
import { formatDate } from '../../../lib/format.ts'
import {
  Avatar,
  Button,
  Kbd,
  Textarea,
  ToggleGroup,
  describeError,
  modKey,
} from '../../../ui/index.ts'
import { KIND_OPTIONS, type NoteKind } from '../NoteDialog.tsx'

type Kind = NoteKind

const MAX = 2000

const COPY: Record<Kind, { placeholder: string; save: string }> = {
  note: {
    placeholder: 'Anything the next person to open this file should know.',
    save: 'Add note',
  },
  call: {
    placeholder: 'Who you spoke to, what they asked, and what happens next.',
    save: 'Log call',
  },
}

/**
 * The note box at the top of the journey. Closed, it is one quiet line with the RM's own avatar;
 * opened, a text box with a note-or-call switch and the date it will carry (the RM clock, not
 * the wall clock, so it lands in the right month of the timeline).
 *
 * On save the event the API returns is put at the head of the cached journey at once, so it
 * appears without waiting for the refetch the mutation also triggers. A failed save keeps the
 * text and says why beside it; nothing typed is ever lost to an error.
 */
export function Composer({
  cif,
  name,
  asOf,
  onAdded,
}: {
  cif: string
  /** First name, for the prompt. */
  name: string
  /** The RM clock: the date the note will carry. Null while the file is still loading. */
  asOf: string | null
  onAdded: (event: JourneyEvent) => void
}) {
  const session = useSession()
  const client = useQueryClient()
  const save = useAddNote(cif)
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('note')
  const [text, setText] = useState('')
  const [tooShort, setTooShort] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    const body = text.trim()
    if (body.length === 0) {
      setTooShort(true)
      area.current?.focus()
      return
    }
    try {
      const reply = await save.mutateAsync({ kind, text: body })
      client.setQueryData<RmJourney>(keys.journey(cif), (old) =>
        old ? { events: [reply.event, ...old.events.filter((e) => e.id !== reply.event.id)] } : old,
      )
      onAdded(reply.event)
      setText('')
      setKind('note')
      setOpen(false)
    } catch {
      // Shown from the mutation's own error state below; the text stays where it was.
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void submit()
    }
    if (event.key === 'Escape' && !save.isPending) {
      event.preventDefault()
      // Closing keeps the draft: Escape is "not now", not "throw it away".
      setOpen(false)
      save.reset()
    }
  }

  const rm = session?.rm
  const avatar = rm ? (
    <Avatar name={rm.name} initials={rm.initials} tone="brand" size="sm" className="mt-1" />
  ) : null

  if (!open) {
    return (
      <div className="flex items-start gap-3">
        {avatar}
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            requestAnimationFrame(() => area.current?.focus())
          }}
          className="flex h-control w-full items-center rounded-md border border-hairline bg-surface px-3 text-left text-body text-ink-hint shadow-raised transition-colors hover:border-hover-edge focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span className="truncate">
            {text.trim() ? text : `Add a note or log a call on ${name}’s journey`}
          </span>
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-3" aria-label="Add to the journey">
      {avatar}
      <div className="grid min-w-0 flex-1 gap-2.5">
        <Textarea
          ref={area}
          rows={3}
          maxLength={MAX}
          value={text}
          aria-label={kind === 'call' ? 'What was said on the call' : 'Note'}
          aria-describedby={hintId}
          aria-invalid={tooShort || undefined}
          placeholder={COPY[kind].placeholder}
          onChange={(e) => {
            setText(e.target.value)
            if (tooShort) setTooShort(false)
          }}
          onKeyDown={onKeyDown}
          disabled={save.isPending}
        />
        {save.isError ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-label-plain text-danger"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>It was not saved. {describeError(save.error)} The text is still here.</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup
            label="This is"
            showLabel
            value={kind}
            onChange={setKind}
            options={KIND_OPTIONS}
            disabled={save.isPending}
            size="md"
          />
          <div className="flex items-center gap-3">
            <p id={hintId} className="text-caption-plain text-ink-faint">
              {tooShort ? (
                <span className="text-danger">Write a line or two first.</span>
              ) : (
                <>
                  {asOf ? <>Dated {formatDate(asOf)} · </> : null}
                  <Kbd>{modKey()}</Kbd>
                  <Kbd>↵</Kbd> to save
                </>
              )}
            </p>
            <Button
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => {
                setOpen(false)
                save.reset()
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" loading={save.isPending}>
              {save.isError ? 'Try again' : COPY[kind].save}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}

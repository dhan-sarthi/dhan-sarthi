import type { Handoff } from '@dhan/contracts'
import { CircleAlert } from 'lucide-react'
import { useId, useState } from 'react'
import { useAddNote } from '../../api/queries.ts'
import { formatCount, formatDate } from '../../lib/format.ts'
import { Button, describeError, Textarea, toast } from '../../ui/index.ts'
import { firstName } from './derive.ts'
import { useHandoffAction } from './useHandoffAction.ts'

const MAX = 2000

/**
 * Logging a call in place, under the opener the RM just used. Inline rather than a modal: the
 * queue row is the context (who, why, what was suggested), and a dialog would cover it.
 *
 * On a row the customer raised, the same save can mark their request contacted, ticked by
 * default because a logged call to someone who asked for one is exactly that. If the note saves
 * and the status change does not, the note is kept and the request says so on its own card.
 * A failed save keeps the text where it was, with the reason beside the button.
 */
export function LogCall({
  cif,
  name,
  asOf,
  handoff,
  draft,
  onDraft,
  onCancel,
  onSaved,
}: {
  cif: string
  name: string
  asOf: string
  /** The open request behind this row, if the customer asked for the call. */
  handoff: Handoff | null
  /** What was typed before the row was last closed; kept by the queue, per customer. */
  draft: string
  onDraft: (text: string) => void
  onCancel: () => void
  onSaved: () => void
}) {
  const id = useId()
  const [text, setText] = useState(draft)
  const [markContacted, setMarkContacted] = useState(true)
  const addNote = useAddNote(cif)
  const handoffAction = useHandoffAction()
  const who = firstName(name)
  const trimmed = text.trim()
  const over = text.length > MAX

  /** Cancel is the one deliberate way to throw a note away. */
  function cancel() {
    onDraft('')
    onCancel()
  }

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault()
    if (trimmed === '' || over || addNote.isPending) return
    try {
      await addNote.mutateAsync({ kind: 'call', text: trimmed })
    } catch {
      // The reason is drawn beside the button from the mutation's own error.
      return
    }
    toast.success('Call logged', {
      description: `On ${who}’s journey for ${formatDate(asOf)}.`,
    })
    onDraft('')
    // Started before the form closes; the request's own card shows how it went.
    if (handoff && markContacted) void handoffAction.run(handoff, 'contacted')
    onSaved()
  }

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-1 gap-3"
      aria-label={`Log a call with ${name}`}
    >
      <div className="grid grid-cols-1 gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`${id}-text`} className="text-label text-ink">
            What was said
          </label>
          <span
            className={
              over ? 'text-caption text-danger tabular' : 'text-caption text-ink-hint tabular'
            }
            aria-live="polite"
          >
            {text.length > MAX - 200 ? `${formatCount(MAX - text.length)} left` : ''}
          </span>
        </div>
        <Textarea
          id={`${id}-text`}
          rows={3}
          autoFocus
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            onDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            // Escape closes an empty form only: it should never be the key that loses a note.
            if (event.key === 'Escape' && text.trim() === '') cancel()
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit(event)
          }}
          placeholder={`What ${who} asked, what you agreed, and what happens next.`}
          aria-invalid={over || addNote.isError || undefined}
          aria-describedby={addNote.isError ? `${id}-error` : undefined}
        />
      </div>

      {handoff ? (
        <label className="flex items-center gap-2 text-label font-normal text-ink-soft">
          <input
            type="checkbox"
            checked={markContacted}
            onChange={(event) => setMarkContacted(event.target.checked)}
            className="size-4 accent-brand"
          />
          Also mark {who}’s request as contacted
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          loading={addNote.isPending}
          disabled={trimmed === '' || over}
        >
          Save call
        </Button>
        <Button type="button" variant="ghost" onClick={cancel} disabled={addNote.isPending}>
          Cancel
        </Button>
        {addNote.isError ? (
          <p
            id={`${id}-error`}
            role="alert"
            className="flex items-center gap-1.5 text-caption text-danger"
          >
            <CircleAlert aria-hidden className="size-3.5 shrink-0" />
            Not saved. {describeError(addNote.error)}
          </p>
        ) : null}
      </div>
    </form>
  )
}

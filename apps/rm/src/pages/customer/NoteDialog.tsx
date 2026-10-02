import { CircleAlert, Phone, StickyNote } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useAddNote } from '../../api/queries.ts'
import { cn } from '../../lib/cn.ts'
import { formatDate } from '../../lib/format.ts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Textarea,
  describeError,
  toast,
} from '../../ui/index.ts'

export type NoteKind = 'call' | 'note'

const MAX = 2000

const COPY: Record<
  NoteKind,
  { title: string; field: string; placeholder: string; save: string; saved: string }
> = {
  call: {
    title: 'Log a call',
    field: 'What was said',
    placeholder: 'Who you spoke to, what they asked, and what happens next.',
    save: 'Log call',
    saved: 'Call logged',
  },
  note: {
    title: 'Add a note',
    field: 'Note',
    placeholder: 'Anything the next person to open this file should know.',
    save: 'Add note',
    saved: 'Note added',
  },
}

/**
 * Logging a call or writing a note: the one form on the file. A modal because it is a write to the
 * customer's journey and the access log, and the RM should finish or cancel it before anything
 * else on the page moves.
 *
 * When the save fails the text stays where it was, the error says so in plain words beside it,
 * and nothing is lost by trying again. A toast only ever confirms success.
 */
export function NoteDialog({
  cif,
  name,
  asOf,
  kind,
  onKindChange,
  onClose,
}: {
  cif: string
  /** First name, for the copy: "On Karan's journey". */
  name: string
  asOf: string
  /** Null while closed. */
  kind: NoteKind | null
  onKindChange: (kind: NoteKind) => void
  onClose: () => void
}) {
  const save = useAddNote(cif)
  const [text, setText] = useState('')
  const [tooShort, setTooShort] = useState(false)
  const open = kind !== null
  const copy = COPY[kind ?? 'note']

  // A new open starts clean of the last attempt's error; the draft itself is kept until it saves.
  const { reset } = save
  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (kind === null) return
    const body = text.trim()
    if (body.length === 0) {
      setTooShort(true)
      return
    }
    try {
      await save.mutateAsync({ kind, text: body })
      toast.success(copy.saved, {
        description: `On ${name}’s journey, dated ${formatDate(asOf)}.`,
      })
      setText('')
      onClose()
    } catch {
      // The error is rendered from the mutation's own state below; the draft stays.
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !save.isPending ? onClose() : null)}>
      <DialogContent width="md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader
            title={copy.title}
            description={`It goes on ${name}’s journey and in your access log.`}
          />
          <KindSwitch value={kind ?? 'note'} onChange={onKindChange} disabled={save.isPending} />
          <Field
            label={copy.field}
            error={tooShort ? 'Write a line or two first.' : undefined}
            hint={`${text.trim().length.toLocaleString('en-IN')} of ${MAX.toLocaleString('en-IN')} characters`}
          >
            {(control) => (
              <Textarea
                {...control}
                autoFocus
                rows={5}
                maxLength={MAX}
                placeholder={copy.placeholder}
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  if (tooShort) setTooShort(false)
                }}
              />
            )}
          </Field>
          {save.isError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-label font-normal text-danger"
            >
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p>It was not saved. {describeError(save.error)} Your text is still here.</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              {save.isError ? 'Try again' : copy.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Call or note, as a two-way switch rather than two forms: the RM who opened "Add note" and
 * realises it was a call changes one control, not the whole dialog.
 */
function KindSwitch({
  value,
  onChange,
  disabled,
}: {
  value: NoteKind
  onChange: (kind: NoteKind) => void
  disabled: boolean
}) {
  const id = useId()
  const options: { kind: NoteKind; label: string; icon: typeof Phone }[] = [
    { kind: 'call', label: 'A call', icon: Phone },
    { kind: 'note', label: 'A note', icon: StickyNote },
  ]
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="grid gap-1.5">
      <span id={`${id}-label`} className="text-label text-ink">
        This is
      </span>
      <div className="inline-flex w-fit rounded-md bg-ground-deep p-0.5">
        {options.map(({ kind, label, icon: Icon }) => {
          const active = value === kind
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(kind)}
              className={cn(
                'inline-flex h-control-sm items-center gap-1.5 rounded-sm px-3 text-label transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-45',
                active ? 'bg-surface text-ink shadow-raised' : 'text-ink-soft hover:text-ink',
              )}
            >
              <Icon aria-hidden className="size-3.5" />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

import {
  CalendarClock,
  CircleAlert,
  MessageSquare,
  Phone,
  PhoneMissed,
  StickyNote,
} from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useAddNote, useUpdateHandoff } from '../../api/queries.ts'
import { cn } from '../../lib/cn.ts'
import { daysBetween, formatDate } from '../../lib/format.ts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  Textarea,
  describeError,
  toast,
} from '../../ui/index.ts'
import { pronoun, waited, type OpenRequest } from './next-actions.ts'

export type NoteKind = 'call' | 'note'

/** How the call went: what a desk logs first, before anything that was said. */
type Outcome = 'spoke' | 'no_answer' | 'call_back'

const MAX = 2000

const OUTCOMES: { id: Outcome; label: string; icon: typeof Phone }[] = [
  { id: 'spoke', label: 'Spoke', icon: MessageSquare },
  { id: 'no_answer', label: 'No answer', icon: PhoneMissed },
  { id: 'call_back', label: 'Call back on…', icon: CalendarClock },
]

/** A calendar date some days on from another. UTC, as the simulation's calendar is. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10)
}

/**
 * The line that goes on the journey for a call: the outcome first, in the RM's words, then
 * whatever they typed. "Spoke with Karan. Agreed to start with the card." The outcome alone is a
 * complete entry, so the free text is optional on a call.
 */
function callEntry(outcome: Outcome, name: string, callBack: string, text: string): string {
  const head =
    outcome === 'spoke'
      ? `Spoke with ${name}.`
      : outcome === 'no_answer'
        ? `Called ${name}, no answer.`
        : `Spoke with ${name}; call back on ${formatDate(callBack)}.`
  return text ? `${head} ${text}` : head
}

/**
 * Logging a call or writing a note: the one form on the file. A modal because it is a write to the
 * customer's journey and the access log, and the RM should finish or cancel it before anything
 * else on the page moves.
 *
 * A call starts from its outcome (spoke, no answer, call back on a date), which is what the queue
 * and "last active" need; what was said is optional. Where the customer asked for the call, the
 * same save can close their request: resolved after a conversation, contacted when a call back is
 * agreed, and left open after no answer, which says so.
 *
 * When the save fails the text stays where it was, the error says so in plain words beside it,
 * and nothing is lost by trying again. A toast only ever confirms success.
 */
export function NoteDialog({
  cif,
  name,
  gender,
  asOf,
  request,
  kind,
  onKindChange,
  onClose,
}: {
  cif: string
  /** First name, for the copy: "On Karan's journey". */
  name: string
  gender: string
  asOf: string
  /** The customer's open request to talk, if any: the call can close it. */
  request: OpenRequest | null
  /** Null while closed. */
  kind: NoteKind | null
  onKindChange: (kind: NoteKind) => void
  onClose: () => void
}) {
  const id = useId()
  const save = useAddNote(cif)
  const handoff = useUpdateHandoff()
  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState<Outcome>('spoke')
  const [callBack, setCallBack] = useState(() => addDays(asOf, 2))
  const [closeRequest, setCloseRequest] = useState(true)
  const [tooShort, setTooShort] = useState(false)
  const open = kind !== null
  const isCall = kind === 'call'
  const body = text.trim()
  const status =
    !request || outcome === 'no_answer' ? null : outcome === 'spoke' ? 'resolved' : 'contacted'
  const pending = save.isPending || handoff.isPending

  // A new open starts clean of the last attempt's error; the draft itself is kept until it saves.
  const { reset } = save
  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (kind === null) return
    if (kind === 'note' && body.length === 0) {
      setTooShort(true)
      return
    }
    const entry = kind === 'call' ? callEntry(outcome, name, callBack, body) : body
    try {
      await save.mutateAsync({ kind, text: entry })
    } catch {
      // The error is rendered from the mutation's own state below; the draft stays.
      return
    }
    const closing = kind === 'call' && request !== null && status !== null && closeRequest
    toast.success(kind === 'call' ? 'Call logged' : 'Note added', {
      description: `On ${name}’s journey, dated ${formatDate(asOf)}.`,
    })
    setText('')
    setOutcome('spoke')
    setCloseRequest(true)
    onClose()
    if (closing) {
      try {
        // The API closes the request's line with its own full stop.
        await handoff.mutateAsync({
          handoffId: request.id,
          status,
          note: entry.replace(/\.$/, ''),
        })
        toast.success(status === 'resolved' ? 'Request resolved' : 'Request marked contacted', {
          description:
            status === 'resolved'
              ? `${name}’s request is off the Asked for you list.`
              : `${name}’s request stays on Asked for you, marked contacted.`,
        })
      } catch (error) {
        // The call itself is saved; only the request's status did not change, and it says so.
        toast.error('The call is logged, but the request is still open', {
          description: describeError(error),
        })
      }
    }
  }

  const who = pronoun(gender)
  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !pending ? onClose() : null)}>
      <DialogContent width="md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader
            title={isCall ? 'Log a call' : 'Add a note'}
            description={`It goes on ${name}’s journey and in your access log.`}
          />
          <KindSwitch value={kind ?? 'note'} onChange={onKindChange} disabled={pending} />

          {isCall ? (
            <div role="group" aria-labelledby={`${id}-outcome`} className="grid gap-1.5">
              <span id={`${id}-outcome`} className="text-label text-ink">
                How it went
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {OUTCOMES.map(({ id: value, label, icon: Icon }, i) => {
                  const active = outcome === value
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={active}
                      // The first chip takes the dialog's focus: one Enter logs "Spoke".
                      autoFocus={i === 0}
                      disabled={pending}
                      onClick={() => setOutcome(value)}
                      className={cn(
                        'inline-flex h-control-sm items-center gap-1.5 rounded-full border px-3 text-label transition-colors duration-150',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45',
                        active
                          ? 'border-brand bg-brand-soft text-brand-deep'
                          : 'border-hairline bg-surface text-ink-soft hover:text-ink',
                      )}
                    >
                      <Icon aria-hidden className="size-3.5" />
                      {label}
                    </button>
                  )
                })}
                {outcome === 'call_back' ? (
                  <Input
                    type="date"
                    aria-label="Call back on"
                    value={callBack}
                    min={addDays(asOf, 1)}
                    onChange={(e) => setCallBack(e.target.value || callBack)}
                    className="w-40"
                    disabled={pending}
                  />
                ) : null}
              </div>
              {outcome === 'call_back' ? (
                <p className="text-caption font-normal text-ink-faint">
                  In {Math.max(1, daysBetween(asOf, callBack))} day
                  {Math.max(1, daysBetween(asOf, callBack)) === 1 ? '' : 's'}, from{' '}
                  {formatDate(asOf)}.
                </p>
              ) : null}
            </div>
          ) : null}

          <Field
            label={isCall ? 'What was said' : 'Note'}
            corner={
              isCall ? <span className="text-caption text-ink-hint">Optional</span> : undefined
            }
            error={tooShort ? 'Write a line or two first.' : undefined}
            hint={`${body.length.toLocaleString('en-IN')} of ${MAX.toLocaleString('en-IN')} characters`}
          >
            {(control) => (
              <Textarea
                {...control}
                autoFocus={!isCall}
                rows={isCall ? 3 : 5}
                maxLength={MAX}
                placeholder={
                  isCall
                    ? `What ${name} asked, what you agreed, and what happens next.`
                    : 'Anything the next person to open this file should know.'
                }
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  if (tooShort) setTooShort(false)
                }}
              />
            )}
          </Field>

          {isCall && request ? (
            status ? (
              <label className="flex items-start gap-2 rounded-md bg-canvas-top px-3 py-2.5 text-label font-normal text-ink-soft">
                <input
                  type="checkbox"
                  checked={closeRequest}
                  disabled={pending}
                  onChange={(e) => setCloseRequest(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-brand"
                />
                <span>
                  Mark {name}’s request {status === 'resolved' ? 'resolved' : 'contacted'}
                  <span className="block text-caption text-ink-faint">
                    {name} asked to talk {waited(request.waitingDays)}
                    {request.reason ? `; on the file that day: ${request.reason}` : ''}.
                  </span>
                </span>
              </label>
            ) : (
              <p className="rounded-md bg-canvas-top px-3 py-2.5 text-caption font-normal text-ink-soft">
                {name}’s request stays open: {who} asked {waited(request.waitingDays)} and is still
                waiting for a conversation.
              </p>
            )
          ) : null}

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
            <Button onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              {save.isError ? 'Try again' : isCall ? 'Log call' : 'Add note'}
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
    <div role="group" aria-labelledby={`${id}-label`} className="flex items-center gap-3">
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

import { Eye, LockKeyhole } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isApiError } from '../api/client.ts'
import { cn } from '../lib/cn.ts'
import { Button } from './Button.tsx'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from './Dialog.tsx'
import { Field, Input, Textarea } from './Field.tsx'

export interface MaskedFieldProps {
  label: string
  /** As the API masks it: "•• ••• 1987". */
  masked: string
  /** Asks the server to unmask. Resolves with the value; the server logs the reason. */
  onReveal: (reason: string) => Promise<string>
  /**
   * The desk's usual reasons, most often first. Given, the dialog offers them as choices (the
   * first one focused) with the RM's own words behind "Other…", so the access log reads the same
   * purpose in the same words; left out, it asks for the reason as free text.
   */
  reasons?: readonly string[]
  /**
   * Keeps the caption for screen readers only, for a field inside a property row whose own
   * label already says what it is. The dialog still names the field.
   */
  hideLabel?: boolean
  /** `stacked`: caption over the value. `inline`: the value and its action on one line. */
  layout?: 'stacked' | 'inline'
  className?: string
}

const MIN_REASON = 5
const OTHER = 'other'

/**
 * A protected value: masked by default, revealed only with a reason, and the reveal is written to
 * the access log by the server. The value is held in this component's state only, never cached,
 * so leaving the page masks it again.
 *
 * After a reveal the Reveal button is gone, so focus moves to the value itself rather than
 * dropping to the page: a screen reader hears the value and "Revealed and logged".
 */
export function MaskedField({
  label,
  masked,
  onReveal,
  reasons,
  hideLabel = false,
  layout = 'stacked',
  className,
}: MaskedFieldProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [value, setValue] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const revealed = useRef<HTMLSpanElement>(null)
  const justRevealed = useRef(false)

  const choosing = reasons !== undefined && reasons.length > 0
  const reason = choosing ? (choice === OTHER ? text.trim() : choice) : text.trim()

  useEffect(() => {
    if (value === null || !justRevealed.current) return
    justRevealed.current = false
    // The frame after the dialog starts closing: its trap is off, and its own focus return then
    // finds focus already placed and leaves it.
    const frame = requestAnimationFrame(() => revealed.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [value])

  function reset() {
    setChoice(null)
    setText('')
    setError(null)
  }

  function close() {
    if (pending) return
    setOpen(false)
    reset()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!reason) {
      setError('Choose why you need it. It goes in the access log.')
      return
    }
    if (reason.length < MIN_REASON) {
      setError('Say why you need it, in a few words. It goes in the access log.')
      return
    }
    setPending(true)
    setError(null)
    try {
      const unmasked = await onReveal(reason)
      justRevealed.current = true
      setValue(unmasked)
      setOpen(false)
      reset()
    } catch (e) {
      setError(isApiError(e) ? e.message : 'The value could not be revealed. Try again.')
    } finally {
      setPending(false)
    }
  }

  const line = (
    <div className={cn('flex items-center gap-2', layout === 'inline' && 'contents')}>
      <span
        ref={revealed}
        tabIndex={value ? -1 : undefined}
        className={cn(
          'rounded-xs tabular text-label outline-none focus-visible:outline-2 focus-visible:outline-focus',
          value ? 'text-ink' : 'tracking-wide text-ink-soft',
        )}
      >
        {value ?? masked}
        {value ? <span className="sr-only">. Revealed and logged.</span> : null}
      </span>
      {value ? (
        <span aria-hidden className="inline-flex items-center gap-1 text-caption text-ink-faint">
          <LockKeyhole className="size-3" />
          Revealed and logged
        </span>
      ) : (
        <Button
          variant="link"
          size="sm"
          className="relative text-caption pointer-coarse:hit-target"
          icon={<Eye aria-hidden />}
          onClick={() => setOpen(true)}
        >
          Reveal
          <span className="sr-only"> {label.toLowerCase()}</span>
        </Button>
      )}
    </div>
  )

  return (
    <div
      className={cn(
        layout === 'inline' ? 'flex flex-wrap items-center gap-x-2 gap-y-0' : 'grid gap-0.5',
        className,
      )}
    >
      <span
        className={cn(
          'text-caption-plain text-ink-faint',
          (hideLabel || layout === 'inline') && 'sr-only',
        )}
      >
        {label}
      </span>
      {line}

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent width="sm">
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader
              title={`Reveal ${label.toLowerCase()}`}
              description={`Every reveal is written to your access log with the reason you ${choosing ? 'choose' : 'give'}.`}
            />
            {choosing ? (
              <div role="group" aria-labelledby={`${id}-why`} className="grid gap-2">
                <span id={`${id}-why`} className="text-label text-ink">
                  Why you need it
                </span>
                <div className="flex flex-wrap gap-2">
                  {[...reasons, OTHER].map((r, i) => {
                    const active = choice === r
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={active}
                        autoFocus={i === 0}
                        disabled={pending}
                        onClick={() => {
                          setChoice(r)
                          setError(null)
                        }}
                        className={cn(
                          'inline-flex h-control-sm items-center rounded-full border px-3 text-label transition-colors duration-feedback',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45',
                          'pointer-coarse:h-control-lg',
                          active
                            ? 'border-brand bg-brand-soft text-brand-deep'
                            : 'border-hairline bg-surface text-ink-soft hover:text-ink',
                        )}
                      >
                        {r === OTHER ? 'Other…' : r}
                      </button>
                    )
                  })}
                </div>
                {error && choice !== OTHER ? (
                  <p role="alert" className="text-caption text-danger">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : null}
            {!choosing ? (
              <Field
                label="Reason"
                error={error}
                hint="For example: verifying identity before a call."
              >
                {(control) => (
                  <Textarea
                    {...control}
                    autoFocus
                    rows={2}
                    maxLength={200}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                )}
              </Field>
            ) : choice === OTHER ? (
              <Field label="Reason" error={error}>
                {(control) => (
                  <Input
                    {...control}
                    autoFocus
                    maxLength={200}
                    value={text}
                    placeholder="In a few words"
                    onChange={(e) => setText(e.target.value)}
                  />
                )}
              </Field>
            ) : null}
            <DialogFooter>
              <Button onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={pending}
                disabled={choosing && !reason}
              >
                Reveal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { Eye, LockKeyhole } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { isApiError } from '../../api/client.ts'
import { cn } from '../../lib/cn.ts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
} from '../../ui/index.ts'

/**
 * The reasons an RM gives for unmasking a date of birth, most often first. A fixed list keeps the
 * access log readable (the same purpose is the same words on every entry) and makes the common
 * case two keystrokes; "Other" still takes the RM's own words for anything the list misses.
 */
const REASONS = ['Verifying identity before a call', 'Customer asked for it', 'KYC update'] as const
const OTHER = 'other'
const MIN_REASON = 5

/**
 * A protected value on the profile rail: masked by default, revealed only with a reason, and the
 * reveal is written to the access log by the server. The value is held in this component's state
 * only, never cached, so leaving the page masks it again.
 *
 * The kit's `MaskedField` asks for the reason as free text; this one offers the desk's usual
 * reasons as choices, focused on the first, with free text behind "Other".
 */
export function RevealField({
  label,
  masked,
  onReveal,
}: {
  label: string
  /** As the API masks it: "••/••/1996". */
  masked: string
  /** Asks the server to unmask. Resolves with the value; the server logs the reason. */
  onReveal: (reason: string) => Promise<string>
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<string | null>(null)
  const [other, setOther] = useState('')
  const [value, setValue] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reason = choice === OTHER ? other.trim() : choice

  function close() {
    if (pending) return
    setOpen(false)
    setChoice(null)
    setOther('')
    setError(null)
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
      setValue(await onReveal(reason))
      setOpen(false)
      setChoice(null)
      setOther('')
    } catch (e) {
      setError(isApiError(e) ? e.message : 'The value could not be revealed. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0">
      <span className="sr-only">{label}</span>
      <span
        className={cn('tabular text-label', value ? 'text-ink' : 'tracking-wide text-ink-soft')}
      >
        {value ?? masked}
      </span>
      {value ? (
        <span className="inline-flex items-center gap-1 text-caption text-ink-faint">
          <LockKeyhole aria-hidden className="size-3" />
          Revealed and logged
        </span>
      ) : (
        <Button
          variant="link"
          size="sm"
          className="text-caption"
          icon={<Eye aria-hidden />}
          onClick={() => setOpen(true)}
        >
          Reveal
        </Button>
      )}

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent width="sm">
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader
              title={`Reveal ${label.toLowerCase()}`}
              description="Every reveal is written to your access log with the reason you choose."
            />
            <div role="group" aria-labelledby={`${id}-why`} className="grid gap-2">
              <span id={`${id}-why`} className="text-label text-ink">
                Why you need it
              </span>
              <div className="flex flex-wrap gap-2">
                {[...REASONS, OTHER].map((r, i) => {
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
                        'inline-flex h-control-sm items-center rounded-full border px-3 text-label transition-colors duration-150',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45',
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
            {choice === OTHER ? (
              <Field label="Reason" error={error}>
                {(control) => (
                  <Input
                    {...control}
                    autoFocus
                    maxLength={200}
                    value={other}
                    placeholder="In a few words"
                    onChange={(e) => setOther(e.target.value)}
                  />
                )}
              </Field>
            ) : null}
            <DialogFooter>
              <Button onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={pending} disabled={!reason}>
                Reveal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

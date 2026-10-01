import { Eye, LockKeyhole } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { isApiError } from '../api/client.ts'
import { cn } from '../lib/cn.ts'
import { Button } from './Button.tsx'
import { Dialog, DialogContent, DialogFooter, DialogHeader } from './Dialog.tsx'
import { Field, Textarea } from './Field.tsx'

export interface MaskedFieldProps {
  label: string
  /** As the API masks it: "•• ••• 1987". */
  masked: string
  /** Asks the server to unmask. Resolves with the value; the server logs the reason. */
  onReveal: (reason: string) => Promise<string>
  className?: string
}

const MIN_REASON = 5

/**
 * A protected value: masked by default, revealed only with a reason the RM types, and the reveal
 * is written to the access log by the server. The value is held in this component's state only,
 * never cached, so leaving the page masks it again.
 */
export function MaskedField({ label, masked, onReveal, className }: MaskedFieldProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [value, setValue] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (reason.trim().length < MIN_REASON) {
      setError('Say why you need it, in a few words. It goes in the access log.')
      return
    }
    setPending(true)
    setError(null)
    try {
      setValue(await onReveal(reason.trim()))
      setOpen(false)
      setReason('')
    } catch (e) {
      setError(isApiError(e) ? e.message : 'The value could not be revealed. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={cn('grid gap-0.5', className)}>
      <span className="text-caption font-normal text-ink-faint">{label}</span>
      <div className="flex items-center gap-2">
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
      </div>

      <Dialog open={open} onOpenChange={(next) => (pending ? null : setOpen(next))}>
        <DialogContent width="sm">
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader
              title={`Reveal ${label.toLowerCase()}`}
              description="Every reveal is written to your access log with the reason you give."
            />
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
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </Field>
            <DialogFooter>
              <Button onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                Reveal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

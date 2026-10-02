import type { Handoff } from '@dhan/contracts'
import { useId, useState } from 'react'
import {
  Button,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  Textarea,
} from '../../ui/index.ts'
import { firstName } from './derive.ts'
import type { HandoffStatusChange } from './useHandoffAction.ts'

export interface RequestActionsProps {
  request: Handoff
  /** This request is being sent right now: only its buttons show progress. */
  busy: boolean
  onChange: (status: HandoffStatusChange, note?: string) => Promise<boolean>
}

/**
 * What the RM does with a customer's request to talk: mark it contacted once they have called,
 * and resolve it once the matter is settled. A call is not the same as the matter being closed,
 * so the two stay separate steps.
 */
export function RequestActions({ request, busy, onChange }: RequestActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {/* Once contacted, the request's own line says so ("Asked 29 Aug · contacted"). */}
      {request.status === 'contacted' ? null : (
        <Button size="sm" loading={busy} onClick={() => void onChange('contacted')}>
          Mark contacted
        </Button>
      )}
      <ResolveButton request={request} disabled={busy} onResolve={onChange} />
    </div>
  )
}

/**
 * Resolving closes the request (the customer stays in the queue only if a signal still puts
 * them there), so it asks once, in place, and takes an optional note for the journey. A popover
 * rather than a dialog: the row it is about stays in view.
 */
function ResolveButton({
  request,
  disabled,
  onResolve,
}: {
  request: Handoff
  disabled: boolean
  onResolve: (status: HandoffStatusChange, note?: string) => Promise<boolean>
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const who = firstName(request.name)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" disabled={disabled}>
          Resolve
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid grid-cols-1 gap-3">
        <div className="grid grid-cols-1 gap-1">
          <PopoverTitle>Resolve {who}’s request?</PopoverTitle>
          <PopoverDescription>
            The request closes. It stays on {who}’s journey, with your note if you add one.
          </PopoverDescription>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <label htmlFor={`${id}-note`} className="text-label text-ink">
            Note <span className="text-label-plain text-ink-faint">(optional)</span>
          </label>
          <Textarea
            id={`${id}-note`}
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="How it was settled"
          />
        </div>
        <div className="flex justify-end gap-2">
          <PopoverClose asChild>
            <Button size="sm" variant="ghost">
              Cancel
            </Button>
          </PopoverClose>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setOpen(false)
              const trimmed = note.trim()
              void onResolve('resolved', trimmed === '' ? undefined : trimmed)
            }}
          >
            Resolve
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

import type { Handoff } from '@dhan/contracts'
import { Check, Inbox } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { formatCount, formatDate } from '../../lib/format.ts'
import { duration, ease } from '../../lib/motion.ts'
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  Textarea,
} from '../../ui/index.ts'
import { firstName } from './derive.ts'
import { Figures } from './parts.tsx'
import { useHandoffAction, type HandoffStatusChange } from './useHandoffAction.ts'

/**
 * "Asked for you": every customer who tapped Talk to your relationship manager and has not been
 * resolved, longest wait first. Contacted requests stay until the RM resolves them, because a
 * call is not the same as the matter being closed.
 */
export function AskedForYou({ handoffs }: { handoffs: readonly Handoff[] }) {
  const action = useHandoffAction()
  const open = handoffs.filter((h) => h.status === 'open').length

  return (
    <Card>
      <CardHeader
        title="Asked for you"
        count={handoffs.length}
        to="/book?tab=asked_for_rm"
        actionLabel="In the book"
      />
      {handoffs.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="Nobody is waiting"
          body="When a customer taps Talk to your relationship manager in the app, they appear here with what they were looking at."
        />
      ) : (
        <>
          {/*
            The reason and context are what Uday had in front of him when the customer asked, not
            today's figures (a deposit "in 11 days" then is "in 7 days" in the queue now). One
            line says so for the whole list rather than on every request.
          */}
          <p className="-mt-2 mb-3 text-caption text-ink-faint">
            {statusLine(open, handoffs.length - open)}
            Each shows Uday’s read on the day they asked.
          </p>
          <ul className="-mx-5 border-t border-hairline-soft">
            <AnimatePresence initial={false}>
              {handoffs.map((handoff) => (
                <motion.li
                  key={handoff.id}
                  layout="position"
                  exit={{
                    opacity: 0,
                    height: 0,
                    transition: { duration: duration.state, ease: ease.in },
                  }}
                  className="overflow-hidden border-b border-hairline-soft last:border-b-0"
                >
                  <HandoffItem
                    handoff={handoff}
                    busy={action.pendingId === handoff.id}
                    onChange={(status, note) => action.run(handoff, status, note)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </Card>
  )
}

/** "1 open, 1 contacted." or "2 contacted, not yet resolved."; nothing when all are open. */
function statusLine(open: number, contacted: number): string {
  if (contacted === 0) return ''
  if (open === 0) return `${formatCount(contacted)} contacted, not yet resolved. `
  return `${formatCount(open)} open, ${formatCount(contacted)} contacted. `
}

function HandoffItem({
  handoff,
  busy,
  onChange,
}: {
  handoff: Handoff
  busy: boolean
  onChange: (status: HandoffStatusChange, note?: string) => Promise<boolean>
}) {
  const contacted = handoff.status === 'contacted'
  return (
    <article
      className="grid grid-cols-1 gap-3 px-5 py-4"
      aria-label={`${handoff.name}, asked for a call`}
    >
      <header className="flex items-start gap-3">
        <Avatar name={handoff.name} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/customers/${handoff.cif}`}
            className="block truncate text-label font-semibold text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            {handoff.name}
          </Link>
          <p className="text-caption text-ink-faint">
            Asked {formatDate(handoff.requestedOn, { year: false })}
            {contacted ? ' · contacted' : ''}
          </p>
        </div>
        {/* The wait is the figure here: how long someone has been left without a call. */}
        <p className="shrink-0 text-right">
          <span className="block text-heading text-ink tabular">
            {handoff.waitingDays === 0
              ? 'Today'
              : `${formatCount(handoff.waitingDays)} ${handoff.waitingDays === 1 ? 'day' : 'days'}`}
          </span>
          <span className="block text-caption text-ink-faint">
            {/* Once called, the customer is no longer waiting; the days still say how long ago. */}
            {handoff.waitingDays === 0 ? 'asked' : contacted ? 'since asked' : 'waiting'}
          </span>
        </p>
      </header>

      <div className="grid grid-cols-1 gap-1.5">
        <p className="text-label font-normal text-ink">
          <Figures text={handoff.reason} />
        </p>
        {handoff.context.length > 0 ? (
          <ul className="grid grid-cols-1 gap-1">
            {handoff.context.map((line, i) => (
              <li
                key={i}
                className="grid grid-cols-[0.75rem_minmax(0,1fr)] text-caption font-normal text-ink-soft"
              >
                <span aria-hidden className="mt-[0.4375rem] size-1 rounded-full bg-ink-hint/60" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {handoff.note ? (
          <p className="text-caption font-normal text-ink-soft">
            <span className="text-ink-faint">Your note: </span>
            {handoff.note}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {contacted ? (
          <Chip tone="brand" icon={<Check aria-hidden />}>
            Contacted
          </Chip>
        ) : (
          <Button size="sm" loading={busy} onClick={() => void onChange('contacted')}>
            Mark contacted
          </Button>
        )}
        <ResolveButton handoff={handoff} disabled={busy} onResolve={onChange} />
      </div>
    </article>
  )
}

/**
 * Resolving closes the request and takes it off this list, so it asks once, in place, and takes
 * an optional note for the journey. A popover rather than a dialog: the card it is about stays
 * in view.
 */
function ResolveButton({
  handoff,
  disabled,
  onResolve,
}: {
  handoff: Handoff
  disabled: boolean
  onResolve: (status: HandoffStatusChange, note?: string) => Promise<boolean>
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const who = firstName(handoff.name)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" disabled={disabled}>
          Resolve
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid grid-cols-1 gap-3">
        <div className="grid grid-cols-1 gap-1">
          <PopoverTitle>Resolve {who}’s request?</PopoverTitle>
          <PopoverDescription>
            It leaves this list. The request, and your note if you add one, stay on {who}’s journey.
          </PopoverDescription>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <label htmlFor={`${id}-note`} className="text-label text-ink">
            Note <span className="font-normal text-ink-faint">(optional)</span>
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

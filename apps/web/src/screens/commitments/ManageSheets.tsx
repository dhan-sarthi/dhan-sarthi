/**
 * Pause, stop, update — the three bottom sheets, rebuilt so that none of them lies.
 *
 * ## The problem the reference does not have
 *
 * SmartWealth's `Pause SIP` button works. It is a distributor's own app acting on a SIP it
 * registered, so pressing it sends a real instruction to a real registrar, and the confirmation
 * sheet can be two lines and a primary button because there is nothing to explain.
 *
 * These are not SIPs the app placed. They are recurring debits **detected in a bank statement**
 * by `packages/core/src/recurring.ts` — a NACH mandate, a standing instruction, a UPI AutoPay,
 * a card on file. This app has no mandate registry, no order path and no write access to any of
 * those rails. A button here labelled `Pause SIP` would not fail; it would appear to succeed, and
 * the money would leave anyway. That is the worst kind of wrong a banking screen can be.
 *
 * ## What they do instead
 *
 * Each sheet keeps the reference's shape — the duration radios on pause, the impact warning on
 * stop, the confirm-before-editing on update — and splits its single button into the two things
 * that are actually true:
 *
 * 1. **Where this is really changed.** `Series.mode` says which rail the money left on, and the
 *    rail decides who can cancel it. That sentence is the most useful thing on the sheet and it
 *    is above the button, not in a footnote.
 * 2. **What this screen can do**, which is take the charge off the projection so the calendar and
 *    the month total answer "what would this look like without it". The button says exactly that
 *    and nothing more, and every surface the note reaches says it is a note.
 *
 * The pause sheet also carries the one thing the reference promises in narration and never
 * builds — its flow file, Gaps §6: *"you can pause and resume your SIP"*, and no resume control
 * exists anywhere. Here a pause has an end date, so it resumes on the calendar by itself.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { addDays, addMonths } from '@dhan/core'
import { Sheet } from '../../components/Sheet.tsx'
import { Button } from '../../components/ui.tsx'
import { Choice, Field, MoneyInput, Stepper } from '../../components/Form.tsx'
import { inr, longDate } from '../../lib/money.ts'
import { howToChange } from './model.ts'
import type { Commitment, Note } from './model.ts'

export type ManageAction = 'pause' | 'stop' | 'update'

const DURATIONS = [
  { id: '1', label: '1 month' },
  { id: '2', label: '2 months' },
  { id: '3', label: '3 months' },
] as const

/** The line that appears on all three, because it is true of all three. */
function NotAnInstruction({ mode }: { mode: Commitment['series']['mode'] }): ReactNode {
  return (
    <div className="mt-4 flex gap-2.5 rounded-md bg-tint-clay p-3.5">
      <Info size={16} strokeWidth={2.4} className="mt-px flex-none text-accent-text" />
      <div className="min-w-0">
        <p className="m-0 text-[13px] font-semibold leading-snug text-accent-text">
          Dhan Sarthi cannot change this for you
        </p>
        <p className="m-0 mt-1 text-[13px] leading-relaxed text-ink-mid">{howToChange(mode)}</p>
      </div>
    </div>
  )
}

function Footer({
  confirm,
  onConfirm,
  onClose,
}: {
  confirm: string
  onConfirm: () => void
  onClose: () => void
}): ReactNode {
  return (
    <div className="flex gap-2.5">
      <Button tone="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button full onClick={onConfirm}>
        {confirm}
      </Button>
    </div>
  )
}

export function ManageSheets({
  commitment,
  action,
  asOf,
  onClose,
  onNote,
}: {
  commitment: Commitment
  action: ManageAction | null
  asOf: string
  onClose: () => void
  onNote: (note: Note) => void
}): ReactNode {
  const c = commitment
  const nominalDay = c.dayOfMonth ?? Number(c.series.lastSeen.slice(8, 10))
  const [months, setMonths] = useState<'1' | '2' | '3'>('2')
  const [amount, setAmount] = useState(c.amount)
  const [day, setDay] = useState(nominalDay)

  /*
   * The form is the commitment's current figures each time it opens, not whatever was typed into
   * a different commitment's sheet before it was closed.
   *
   * Adjusted during render against a remembered prop rather than in an effect. React's own
   * guidance for "reset state when a prop changes", and the one that does not paint the stale
   * value first — an effect here would flash the previous commitment's amount for a frame, which
   * on a money field is the frame somebody screenshots.
   */
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  const token = action === null ? null : `${c.key}:${action}`
  if (token !== openedFor) {
    setOpenedFor(token)
    if (action === 'update') {
      setAmount(c.amount)
      setDay(nominalDay)
    }
  }

  const resumes = addMonths(asOf, Number(months))
  const monthly = c.monthlyCost

  return (
    <>
      <Sheet
        open={action === 'pause'}
        onClose={onClose}
        title="Pause this?"
        sub={`${c.name} · ${inr(c.amount)} each time`}
        footer={
          <Footer
            confirm="Take it off until then"
            onClose={onClose}
            onConfirm={() => {
              onNote({ kind: 'paused', on: asOf, until: resumes, amount: null, dayOfMonth: null })
              onClose()
            }}
          />
        }
      >
        <p className="m-0 text-[13.5px] leading-relaxed text-ink-mid">
          How long do you want it off your calendar for? It comes back on{' '}
          <strong className="font-semibold text-ink">{longDate(resumes)}</strong> without you having
          to do anything — no resume to remember.
        </p>
        <div className="mt-3.5">
          <Choice options={DURATIONS} value={months} onChange={setMonths} />
        </div>
        <p className="m-0 mt-3.5 text-[13px] leading-relaxed text-ink-soft">
          That takes {inr(monthly * Number(months))} out of the next {months} month
          {months === '1' ? '' : 's'} of your plan.
        </p>
        <NotAnInstruction mode={c.series.mode} />
      </Sheet>

      <Sheet
        open={action === 'stop'}
        onClose={onClose}
        title="Stop this?"
        sub={c.name}
        footer={
          <Footer
            confirm="Take it off the calendar"
            onClose={onClose}
            onConfirm={() => {
              onNote({ kind: 'stopped', on: asOf, until: null, amount: null, dayOfMonth: null })
              onClose()
            }}
          />
        }
      >
        <p className="m-0 text-[13.5px] leading-relaxed text-ink-mid">
          {inr(monthly)} a month, {inr(c.annualCost)} a year, back in your hands from{' '}
          {longDate(addDays(asOf, 1))}.
        </p>
        {c.series.kind === 'sip' ? (
          /* The reference warns that stopping "would impact your tagged SmartJars". The honest
             version of that warning is the one the engine can prove: this is money currently
             going into investments, and stopping it is not the same as saving it. */
          <p className="m-0 mt-3 rounded-md bg-tint-sky p-3.5 text-[13px] leading-relaxed text-ink-mid">
            This one is going into investments, not out of them. Stopping it frees up {inr(monthly)}{' '}
            a month and takes the same amount out of what you are putting away — your plan on the
            Plan tab is built on it.
          </p>
        ) : null}
        {c.series.kind === 'insurance' ? (
          <p className="m-0 mt-3 rounded-md bg-danger-soft p-3.5 text-[13px] leading-relaxed text-danger">
            A missed premium can lapse the cover, and the cover is usually worth more than the
            premium. Check what you would be giving up before you cancel this one.
          </p>
        ) : null}
        <NotAnInstruction mode={c.series.mode} />
      </Sheet>

      <Sheet
        open={action === 'update'}
        onClose={onClose}
        title="Different amount or day?"
        sub={c.name}
        footer={
          <Footer
            confirm="Use these figures"
            onClose={onClose}
            onConfirm={() => {
              onNote({
                kind: 'revised',
                on: asOf,
                until: null,
                amount: amount > 0 ? amount : null,
                dayOfMonth: c.series.cadence === 'monthly' ? day : null,
              })
              onClose()
            }}
          />
        }
      >
        <p className="m-0 mb-4 text-[13.5px] leading-relaxed text-ink-mid">
          The reference app asks you to confirm and then never shows the form. Here is the form —
          but it changes what this screen projects, not what the bank collects.
        </p>
        <Field label="Each charge" hint={`Currently ${inr(c.series.amount)}`}>
          <MoneyInput value={amount} onChange={setAmount} ariaLabel="Amount of each charge" />
        </Field>
        {c.series.cadence === 'monthly' ? (
          <Field
            label="Day of the month"
            hint={
              day > 28
                ? 'Short months clamp to the last day, which is what the rails do too.'
                : undefined
            }
          >
            <Stepper value={day} min={1} max={31} onChange={setDay} />
          </Field>
        ) : null}
        <NotAnInstruction mode={c.series.mode} />
      </Sheet>
    </>
  )
}

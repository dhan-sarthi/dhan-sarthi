/**
 * A monthly limit on one category.
 *
 * The one control in the app that changes what the advice *says* rather than what it is
 * computed from. `dailyplan` reads the session's caps and marks the plan as breached when the
 * month's spending in a capped category goes past the limit, so setting one here is not a note
 * to self: the next Today is different.
 *
 * The starting figure is what they actually spend, not a round number, because a limit is only
 * useful next to the thing it is limiting. Somebody who spends ₹8,400 a month on eating out is
 * choosing between ₹8,400 and a number they pick, and the app should not pretend to know which.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sheet } from '../components/Sheet.tsx'
import { Button } from '../components/ui.tsx'
import { Field, MoneyInput } from '../components/Form.tsx'
import { inr } from '../lib/money.ts'

export interface CapTarget {
  category: string
  /** What this category costs over the window on file, monthly where there is a year of it. */
  spend: number
  /** Whether `spend` is a monthly rate or the observed total of a shorter window. */
  monthly: boolean
  /** The limit already in force, or null. */
  current: number | null
}

export function CapSheet({
  target,
  busy,
  onClose,
  onSave,
}: {
  target: CapTarget | null
  busy: boolean
  onClose: () => void
  onSave: (category: string, monthlyLimit: number | null) => void
}): ReactNode {
  const [amount, setAmount] = useState(0)
  /*
   * The figure resets when the sheet opens on a different category.
   *
   * Adjusted during render rather than in an effect, which is what React asks for when state
   * has to follow a prop: an effect would paint the previous category's number for a frame
   * first, and this component's whole job is to open with the right one. Guarded on the
   * category, so typing into the field is never overwritten.
   */
  const [seeded, setSeeded] = useState<string | null>(null)
  if (target !== null && seeded !== target.category) {
    setSeeded(target.category)
    setAmount(target.current ?? Math.round(target.spend))
  }

  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={target === null ? '' : `Cap ${target.category}`}
      sub="Today tells you when a capped category runs over."
      footer={
        target === null ? null : (
          <div className="flex gap-2">
            {target.current !== null ? (
              <Button tone="secondary" busy={busy} onClick={() => onSave(target.category, null)}>
                Remove
              </Button>
            ) : null}
            <Button
              full
              busy={busy}
              disabled={amount <= 0}
              onClick={() => onSave(target.category, amount)}
            >
              {target.current === null ? 'Set the limit' : 'Change it'}
            </Button>
          </div>
        )
      }
    >
      {target === null ? null : (
        <>
          <p className="m-0 mb-4 mt-1 text-[14px] leading-normal text-ink-mid">
            {target.monthly
              ? `${target.category} costs you about ${inr(target.spend)} a month at the moment.`
              : `${target.category} comes to ${inr(target.spend)} over the statement on file — under a month, so this is the window rather than a monthly rate.`}
          </p>

          <Field label="Limit per month" hint="Nothing is blocked. You get told, that is all.">
            <MoneyInput
              ariaLabel={`Monthly limit for ${target.category}`}
              value={amount}
              onChange={setAmount}
            />
          </Field>

          {amount > 0 && target.monthly && amount < target.spend ? (
            <p className="ds-rise m-0 rounded-sm bg-tint-sage px-3 py-2.5 text-[13px] leading-snug text-brand-deep">
              {inr(target.spend - amount)} a month less than now, which is{' '}
              {inr((target.spend - amount) * 12)} over a year.
            </p>
          ) : null}
          {amount > 0 && target.monthly && amount >= target.spend ? (
            <p className="m-0 text-[13px] leading-snug text-ink-soft">
              At or above what you already spend, so it will not bind until something changes.
            </p>
          ) : null}

          <p className="mb-1 mt-4 text-xs leading-relaxed text-ink-soft">
            Yours, on your session, not on anything the bank holds. It is not a block on the account
            and cannot decline a payment.
          </p>
        </>
      )}
    </Sheet>
  )
}

/**
 * Changing the target.
 *
 * The plan already offers this in words: "we can push the date, lower the target, or find the
 * difference in your spending". Until now there was no way to do any of it, which makes the
 * sentence a shrug rather than an offer.
 *
 * The slider shows what the change costs a month while it is being dragged, from the same
 * arithmetic the server uses, so the customer is choosing between two numbers rather than
 * picking one and finding out afterwards. The server still recuts the roadmap and records a new
 * version with the reason, because the projection here is an illustration and the plan is not.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Roadmap } from '@dhan/contracts'
import { Sheet } from '../components/Sheet.tsx'
import { Button } from '../components/ui.tsx'
import { MoneyInput } from '../components/Form.tsx'
import { api, isApiError } from '../api/client.ts'
import { approx, inr } from '../lib/money.ts'
import { useCountUp } from '../lib/motion.ts'

/** Months between now and the goal's date, floored at one so nothing divides by zero. */
function monthsTo(asOf: string, targetDate: string): number {
  const a = Number(asOf.slice(0, 4)) * 12 + Number(asOf.slice(5, 7))
  const b = Number(targetDate.slice(0, 4)) * 12 + Number(targetDate.slice(5, 7))
  return Math.max(1, b - a)
}

export function GoalSheet({
  open,
  onClose,
  onSaved,
  roadmap,
  asOf,
  deployable,
}: {
  open: boolean
  onClose: () => void
  onSaved: (message: string) => void
  roadmap: Roadmap
  asOf: string
  /** What the engine says is free each month. The line the target is measured against. */
  deployable: number
}): ReactNode {
  const suggested = roadmap.goal.targetAmount
  const [target, setTarget] = useState(suggested)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const months = monthsTo(asOf, roadmap.goal.targetDate)
  // Straight-line, deliberately: this is the cost of the choice being made right now, and
  // discounting it would put a second set of assumptions between the slider and the number.
  const perMonth = Math.round(target / months)
  const shownPerMonth = useCountUp(perMonth, 220)
  const reachable = perMonth <= deployable

  const save = async (): Promise<void> => {
    if (target <= 0) return
    setBusy(true)
    setError(null)
    try {
      /*
       * The basis rides along unchanged, because this sheet moves the amount and not the money
       * it is in. A customer who inflated their target on the create screen and then nudges the
       * slider here is still aiming at a figure in the rupees of the year it lands; dropping the
       * basis would quietly re-read the same number as today's money and roughly treble the
       * monthly, for a reason the slider never mentioned.
       */
      await api('setGoal', {
        body: {
          targetAmount: Math.round(target),
          ...(roadmap.goal.amountBasis ? { amountBasis: roadmap.goal.amountBasis } : {}),
        },
      })
      onSaved('Target changed. A new version of the plan is on the record.')
      onClose()
    } catch (err) {
      setError(isApiError(err) ? err.message : 'That could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  // A range wide enough to halve or double the suggestion, rounded so the handle lands on
  // figures a person would say out loud.
  const step = Math.max(5000, Math.round(suggested / 100 / 5000) * 5000)
  const min = Math.max(step, Math.round(suggested * 0.25))
  const max = Math.round(suggested * 2)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Change the target"
      sub={roadmap.goal.purpose ?? 'Your goal'}
      footer={
        <Button
          full
          busy={busy}
          disabled={target <= 0 || target === suggested}
          onClick={() => void save()}
        >
          {target === suggested ? 'Unchanged' : 'Use this target'}
        </Button>
      }
    >
      {error ? (
        <p
          role="alert"
          className="mb-3 mt-1 rounded-sm bg-danger-soft px-3 py-2.5 text-[13px] leading-snug text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="pt-1">
        <div className={`rounded-md p-4 ${reachable ? 'bg-tint-sage' : 'bg-tint-clay'}`}>
          <div className="text-[32px] font-bold leading-none tracking-tight tabular-nums text-ink">
            {approx(target)}
          </div>
          {/* Which money, read off the goal rather than assumed — the slider keeps whichever
              the target was already stated in, and saying the wrong one here would make the
              figure above mean something it does not. */}
          <p className="m-0 mt-1.5 text-[13px] text-ink-soft">
            by {roadmap.goal.targetDate.slice(0, 4)},{' '}
            {roadmap.goal.amountBasis === 'at_horizon'
              ? `in ${roadmap.goal.targetDate.slice(0, 4)} rupees`
              : 'in today’s money'}
          </p>
          <p className="m-0 mt-3 text-[14px] font-semibold leading-snug text-ink">
            {inr(Math.round(shownPerMonth))} a month for {months}{' '}
            {months === 1 ? 'month' : 'months'}
          </p>
          <p className="m-0 mt-1 text-[13px] leading-snug text-ink-mid">
            {reachable
              ? `That fits inside the ${inr(deployable)} a month you have free.`
              : `That is ${inr(perMonth - deployable)} a month more than you have free.`}
          </p>
        </div>

        <input
          type="range"
          aria-label="Target amount"
          className="mt-5 h-11 w-full accent-[var(--accent)]"
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, target))}
          onChange={(e) => setTarget(Number(e.target.value))}
        />
        <div className="flex justify-between text-[11.5px] tabular-nums text-ink-soft">
          <span>{approx(min)}</span>
          <span>{approx(max)}</span>
        </div>

        <div className="mt-5">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink">Or type it</span>
          <MoneyInput ariaLabel="Target amount, exact" value={target} onChange={setTarget} />
        </div>

        {target !== suggested ? (
          <button
            type="button"
            onClick={() => setTarget(suggested)}
            className="ds-press mt-3 h-10 rounded-pill border-0 bg-ground-deep px-4 text-[13.5px] font-semibold text-ink-mid"
          >
            Back to the suggested {approx(suggested)}
          </button>
        ) : null}

        <p className="mb-1 mt-5 text-xs leading-relaxed text-ink-soft">
          Changing this cuts a new version of the plan, kept with the reason and the figures it was
          built on. Nothing is overwritten.
        </p>
      </div>
    </Sheet>
  )
}

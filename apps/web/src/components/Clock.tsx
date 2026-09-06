/**
 * The time machine, as a visible control rather than a hidden toggle.
 *
 * The problem this solves: memory, proactive nudges and roadmap adaptation are the three
 * strongest things we built, and none of them can be verified in a sixty-second slot because
 * they need time to pass. A mocked notification just makes a reviewer think we wrote the string.
 *
 * So the reviewer moves the clock themselves. Advance a week and real transactions appear, the
 * safe-to-spend figure falls, and the plan recalculates — all computed, none scripted. Labelled
 * plainly as a simulation, because the moment it looks like a trick the credibility is gone.
 *
 * The clock lives in the reviewer's session on the server; this only asks it to move. When it
 * will not — the ledger runs to a horizon, and another tab may have moved it first — the
 * server's own sentence is shown.
 *
 * **Shaped as an instrument, not as advice.** It used to be a full peach card with a
 * four-line explanation, sitting above the day's figure: the first thing anyone saw on the
 * customer's screen was the reviewer's control panel. It is now a single compact strip that
 * reads as apparatus — the explanation is one line, and it opens only if asked for.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { dayMonth } from '../lib/money.ts'

const STEP =
  'min-h-11 min-w-0 rounded-pill border border-solid border-accent/45 bg-white px-3 text-sm font-semibold text-accent-text hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand transition-transform duration-100 active:scale-[0.985] disabled:opacity-50'

export function Clock({
  asOf,
  notice,
  disabled = false,
  onAdvance,
  onReset,
}: {
  asOf: string
  /** Why the last move was refused, in the server's words. */
  notice?: string | null
  disabled?: boolean
  onAdvance: (days: 1 | 7 | 30) => void
  onReset: () => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="Simulated clock" className="min-w-0 px-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-ink-soft">
          Simulated · {dayMonth(asOf)} {asOf.slice(0, 4)}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="clock-controls"
          className="min-h-11 border-0 bg-transparent px-2 text-sm font-semibold text-brand underline underline-offset-2 hover:text-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close clock' : 'Move time'}
        </button>
      </div>

      {open ? (
        <div id="clock-controls" className="pb-3">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={STEP} onClick={() => onAdvance(1)} disabled={disabled}>
              +1 day
            </button>
            <button type="button" className={STEP} onClick={() => onAdvance(7)} disabled={disabled}>
              +1 week
            </button>
            <button
              type="button"
              className={STEP}
              onClick={() => onAdvance(30)}
              disabled={disabled}
            >
              +1 month
            </button>
            <button type="button" className={STEP} onClick={onReset} disabled={disabled}>
              Reset
            </button>
          </div>
          <p className="mb-0 mt-2 text-xs leading-normal text-ink-soft">
            Figures are recomputed from the ledger. Reset moves time back; your decisions stay
            recorded.
          </p>
        </div>
      ) : null}
      {notice ? (
        <p role="alert" className="mb-2 mt-0 text-xs leading-normal text-danger">
          {notice}
        </p>
      ) : null}
    </section>
  )
}

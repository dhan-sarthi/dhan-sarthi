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
  'h-8 min-w-0 whitespace-nowrap rounded-pill border border-solid border-accent/45 bg-white px-2.5 text-[13px] font-semibold text-accent-text transition-transform duration-100 active:scale-[0.97] disabled:opacity-50'

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
    <section className="mb-3 min-w-0 rounded-sm border border-solid border-hairline bg-tint-clay/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-accent-text">
          Simulated
        </span>
        <span className="text-[13px] font-semibold tabular-nums text-ink">
          {dayMonth(asOf)} {asOf.slice(0, 4)}
        </span>

        <span className="ml-auto flex items-center gap-1.5">
          <button type="button" className={STEP} onClick={() => onAdvance(1)} disabled={disabled}>
            +1d
          </button>
          <button type="button" className={STEP} onClick={() => onAdvance(7)} disabled={disabled}>
            +1w
          </button>
          <button type="button" className={STEP} onClick={() => onAdvance(30)} disabled={disabled}>
            +1m
          </button>
          <button
            type="button"
            className="h-8 shrink-0 rounded-pill border-0 bg-transparent px-1.5 text-[13px] font-medium text-ink-soft underline-offset-2 hover:underline disabled:opacity-50"
            onClick={onReset}
            disabled={disabled}
          >
            Reset
          </button>
          <button
            type="button"
            aria-expanded={open}
            aria-label="What the clock does"
            className="grid size-6 flex-none place-items-center rounded-pill border border-solid border-accent/45 bg-white text-[12px] font-bold text-accent-text"
            onClick={() => setOpen((v) => !v)}
          >
            ?
          </button>
        </span>
      </div>

      {notice ? (
        <p role="alert" className="mb-0 mt-2 text-[12.5px] leading-normal text-danger">
          {notice}
        </p>
      ) : null}

      {open ? (
        <p className="mb-0 mt-2 text-[12px] leading-relaxed text-ink-soft">
          Move time forward and the ledger produces the days it always had. Nothing is scripted —
          everything below is recomputed from the transactions. Reset moves the clock back, not the
          customer: what you decided stays decided.
        </p>
      ) : null}
    </section>
  )
}

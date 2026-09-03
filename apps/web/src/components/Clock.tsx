/**
 * The time machine, as a visible control rather than a hidden toggle.
 *
 * The problem this solves: memory, proactive nudges and
 * roadmap adaptation are the three strongest things we built, and none of them can be verified in
 * a sixty-second slot because they need time to pass. A mocked notification just makes a judge
 * think we wrote the string.
 *
 * So the judge moves the clock themselves. Advance a week and real transactions appear, the
 * safe-to-spend figure falls, and the plan recalculates — all computed, none scripted. Labelled
 * plainly as a simulation, because the moment it looks like a trick the credibility is gone.
 *
 * The clock itself lives in the reviewer's session on the server; this only asks it to move.
 * When it will not — the ledger has been generated up to a horizon, and another tab may have
 * moved it first — the server's own sentence is shown under the buttons.
 *
 * Styled as the peach "attention" card: orange eyebrow, three identical secondary outline pills
 * to advance, and Reset as a quiet text button so it never competes with them.
 */
import type { ReactNode } from 'react'
import { dayMonth } from '../lib/money.ts'

const ADVANCE_BTN =
  'h-11 min-w-0 flex-1 whitespace-nowrap rounded-pill border-[1.5px] border-solid border-accent bg-white px-3 text-[15px] font-semibold text-accent-text transition-transform duration-100 active:scale-[0.985] disabled:opacity-60'

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
  return (
    <section className="mb-3 min-w-0 rounded-md bg-tint-clay p-4 pb-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-text">
            Simulated clock
          </div>
          <div className="mt-0.5 text-[18px] font-semibold leading-tight tabular-nums text-ink">
            {dayMonth(asOf)} {asOf.slice(0, 4)}
          </div>
        </div>
        <button
          type="button"
          className="h-10 shrink-0 rounded-pill border-0 bg-transparent px-2 text-[15px] font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-60"
          onClick={onReset}
          disabled={disabled}
        >
          Reset
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={ADVANCE_BTN}
          onClick={() => onAdvance(1)}
          disabled={disabled}
        >
          +1 day
        </button>
        <button
          type="button"
          className={ADVANCE_BTN}
          onClick={() => onAdvance(7)}
          disabled={disabled}
        >
          +1 week
        </button>
        <button
          type="button"
          className={ADVANCE_BTN}
          onClick={() => onAdvance(30)}
          disabled={disabled}
        >
          +1 month
        </button>
      </div>

      {notice ? (
        <p role="alert" className="mb-0 mt-3 text-[13px] leading-normal text-danger">
          {notice}
        </p>
      ) : null}

      <p className="mb-0 mt-3 text-xs leading-relaxed text-ink-soft">
        Move time forward and the ledger produces the days it always had. Nothing is scripted — the
        plan below is recomputed from the transactions. Reset moves the clock back, not the
        customer: what you decided stays decided.
      </p>
    </section>
  )
}

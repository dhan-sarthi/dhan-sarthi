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

/** `YYYY-MM-DD` plus n days, via UTC so no local timezone can move the date. */
function addDays(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00.000Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

const ADVANCE_BTN =
  'h-11 min-w-0 flex-1 whitespace-nowrap rounded-pill border-[1.5px] border-solid border-accent bg-white px-3 text-[15px] font-semibold text-accent-text transition-transform duration-100 active:scale-[0.985] disabled:opacity-60'

export function Clock({
  asOf,
  horizonTo,
  notice,
  disabled = false,
  onAdvance,
  onReset,
}: {
  asOf: string
  /**
   * The last date the feed has data for. Every step past it is refused by the server, so a
   * button that would cross it is disabled rather than offered.
   *
   * This matters under a real feed in a way it never did under the generator. The generator
   * produces eighteen months past the anchor, so there was always headroom; IDBI's sandbox
   * ends on 2025-05-20 and a session opens there, which left three buttons on screen that
   * could only ever answer "there is no data for 2025-05-21".
   */
  horizonTo: string
  /** Why the last move was refused, in the server's words. */
  notice?: string | null
  disabled?: boolean
  onAdvance: (days: 1 | 7 | 30) => void
  onReset: () => void
}): ReactNode {
  const canAdvance = (days: number): boolean => addDays(asOf, days) <= horizonTo
  const atTheEnd = !canAdvance(1)
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
        {([1, 7, 30] as const).map((days) => (
          <button
            key={days}
            type="button"
            className={ADVANCE_BTN}
            onClick={() => onAdvance(days)}
            disabled={disabled || !canAdvance(days)}
            title={canAdvance(days) ? undefined : `The ledger ends on ${dayMonth(horizonTo)}.`}
          >
            {days === 1 ? '+1 day' : days === 7 ? '+1 week' : '+1 month'}
          </button>
        ))}
      </div>

      {notice ? (
        <p role="alert" className="mb-0 mt-3 text-[13px] leading-normal text-danger">
          {notice}
        </p>
      ) : null}

      {/* One explanation, not two. Telling a reviewer to move time forward directly under
          three disabled buttons and a line saying there is nothing further to reveal reads as
          a broken control rather than an exhausted one. */}
      <p className="mb-0 mt-3 text-xs leading-relaxed text-ink-soft">
        {atTheEnd ? (
          <>
            This is the last day the feed has data for, so there is nothing further to reveal. Reset
            moves the clock back through what is already there — back, not the customer: what you
            decided stays decided.
          </>
        ) : (
          <>
            Move time forward and the ledger produces the days it always had. Nothing is scripted —
            the plan below is recomputed from the transactions. Reset moves the clock back, not the
            customer: what you decided stays decided.
          </>
        )}
      </p>
    </section>
  )
}

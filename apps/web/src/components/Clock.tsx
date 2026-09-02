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
 */
import type { ReactNode } from 'react'
import { dayMonth } from '../lib/money.ts'

export function Clock({
  asOf,
  onAdvance,
  onReset,
}: {
  asOf: string
  onAdvance: (days: number) => void
  onReset: () => void
}): ReactNode {
  return (
    <section className="card tint-clay" style={{ paddingBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: '#7a5a3c',
            }}
          >
            Simulated clock
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 3 }}>
            {dayMonth(asOf)} {asOf.slice(0, 4)}
          </div>
        </div>
        <button type="button" className="btn ghost sm" style={{ width: 'auto' }} onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="btn-row" style={{ marginTop: 13 }}>
        <button type="button" className="btn sm" onClick={() => onAdvance(1)}>
          +1 day
        </button>
        <button type="button" className="btn sm" onClick={() => onAdvance(7)}>
          +1 week
        </button>
        <button type="button" className="btn sm" onClick={() => onAdvance(30)}>
          +1 month
        </button>
      </div>

      <p className="note" style={{ marginTop: 11, color: '#7a5a3c' }}>
        Move time forward and the ledger produces the days it always had. Nothing is scripted —
        the plan below is recomputed from the transactions.
      </p>
    </section>
  )
}

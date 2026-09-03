/**
 * One line under Today's header saying where the numbers came from and how fresh they are.
 *
 * A banker's first question about any figure is "as of when, from where". Under a real feed
 * this reads "IDBI sandbox · data to 3 September"; under the demo it says the ledger is
 * synthetic. Either way it is said, not assumed. A flex-none sibling of `.scroll`, like
 * Segments, so it never scrolls away.
 */
import type { ReactNode } from 'react'
import type { BankSource, ViewMeta } from '@dhan/contracts'
import { dayMonth } from '../lib/money.ts'
import { TierBadge } from './TierBadge.tsx'
import type { Tier } from './TierBadge.tsx'

const SOURCE: Record<BankSource, string> = {
  memory: 'Synthetic ledger, in memory',
  postgres: 'Seeded database',
  'idbi-sandbox': 'IDBI sandbox',
}

export function DataSourceRibbon({ meta, tier }: { meta: ViewMeta; tier: Tier }): ReactNode {
  const source = tier === 'offline' ? 'Simulated in this browser' : SOURCE[meta.source]
  return (
    <div
      className="mx-4 mt-3 flex flex-none items-center justify-between gap-2 text-xs text-ink-soft"
      aria-label="Data source"
    >
      <span className="min-w-0 leading-snug">
        {source} · data to {dayMonth(meta.dataFreshnessDate)} {meta.dataFreshnessDate.slice(0, 4)}
      </span>
      <TierBadge tier={tier} />
    </div>
  )
}

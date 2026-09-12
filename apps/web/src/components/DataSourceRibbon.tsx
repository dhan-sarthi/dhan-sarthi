/**
 * One line under the header: how fresh the numbers are, and anything qualifying them.
 *
 * A banker's first question about any figure is "as of when", so it is said rather than assumed.
 * Everything else here earns its place only by being a disclosure — that the ledger is sample
 * data, or that the advisor is on a lower rung today. On a real feed with the avatar up, this is
 * one short clause and nothing more.
 *
 * Two earlier versions of this line were written for reviewers rather than customers. It named
 * the storage engine ("Synthetic ledger, in memory"), and the tier sat beside it as a pill
 * reading "Text advisor" — pill-shaped, in the app's own chip colours, next to a heading, so
 * people tapped it and nothing happened; it was a `role="status"` label all along. "Text advisor"
 * also reads as an instruction to text the advisor rather than as the state of one.
 */
import type { ReactNode } from 'react'
import type { BankSource, ViewMeta } from '@dhan/contracts'
import type { Tier } from '../lib/availability.ts'
import { dayMonth } from '../lib/money.ts'

/** Only sources a customer must be warned about. A real feed needs no announcement. */
const UNREAL: Partial<Record<BankSource, string>> = {
  memory: 'Sample data',
  postgres: 'Sample data',
}

/** Only tiers worth mentioning. Live is the expectation, not news. */
const TIER: Partial<Record<Tier, string>> = {
  text: 'Uday is replying in text',
  offline: 'Offline · nothing is being recorded',
}

export function DataSourceRibbon({ meta, tier }: { meta: ViewMeta; tier: Tier }): ReactNode {
  const freshness = `${UNREAL[meta.source] ?? 'Data'} to ${dayMonth(meta.dataFreshnessDate)} ${meta.dataFreshnessDate.slice(0, 4)}`
  const clauses = [freshness, TIER[tier]].filter((c): c is string => c !== undefined)
  return (
    <div
      className="mx-4 mt-3 flex-none text-xs leading-snug text-ink-soft"
      aria-label="Data source"
    >
      {clauses.join(' · ')}
    </div>
  )
}

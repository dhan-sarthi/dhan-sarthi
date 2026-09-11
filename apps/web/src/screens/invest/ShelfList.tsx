/**
 * The shelf, as a list you can buy from.
 *
 * Step 5 owns Discover and the fund lists; this is the minimum the spine needs to be reachable —
 * the real shelf off `/view`, grouped, on the canonical `ListRow` at its 68px. It is deliberately
 * not `FundRow` (logo, NAV, return %, rating): none of those figures exist in this app's data,
 * and inventing five metrics per row to match the reference's density would be filling a list
 * with numbers nobody computed. `COMPONENT-GAP.md` keeps `FundRow` open for the step that has
 * the data.
 *
 * The `In your plan` ribbon is the IDBI answer to SmartWealth's amber `Recommended` tab, and the
 * difference is the point. Theirs is the app's only judgement and it is on everything; ours means
 * one specific thing that is checkable — this product is named by a stage of *this customer's*
 * roadmap. Nothing carries it otherwise.
 */
import type { ReactNode } from 'react'
import type { ShelfProduct } from '@dhan/contracts'
import { inr } from '../../lib/money.ts'
import { ListRow, Pill } from '../../components/ui.tsx'
import { SchemeMark } from './SchemeMark.tsx'

/** The three shapes of thing on IDBI's shelf, in the order a plan reaches for them. */
const GROUPS: readonly { label: string; has: (p: ShelfProduct) => boolean }[] = [
  {
    label: 'Mutual funds',
    has: (p) => ['Liquid', 'Debt', 'Index Fund', 'Equity', 'ELSS'].includes(p.category),
  },
  {
    label: 'Protection',
    has: (p) => p.insuranceProduct === true,
  },
  {
    label: 'Deposits and long-horizon schemes',
    has: (p) =>
      ['Sweep-in FD', 'Fixed Deposit', 'Recurring Deposit', 'NPS', 'PPF'].includes(p.category),
  },
]

export function ShelfList({
  shelf,
  planned,
  onPick,
}: {
  shelf: readonly ShelfProduct[]
  planned: ReadonlySet<string>
  onPick: (product: ShelfProduct) => void
}): ReactNode {
  return (
    <>
      {GROUPS.map((group) => {
        const rows = shelf.filter((p) => p.transactable && group.has(p))
        if (rows.length === 0) return null
        return (
          <section key={group.label}>
            {/* -mx-4 escapes `.scroll`'s gutter and px-4 puts the label back on it, so the band
                runs edge to edge while its text stays in line with every row. Same recipe as the
                More menu's section bands. */}
            <div className="-mx-4 mt-2 bg-ground-deep px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
              {group.label}
            </div>
            {rows.map((p) => (
              <ListRow
                key={p.productId}
                icon={<SchemeMark manufacturer={p.manufacturer} />}
                title={p.name}
                sub={`${p.category} · ${p.riskometer} risk · from ${inr(p.minInvestment)}`}
                value={planned.has(p.productId) ? <Pill tone="warn">In your plan</Pill> : undefined}
                onClick={() => onPick(p)}
              />
            ))}
          </section>
        )
      })}
    </>
  )
}

/**
 * The category grid above the shelf.
 *
 * SmartWealth's Discover opens on a grid of product categories, not on a list of products, and
 * that grid is most of why its Discover reads as designed rather than as a table: a customer who
 * does not yet know what they want is offered *kinds* first and instruments second. The list is
 * still underneath — this narrows it.
 *
 * The icons are the illustrated set in `public/icons`, one per category, rendered at 56px. They
 * carry more colour than the rest of the app on purpose: the chrome is one green, and the
 * illustration is where a bank is allowed to be warm. Each icon is green-based with a single
 * accent hue, which is what keeps fourteen of them looking like one set. See DESIGN.md.
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { ShelfProduct } from '@dhan/contracts'

/** Category as the shelf spells it, to the icon drawn for it. */
const ICON: Record<string, string> = {
  'Sweep-in FD': 'sweep-in-fd',
  'Fixed Deposit': 'fixed-deposit',
  'Recurring Deposit': 'recurring-deposit',
  Liquid: 'liquid-fund',
  Debt: 'debt-fund',
  'Index Fund': 'index-fund',
  ELSS: 'elss',
  'Term Insurance': 'term-insurance',
  'Health Insurance': 'health-insurance',
  'Government Insurance': 'govt-insurance',
  NPS: 'nps',
  PPF: 'ppf',
  ULIP: 'ulip',
  Endowment: 'endowment',
}

/** Shorter than the shelf's own wording, because a tile label is two lines at most. */
const LABEL: Record<string, string> = {
  'Sweep-in FD': 'Sweep-in FD',
  'Fixed Deposit': 'Fixed deposits',
  'Recurring Deposit': 'Recurring',
  Liquid: 'Liquid funds',
  Debt: 'Debt funds',
  'Index Fund': 'Index funds',
  ELSS: 'Tax saver',
  'Term Insurance': 'Term cover',
  'Health Insurance': 'Health cover',
  'Government Insurance': 'Govt. cover',
  NPS: 'NPS',
  PPF: 'PPF',
  ULIP: 'ULIP',
  Endowment: 'Endowment',
}

export function CategoryGrid({
  shelf,
  selected,
  onSelect,
}: {
  shelf: readonly ShelfProduct[]
  /** `null` is "everything", which is also the state the screen opens in. */
  selected: string | null
  onSelect: (category: string | null) => void
}): ReactNode {
  /* Only categories the shelf actually carries, in the shelf's own order — a tile for a category
     with nothing behind it is a dead end, and this shelf is short enough to notice. */
  const categories = useMemo(() => {
    const seen: string[] = []
    for (const p of shelf) {
      if (p.transactable && ICON[p.category] && !seen.includes(p.category)) seen.push(p.category)
    }
    return seen
  }, [shelf])

  if (categories.length === 0) return null

  return (
    <section aria-label="Product categories" className="mt-1">
      <div className="grid grid-cols-4 gap-x-1 gap-y-3">
        {categories.map((category) => {
          const on = selected === category
          return (
            <button
              key={category}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(on ? null : category)}
              className={`ds-press flex flex-col items-center gap-1.5 rounded-md border-0 bg-transparent px-0.5 pb-1.5 pt-1 transition-colors duration-200 ${
                on ? 'bg-accent-soft' : ''
              }`}
            >
              <img
                src={`/icons/${ICON[category]}.png`}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                width={224}
                height={224}
                className="size-14 flex-none select-none object-contain"
              />
              <span
                className={`text-center text-[11px] leading-[13px] ${
                  on ? 'font-bold text-accent-text' : 'font-medium text-ink-mid'
                }`}
              >
                {LABEL[category] ?? category}
              </span>
            </button>
          )
        })}
      </div>
      {selected ? (
        <p className="m-0 mt-3 text-[13px] text-ink-soft">
          Showing {LABEL[selected] ?? selected}.{' '}
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="border-0 bg-transparent p-0 font-semibold text-brand-deep underline underline-offset-2"
          >
            Show everything
          </button>
        </p>
      ) : null}
    </section>
  )
}

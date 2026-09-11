/**
 * The shelf, as a list you can buy from — `02-fund-list-category` and `03-add-scheme-fund-list`.
 *
 * The first pass built this on the canonical 68px `ListRow` and left a note saying `FundRow` —
 * the reference's dense five-figure row — was for "the step that has the data". Then somebody
 * opened frames 01–04 beside it. The reference row is not a list row with extra text on it: it is
 * a *card*, ~145px tall, in three bands — an identity band (logo · name · `Add`), a tag band
 * (rating and three chips), and a figures band (four ruled columns of label-over-value). A single
 * line of `Index Fund · Very High risk · from ₹500` carries the same words and none of the shape,
 * and next to the frame it reads as a settings menu.
 *
 * So the three bands are here. What goes in them is only what IDBI's feed actually has, which is
 * the whole of the difference between this list and theirs:
 *
 * | Reference | Here |
 * |---|---|
 * | AMC logo tile | `SchemeMark` monogram — we do not ship other companies' brand assets |
 * | ★ 4.0 star rating | **omitted.** Nobody rates these products and inventing a number to fill a row is the one thing this app does not do |
 * | `AUM(Cr.) ₹8.9K` | **omitted.** No fund-level AUM in the feed |
 * | `Return(1Y)` / `Return(3Y)` | **omitted.** No NAV history, so no realised return exists to print |
 * | `Risk(1Y) 0.5%` | the SEBI riskometer band, in the chip row. It is a category, not a volatility figure, so it is not dressed up as a percentage |
 * | `Recommended` on nearly every row | `In your plan`, on the products a stage of *this customer's* roadmap names — checkable, and therefore rare |
 *
 * The figures band keeps the reference's four columns and fills the ones this product has a
 * number for: the minimum and the lock-in always, the expense ratio and the indicative return
 * when they exist. A row with three leaves the fourth cell empty rather than reaching for a
 * fourth figure, and the columns stay on the same grid down the whole list either way.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ShelfProduct } from '@dhan/contracts'
import { inr } from '../../lib/money.ts'
import { Button } from '../../components/ui.tsx'
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
  filterBar = false,
}: {
  shelf: readonly ShelfProduct[]
  planned: ReadonlySet<string>
  onPick: (product: ShelfProduct) => void
  /**
   * The reference's `All | Recommended` chip row and its `1267 Mutual Fund Schemes` count.
   *
   * Off by default: Discover already says what it is filtered to, in its own words, right under
   * the category grid, and two filter affordances on one screen is one too many. The pick step
   * inside the order has no other filter, so it takes this one.
   */
  filterBar?: boolean
}): ReactNode {
  const [only, setOnly] = useState(false)
  const on = filterBar && only
  const buyable = shelf.filter((p) => p.transactable)
  const shown = on ? buyable.filter((p) => planned.has(p.productId)) : buyable

  return (
    <>
      {filterBar ? (
        <div className="-mx-4 border-0 border-b border-solid border-hairline-mint bg-surface px-4 pb-3 pt-1">
          <div className="flex gap-2">
            <Chip on={!on} onClick={() => setOnly(false)}>
              All
            </Chip>
            <Chip on={on} onClick={() => setOnly(true)}>
              In your plan
            </Chip>
          </div>
          <p className="mb-0 mt-2.5 text-[13px] text-ink-soft">
            {shown.length} {shown.length === 1 ? 'product' : 'products'}
            {on ? ' named by your roadmap' : ' IDBI can put you into'}
          </p>
        </div>
      ) : null}

      {GROUPS.map((group) => {
        const rows = shown.filter((p) => group.has(p))
        if (rows.length === 0) return null
        return (
          <section key={group.label}>
            {/* -mx-4 escapes `.scroll`'s gutter and px-4 puts the label back on it, so the band
                runs edge to edge while its text stays in line with every row. Same recipe as the
                More menu's section bands. */}
            <div className="-mx-4 mt-2 bg-ground-deep px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
              {group.label}
            </div>
            {/* White cards on the grey ground, 8px apart — the reference's separator is the
                ground showing through between blocks, not a hairline. */}
            <div className="-mx-4 space-y-2 bg-ground-deep pb-2">
              {rows.map((p) => (
                <FundRow
                  key={p.productId}
                  product={p}
                  planned={planned.has(p.productId)}
                  onPick={() => onPick(p)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {shown.length === 0 ? (
        <p className="mt-6 text-center text-[15px] text-ink-mid">
          No stage of your roadmap names a product on the shelf yet.
        </p>
      ) : null}
    </>
  )
}

/* ---------------------------------------------------------------- Pieces */

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`ds-press h-8 flex-none rounded-pill border-[1.5px] border-solid px-3.5 text-[13px] font-semibold ${
        on
          ? 'border-accent bg-accent text-on-accent'
          : 'border-hairline-mint bg-surface text-ink-mid'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * One product, in the reference's three bands.
 *
 * The whole card is the tap target *and* it carries an `Add` button, which is the reference's
 * arrangement and looks like a duplicate until you use it: the button is the one-tap path for
 * somebody who already knows the fund, the card is the path for somebody reading the figures. So
 * `Add` is a real button and the surrounding card is a second, larger control that does the same
 * thing — not a link wrapping a button, which is the markup that would break both.
 */
function FundRow({
  product,
  planned,
  onPick,
}: {
  product: ShelfProduct
  planned: boolean
  onPick: () => void
}): ReactNode {
  /* The riskometer is not in here: it is already the second chip, and at `Moderately High` it is
     the one value in the set too long for a quarter of a 430px row. */
  const facts: { label: string; value: string }[] = [
    { label: 'Minimum', value: inr(product.minInvestment) },
    { label: 'Lock-in', value: product.lockInYears > 0 ? `${product.lockInYears}y` : 'None' },
  ]
  if (product.expenseRatio !== undefined) {
    facts.push({ label: 'Expense', value: `${product.expenseRatio}%` })
  }
  if (product.indicativeReturn !== undefined) {
    facts.push({ label: 'Indicative', value: `${product.indicativeReturn}%` })
  }

  return (
    <article className="bg-surface">
      {planned ? (
        <span className="ml-4 inline-flex rounded-b-sm bg-accent-soft px-2.5 pb-1.5 pt-1.5 text-[11px] font-bold leading-none text-accent-text">
          In your plan
        </span>
      ) : null}
      <div className={`px-4 pb-3.5 ${planned ? 'pt-2' : 'pt-3.5'}`}>
        <div className="flex items-start gap-3">
          <SchemeMark manufacturer={product.manufacturer} />
          <button
            type="button"
            onClick={onPick}
            className="ds-press min-w-0 flex-1 border-0 bg-transparent p-0 text-left"
          >
            <span className="block text-[15px] font-semibold leading-snug text-ink">
              {product.name}
            </span>
            <span className="mt-0.5 block text-[12.5px] text-ink-soft">{product.manufacturer}</span>
          </button>
          <Button size="sm" tone="secondary" onClick={onPick} ariaLabel={`Add ${product.name}`}>
            Add
          </Button>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Tag>{product.category}</Tag>
          <Tag>{product.riskometer} risk</Tag>
          {product.coverAmount !== undefined ? <Tag>{inr(product.coverAmount)} cover</Tag> : null}
        </div>

        {/* Four equal columns whatever the row carries, so the figures line up down the whole
            list the way they do in frames 02 and 03. A row with three facts leaves the fourth
            cell empty; it does not stretch three across four or invent a value for it. */}
        <dl className="m-0 mt-3 grid grid-cols-4 gap-2 border-0 border-t border-solid border-hairline-mint pt-2.5">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="truncate text-[11.5px] text-ink-soft">{f.label}</dt>
              <dd className="m-0 mt-0.5 truncate text-[13.5px] font-semibold tabular-nums text-ink">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  )
}

/** The reference's grey capsules under the fund name: a category, not an action. */
function Tag({ children }: { children: ReactNode }): ReactNode {
  return (
    <span className="rounded-sm bg-ground-deep px-2 py-1 text-[11.5px] font-medium text-ink-mid">
      {children}
    </span>
  )
}

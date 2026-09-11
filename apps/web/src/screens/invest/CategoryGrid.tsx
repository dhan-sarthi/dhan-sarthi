/**
 * The explore section — a tinted ground, an eyebrow, a heading, and the grid of categories.
 *
 * SmartWealth's Discover opens on a grid of product categories, not on a list of products, and
 * that grid is most of why its Discover reads as designed rather than as a table: a customer who
 * does not yet know what they want is offered *kinds* first and instruments second. The list is
 * still underneath — this narrows it.
 *
 * `09-start-100/01-explore-and-invest` is more than the grid, though, and the first pass shipped
 * only the grid. The frame carries a **full-bleed rose panel** running up under the notch with
 * `Build wealth` over `Explore and Invest` above eight **white tiles**, and the panel is what
 * makes the icons read as a set rather than as loose stickers on the page. That structure is
 * here: a `tint-sage` band escaping the gutter, the eyebrow, the section heading, and a white
 * rounded tile behind every mark.
 *
 * The reference gets its lift from colour — a rose ground under a lavender promo. We are one
 * green by decision (`DESIGN.md`), so the same lift has to come from weight and form instead:
 * a flat tinted panel against the white page, white tiles against the panel, and the illustrated
 * marks carrying the only hues on the screen. Selection is a ring, not a second tint, for the
 * same reason — two tints in this palette draw identical pixels.
 *
 * The icons are the illustrated set in `public/icons`, one per category. They carry more colour
 * than the rest of the app on purpose: the chrome is one green, and the illustration is where a
 * bank is allowed to be warm. Each icon is green-based with a single accent hue, which is what
 * keeps fourteen of them looking like one set. See DESIGN.md.
 */
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { ShelfProduct } from '@dhan/contracts'
import { CATEGORY_ICON, categoryLabel } from './categories.ts'

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
      if (p.transactable && CATEGORY_ICON[p.category] && !seen.includes(p.category))
        seen.push(p.category)
    }
    return seen
  }, [shelf])

  if (categories.length === 0) return null

  return (
    /* -mx-4 escapes `.scroll`'s 16px gutter and px-4 puts the content back on it, so the panel
       runs edge to edge and butts against the header slab the way the rose panel does. */
    <section aria-label="Explore and invest" className="-mx-4 bg-tint-sage px-4 pb-4 pt-4">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
        Build wealth
      </p>
      <h2 className="m-0 mt-1 text-[22px] font-bold leading-tight text-brand-deep">
        Explore and invest
      </h2>

      <div className="mt-4 grid grid-cols-4 gap-x-1 gap-y-3.5">
        {categories.map((category) => {
          const on = selected === category
          return (
            <button
              key={category}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(on ? null : category)}
              className="ds-press flex flex-col items-center gap-1.5 rounded-md border-0 bg-transparent px-0.5 pb-0.5 pt-0.5"
            >
              {/* The reference's 52pt white tile with a 14pt radius and a very soft shadow. On a
                  tinted ground it is what separates one mark from the next; on white it would be
                  invisible, which is why the panel and the tile arrived together. */}
              <span
                className={`grid size-14 flex-none place-items-center rounded-md bg-surface shadow-card transition-shadow duration-200 ${
                  on ? 'ring-2 ring-accent' : ''
                }`}
              >
                <img
                  src={`/icons/${CATEGORY_ICON[category]}.png`}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  width={224}
                  height={224}
                  className="size-11 flex-none select-none object-contain"
                />
              </span>
              <span
                className={`text-center text-[11px] leading-[13px] ${
                  on ? 'font-bold text-accent-text' : 'font-medium text-ink-mid'
                }`}
              >
                {categoryLabel(category)}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

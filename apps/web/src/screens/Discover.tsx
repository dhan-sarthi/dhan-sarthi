/**
 * Discover — the shelf, and the way into a purchase.
 *
 * ## What the frames actually carry
 *
 * `09-start-100/01-explore-and-invest` is four things stacked, and the first pass built one of
 * them. Top to bottom the reference is:
 *
 * 1. a full-bleed **tinted section panel** running up under the notch, with an eyebrow
 *    (`Build wealth`) over a section heading (`Explore and Invest`) and the tile grid inside it;
 * 2. a **promo carousel** — one wide card with a title, a chevron, two lines of copy and an
 *    illustration bleeding off its right edge — with **page dots** beneath;
 * 3. a pale **feature card**: eyebrow, big headline with a hand-drawn underline, then rows of
 *    icon · bold title · grey subtitle · trailing check, ruled apart by hairlines;
 * 4. the list.
 *
 * Ours was a grid on white followed by two paragraphs. All four are here now. The panel and the
 * grid live in `invest/CategoryGrid.tsx`; the carousel and the feature card are below.
 *
 * ## Why it does not look like the frame
 *
 * Most of that screen's richness is *hue*: a rose ground under a lavender promo under a pale-cyan
 * card, three unrelated colours on one page. This app is one green by decision — `DESIGN.md`, and
 * the note there that the three tint names draw identical pixels, so you cannot separate two
 * things by picking two of them. The same density therefore has to come from **weight and form**:
 * a flat tinted panel against the white page, white tiles against the panel, a deeper
 * `accent-soft` card for the promos so "emphasised" is visible, hairline-ruled rows, and the
 * illustrated marks carrying the only accents on the screen.
 *
 * ## What is omitted, and why
 *
 * The reference's promo copy is marketing for features this app does not have, and its Model
 * Portfolio card belongs to another agent's surface. So the three promos are the three real
 * destinations Discover can reach — the low-minimum slice of the shelf, the advisor, the record —
 * and the feature card is the one thing this screen has that the reference's does not: the
 * suitability gate, with its rows read off `view.rules` rather than written here.
 * `07-DECISIONS.md` §3 calls that a feature to surface rather than a check to hide, and the first
 * place to surface it is before anyone has picked anything.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  CalendarClock,
  Check,
  ChevronRight,
  CreditCard,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ShelfProduct, Verdict, View } from '@dhan/contracts'
import { Screen } from '../components/Screen.tsx'
import { Art } from '../components/Art.tsx'
import type { ArtName } from '../components/Art.tsx'
import { Head } from '../components/ui.tsx'
import { inr } from '../lib/money.ts'
import { Invest } from './invest/Invest.tsx'
import { plannedIds } from './invest/planned.ts'
import { ShelfList } from './invest/ShelfList.tsx'
import { CategoryGrid } from './invest/CategoryGrid.tsx'
import { categoryLabel } from './invest/categories.ts'

/**
 * What the shelf is narrowed to. `null` is everything, which is how the screen opens.
 *
 * Two kinds rather than one string, because the reference's headline tile — the one the whole
 * feature is named after, `Start with ₹100 Funds` — is not a category. It is a price band, and
 * IDBI's own is whatever the cheapest thing on the shelf costs.
 */
type Filter = { kind: 'category'; value: string } | { kind: 'entry' } | null

export function Discover({
  view,
  evaluate,
  onAsk,
  onOpenBaskets,
  onSeeRecord,
}: {
  view: View
  /** The suitability gate, injected. See the header of `screens/invest/Invest.tsx`. */
  evaluate: (productId: string, monthly: number) => Promise<Verdict>
  onAsk: () => void
  onOpenBaskets: () => void
  onSeeRecord: () => void
}): ReactNode {
  /* The spine takes the screen once it opens, and holds the basket for as long as it is up.
     There is no cart on the server to hold it instead. */
  const [buying, setBuying] = useState<ShelfProduct | null>(null)
  const [filter, setFilter] = useState<Filter>(null)

  /* The cheapest way in, computed rather than written down: the lowest first instalment across
     the investments IDBI can actually sell, and everything that opens at it. Insurance is out of
     it — a ₹20 accident premium is not "start small", it is a different product. */
  const entry = useMemo(() => {
    const investable = view.shelf.filter((p) => p.transactable && p.insuranceProduct !== true)
    if (investable.length === 0) return null
    const floor = Math.min(...investable.map((p) => p.minInvestment))
    return {
      floor,
      ids: new Set(investable.filter((p) => p.minInvestment <= floor).map((p) => p.productId)),
    }
  }, [view.shelf])

  const shown = useMemo(() => {
    if (filter === null) return view.shelf
    if (filter.kind === 'category') return view.shelf.filter((p) => p.category === filter.value)
    return view.shelf.filter((p) => entry?.ids.has(p.productId) === true)
  }, [view.shelf, filter, entry])

  if (buying) {
    return (
      <Invest
        view={view}
        initial={buying}
        evaluate={evaluate}
        onExit={() => setBuying(null)}
        onSeeRecord={onSeeRecord}
      />
    )
  }

  const count = shown.filter((p) => p.transactable).length

  const promos: Promo[] = []
  if (entry !== null && entry.ids.size > 0) {
    promos.push({
      id: 'entry',
      art: 'promo-start-small',
      title: `Start from ${inr(entry.floor)}`,
      body: `${entry.ids.size} of the products IDBI can sell you open at ${inr(entry.floor)}. Same rules, same record.`,
      onClick: () => setFilter({ kind: 'entry' }),
    })
  }
  /* The reference's `Try Model Portfolio` promo. Ours names the offer honestly: a basket is the
     shelf filtered by one rule you can check against the cards, not a curated product IDBI sells. */
  promos.push({
    id: 'baskets',
    art: 'empty-basket',
    title: 'A basket, not a shortlist',
    body: 'Split one amount across the shelf by a rule you can check — no lock-in, no equity, or locked away. Same gate at the end.',
    onClick: onOpenBaskets,
  })
  promos.push({
    id: 'ask',
    art: 'promo-advisor',
    title: 'Ask Uday first',
    body: 'Have any product on the shelf checked against your position, with no order to place at the end of it.',
    onClick: onAsk,
  })
  promos.push({
    id: 'record',
    art: 'order-recorded',
    title: 'Every check, on the record',
    body: `${view.rules.length} rules, the sentence each one wrote, and a chain nobody can quietly edit.`,
    onClick: onSeeRecord,
  })

  return (
    <Screen header={<Head title="Discover" />}>
      <CategoryGrid
        shelf={view.shelf}
        selected={filter?.kind === 'category' ? filter.value : null}
        onSelect={(c) => setFilter(c === null ? null : { kind: 'category', value: c })}
      />

      {/* Filtered, the screen becomes the reference's `02-start-100-fund-list`: a bar, a count
          and the list. The marketing goes away rather than sitting between the tile you just
          pressed and the answer to it. */}
      {filter === null ? (
        <>
          <PromoCarousel promos={promos} />
          <GateCard rules={view.rules} />
        </>
      ) : null}

      <ListBar
        label={
          filter === null
            ? null
            : filter.kind === 'category'
              ? categoryLabel(filter.value)
              : `From ${inr(entry?.floor ?? 0)}`
        }
        count={count}
        onClear={() => setFilter(null)}
      />

      <ShelfList shelf={shown} planned={plannedIds(view.roadmap)} onPick={setBuying} />
    </Screen>
  )
}

/* ---------------------------------------------------------------- The carousel */

interface Promo {
  id: string
  art: ArtName
  title: string
  body: string
  onClick: () => void
}

/**
 * The reference's banner carousel: one card at a time, swiped, with page dots under it.
 *
 * Scroll-snap rather than a transform track, because a snapping overflow scroller is the one
 * carousel that keeps working with a trackpad, a touch screen, a keyboard and a screen reader
 * without any of them being special-cased. The dots read the scroller rather than driving it,
 * so the active dot cannot disagree with what is on screen.
 */
function PromoCarousel({ promos }: { promos: readonly Promo[] }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    const kids = Array.from(el.children) as HTMLElement[]
    if (kids.length === 0) return
    const origin = kids[0]!.offsetLeft
    let best = 0
    let bestDistance = Infinity
    kids.forEach((kid, i) => {
      const d = Math.abs(kid.offsetLeft - origin - el.scrollLeft)
      if (d < bestDistance) {
        bestDistance = d
        best = i
      }
    })
    setActive(best)
  }, [])

  const goTo = (i: number): void => {
    const el = ref.current
    const kid = el?.children[i] as HTMLElement | undefined
    if (!el || !kid) return
    el.scrollTo({
      left: kid.offsetLeft - (el.children[0] as HTMLElement).offsetLeft,
      behavior: 'smooth',
    })
  }

  return (
    <section aria-label="Ways in" className="mt-4">
      <div
        ref={ref}
        onScroll={onScroll}
        className="-mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {promos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={p.onClick}
            className="ds-press flex w-[86%] flex-none snap-start items-center gap-1 overflow-hidden rounded-md border-0 bg-accent-soft py-3 pl-4 pr-1 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-0.5 text-[17px] font-bold leading-tight text-brand-deep">
                <span className="min-w-0 truncate">{p.title}</span>
                <ChevronRight size={17} strokeWidth={2.6} className="flex-none" />
              </span>
              <span className="mt-1.5 block text-[13px] leading-snug text-ink-mid">{p.body}</span>
            </span>
            {/* The reference's illustration bleeds off the card's right and bottom edges; the
                negative margins are what let a square mark do that inside the padding box. */}
            <Art name={p.art} size="sm" className="-my-3 -mr-2 flex-none" />
          </button>
        ))}
      </div>

      {/* "Page dots where there is more than one" — a single dot is not a control, it is noise. */}
      {promos.length > 1 ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {promos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Show ${p.title}`}
              aria-current={i === active}
              onClick={() => goTo(i)}
              className={`h-[7px] rounded-pill border-0 p-0 transition-all duration-200 ${
                i === active ? 'w-[18px] bg-accent' : 'w-[7px] bg-chart-idle'
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

/* ---------------------------------------------------------------- The gate card */

/** A short title for a rule, so a row is not two sentences. The sentence is the rule's own. */
const RULE_TITLE: Record<string, string> = {
  HIGH_INTEREST_DEBT: 'Expensive debt first',
  EMERGENCY_BUFFER: 'A cushion before a lock-in',
  VOLATILITY_VS_HORIZON: 'Time before risk',
  AFFORDABILITY: 'Only what you can spare',
}

const RULE_ICON: Record<string, LucideIcon> = {
  HIGH_INTEREST_DEBT: CreditCard,
  EMERGENCY_BUFFER: ShieldCheck,
  VOLATILITY_VS_HORIZON: CalendarClock,
  AFFORDABILITY: Wallet,
}

/** Four of the nine, in the order the gate applies them. The card says there are more. */
const SHOWN_RULES = [
  'HIGH_INTEREST_DEBT',
  'EMERGENCY_BUFFER',
  'VOLATILITY_VS_HORIZON',
  'AFFORDABILITY',
] as const

/**
 * The reference's pale feature card, carrying this app's feature instead of theirs.
 *
 * Same shape as `Try Model Portfolio`: eyebrow, a headline with a drawn underline under it, then
 * rows of icon · bold title · grey subtitle · trailing check with hairlines between. What the
 * rows say is not written here — it is `view.rules`, the same list the record prints and the same
 * sentence a refusal quotes, so this card cannot drift from what the gate actually does.
 *
 * It is a hand-rolled card rather than `Card`, for one reason: `Card` pins any `h2` inside it to
 * 18px, and the reference's headline is the same 22px as the section heading above. Every other
 * string is `Card`'s own recipe from `DESIGN.md`.
 */
function GateCard({ rules }: { rules: View['rules'] }): ReactNode {
  const rows = SHOWN_RULES.map((id) => rules.find((r) => r.id === id)).filter(
    (r): r is { id: string; description: string } => r !== undefined,
  )
  if (rows.length === 0) return null

  return (
    <section className="mb-3 mt-5 min-w-0 rounded-md bg-tint-sage p-4">
      <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
        Before any order
      </p>
      <h2 className="m-0 mt-1 text-[22px] font-bold leading-tight text-brand-deep">
        Checked before it is placed
      </h2>
      {/* The frame's hand-drawn double underline, in one hue at two weights. */}
      <svg
        viewBox="0 0 190 12"
        className="mt-1 block h-3 w-[190px] max-w-full text-brand"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 6.2c31-4.1 66-4.9 102-2.4 26 1.8 49 2.5 82 .5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M16 10.4c36-2.7 74-3 114-1.3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>

      <div className="mt-3.5">
        {rows.map((rule, i) => (
          <div
            key={rule.id}
            className={`flex items-start gap-3 py-3 ${
              i > 0 ? 'border-0 border-t border-solid border-hairline-mint' : ''
            }`}
          >
            <span className="grid size-9 flex-none place-items-center rounded-sm bg-surface text-brand-deep">
              {(() => {
                const Icon = RULE_ICON[rule.id] ?? ShieldCheck
                return <Icon size={18} strokeWidth={2} />
              })()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug text-ink">
                {RULE_TITLE[rule.id] ?? rule.id}
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-soft">
                {rule.description}
              </span>
            </span>
            <Check size={18} strokeWidth={2.6} className="mt-0.5 flex-none text-brand" />
          </div>
        ))}
      </div>

      <p className="mb-0 mt-3 text-[13px] leading-relaxed text-ink-soft">
        {rules.length} rules in all, run against what your statements actually show. The earliest
        one to fail is the one you are shown — IDBI sells some of the products below that it will
        refuse to sell you.
      </p>
    </section>
  )
}

/* ---------------------------------------------------------------- The list bar */

/**
 * The reference's `1267 Mutual Fund Schemes` line, plus the way back out of a filter.
 *
 * The count is there in both states because a list with no count is a list of unknown length;
 * the chip and `Show all` only exist when something is narrowing it, and they are the whole
 * answer to "is the filtered state finished" — there was previously a sentence with an inline
 * link, which is not a control anyone finds.
 */
function ListBar({
  label,
  count,
  onClear,
}: {
  label: string | null
  count: number
  onClear: () => void
}): ReactNode {
  return (
    <div className="-mx-4 mt-4 border-0 border-b border-solid border-hairline-mint bg-surface px-4 pb-3">
      {label !== null ? (
        <div className="mb-2.5 flex items-center gap-2">
          <span className="inline-flex min-w-0 items-center rounded-pill bg-accent px-3 py-1.5 text-[13px] font-semibold text-on-accent">
            <span className="truncate">{label}</span>
          </span>
          <button
            type="button"
            onClick={onClear}
            className="ds-press ml-auto inline-flex h-8 flex-none items-center gap-1 rounded-pill border-[1.5px] border-solid border-accent bg-surface px-3 text-[13px] font-semibold text-accent-text"
          >
            <X size={14} strokeWidth={2.6} />
            Show all
          </button>
        </div>
      ) : null}
      <p className="m-0 text-[13px] text-ink-soft">
        {count} {count === 1 ? 'product' : 'products'}
        {label === null ? ' IDBI can put you into' : ''}
      </p>
    </div>
  )
}

/**
 * Five tabs, with the advisor raised in the middle.
 *
 *   Discover   the shelf, and the route into a purchase. Net-new; the app has no buy route yet
 *   Dashboard  what you are worth and what you are doing about it today. Absorbs Money
 *   Ask        Uday, full screen. Voice for the decisions, text for the check-ins
 *   Plan       the sequenced route, and the recalculation history
 *   More       the record, your details, and the demo's own controls
 *
 * ## Two raised things, and why they are different shapes
 *
 * SmartWealth's signature piece of chrome is that the *active* tab sits in a white card lifted
 * out of the bar. This app already lifted something out of the bar: a dark green disc in the
 * centre, permanently, for the advisor. `07-DECISIONS.md` settles the merge rather than picking
 * one — the centre stays the advisor and stays raised, and the other four get the reference's
 * active treatment. So the bar has two lifted shapes and they read as two different things,
 * which is correct: the disc is a destination that is always there, the card is *where you are*.
 *
 * The count is five, not the reference's three, and that is deliberate. The raised centre needs
 * an odd count to sit centred with equal halves either side, and the advisor is the one thing in
 * this product that SmartWealth has no answer for at all — demoting it to a menu row to match a
 * tab count observed in a marketing video would copy the reference's priorities, not its craft.
 *
 * ## What the card costs, and what it changes
 *
 * The reference's card is 216pt wide on a three-tab bar — 1.6× its own column. Five columns on a
 * 375px phone are 75px each, so ours is the column less a 4px inset either side. It is the same
 * mechanic at the width this bar has.
 *
 * The active tab used to be told by weight alone, because both states were white on the green
 * gradient and a colour change would have been decoration. Once the active item moves onto a
 * white card that stops being true: it needs an ink that survives on white, which is
 * `accent-text` — IDBI's action colour used as text, 5.5:1, where the raw orange is 2.6:1 and
 * would fail even the 3:1 a 22px monoline glyph needs.
 *
 * ## The bar is a flex sibling
 *
 * Never absolutely positioned, so it is structurally impossible for it to leave the screen. The
 * lifted card and the disc escape it by being siblings of their button rather than children of
 * one: `.ds-press` sets `overflow: hidden` to keep the ripple inside the pill, and it clips
 * anything reaching past the button's edge just as happily.
 */
import type { ReactNode } from 'react'
import { Compass, LayoutGrid, Menu, Route, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRipple } from '../lib/motion.ts'

export type TabId = 'discover' | 'dashboard' | 'ask' | 'plan' | 'more'

const TABS: readonly { id: TabId; label: string; glyph: LucideIcon; centre?: boolean }[] = [
  { id: 'discover', label: 'Discover', glyph: Compass },
  { id: 'dashboard', label: 'Dashboard', glyph: LayoutGrid },
  { id: 'ask', label: 'Ask Uday', glyph: Video, centre: true },
  { id: 'plan', label: 'Plan', glyph: Route },
  { id: 'more', label: 'More', glyph: Menu },
]

export function TabBar({
  active,
  onChange,
}: {
  active: TabId
  onChange: (id: TabId) => void
}): ReactNode {
  const ripple = useRipple()
  return (
    <nav
      className="grid min-h-[68px] flex-none grid-cols-5 rounded-t-lg bg-gradient-to-b from-nav-top to-nav-bottom pb-[env(safe-area-inset-bottom,0px)] text-white"
      aria-label="Sections"
    >
      {TABS.map((t) => {
        const Glyph = t.glyph
        const isActive = t.id === active

        if (t.centre) {
          return (
            <div key={t.id} className="relative flex min-w-0">
              {/* No `ds-press` on the button: it would clip the disc it is lifting. The disc
                  carries it instead, so the press scales the disc and the ripple stays in it. */}
              <button
                type="button"
                className="relative flex min-w-0 flex-1 flex-col items-center justify-end gap-1 border-0 bg-transparent px-1 pb-1.5 pt-2 text-white"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onChange(t.id)}
              >
                <span
                  aria-hidden="true"
                  onPointerDown={ripple}
                  className="ds-press grid size-[60px] -translate-y-4 -mb-[22px] place-items-center rounded-pill border-4 border-solid border-white bg-brand-deep shadow-lift ring-2 ring-accent"
                >
                  <Glyph size={26} strokeWidth={1.75} />
                </span>
                <span
                  className={`truncate text-[10px] leading-[14px] min-[360px]:text-[11px] ${
                    isActive ? 'font-bold' : 'font-medium'
                  }`}
                >
                  {t.label}
                </span>
              </button>
            </div>
          )
        }

        return (
          <div key={t.id} className="relative flex min-w-0">
            {/* The lifted card. A sibling of the button so it can reach 8px above the bar, and
                `pointer-events-none` so the press still lands on the button underneath it.
                It spans the full column: at five columns the longest label ("Dashboard", 61px)
                is wider than a column inset by 8px on a 320px screen, and the text spilled past
                the card onto the green. The label drops to 10px below 360px for the same reason. */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 -top-2 bottom-1 rounded-lg bg-surface shadow-lift transition-all duration-200 ease-[cubic-bezier(0.22,0.8,0.3,1)] ${
                isActive ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
              }`}
            />
            <button
              type="button"
              className={`ds-press relative z-[1] flex min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-lg border-0 bg-transparent px-1 pb-1.5 pt-2 transition-colors duration-200 ${
                isActive ? 'text-accent-text' : 'text-white'
              }`}
              aria-current={isActive ? 'page' : undefined}
              onPointerDown={ripple}
              onClick={() => onChange(t.id)}
            >
              <span
                className={`grid size-6 place-items-center transition-transform duration-200 ${
                  isActive ? '-translate-y-0.5 scale-110' : ''
                }`}
                aria-hidden="true"
              >
                <Glyph size={22} strokeWidth={isActive ? 2.3 : 1.75} />
              </span>
              <span
                className={`truncate text-[10px] leading-[14px] min-[360px]:text-[11px] ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {t.label}
              </span>
            </button>
          </div>
        )
      })}
    </nav>
  )
}

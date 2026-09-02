/**
 * The five tabs, with the advisor in the middle.
 *
 * The arrangement is Cleo's and it is right: putting the assistant in the centre of the bar makes
 * it the thing you reach for rather than a feature you have to go and find. Ours differs in what
 * the tabs are, and the differences are the product:
 *
 *   Today   the daily plan — one number, one action
 *   Plan    the route, and the recalculation history. Replaces the cut Future Self screen
 *   Ask     Uday, full screen. Voice for the decisions, text for the check-ins
 *   Money   the 360 view. Boring on purpose; it is the "you know everything about me" proof
 *   Record  the audit trail and the consent centre. The compliance artefact, made visible
 *
 * `Record` exists as much for the judge as the customer. A remote banker cannot feel a
 * conversation, but recognises a paper trail.
 *
 * The chrome is GO Mobile+'s: a green gradient bar with white monoline icons, the active item
 * told by weight alone, and the centre item raised out of the bar as a dark green disc with a
 * white border and an orange ring. The bar is a flex sibling of the scroll region, never
 * absolutely positioned, so it is structurally impossible for it to leave the screen.
 */
import type { ReactNode } from 'react'
import { Home, IndianRupee, Route, ScrollText, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type TabId = 'today' | 'plan' | 'ask' | 'money' | 'record'

const TABS: readonly { id: TabId; label: string; glyph: LucideIcon; centre?: boolean }[] = [
  { id: 'today', label: 'Today', glyph: Home },
  { id: 'plan', label: 'Plan', glyph: Route },
  { id: 'ask', label: 'Ask Uday', glyph: Video, centre: true },
  { id: 'money', label: 'Money', glyph: IndianRupee },
  { id: 'record', label: 'Record', glyph: ScrollText },
]

export function TabBar({
  active,
  onChange,
}: {
  active: TabId
  onChange: (id: TabId) => void
}): ReactNode {
  return (
    <nav
      className="grid min-h-16 flex-none grid-cols-5 rounded-t-lg bg-gradient-to-b from-nav-top to-nav-bottom pb-[env(safe-area-inset-bottom,0px)] text-white"
      aria-label="Sections"
    >
      {TABS.map((t) => {
        const Glyph = t.glyph
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            type="button"
            className="flex min-w-0 flex-col items-center justify-end gap-1 border-0 bg-transparent px-1 pb-1.5 pt-2 text-white"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(t.id)}
          >
            {t.centre ? (
              <span
                className="grid size-[60px] -translate-y-4 -mb-[22px] place-items-center rounded-pill border-4 border-solid border-white bg-brand-deep shadow-lift ring-2 ring-accent"
                aria-hidden="true"
              >
                <Glyph size={26} strokeWidth={1.75} />
              </span>
            ) : (
              <span className="grid size-6 place-items-center" aria-hidden="true">
                <Glyph size={22} strokeWidth={1.75} />
              </span>
            )}
            <span
              className={`truncate text-[11px] leading-[14px] ${isActive ? 'font-bold' : 'font-medium'}`}
            >
              {t.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

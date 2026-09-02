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
 */
import type { ReactNode } from 'react'

export type TabId = 'today' | 'plan' | 'ask' | 'money' | 'record'

const TABS: readonly { id: TabId; label: string; glyph: string; centre?: boolean }[] = [
  { id: 'today', label: 'Today', glyph: '◎' },
  { id: 'plan', label: 'Plan', glyph: '◈' },
  { id: 'ask', label: 'Ask Uday', glyph: 'U', centre: true },
  { id: 'money', label: 'Money', glyph: '₹' },
  { id: 'record', label: 'Record', glyph: '☰' },
]

export function TabBar({
  active,
  onChange,
}: {
  active: TabId
  onChange: (id: TabId) => void
}): ReactNode {
  return (
    <nav className="tabs" aria-label="Sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab${t.centre ? ' centre' : ''}`}
          aria-current={t.id === active ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <span className="glyph" aria-hidden="true">
            {t.glyph}
          </span>
          <span className="label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}

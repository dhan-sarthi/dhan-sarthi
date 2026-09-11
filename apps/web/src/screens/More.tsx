/**
 * More — the fifth tab, and the only screen in the app that is purely a way to somewhere else.
 *
 * SmartWealth's `more-menu` is a flat white list with no cards, grouped by full-bleed tinted
 * section bands, each row a glyph, a title, a sub-label and a chevron. That is the shape here;
 * the bands are `ground-deep` with an eyebrow label, which is where `03-PALETTE-MAP.md` sends
 * their `#F0F5FA` and what this app already uses for a section heading.
 *
 * What is behind the rows is this app's, not theirs. `06-EXISTING-APP-MAP.md` puts Record,
 * Reports, Family and settings here; Reports and Family do not exist and are not invented. What
 * does exist and had nowhere obvious to live is the profile, the holdings and the account-link
 * consent — all three are sheets that were only reachable from a button halfway down another
 * screen — and the customer picker, which is how a reviewer changes persona.
 *
 * Record is *pushed*, not a tab of its own any more, and that push is why `Head` grew a back
 * arrow. It is one level deep and hand-rolled rather than routed: one screen does not need a
 * router, and the day a second one does, this is the state to lift.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link2, ScrollText, UserRound, UsersRound, Wallet } from 'lucide-react'
import type { ConsentScope, SessionState, View } from '@dhan/contracts'
import { Screen } from '../components/Screen.tsx'
import type { Tier } from '../components/TierBadge.tsx'
import { Head, ListRow } from '../components/ui.tsx'
import type { RecordState } from '../lib/record.ts'
import { Record } from './Record.tsx'

const GLYPH = { size: 20, strokeWidth: 1.9 } as const

export function More({
  startOn = 'menu',
  view,
  record,
  session,
  tier,
  busy,
  onConsent,
  onOpenProfile,
  onEditHoldings,
  onLinkAccounts,
  onSwitchCustomer,
  onRefresh,
}: {
  /**
   * Which page to open on.
   *
   * The transaction spine's success screen offers "see what was recorded", and the record is
   * one level inside this tab. More is unmounted while Discover is on screen, so the caller
   * sets the destination and the tab change mounts it there — no lifted state, no router.
   */
  startOn?: 'menu' | 'record'
  view: View
  record: RecordState
  session: SessionState | null
  tier: Tier
  busy: boolean
  onConsent: (scope: ConsentScope, granted: boolean) => void
  onOpenProfile: () => void
  onEditHoldings: () => void
  onLinkAccounts: () => void
  /** Back to the picker. The app has no sign-in; a persona *is* the session. */
  onSwitchCustomer: () => void
  onRefresh: () => Promise<void>
}): ReactNode {
  const [page, setPage] = useState<'menu' | 'record'>(startOn)

  if (page === 'record') {
    return (
      <Record
        view={view}
        record={record}
        session={session}
        tier={tier}
        busy={busy}
        onConsent={onConsent}
        onEditProfile={onOpenProfile}
        onBack={() => setPage('menu')}
        onRefresh={onRefresh}
      />
    )
  }

  const decisions = record.record?.adviceRecords.length ?? 0

  return (
    <Screen header={<Head title="More" sub={view.snapshot.customer.name} />}>
      <Section label="Track and manage" />
      <ListRow
        icon={<ScrollText {...GLYPH} />}
        title="Record"
        sub="Every recommendation, the rules behind it, and your data"
        badge={decisions}
        onClick={() => setPage('record')}
      />

      <Section label="Your details" />
      <ListRow
        icon={<UserRound {...GLYPH} />}
        title="About you"
        sub="Income, dependants, risk profile, tax regime"
        onClick={onOpenProfile}
      />
      <ListRow
        icon={<Wallet {...GLYPH} />}
        title="What you already own"
        sub="Funds, deposits, PPF and NPS, insurance"
        onClick={onEditHoldings}
      />
      <ListRow
        icon={<Link2 {...GLYPH} />}
        title="Linked accounts"
        sub="Account Aggregator consent, verified against the bank"
        onClick={onLinkAccounts}
      />

      <Section label="This demo" />
      <ListRow
        icon={<UsersRound {...GLYPH} />}
        title="Switch customer"
        sub="Each persona fires a different suitability rule"
        onClick={onSwitchCustomer}
      />
    </Screen>
  )
}

/**
 * The full-bleed band between groups.
 *
 * `-mx-4` escapes `.scroll`'s gutter and `px-4` puts the label back on it, which is the whole
 * trick: the band runs edge to edge and its text still lines up with every row above and below.
 */
function Section({ label }: { label: string }): ReactNode {
  return (
    <div className="-mx-4 mt-2 bg-ground-deep px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
      {label}
    </div>
  )
}

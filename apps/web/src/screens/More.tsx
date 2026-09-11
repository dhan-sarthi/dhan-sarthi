/**
 * More — the fifth tab, and the only screen in the app that is purely a way to somewhere else.
 *
 * This file is now the router and nothing else. The menu itself, the reports flow and the
 * investment-profile flow live in `screens/more/`, which is where the surface grew to; what stays
 * here is the one decision the rest of the app depends on — that More is a stack, that its pages
 * are pushed rather than routed, and that `startOn` is the only way in from outside.
 *
 * Four pages, one level deep:
 *
 *   menu     the grouped account list (`screens/more/MoreMenu.tsx`)
 *   record   the hash-chained advice record — this app's order history, and better
 *   reports   → statement config → download (`screens/more/Reports.tsx`)
 *   profile  the risk profile: pick one, or answer six questions
 *
 * Still hand-rolled rather than routed. One `useState` holds the whole stack because the stack is
 * one deep and every page's back button goes to the same place; the day a page needs to push a
 * page that pushes a page, this is the state to lift into a real router rather than the place to
 * add a third `page` variable.
 *
 * `startOn` is the transaction spine's edge: its success screen offers "see what was recorded",
 * and More is unmounted while another tab is on screen, so the caller sets the destination and
 * the tab change mounts it there. `App.tsx` resets it to `menu` on a tab tap, so a later entry is
 * a fresh one.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ConsentScope, SessionState, View } from '@dhan/contracts'
import type { Tier } from '../components/TierBadge.tsx'
import type { RecordState } from '../lib/record.ts'
import { Record } from './Record.tsx'
import { InvestmentProfile, MoreMenu, Reports } from './more/index.ts'

type Page = 'menu' | 'record' | 'reports' | 'profile'

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
   * Only the two the spine knows about. Adding the reports or the profile here would make an
   * internal page of this tab part of the app's entry surface, which is the opposite of what
   * keeping the stack local buys.
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
  const [page, setPage] = useState<Page>(startOn)
  const back = (): void => setPage('menu')

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
        onEditRiskProfile={() => setPage('profile')}
        onBack={back}
        onRefresh={onRefresh}
      />
    )
  }

  if (page === 'reports') {
    return <Reports view={view} tier={tier} onBack={back} />
  }

  if (page === 'profile') {
    return <InvestmentProfile view={view} onBack={back} onSaved={onRefresh} />
  }

  return (
    <MoreMenu
      view={view}
      decisions={record.record?.adviceRecords.length ?? 0}
      onOpenRecord={() => setPage('record')}
      onOpenReports={() => setPage('reports')}
      onOpenRiskProfile={() => setPage('profile')}
      onOpenProfile={onOpenProfile}
      onEditHoldings={onEditHoldings}
      onLinkAccounts={onLinkAccounts}
      onSwitchCustomer={onSwitchCustomer}
      onRefresh={onRefresh}
    />
  )
}

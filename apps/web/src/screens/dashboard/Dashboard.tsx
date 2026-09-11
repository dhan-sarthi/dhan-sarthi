/**
 * The Dashboard tab, and the four panes under it.
 *
 * `06-dashboard/01-dashboard-home.md` gives this surface its shape: a greeting app bar, then a
 * four-cell tab row, then a pane. The reference's four are **Overview · SmartJars · Holdings ·
 * Analytics**; ours are **Overview · Holdings · Spending · Analytics**, which is the set
 * `06-EXISTING-APP-MAP.md` §6 names, and the two substitutions are both decisions rather than
 * omissions.
 *
 * **SmartJars is not here, and Spending is.** This app's goals live in `Plan`, which is a
 * top-level tab of its own with a sequenced, justified roadmap behind it — a second copy inside
 * the Dashboard would be the same content twice, and the tab bar would then carry goals in two
 * places. Meanwhile `Money`'s spending and commitments analysis is the thing SmartWealth has no
 * answer for at all (§4, items 4 and 5), and it had nowhere else to go. So the fourth slot is
 * Spending, and it carries both: one pill switch inside the pane, because the reference's own
 * analytics tab does exactly this — a screen-level tab row with a filter row under it.
 *
 * If a jars surface is ever wanted here, `jars` is the seam: pass a node and a fifth cell
 * appears between Overview and Holdings. Nothing else in this file has to move.
 *
 * ## What is drawn once, here
 *
 * The bar, the ribbon and the tab row are built at this level and handed to whichever pane is
 * mounted, because a pane that drew its own would redraw it on every switch — and a header that
 * flickers as you move sideways is the tell that a tab row is faked.
 *
 * The holdings block is read once here too, for the same reason: three of the four panes want
 * it, and a fetch per pane would re-read it on every tab tap.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Lightbulb, UserRound } from 'lucide-react'
import type {
  Account as AccountRow,
  Action,
  CategoryCap,
  LeadOutcomeResponse,
  View,
} from '@dhan/contracts'
import { DataSourceRibbon } from '../../components/DataSourceRibbon.tsx'
import { Screen } from '../../components/Screen.tsx'
import type { ScreenChrome } from '../../components/Screen.tsx'
import type { Tier } from '../../components/TierBadge.tsx'
import { Head, IconButton, Segments } from '../../components/ui.tsx'
import { dayMonth } from '../../lib/money.ts'
import type { DecisionKind } from '../../lib/mutations.ts'
import type { TransactionSource } from '../../lib/transactions.ts'
import { Money } from '../Money.tsx'
import type { MoneyTab } from '../Money.tsx'
import { Today } from '../Today.tsx'
import type { ClockControls } from '../Today.tsx'
import { Analytics } from './Analytics.tsx'
import { Holdings } from './Holdings.tsx'
import { Overview } from './Overview.tsx'
import type { HoldingsSource } from './portfolio.ts'
import { usePortfolio } from './usePortfolio.ts'

type Pane = 'overview' | 'jars' | 'holdings' | 'spending' | 'analytics'

const SPEND_TABS: readonly { id: MoneyTab; label: string }[] = [
  { id: 'spending', label: 'This month' },
  { id: 'commitments', label: 'Commitments' },
]

export function Dashboard({
  view,
  tier,
  clock,
  decided,
  decisionsEnabled,
  busy,
  lead,
  accounts,
  source,
  holdings,
  caps,
  capsEnabled,
  jars,
  onDecide,
  onAsk,
  onOpenProfile,
  onEditHoldings,
  onLinkAccounts,
  onSetCap,
  onRefresh,
}: {
  view: View
  tier: Tier
  clock: ClockControls
  decided: ReadonlySet<string>
  decisionsEnabled: boolean
  busy: boolean
  lead: LeadOutcomeResponse | null
  accounts: readonly AccountRow[]
  source: TransactionSource
  /** Reads the declared holdings block, from the API or from the offline ledger. */
  holdings: HoldingsSource
  caps: readonly CategoryCap[]
  capsEnabled: boolean
  /** Given, a `SmartJars` pane appears second. The seam for whoever owns goals. */
  jars?: ReactNode
  onDecide: (action: Action, kind: DecisionKind) => void
  onAsk: () => void
  onOpenProfile: () => void
  onEditHoldings: () => void
  onLinkAccounts: () => void
  onSetCap: (category: string, monthlyLimit: number | null) => Promise<void>
  onRefresh: () => Promise<void>
}): ReactNode {
  const [pane, setPane] = useState<Pane>('overview')
  /** Which half of the Spending pane. Held here so it survives a trip to another pane. */
  const [spendTab, setSpendTab] = useState<MoneyTab>('spending')
  /*
   * A tick, not a boolean, so pressing the chip twice scrolls twice.
   *
   * The insight chip lives in the bar, which is drawn for all four panes, but the section it
   * points at is only rendered by one of them. Pressing it from Analytics has to switch panes
   * *and then* scroll, and the scroll cannot happen in the click handler because the target does
   * not exist yet. An effect keyed on the tick runs after the pane it needs has committed.
   */
  const [seek, setSeek] = useState(0)
  useEffect(() => {
    if (seek === 0 || pane !== 'overview') return
    document
      .getElementById('what-i-noticed')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [seek, pane])

  /* Keyed on the snapshot, so advancing the clock or saving a holding brings the rows back with
     the view rather than a step behind it. */
  const held = usePortfolio(holdings, view.meta.snapshotId)

  const panes: readonly { id: Pane; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    ...(jars === undefined ? [] : ([{ id: 'jars', label: 'SmartJars' }] as const)),
    { id: 'holdings', label: 'Holdings' },
    { id: 'spending', label: 'Spending' },
    { id: 'analytics', label: 'Analytics' },
  ]

  const noticed = view.plan.insights.length
  const chrome: ScreenChrome = {
    header: (
      <Head
        greeting
        title={view.snapshot.customer.name.split(' ')[0] ?? 'there'}
        sub={dayMonth(view.meta.asOf)}
        right={
          <>
            <IconButton
              label={
                noticed > 0
                  ? `${noticed} ${noticed === 1 ? 'thing' : 'things'} I noticed`
                  : 'Nothing I noticed'
              }
              tone="bordered"
              count={noticed}
              onClick={() => {
                setPane('overview')
                setSeek((n) => n + 1)
              }}
            >
              <Lightbulb size={17} strokeWidth={2.3} />
            </IconButton>
            <IconButton label="About you" tone="bordered" onClick={onOpenProfile}>
              <UserRound size={17} strokeWidth={2.3} />
            </IconButton>
          </>
        }
      />
    ),
    notice: <DataSourceRibbon meta={view.meta} tier={tier} />,
    tabs: <Segments variant="underline" value={pane} onChange={setPane} options={panes} />,
  }

  const openSpending = useCallback((tab: MoneyTab) => {
    setSpendTab(tab)
    setPane('spending')
  }, [])

  if (pane === 'overview') {
    return (
      <Today
        view={view}
        chrome={chrome}
        clock={clock}
        decided={decided}
        decisionsEnabled={decisionsEnabled}
        busy={busy}
        lead={lead}
        onDecide={onDecide}
        onAsk={onAsk}
        onOpenProfile={onOpenProfile}
        onRefresh={onRefresh}
        /* The reference's overview, under the plan rather than instead of it. See
           `Overview.tsx`'s header for why that order and not the other one. */
        portfolio={
          <Overview
            snapshot={view.snapshot}
            accounts={accounts}
            held={held}
            onEditHoldings={onEditHoldings}
            onOpenSpending={() => openSpending('spending')}
            onOpenCommitments={() => openSpending('commitments')}
            onOpenAnalytics={() => setPane('analytics')}
          />
        }
      />
    )
  }

  if (pane === 'spending') {
    return (
      <Money
        tab={spendTab}
        chrome={chrome}
        lead={
          /* -mx-4 escapes the scroller's own 16px gutter, so the switch lines up with the cards
             under it rather than sitting 32px in. */
          <div className="-mx-4">
            <Segments value={spendTab} onChange={setSpendTab} options={SPEND_TABS} />
          </div>
        }
        snapshot={view.snapshot}
        source={source}
        asOf={view.meta.asOf}
        onRefresh={onRefresh}
        caps={caps}
        onSetCap={onSetCap}
        capsEnabled={capsEnabled}
      />
    )
  }

  return (
    <Screen {...chrome} onRefresh={onRefresh}>
      {pane === 'jars' ? jars : null}
      {pane === 'holdings' ? (
        <Holdings
          snapshot={view.snapshot}
          accounts={accounts}
          held={held}
          onEditHoldings={onEditHoldings}
          onLinkAccounts={onLinkAccounts}
        />
      ) : null}
      {pane === 'analytics' ? (
        <Analytics snapshot={view.snapshot} held={held} onEditHoldings={onEditHoldings} />
      ) : null}
    </Screen>
  )
}

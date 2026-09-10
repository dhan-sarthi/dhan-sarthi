/**
 * The Dashboard tab, and the four panes under it.
 *
 * `06-EXISTING-APP-MAP.md` puts SmartWealth's dashboard here — a portfolio surface with four
 * sub-tabs — and folds `Money`'s three tabs into it. The settled five-tab shape in
 * `07-DECISIONS.md` has no `Today` slot of its own, and that file's §6 is blunt about the risk:
 * demoted to a card on somebody else's screen, "one action at a time" stops being the shape of
 * the app and becomes a widget.
 *
 * So `Today` is the *first* pane, not a card on one. It keeps a whole screen, it is what the app
 * opens on, and the three panes beside it are the 360 view it is computed from — which is a
 * better argument for the daily plan than a tab of its own ever made: the number and the working
 * are one swipe apart.
 *
 *   Today        the daily plan — one number, one action.       `Today.tsx`
 *   Accounts     balances, holdings, debt, protection.          `Money.tsx`
 *   Spending     the normal month, categories, the statement.   `Money.tsx`
 *   Commitments  every recurring mandate the ledger found.      `Money.tsx`
 *
 * Step 4 rebuilds these against `06-dashboard` — Overview / SmartJars / Holdings / Analytics —
 * and the pane names will move with it. Nothing here is deleted to make room for that; the point
 * of this step is that every existing job already has a home when it arrives.
 *
 * The bar, the ribbon and the tab row are built once, here, and handed to whichever pane is
 * mounted. A pane that drew its own would redraw it on every switch, and a header that flickers
 * as you move sideways is the tell that a tab row is faked.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Lightbulb, UserRound } from 'lucide-react'
import type {
  Account as AccountRow,
  Action,
  CategoryCap,
  LeadOutcomeResponse,
  View,
} from '@dhan/contracts'
import { DataSourceRibbon } from '../components/DataSourceRibbon.tsx'
import type { ScreenChrome } from '../components/Screen.tsx'
import type { Tier } from '../components/TierBadge.tsx'
import { Head, IconButton, Segments } from '../components/ui.tsx'
import { dayMonth } from '../lib/money.ts'
import type { DecisionKind } from '../lib/mutations.ts'
import type { TransactionSource } from '../lib/transactions.ts'
import { Money } from './Money.tsx'
import type { MoneyTab } from './Money.tsx'
import { Today } from './Today.tsx'
import type { ClockControls } from './Today.tsx'

type Pane = 'today' | MoneyTab

const PANES: readonly { id: Pane; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'spending', label: 'Spending' },
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
  caps,
  capsEnabled,
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
  caps: readonly CategoryCap[]
  capsEnabled: boolean
  onDecide: (action: Action, kind: DecisionKind) => void
  onAsk: () => void
  onOpenProfile: () => void
  onEditHoldings: () => void
  onLinkAccounts: () => void
  onSetCap: (category: string, monthlyLimit: number | null) => Promise<void>
  onRefresh: () => Promise<void>
}): ReactNode {
  const [pane, setPane] = useState<Pane>('today')
  /*
   * A tick, not a boolean, so pressing the chip twice scrolls twice.
   *
   * The insight chip lives in the bar, which is drawn for all four panes, but the section it
   * points at is only rendered by one of them. Pressing it from Spending has to switch panes
   * *and then* scroll, and the scroll cannot happen in the click handler because the target does
   * not exist yet. An effect keyed on the tick runs after the pane it needs has committed.
   */
  const [seek, setSeek] = useState(0)
  useEffect(() => {
    if (seek === 0 || pane !== 'today') return
    document
      .getElementById('what-i-noticed')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [seek, pane])

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
                setPane('today')
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
    tabs: <Segments variant="underline" value={pane} onChange={setPane} options={PANES} />,
  }

  if (pane === 'today') {
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
      />
    )
  }

  return (
    <Money
      tab={pane}
      chrome={chrome}
      snapshot={view.snapshot}
      accounts={accounts}
      source={source}
      asOf={view.meta.asOf}
      onEditHoldings={onEditHoldings}
      onLinkAccounts={onLinkAccounts}
      onRefresh={onRefresh}
      caps={caps}
      onSetCap={onSetCap}
      capsEnabled={capsEnabled}
    />
  )
}

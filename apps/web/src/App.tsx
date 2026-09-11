/**
 * The shell.
 *
 * Five tabs — Discover · Dashboard · (Ask) · Plan · More — and one rule that shapes the whole
 * file: **Ask Uday takes the screen.** No tab bar, no header, no card around it. A conversation
 * with a person does not happen inside a panel, and the avatar is the strongest thing we have —
 * so it gets the glass.
 *
 * The tabs are SmartWealth's destinations in the count this app already shipped, which
 * `07-DECISIONS.md` settles and `06-EXISTING-APP-MAP.md` argues for. Nothing was deleted to make
 * room: `Today` and `Money` are inside Dashboard's four panes — Overview · Holdings · Spending ·
 * Analytics — `Plan` kept a slot of its own, `Record` is pushed from More along with the three
 * editing sheets that used to be reachable only from a button halfway down another screen, and
 * `Ask` is untouched.
 *
 * Everything the tabs show comes from one `View` the API computed for this reviewer's session.
 * The shell wires the hooks together — session, view, record, mutations, availability — and
 * decides which tier is on screen: the live avatar, the same engine in text, or the simulation
 * in this browser when the API is out of reach. Each tier is labelled; none of them spins.
 */
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from './api/client.ts'
import { clearSession, useStoredSession } from './api/session.ts'
import { OfflineBadge } from './components/OfflineBadge.tsx'
import { Screen } from './components/Screen.tsx'
import { TabBar } from './components/TabBar.tsx'
import type { TabId } from './components/TabBar.tsx'
import type { Tier } from './components/TierBadge.tsx'
import { Card, Head, Skeleton, TextLink } from './components/ui.tsx'
import { Toast } from './components/Toast.tsx'
import type { ToastMessage, ToastTone } from './components/Toast.tsx'
import { ProfileSheet } from './screens/ProfileSheet.tsx'
import { HoldingsSheet } from './screens/HoldingsSheet.tsx'
import { LinkAccountsSheet } from './screens/LinkAccountsSheet.tsx'
import { GoalSheet } from './screens/GoalSheet.tsx'
import { Ask } from './screens/Ask.tsx'
import { Dashboard } from './screens/dashboard/Dashboard.tsx'
import { Discover } from './screens/Discover.tsx'
import { More } from './screens/More.tsx'
import { Pick } from './screens/Pick.tsx'
import { Plan } from './screens/Plan.tsx'
import { SmartJars } from './screens/goals/index.ts'
import { Commitments } from './screens/commitments/Commitments.tsx'
import { Family } from './screens/family/index.ts'
import { Baskets } from './screens/baskets/index.ts'
import { Onboarding } from './screens/Onboarding.tsx'
import type { HoldingsSource } from './screens/dashboard/portfolio.ts'
import { offlineAsk, serverAsk } from './lib/ask.ts'
import { useAvailability } from './lib/availability.ts'
import { useMutations } from './lib/mutations.ts'
import { hasOnboarded, markOnboarded } from './lib/onboarding.ts'
import { useRecord } from './lib/record.ts'
import type { TransactionSource } from './lib/transactions.ts'
import { useView } from './lib/view.ts'

export function App(): ReactNode {
  const stored = useStoredSession()
  const vs = useView(stored)
  const record = useRecord(stored, vs.tier)
  const [tab, setTab] = useState<TabId>('dashboard')
  /* Which page More opens on. The spine's success screen routes to the record, and More is
     unmounted when it does, so the destination has to be set before the tab changes. */
  const [morePage, setMorePage] = useState<'menu' | 'record'>('menu')
  const [sheet, setSheet] = useState<'profile' | 'holdings' | 'link' | 'goal' | null>(null)
  /** The commitments surface is a push, not a pane: it owns a calendar and a detail stack. */
  const [commitments, setCommitments] = useState(false)
  /** The household is a push too: it owns a tab row and a stack of its own. */
  const [family, setFamily] = useState(false)
  /** Baskets is a push as well: it owns a cart and the spine's screens after the gate. */
  const [baskets, setBaskets] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  /*
   * First run, per customer, decided once and held here.
   *
   * Read as initial state rather than in an effect, so the tabs never flash behind the
   * introduction; and held in state rather than re-read, so finishing it does not depend on
   * storage having accepted the write.
   */
  const [greeted, setGreeted] = useState<string | null>(null)

  /*
   * One place a result is announced, rather than a notice under whichever card was used.
   *
   * An inline notice is below the fold as soon as the action is halfway down a scroll, and it
   * stays on screen long after the thing it describes, which makes an outcome read as a state.
   */
  const say = useCallback((text: string, tone: ToastTone = 'ok') => {
    setToast({ id: Date.now(), tone, text })
  }, [])

  const m = useMutations(vs, record.refresh, say)
  const avail = useAvailability(vs.tier === 'server' && vs.view !== null)

  /* An edit to the profile or the holdings changes what the engine derives, so the view is
     re-read rather than patched: the numbers on screen are the server's, always. */
  const refreshView = vs.refresh
  const afterEdit = useCallback(
    (message: string) => {
      say(message)
      void refreshView()
    },
    [say, refreshView],
  )

  const offline = vs.offline
  const source = useMemo<TransactionSource>(
    () =>
      offline
        ? (cursor, limit, category) =>
            Promise.resolve(
              offline.mod.transactionsPage(offline.state, cursor, limit, category ?? undefined),
            )
        : (cursor, limit, category) =>
            api('listTransactions', {
              query: {
                limit,
                ...(cursor ? { cursor } : {}),
                ...(category ? { category } : {}),
              },
            }),
    [offline],
  )
  /* The declared holdings block, the same way the statement is wired: the offline tier answers
     from the ledger it generated, so the Dashboard has one code path rather than an empty
     Holdings tab whenever the API is out of reach. */
  const holdings = useMemo<HoldingsSource>(
    () =>
      offline
        ? () => Promise.resolve(offline.mod.holdings(offline.state))
        : () => api('getHoldings'),
    [offline],
  )
  const askBackend = useMemo(() => (offline ? offlineAsk(offline) : serverAsk), [offline])
  const refreshAvailability = avail.refresh
  const onOpenAsk = useCallback(() => void refreshAvailability(), [refreshAvailability])

  if (!stored) {
    return (
      <div className="app">
        <Pick />
      </div>
    )
  }

  /*
   * The introduction owns the screen: no tab bar behind it, and no half-built view under it.
   *
   * Only against the real API. The offline tier has no profile to save to and no bank to read
   * from, so walking a reviewer through four steps that all end in "could not be reached" would
   * be worse than simply showing them the simulation. If the API drops out mid-introduction this
   * turns false and the app falls through to the tabs with the offline badge, which is the right
   * outcome too.
   */
  if (vs.tier === 'server' && greeted !== stored.cif && !hasOnboarded(stored.cif)) {
    return (
      <div className="app">
        <Onboarding
          onDone={() => {
            markOnboarded(stored.cif)
            setGreeted(stored.cif)
            // The profile it just collected changes everything the engine derives.
            void refreshView()
          }}
        />
      </div>
    )
  }

  const tier: Tier =
    vs.tier === 'offline'
      ? 'offline'
      : avail.availability?.enabled && avail.availability.available
        ? 'live'
        : 'text'

  const badge =
    vs.tier === 'offline' ? (
      <OfflineBadge onRetry={() => void vs.reconnect()} busy={vs.busy} />
    ) : null

  const view = vs.view
  if (!view) {
    return (
      <div className="app">
        {badge}
        <Gate
          loading={vs.loading}
          message={vs.error?.message ?? null}
          onRetry={() => void vs.refresh()}
        />
      </div>
    )
  }

  // A push over the shell: it owns a calendar and a detail stack, so it takes the whole screen
  // and the tab bar stays put underneath it.
  if (baskets) {
    return (
      <div className="app">
        {badge}
        <Baskets
          view={view}
          /* The same evaluate Discover and the spine use, so a basket meets the same gate on the
             same snapshot — one call over the whole basket, not one per line. */
          evaluate={askBackend.evaluate}
          onExit={() => setBaskets(false)}
          onSeeRecord={() => {
            setBaskets(false)
            setMorePage('record')
            setTab('more')
            void record.refresh()
          }}
          onOpenProfile={() => setSheet('profile')}
          onOpenPlan={() => {
            setBaskets(false)
            setTab('plan')
          }}
        />
        <TabBar
          active={tab}
          onChange={(id) => {
            setBaskets(false)
            setTab(id)
            setMorePage('menu')
            if (id === 'more') void record.refresh()
          }}
        />
      </div>
    )
  }

  if (family) {
    return (
      <div className="app">
        {badge}
        <Family
          view={view}
          holdings={holdings}
          onBack={() => setFamily(false)}
          onRefresh={refreshView}
        />
        <TabBar
          active={tab}
          onChange={(id) => {
            setFamily(false)
            setTab(id)
            setMorePage('menu')
            if (id === 'more') void record.refresh()
          }}
        />
      </div>
    )
  }

  if (commitments) {
    return (
      <div className="app">
        {badge}
        <Commitments
          snapshot={view.snapshot}
          onBack={() => setCommitments(false)}
          onRefresh={refreshView}
        />
        <TabBar
          active={tab}
          onChange={(id) => {
            setCommitments(false)
            setTab(id)
            setMorePage('menu')
            if (id === 'more') void record.refresh()
          }}
        />
      </div>
    )
  }

  // Full bleed. Everything else in the app is inside the shell; this is the shell.
  if (tab === 'ask') {
    return (
      <div className="app">
        {badge}
        <div className="relative min-h-0 flex-1">
          <Ask
            backend={askBackend}
            shelf={view.shelf}
            monthlyAmount={view.snapshot.surplus.deployable}
            tier={tier}
            availability={avail.availability}
            onOpen={onOpenAsk}
            onClose={() => setTab('dashboard')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {badge}
      {/* One conditional per tab rather than a lookup, so a tab's whole subtree unmounts when you
          leave it: that is what replays the entrance stagger, and what makes each screen's own
          state — a sub-tab, an open sheet, a scroll position — start clean on the way back in. */}
      {tab === 'discover' ? (
        <Discover
          onOpenBaskets={() => setBaskets(true)}
          view={view}
          /* The gate the transaction spine runs on. Same call the advisor's product check
             makes: `/suitability/evaluate` on the server tier, which writes the advice
             record, and the lazy offline chunk otherwise. */
          evaluate={askBackend.evaluate}
          onAsk={() => setTab('ask')}
          onSeeRecord={() => {
            setMorePage('record')
            setTab('more')
            void record.refresh()
          }}
        />
      ) : null}

      {tab === 'dashboard' ? (
        <Dashboard
          view={view}
          tier={tier}
          clock={{
            show: view.meta.simulatedClock,
            horizonTo: vs.session?.ledgerHorizon.to ?? view.meta.dataFreshnessDate,
            notice: m.clockNotice,
            disabled: m.busy,
            onAdvance: (days) => void m.advanceClock(days),
            onReset: () => void m.resetClock(),
          }}
          decided={m.decided}
          decisionsEnabled={vs.tier === 'server'}
          busy={m.busy}
          lead={m.lead}
          accounts={view.accounts}
          source={source}
          holdings={holdings}
          caps={vs.session?.caps ?? []}
          capsEnabled={vs.tier === 'server'}
          onDecide={(action, kind) => void m.decide(action, kind)}
          onAsk={() => setTab('ask')}
          onOpenProfile={() => setSheet('profile')}
          onEditHoldings={() => setSheet('holdings')}
          onLinkAccounts={() => setSheet('link')}
          onSetCap={m.setCap}
          onRefresh={refreshView}
          onOpenCommitments={() => setCommitments(true)}
          jars={(chrome) => (
            <SmartJars
              view={view}
              chrome={chrome}
              onRefresh={refreshView}
              onSaved={(message) => say(message)}
              onOpenProfile={() => setSheet('profile')}
              onOpenPlan={() => setTab('plan')}
            />
          )}
        />
      ) : null}

      {tab === 'plan' ? (
        <Plan
          snapshot={view.snapshot}
          roadmap={view.roadmap}
          asOf={view.meta.asOf}
          onEditGoal={() => setSheet('goal')}
          onRefresh={refreshView}
          rebalance={{
            view,
            // The same evaluate Discover hands the spine, so a rebalance that reaches a
            // purchase is refused by the same gate on the same snapshot.
            evaluate: askBackend.evaluate,
            onSeeRecord: () => {
              setMorePage('record')
              setTab('more')
              void record.refresh()
            },
            decisions: {
              actions: [view.plan.primary, ...view.plan.secondary].filter(
                (a): a is NonNullable<typeof a> => a !== null && a !== undefined,
              ),
              decided: m.decided,
              enabled: vs.tier === 'server',
              busy: m.busy,
              onDecide: (action, kind) => void m.decide(action, kind),
            },
          }}
        />
      ) : null}

      {tab === 'more' ? (
        <More
          startOn={morePage}
          view={view}
          record={record}
          session={vs.session}
          tier={tier}
          busy={m.busy}
          onConsent={(scope, granted) => void m.setConsent(scope, granted)}
          onOpenProfile={() => setSheet('profile')}
          onOpenFamily={() => setFamily(true)}
          onEditHoldings={() => setSheet('holdings')}
          onLinkAccounts={() => setSheet('link')}
          onSwitchCustomer={clearSession}
          onRefresh={async () => {
            await Promise.all([refreshView(), record.refresh()])
          }}
        />
      ) : null}

      <TabBar
        active={tab}
        onChange={(id) => {
          setTab(id)
          // A tab tap is a fresh entry into More, not a return to wherever the spine sent it.
          setMorePage('menu')
          // A product check in Ask writes an advice record too; More re-reads on entry so the
          // paper trail behind it is never a step behind what the reviewer just did.
          if (id === 'more') void record.refresh()
        }}
      />

      <ProfileSheet open={sheet === 'profile'} onClose={() => setSheet(null)} onSaved={afterEdit} />
      <HoldingsSheet
        open={sheet === 'holdings'}
        onClose={() => setSheet(null)}
        onChanged={afterEdit}
      />
      <LinkAccountsSheet
        open={sheet === 'link'}
        onClose={() => setSheet(null)}
        onLinked={afterEdit}
      />
      <GoalSheet
        open={sheet === 'goal'}
        onClose={() => setSheet(null)}
        onSaved={afterEdit}
        roadmap={view.roadmap}
        asOf={view.meta.asOf}
        deployable={view.snapshot.surplus.deployable}
      />
      <Toast key={toast?.id ?? 'none'} message={toast} onDone={() => setToast(null)} />
    </div>
  )
}

/**
 * Between the picker and the first view: the statements are being read, or they could not be.
 * A sentence and a button, not a spinner — "nothing may hard-fail" includes the first second.
 */
function Gate({
  loading,
  message,
  onRetry,
}: {
  loading: boolean
  message: string | null
  onRetry: () => void
}): ReactNode {
  return (
    <Screen
      header={
        <Head title="Dashboard" sub={loading ? 'Reading your statements…' : 'Not available'} />
      }
    >
      <div className="mt-3">
        {loading ? (
          /*
           * The shape of the screen that is coming, not a message about it.
           *
           * A view is four live calls to a bank and takes a second or two, and a card that
           * says "one moment" is a second of nothing followed by a layout jump. A skeleton
           * the size of the real thing gives the eye somewhere to rest and lands without the
           * page moving.
           */
          <div aria-busy="true" aria-live="polite">
            <span className="sr-only">Reading your statements</span>
            <Card tint="sage">
              <Skeleton h={15} w="42%" className="mb-3" />
              <Skeleton h={34} w="58%" className="mb-3" />
              <Skeleton h={8} className="mb-4" />
              <Skeleton h={13} className="mb-2" />
              <Skeleton h={13} w="80%" className="mb-2" />
              <Skeleton h={13} w="64%" />
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <Skeleton h={64} />
                <Skeleton h={64} />
              </div>
            </Card>
            <Card>
              <Skeleton h={15} w="52%" className="mb-2.5" />
              <Skeleton h={13} className="mb-2" />
              <Skeleton h={13} w="72%" />
            </Card>
          </div>
        ) : (
          <Card tint="clay">
            <h2>The advisor could not be reached</h2>
            <p role="alert" className="m-0 mt-1.5 text-sm leading-normal text-ink-mid">
              {message ?? 'Could not reach the advisor service.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="ds-press h-11 rounded-pill border-[1.5px] border-solid border-accent bg-white px-4 text-[15px] font-semibold text-accent-text"
              >
                Try again
              </button>
              <TextLink onClick={clearSession}>Pick another customer</TextLink>
            </div>
          </Card>
        )}
      </div>
    </Screen>
  )
}

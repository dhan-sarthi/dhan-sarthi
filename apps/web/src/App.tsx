/**
 * The shell.
 *
 * Four tabs plus the advisor, and one rule that shapes the whole file: **Ask Uday takes the
 * screen.** No tab bar, no header, no card around it. A conversation with a person does not
 * happen inside a panel, and the avatar is the strongest thing we have — so it gets the glass.
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
import { TabBar } from './components/TabBar.tsx'
import type { TabId } from './components/TabBar.tsx'
import type { Tier } from './components/TierBadge.tsx'
import { Card, Head, Skeleton } from './components/ui.tsx'
import { Toast } from './components/Toast.tsx'
import type { ToastMessage, ToastTone } from './components/Toast.tsx'
import { ProfileSheet } from './screens/ProfileSheet.tsx'
import { HoldingsSheet } from './screens/HoldingsSheet.tsx'
import { LinkAccountsSheet } from './screens/LinkAccountsSheet.tsx'
import { GoalSheet } from './screens/GoalSheet.tsx'
import { Ask } from './screens/Ask.tsx'
import { Money } from './screens/Money.tsx'
import { Pick } from './screens/Pick.tsx'
import { Plan } from './screens/Plan.tsx'
import { Record } from './screens/Record.tsx'
import { Today } from './screens/Today.tsx'
import { Onboarding } from './screens/Onboarding.tsx'
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
  const [tab, setTab] = useState<TabId>('today')
  const [sheet, setSheet] = useState<'profile' | 'holdings' | 'link' | 'goal' | null>(null)
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
            onClose={() => setTab('today')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {badge}
      {/* Keyed on the tab so the fade replays on every change. Without the key React reuses the
          subtree and the animation only ever runs once, on first mount. */}
      {tab === 'today' ? (
        <Today
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
          onDecide={(action, kind) => void m.decide(action, kind)}
          onAsk={() => setTab('ask')}
          onOpenProfile={() => setSheet('profile')}
          onRefresh={refreshView}
        />
      ) : null}

      {tab === 'plan' ? (
        <Plan
          snapshot={view.snapshot}
          roadmap={view.roadmap}
          asOf={view.meta.asOf}
          onEditGoal={() => setSheet('goal')}
          onRefresh={refreshView}
        />
      ) : null}
      {tab === 'money' ? (
        <Money
          snapshot={view.snapshot}
          accounts={view.accounts}
          source={source}
          asOf={view.meta.asOf}
          onEditHoldings={() => setSheet('holdings')}
          onLinkAccounts={() => setSheet('link')}
          onRefresh={refreshView}
          caps={vs.session?.caps ?? []}
          onSetCap={m.setCap}
          capsEnabled={vs.tier === 'server'}
        />
      ) : null}
      {tab === 'record' ? (
        <Record
          view={view}
          record={record}
          session={vs.session}
          tier={tier}
          busy={m.busy}
          onConsent={(scope, granted) => void m.setConsent(scope, granted)}
          onEditProfile={() => setSheet('profile')}
          onRefresh={async () => {
            await Promise.all([refreshView(), record.refresh()])
          }}
        />
      ) : null}

      <TabBar
        active={tab}
        onChange={(id) => {
          setTab(id)
          // A product check in Ask writes an advice record too; the tab re-reads on entry so
          // the paper trail is never a step behind what the reviewer just did.
          if (id === 'record') void record.refresh()
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
    <>
      <Head title="Today" sub={loading ? 'Reading your statements…' : 'Not available'} />
      <div className="scroll">
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
                  className="h-11 rounded-pill border-[1.5px] border-solid border-accent bg-white px-4 text-[15px] font-semibold text-accent-text transition-transform duration-100 active:scale-[0.985]"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={clearSession}
                  className="h-10 rounded-pill border-0 bg-transparent px-2 text-[15px] font-semibold text-brand underline-offset-2 hover:underline"
                >
                  Pick another customer
                </button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

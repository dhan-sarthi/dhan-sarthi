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
import { Card, Head } from './components/ui.tsx'
import { Ask } from './screens/Ask.tsx'
import { Money } from './screens/Money.tsx'
import { Pick } from './screens/Pick.tsx'
import { Plan } from './screens/Plan.tsx'
import { Record } from './screens/Record.tsx'
import { Today } from './screens/Today.tsx'
import { offlineAsk, serverAsk } from './lib/ask.ts'
import { useAvailability } from './lib/availability.ts'
import { useMutations } from './lib/mutations.ts'
import { useRecord } from './lib/record.ts'
import type { TransactionSource } from './lib/transactions.ts'
import { useView } from './lib/view.ts'

export function App(): ReactNode {
  const stored = useStoredSession()
  const vs = useView(stored)
  const record = useRecord(stored, vs.tier)
  const m = useMutations(vs, record.refresh)
  const avail = useAvailability(vs.tier === 'server' && vs.view !== null)
  const [tab, setTab] = useState<TabId>('today')
  const [picking, setPicking] = useState(false)

  const offline = vs.offline
  const source = useMemo<TransactionSource>(
    () =>
      offline
        ? (cursor, limit) =>
            Promise.resolve(offline.mod.transactionsPage(offline.state, cursor, limit))
        : (cursor, limit) =>
            api('listTransactions', { query: { limit, ...(cursor ? { cursor } : {}) } }),
    [offline],
  )
  const askBackend = useMemo(() => (offline ? offlineAsk(offline) : serverAsk), [offline])
  const refreshAvailability = avail.refresh
  const onOpenAsk = useCallback(() => void refreshAvailability(), [refreshAvailability])
  // The record survives reloads; optimistic ids cover the wait for its next response. Both
  // hooks expose only the active session's state, since action ids can repeat across sessions.
  const decided = new Set([
    ...m.decided,
    ...(record.record?.decisions.map((decision) => decision.actionId) ?? []),
  ])
  const decisionsUnavailable =
    vs.tier !== 'server'
      ? 'Decisions are written to the record on the advisor service. Reconnect to act on this.'
      : record.error
        ? 'Your previous decisions could not be read. Open Record and try again.'
        : !record.record
          ? 'Reading your previous decisions…'
          : null

  if (!stored || picking) {
    return (
      <div className="app">
        <Pick
          onPicked={() => {
            setPicking(false)
            setTab('today')
          }}
          {...(stored ? { onCancel: () => setPicking(false) } : {})}
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
      {tab === 'today' ? (
        <Today
          view={view}
          tier={tier}
          clock={{
            show: view.meta.simulatedClock,
            notice: m.clockNotice,
            disabled: m.busy,
            onAdvance: (days) => void m.advanceClock(days),
            onReset: () => void m.resetClock(),
          }}
          decided={decided}
          decisionsUnavailable={decisionsUnavailable}
          busy={m.busy}
          notice={m.notice}
          onDecide={(action, kind) => void m.decide(action, kind)}
          onAsk={() => setTab('ask')}
          onSwitchCustomer={() => setPicking(true)}
        />
      ) : null}

      {tab === 'plan' ? (
        <Plan snapshot={view.snapshot} roadmap={view.roadmap} asOf={view.meta.asOf} />
      ) : null}
      {tab === 'money' ? (
        <Money snapshot={view.snapshot} source={source} asOf={view.meta.asOf} />
      ) : null}
      {tab === 'record' ? (
        <Record
          view={view}
          record={record}
          session={vs.session}
          tier={tier}
          busy={m.busy}
          notice={m.notice}
          onConsent={(scope, granted) => void m.setConsent(scope, granted)}
          onSwitchCustomer={() => setPicking(true)}
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
            <Card tint="sage">
              <h2>One moment</h2>
              <p className="m-0 mt-1.5 text-sm text-ink-soft" aria-live="polite">
                Twenty-four months of statements are being turned into a plan.
              </p>
            </Card>
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

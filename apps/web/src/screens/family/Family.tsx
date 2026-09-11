/**
 * Family Wealth — SmartWealth's household surface, on an app that has no household.
 *
 * ## The problem this screen had to solve before it could be drawn
 *
 * `snapshot.customer.dependents` is an integer. That is the entire extent of family in this data
 * model: no second customer file, no relationship, no consent record between two CIFs, no endpoint
 * that would return one. Every figure on the reference's Family Wealth screen — the household
 * total, the per-member cards, the aggregated holdings — would therefore be invented.
 * `07-DECISIONS.md` §5 originally struck the feature for exactly that reason and was then reversed
 * to full parity, with the rule that governs the reversal written into it: **a screen may be
 * driven by demo data, but it may never claim the data is real.**
 *
 * ## What was chosen
 *
 * The customer's half is real and the rest is labelled. One member of this household is the person
 * whose session this is, and every number on that member is computed from their statements by
 * `portfolioOf()` — the same holdings block, from the same fetch, that the Dashboard's Holdings
 * pane totals, so the two screens cannot disagree. The other three are demo people and say so on
 * every surface they appear on.
 *
 * That is not a compromise between showing the design and telling the truth; it is the only
 * version where both survive. A household of four invented people would demonstrate the layout and
 * teach a reviewer nothing about the product. A screen with one real member and no others would be
 * honest and would not be the feature. This is the feature, with the seam drawn where it actually
 * falls.
 *
 * ## How it says so, and where
 *
 * In the register `Clock` uses, because that card is this app's existing answer to the same
 * question and a second register would read as a second policy. Four places, none of them a
 * disclaimer buried at the foot:
 *
 * - the app bar's second line, `Demo household`, which is on screen before anything else is;
 * - the hero's eyebrow, the accent-uppercase label the clock leads with;
 * - the hero's foot — a `StatusBand` naming **how much of the total is yours** and computed, in
 *   rupees, against how much is not. `household.ts` keeps `realValue` and `demoValue` apart so
 *   that sentence is arithmetic rather than a form of words;
 * - and on every member, every holding row and every request, a marker chip.
 *
 * A total that mixes computed and demo money is still shown, because that is what a household view
 * is. What it is never allowed to do is pass for a figure IDBI holds.
 *
 * ## Composition
 *
 * The reference's, which is the one thing here that is a straight port: a dark bar, a summary card
 * hanging up into it, the two-tab row *below* the card rather than above it, and the pane under
 * that. `Head tone="brand" overlap` with `Screen scrollHeader overlap` is what `DESIGN.md` says
 * that shape is built from — the green is the mechanism that makes the overlap read, not a
 * decoration — and the tab row is a child of the scroller rather than `Screen`'s `tabs` slot,
 * because in the frames it sits under the hero and scrolls with it.
 */
import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { View } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { Amount, Head, Segments, Skeleton } from '../../components/ui.tsx'
import { inr } from '../../lib/money.ts'
import type { HoldingsSource } from '../dashboard/portfolio.ts'
import { usePortfolio } from '../dashboard/usePortfolio.ts'
import { AddMember } from './AddMember.tsx'
import { HouseholdHoldings } from './HouseholdHoldings.tsx'
import { Members } from './Members.tsx'
import { RequestSent } from './RequestSent.tsx'
import { RequestsReceived } from './RequestsReceived.tsx'
import type { Answer } from './RequestsReceived.tsx'
import { DEFAULT_LINKED, DEMO_REQUESTS, householdOf } from './household.ts'
import type { LinkRequest } from './household.ts'
import { Gain } from './parts.tsx'

type Tab = 'members' | 'holdings'
type Push = { at: 'requests' } | { at: 'add' } | { at: 'sent'; customerId: string } | null

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'members', label: 'Family Members' },
  { id: 'holdings', label: 'Overall Holdings' },
]

export function Family({
  view,
  holdings,
  onBack,
  onRefresh,
}: {
  view: View
  /** The declared holdings block, the same source the Dashboard passes its own pane. */
  holdings: HoldingsSource
  /** Present, the screen gets a back arrow. It is a push over the shell, like Commitments. */
  onBack?: () => void
  onRefresh?: () => Promise<void>
}): ReactNode {
  const held = usePortfolio(holdings, view.meta.snapshotId)
  const [tab, setTab] = useState<Tab>('members')
  const [push, setPush] = useState<Push>(null)

  /*
   * Which demo members are in the household, and which requests are still open. State, because
   * accepting and removing are the two things this surface actually does — they change nothing
   * anywhere else in the app and are gone on reload, which is the correct lifetime for something
   * the bank has no record of.
   */
  const [linked, setLinked] = useState<readonly string[]>(DEFAULT_LINKED)
  const [requests, setRequests] = useState<readonly LinkRequest[]>(DEMO_REQUESTS)
  const [answered, setAnswered] = useState<readonly { request: LinkRequest; answer: Answer }[]>([])

  const self = useMemo(
    () => ({ id: 'self', name: view.snapshot.customer.name }),
    [view.snapshot.customer.name],
  )
  const household = useMemo(
    () => householdOf(self, held.portfolio, linked),
    [self, held.portfolio, linked],
  )

  const answer = useCallback((request: LinkRequest, given: Answer) => {
    setRequests((open) => open.filter((r) => r.id !== request.id))
    setAnswered((done) => [...done, { request, answer: given }])
    /* A request's id is its member's id — see `household.ts`. Accepting therefore links the exact
       person whose name was on the button, with the holdings that file declares for them, and
       cannot mint somebody the model never wrote down. */
    if (given === 'accepted')
      setLinked((ids) => (ids.includes(request.id) ? ids : [...ids, request.id]))
  }, [])

  if (push?.at === 'requests') {
    return (
      <RequestsReceived
        requests={requests}
        answered={answered}
        asOf={view.snapshot.asOf}
        onBack={() => setPush(null)}
        onAnswer={answer}
      />
    )
  }
  if (push?.at === 'add') {
    return (
      <AddMember
        onBack={() => setPush(null)}
        onSend={(customerId) => setPush({ at: 'sent', customerId })}
      />
    )
  }
  if (push?.at === 'sent') {
    return (
      <RequestSent
        customerId={push.customerId}
        asOf={view.snapshot.asOf}
        onDone={() => setPush(null)}
      />
    )
  }

  return (
    <Screen
      scrollHeader
      overlap
      {...(onBack ? { header: header(onBack) } : { header: header() })}
      {...(onRefresh ? { onRefresh } : {})}
    >
      {/* nth-child(2) of the content wrapper — the card `overlap` pulls up into the green slab. */}
      <Hero household={household} loading={held.loading} error={held.error} />

      {/* Below the hero, not above it: in the frames the tab row sits under the summary card and
          scrolls with it. -mx-4 because the row draws its own gutter and its own hairline. */}
      <div className="-mx-4 mb-4">
        <Segments variant="underline" options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'members' ? (
        <Members
          household={household}
          requests={requests}
          onReview={() => setPush({ at: 'requests' })}
          onAdd={() => setPush({ at: 'add' })}
          onRemove={(id) => setLinked((ids) => ids.filter((x) => x !== id))}
        />
      ) : (
        <HouseholdHoldings household={household} />
      )}
    </Screen>
  )
}

function header(onBack?: () => void): ReactNode {
  return (
    <Head
      {...(onBack ? { onBack, backLabel: 'Back' } : {})}
      title="Family Wealth"
      sub="Demo household"
      overlap
      tone="brand"
    />
  )
}

/**
 * The hero, and the sentence that makes the rest of the screen safe to read.
 *
 * The reference's card is a label, one very large amount, and a two-column row of `Invested Value`
 * and `Gain`. All three are here. What is added is the foot: how much of that total was computed
 * and how much was not, in rupees, because "some of this is demo" is a hedge and "₹3.13L of this
 * is yours" is a fact somebody can check against the Dashboard.
 *
 * On a household with no demo members left — remove all three and it happens — the band stops
 * saying it, because then there is nothing to warn about and a standing disclaimer over a screen
 * showing only your own money is just noise.
 */
function Hero({
  household,
  loading,
  error,
}: {
  household: ReturnType<typeof householdOf>
  loading: boolean
  error: string | null
}): ReactNode {
  return (
    <section className="mb-4 overflow-hidden rounded-md border border-solid border-hairline-mint bg-surface shadow-card">
      <div className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-text">
          Demo household
        </div>
        <div className="mt-1.5 text-[13px] text-ink-mid">
          Recorded value · {household.members.length}{' '}
          {household.members.length === 1 ? 'member' : 'members'}
        </div>
        <div className="mt-1">
          {loading ? <Skeleton h={34} w="62%" /> : <Amount value={household.value} size="xl" />}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-3">
          <div className="min-w-0">
            <div className="text-[13px] text-ink-soft">Invested</div>
            <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-ink">
              {household.invested === null ? (
                <span className="font-normal text-ink-soft">Not recorded</span>
              ) : (
                inr(household.invested)
              )}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[13px] text-ink-soft">Gain</div>
            <div className="mt-0.5">
              {household.gain === null ? (
                <span className="text-[15px] text-ink-soft">No cost recorded</span>
              ) : (
                <Gain amount={household.gain} pct={household.gainPct} />
              )}
            </div>
          </div>
        </div>
      </div>

      {error !== null ? (
        <StatusBand flush tone="bad" label="What you hold could not be read,">
          so none of this total is yours. {error}
        </StatusBand>
      ) : household.demoMembers === 0 ? (
        <StatusBand flush tone="good" label="All of this is yours">
          — computed from your statements, the same figures the Dashboard totals.
        </StatusBand>
      ) : (
        <StatusBand flush tone="warn" label={`${inr(household.realValue)} of this is yours`}>
          — from your statements. The other {household.demoMembers} are demo people; their{' '}
          {inr(household.demoValue)} is invented — IDBI has no household in its records.
        </StatusBand>
      )}
    </section>
  )
}

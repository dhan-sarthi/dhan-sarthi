// Grow — what you own, what you might, and what you are putting aside.
//
// Cleo's Save tab is Cleo's own savings account: one balance, some automation, a streak.
// A bank's equivalent is not one product but a whole balance sheet, so the three panes this
// tab opened with had no Cleo source at all and were built from the data instead.
//
// That is now true of three of the five rather than of the whole tab. Grow already occupies
// Cleo's Save slot in the five-tab map, and Save and Challenges are that tab read screen by
// screen and finally put where it belongs. The pot had been sitting in Spend as a `savings`
// pane — a second drawing of the roadmap card, filed under last month's outgoings — and what
// replaces it here is an actual pot: deposits that accrue, five save hacks that put them
// there, and the interest the balance earns. Challenges is the other half of the same idea
// and the only surface in the app that goes after a habit rather than a balance.
//
// Five panes, and the order is the argument. Save first and Challenges second because they
// are the two things on this tab a customer can act on today; everything below them is a
// position, which is a fact rather than a decision. Net worth is the number Cleo has no
// reason to compute and a wealth product cannot do without. Holdings is what is already
// owned, including what is held elsewhere. Invest is the shelf — and every row on it goes
// through the gate before it can be bought, which is the one thing here that no competitor's
// shelf does.
//
// Save and Challenges are served by routes of their own rather than by /view, so they are
// fetched here exactly the way Holdings already was: state on the tab, one effect keyed on
// the snapshot, and the pull-to-refresh pulling all three — which is what `alsoRefresh` on
// `SnapshotScroll` is for. Every screen this tab pushes reads its own payloads the same way.
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { TabHeader } from '~/ui/TabHeader'
import { Pills, usePane } from '~/ui/Pills'
import { Pane, Reveal } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Count } from '~/ui/Count'
import { dur } from '~/ui/motion'
import { Button } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Meter } from '~/ui/Meter'
import { Note } from '~/ui/Note'
import { Tap } from '~/ui/Tap'
import { Row } from '~/ui/Row'
import { Section } from '~/ui/Section'
import { SnapshotScroll } from '~/ui/SnapshotScroll'
import { PayloadPane } from '~/ui/PayloadPane'
import { DayGrid } from '~/ui/DayGrid'
import { SpendBars } from '~/ui/SpendBars'
import { Glyph, GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { GateSheet, ProductRow } from '~/ui/GateSheet'
import { MerchantMark } from '~/ui/MerchantMark'
import { TransactionRow } from '~/ui/TransactionRow'
import { SourceStrip } from '~/ui/SourceStrip'
import { useSnapshot } from '~/state/snapshot'
import { usePayload } from '~/state/payload'
import { useSaveView } from '~/state/save'
import { api } from '~/api/client'
import { fullDate, rupees, rupeesShort, shortDate } from '~/lib/money'
import { color } from '@dhan/design'
import { netWorth, shelfGroup, type ShelfGroup } from '@dhan/core'
import { holdingsTotals } from '~/lib/holdings'
import { HOME_CUSTODIAN, custodianOf, sourcesOf } from '~/lib/sources'
import { groupByDay } from '~/lib/activity'
import type {
  ActiveChallenge,
  ChallengeView,
  ConsentScope,
  HoldingRecordResponse,
  SaveDeposit,
  SaveHackCard,
  SaveView,
  ShelfProduct,
  View as ViewModel,
} from '@dhan/contracts'

// Not exported by the contract: `SaveDepositSchema.source` is an inline union of the five
// hack ids and 'manual', so the name for it is derived here rather than added over there.
type SaveDepositSource = SaveDeposit['source']

type Pane = 'save' | 'challenges' | 'networth' | 'holdings' | 'invest'

const PANES = [
  { value: 'save' as const, label: 'Save' },
  { value: 'challenges' as const, label: 'Challenges' },
  { value: 'networth' as const, label: 'Net worth' },
  { value: 'holdings' as const, label: 'Holdings' },
  { value: 'invest' as const, label: 'Invest' },
]

export default function Grow() {
  const { data: view } = useSnapshot()
  const { pane, dir, set } = usePane<Pane>('save')
  // Three routes beside the snapshot, each read on its own so that a save route which is
  // down empties its own pane and leaves the net worth beside it standing. Each one is held
  // by `usePayload`, which keeps *failed* apart from *loading* and from *empty*: these three
  // used to catch into `[]` and `null`, so a 500 on /holdings rendered "Nothing held yet."
  // over a portfolio that exists, and a 500 on /save left "Counting the pot…" on screen for
  // good. Keyed on the view, so a refreshed snapshot — a moved clock, a decision taken —
  // pulls all three with it.
  const holdings = usePayload(api.holdings, view)
  const save = useSaveView(view)
  const challenges = usePayload(api.challenges, view)
  // Read for one field: which blocks of the file the customer has switched off. Holdings
  // needs it to tell an empty portfolio apart from a withdrawn one — two states that look
  // identical from /holdings and mean opposite things to the person reading the screen.
  const session = usePayload(api.session, view)
  const [chosen, setChosen] = useState<ShelfProduct | null>(null)

  const reloadHoldings = holdings.reload
  const reloadSave = save.reload
  const reloadChallenges = challenges.reload
  const reloadSession = session.reload
  const loadPanes = useCallback(
    () => Promise.all([reloadHoldings(), reloadSave(), reloadChallenges(), reloadSession()]),
    [reloadHoldings, reloadSave, reloadChallenges, reloadSession],
  )

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <TabHeader title="Grow" />
      <Pills options={PANES} value={pane} onChange={set} />

      {/* `alsoRefresh` pulls the three extra routes on the same gesture, deliberately.
          Refreshing the view alone would let each payload's own effect pick them up behind
          it — but only once /view has actually come back, and a pull that fails there is
          precisely the moment the customer wants the other three tried anyway. So a manual
          pull reads each of the three twice, once on the gesture and once when the new view
          lands; `usePayload` sequences the two by issue order, so the later answer is the one
          that stays. Three wasted GETs on a gesture, for a tab that is never half-stale. */}
      <SnapshotScroll loading="Adding it up…" alsoRefresh={loadPanes}>
        {(view) => (
          <Pane key={pane} dir={dir} className="gap-md">
            {pane === 'save' ? (
              <PayloadPane
                payload={save}
                loading="Counting the pot…"
                error="Could not read your pot."
              >
                {(s) => <Save save={s} />}
              </PayloadPane>
            ) : pane === 'challenges' ? (
              <PayloadPane
                payload={challenges}
                loading="Reading your last four weeks…"
                error="Could not read your challenges."
              >
                {(c) => <Challenges challenges={c} />}
              </PayloadPane>
            ) : pane === 'networth' ? (
              <NetWorth view={view} />
            ) : pane === 'holdings' ? (
              <PayloadPane
                payload={holdings}
                loading="Reading what you hold…"
                error="Could not read what you hold."
              >
                {(h) => (
                  <Holdings
                    holdings={h.holdings}
                    sipMonthly={view.snapshot.holdings.sipMonthly}
                    scopeOverrides={session.data?.scopeOverrides ?? []}
                  />
                )}
              </PayloadPane>
            ) : (
              <Invest shelf={view.shelf} onPick={setChosen} />
            )}
          </Pane>
        )}
      </SnapshotScroll>

      <GateSheet product={chosen} onClose={() => setChosen(null)} />
    </SafeAreaView>
  )
}

/**
 * Save — Cleo's savings pot, drawn over a bank account rather than over a wallet.
 *
 * Cleo's pot is money they hold: it moves in, it sits there, and the card is a statement of
 * their balance. Ours cannot be, and pretending otherwise would be the one dishonest card in
 * the app. The pot is the part of the customer's own savings account the hacks have set
 * aside, the interest line is IDBI's published savings rate read off that account rather than
 * an APY sold as nine times the national average, and the goal being filled belongs to the
 * roadmap — which is why the gear leads to a settings screen that can edit it and why nothing
 * on this card can.
 *
 * Everything printed here was computed server-side, including the five hacks' titles and the
 * sentence under each one. Two clients reading one pot should not be able to describe it
 * differently.
 */
function Save({ save }: { save: SaveView }) {
  const { pot, cards, interest, deposits } = save
  const pct = Math.round(pot.progress * 100)
  const activity = groupByDay(deposits)

  return (
    <>
      <View className="rounded-lg bg-hero p-lg">
        <View className="flex-row items-start justify-between gap-md">
          <Type role="heading" tone="onInk" className="flex-1">
            {pot.purpose}
          </Type>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Savings settings"
            haptic="none"
            onPress={() => router.push('/save-settings')}
            scale={0.9}
            className="h-9 w-9 items-center justify-center rounded-pill bg-surface/20"
          >
            <Glyph name="sliders" size={18} tint={color.onInk} />
          </Tap>
        </View>

        <Count
          value={pot.saved}
          format={rupees}
          role="display"
          tone="onInk"
          className="mt-lg"
          delay={dur.enter}
        />
        <Type role="body" tone="onInk" className="mt-xs opacity-85">
          of {rupees(pot.target)} saved
        </Type>

        <View className="mt-lg flex-row items-center justify-between">
          <Type role="caption" tone="onInk" className="opacity-75">
            {pot.daysLeft} days left
          </Type>
          {/* A fortnight-old pot is genuinely under one percent of a five-year target, and
              rounding that to a flat 0% tells the customer nothing has happened when
              something has. Cleo write "<1%" and they are right to. */}
          <Type role="caption" tone="onInk" className="opacity-75">
            {pct === 0 && pot.progress > 0 ? '<1%' : `${pct}%`} progress
          </Type>
        </View>
        <View className="mt-sm">
          <Meter
            fraction={pot.progress}
            tone="bg-surface"
            track="bg-surface/25"
            delay={dur.enter}
          />
        </View>

        <View className="mt-lg gap-sm">
          <Leader label="Saved" amount={pot.saved} />
          <Leader label="Going in each month" amount={pot.monthlyInflow} />
        </View>

        <View className="mt-lg">
          <Button label="Deposit" variant="light" onPress={() => router.push('/deposit')} />
        </View>
      </View>

      <Section title="Save hacks" onMore={() => router.push('/save-hacks')} />
      {/* The rows are not individually tappable, and that is Cleo's arrangement rather than an
          omission: five destinations stacked in one card is five chances to open the wrong
          one, so the chevron on the heading opens the list and the list opens a hack. */}
      <Card>
        {cards.map((c, i) => (
          <View
            key={c.id}
            className={
              i > 0
                ? 'flex-row items-center gap-md border-t border-hairline px-lg py-md'
                : 'flex-row items-center gap-md px-lg py-md'
            }
          >
            <Type role="body" className="flex-1">
              {c.title}
            </Type>
            {c.enabled ? (
              <Chip tone="success">On</Chip>
            ) : (
              <Type role="label" tone="faint">
                Off
              </Type>
            )}
          </View>
        ))}
      </Card>

      <Section title="Interest" />
      <View className="flex-row gap-md">
        <Figure
          value={`${interest.ratePct}%`}
          label={`As of ${shortDate(interest.asOf, save.asOf)}`}
        />
        <Figure value={rupees(interest.earned)} label="Interest earned" />
      </View>
      <Type role="caption" tone="faint">
        What this savings account actually pays, not a promotional rate. It goes up above ₹5 lakh,
        so the figure moves with your balance.
      </Type>

      <Section title="Activity" />
      {activity.length === 0 ? (
        <Card>
          <View className="px-lg py-lg">
            <Type role="body" tone="soft">
              Nothing in the pot yet. Turn on a save hack, or add money by hand, and it shows up
              here.
            </Type>
          </View>
        </Card>
      ) : (
        activity.map((day) => (
          <View key={day.date} className="gap-sm">
            <Type role="caption" tone="soft" className="mt-sm">
              {fullDate(day.date)}
            </Type>
            <Card>
              {day.items.map((d, i) => (
                <Reveal key={d.id} i={i} delay={dur.state}>
                  <View
                    className={
                      i > 0
                        ? 'flex-row items-center gap-md border-t border-hairline px-lg py-md'
                        : 'flex-row items-center gap-md px-lg py-md'
                    }
                  >
                    <GlyphPlate
                      name={SOURCE_GLYPH[d.source]}
                      size={36}
                      fill={d.source === 'manual' ? 'bg-ground-deep' : 'bg-success'}
                    />
                    <View className="flex-1">
                      <Type role="label">{sourceTitle(d.source, cards)}</Type>
                      <Type role="caption" tone="soft" className="mt-0.5">
                        {d.note}
                      </Type>
                    </View>
                    <Type role="label" tone="brand">
                      + {rupees(d.amount)}
                    </Type>
                  </View>
                </Reveal>
              ))}
            </Card>
          </View>
        ))
      )}
    </>
  )
}

/**
 * What an activity row is called.
 *
 * The five hacks' titles arrive on `cards`, written server-side, so the row reads them from
 * there rather than keeping a second copy of the same five names one screen away from the
 * settings list that shows them. A hand-made deposit has no card, and "Deposit" is the only
 * string in this file that names a save hack at all.
 */
function sourceTitle(source: SaveDepositSource, cards: SaveHackCard[]): string {
  if (source === 'manual') return 'Deposit'
  return cards.find((c) => c.id === source)?.title ?? 'Save hack'
}

/** One mark per source, so a long activity list can be read down the left edge. */
/** The copy for each group the domain names. The partition is the engine's; the words are not. */
const GROUP_LABEL: Record<ShelfGroup, string> = {
  idbi_own: "IDBI's own",
  protection: 'Protection',
  market_linked: 'Market-linked',
}

const SOURCE_GLYPH: Record<SaveDepositSource, GlyphName> = {
  roundups: 'coins',
  set_forget: 'calendar',
  smart_save: 'sparkle',
  swear_jar: 'moneybag',
  payday_saver: 'paycheck',
  manual: 'plus',
}

/** One of the two interest tiles. Cleo put the figure first and name it underneath. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 rounded-md bg-ground-deep px-lg py-md">
      <Type role="title">{value}</Type>
      <Type role="caption" tone="soft" className="mt-xs">
        {label}
      </Type>
    </View>
  )
}

/** A dotted-leader row, the way Cleo rule the two figures under the pot. Cream on green. */
function Leader({ label, amount }: { label: string; amount: number }) {
  return (
    <View className="flex-row items-center gap-sm">
      <Type role="caption" tone="onInk" className="opacity-75">
        {label}
      </Type>
      <View className="h-px flex-1 bg-surface/25" />
      <Type role="label" tone="onInk">
        {rupees(amount)}
      </Type>
    </View>
  )
}

/**
 * Challenges — the gold half of Cleo's Save tab.
 *
 * One challenge runs at a time, which is a product decision the server enforces and not a
 * limitation: three simultaneous spending limits is a budget, and the app already has one of
 * those on the Spend tab. A challenge is the narrow case — one merchant or one category, for
 * one fortnight, with a number attached — and its whole value is that it is small enough to
 * hold in your head.
 *
 * So the pane has exactly two states. Nothing running is the pitch. Something running is the
 * card and then everything Cleo put behind a "View Challenge details" button, inlined: the
 * check-in, the daily chart, the streak and the lines that count against the limit. Cleo need
 * that button because their card and their detail are two screens; ours are one scroll, and a
 * button that scrolls you to what is already under your thumb is furniture.
 */
function Challenges({ challenges }: { challenges: ChallengeView }) {
  return challenges.active === null ? (
    <ChallengePromo windowDays={challenges.windowDays} />
  ) : (
    <ChallengeRun challenge={challenges.active} asOf={challenges.asOf} />
  )
}

function ChallengePromo({ windowDays }: { windowDays: number }) {
  return (
    <>
      <View className="rounded-lg bg-streak p-lg">
        <Type role="title">Rescue your spending</Type>
        <Type role="body" className="mt-xs opacity-80">
          Start a challenge in seconds and get your overspending under control.
        </Type>

        <View className="mt-lg gap-md">
          <Claim>Generated from your own statement</Claim>
          <Claim>Checked in on as you go</Claim>
          <Claim>What you do not spend goes to your goal</Claim>
        </View>

        <View className="mt-lg">
          <Button label="Start a challenge" onPress={() => router.push('/challenge-generating')} />
        </View>
      </View>

      {/* Cleo's small print under this card is an interest-rate disclosure. Ours has to say
          the harder thing, which is that starting a challenge moves no money at all: the
          saving is arithmetic against the customer's own recent spending, and a card that
          calls it a prediction while the small print quietly calls it a transfer would have
          those two sentences the wrong way round. */}
      <Type role="caption" tone="faint">
        A challenge does not move money by itself. The predicted saving is the difference between
        the limit you set and what the last {windowDays} days of your statement say the same stretch
        would otherwise cost — keeping to it is what puts the difference in the pot.
      </Type>
    </>
  )
}

/** One of the promo's three ticks. */
function Claim({ children }: { children: string }) {
  return (
    <View className="flex-row items-start gap-md">
      <Glyph name="check" size={18} />
      <Type role="body" className="flex-1">
        {children}
      </Type>
    </View>
  )
}

function ChallengeRun({ challenge, asOf }: { challenge: ActiveChallenge; asOf: string }) {
  const { limit, spent, days, dayIndex, remaining, overspent, daily, tip } = challenge
  const over = Math.max(0, spent - limit)

  return (
    <>
      <View className="rounded-lg bg-streak p-lg">
        <Type role="heading">{challenge.name}</Type>

        <Count value={spent} format={rupees} role="display" className="mt-sm" delay={dur.enter} />
        <Type role="body" className="mt-xs opacity-80">
          Spent of {rupees(limit)} spend limit
        </Type>

        {/* `won === true`, never a truthiness test. Null is "still running", and a screen that
            folds null into false commiserates with somebody whose result does not exist yet. */}
        {challenge.complete ? (
          <Type role="label" tone={challenge.won === true ? 'brand' : 'danger'} className="mt-lg">
            {challenge.won === true
              ? `Kept it — ${rupees(challenge.predictedSaving)} that stays yours`
              : `Finished ${rupees(over)} over the limit`}
          </Type>
        ) : (
          <Type role="label" tone={overspent ? 'danger' : 'ink'} className="mt-lg">
            {overspent ? `${rupees(over)} over the limit` : `${rupees(remaining)} remaining`}
          </Type>
        )}
        <View className="mt-sm">
          <Meter
            fraction={limit > 0 ? spent / limit : 0}
            tone={overspent ? 'bg-danger' : 'bg-ink'}
            track="bg-surface"
            delay={dur.enter}
          />
        </View>

        {/* A lighter wash of the same gold rather than a white well, which is how Cleo draw
            it and the right call: white on gold reads as a second card sitting on the first,
            and the grid is part of this card's argument rather than a thing beside it. */}
        <View className="mt-lg rounded-md bg-surface/35 p-md">
          <Type role="label">
            Day {dayIndex} of {days}
          </Type>
          <View className="mt-md">
            <DayGrid days={daily} limitPerDay={limit / days} />
          </View>
        </View>
      </View>

      <Section title="Challenge tips" />
      <Note title={tip.headline} glyph={TIP_GLYPH[tip.tone]}>
        {tip.detail}
      </Note>

      <Section title="Daily spending" />
      <Card>
        <View className="px-lg py-lg">
          <SpendBars days={daily} format={rupeesShort} />
          {/* The flame is the only mark in the chart that is not a bar, so it gets named. The
              count beside it is the run so far rather than a legend's decoration: a key that
              also answers "how many" earns the row it costs. */}
          <View className="mt-lg flex-row items-center gap-md">
            <GlyphPlate name="flame" size={28} fill="bg-streak" />
            <Type role="label" tone="mid" className="flex-1">
              ₹0 spend days
            </Type>
            <Type role="label">{challenge.zeroDays}</Type>
          </View>
        </View>
      </Card>

      <Card>
        <View className="flex-row items-center gap-md px-lg py-md">
          <GlyphPlate name="flame" size={36} fill="bg-streak" />
          <Type role="body" className="flex-1">
            Longest ₹0 spend streak
          </Type>
          <Type role="label">{challenge.longestZeroStreak}</Type>
        </View>
      </Card>

      <Section title="Challenge transactions" />
      <Card>
        {challenge.transactions.length === 0 ? (
          <View className="px-lg py-lg">
            <Type role="body" tone="soft">
              Nothing has counted against this limit yet.
            </Type>
          </View>
        ) : (
          challenge.transactions.map((t, i) => (
            <Reveal key={t.txnId} i={i} delay={dur.state}>
              <TransactionRow txn={t} asOf={asOf} divide={i > 0} />
            </Reveal>
          ))
        )}
      </Card>
    </>
  )
}

/**
 * Which mark the written check-in carries.
 *
 * The tone is the server's word — it knows whether the spend is inside its share of the
 * elapsed days and the client does not recompute it — so this is a lookup and not a
 * judgement. A clock before the challenge has started, a star while it is being kept, and a
 * target once it needs aiming at.
 */
const TIP_GLYPH: Record<ActiveChallenge['tip']['tone'], GlyphName> = {
  early: 'clock',
  ahead: 'star',
  behind: 'target',
}

function NetWorth({ view }: { view: ViewModel }) {
  // `balances`, `holdings` and `debt` are still read directly below for the per-line
  // figures; what net worth *means* is the engine's, not this render function's.
  const { balances, holdings, debt } = view.snapshot
  const { assets, net, allocation } = netWorth(view.snapshot)
  const { cash, equity, fixed } = allocation

  return (
    <>
      <View className="rounded-lg bg-hero p-lg">
        <Type role="caption" tone="onInk" className="opacity-85">
          NET WORTH
        </Type>
        <Count
          value={net}
          format={rupeesShort}
          role="display"
          tone="onInk"
          className="mt-xs"
          delay={dur.enter}
        />
        <Type role="body" tone="onInk" className="mt-sm opacity-85">
          {rupees(assets)} of assets, less {rupees(debt.total)} owed.
        </Type>
      </View>

      <Card>
        <Row label="Savings" value={rupees(balances.savings)} />
        <Row label="Deposits" value={rupees(balances.deposits)} divide />
        <Row label="Investments" value={rupees(holdings.total)} divide />
        <Row label="Borrowing" value={`− ${rupees(debt.total)}`} divide tone="danger" />
      </Card>

      <Section title="Where it sits" />
      <Card>
        <Allocation label="Cash and deposits" amount={cash} total={assets} tone="bg-brand" />
        <Allocation label="Equity" amount={equity} total={assets} tone="bg-streak" divide />
        <Allocation
          label="Fixed income and other"
          amount={fixed}
          total={assets}
          tone="bg-budget"
          divide
        />
      </Card>

      {/* Idle cash is the finding this tab exists to surface. It is not a scolding: it is a
          number with a consequence, which the daily action then offers to fix. */}
      {balances.idleMonths >= 6 && (
        <View className="rounded-lg bg-streak p-lg">
          <Type role="heading">
            {rupees(balances.idleFloor)} has not moved in {balances.idleMonths} months
          </Type>
          <Type role="body" className="mt-xs opacity-80">
            Your balance never drops below this. At savings rates it loses to inflation every year
            it sits there.
          </Type>
        </View>
      )}
    </>
  )
}

function Holdings({
  holdings,
  sipMonthly,
  scopeOverrides,
}: {
  holdings: HoldingRecordResponse[]
  sipMonthly: number
  /** The blocks of the file the customer has switched off. */
  scopeOverrides: readonly ConsentScope[]
}) {
  // An empty portfolio and a withdrawn one arrive here identically — `consent-scope.ts` blanks
  // the holdings block rather than erroring — and they mean opposite things. "Nothing held yet"
  // over a portfolio the customer switched off themselves is the app lying about its own state.
  const withdrawn = scopeOverrides.includes('HOLDINGS')
  if (withdrawn) {
    return <SourceStrip sources={[]} withdrawn onPress={() => router.push('/connections')} />
  }
  if (holdings.length === 0) {
    return (
      <Type role="body" tone="soft">
        Nothing held yet.
      </Type>
    )
  }
  const { invested, value, gain } = holdingsTotals(holdings)
  const sources = sourcesOf(holdings)

  return (
    <>
      <View className="rounded-lg bg-budget p-lg">
        <Type role="caption" className="opacity-70">
          CURRENT VALUE
        </Type>
        <Count value={value} format={rupees} role="display" className="mt-xs" delay={dur.enter} />
        {/* Stated as rupees and as a share of what went in, never as a return: a notional
            gain annualised into a percentage is a performance claim, and this is not one. */}
        <Type role="body" className="mt-sm opacity-80">
          {rupees(invested)} put in · {gain >= 0 ? '+' : '−'}
          {rupees(Math.abs(gain))} on paper
        </Type>
        {sipMonthly > 0 && (
          <Type role="caption" className="mt-sm opacity-70">
            {rupees(sipMonthly)} a month going in
          </Type>
        )}
      </View>

      {/* Between the total and the list, because it frames the list: these eleven rows are not
          all IDBI's, and the customer is entitled to know whose they are before reading them. */}
      <SourceStrip
        sources={sources}
        withdrawn={false}
        onPress={() => router.push('/connections')}
      />

      <Card>
        {holdings.map((h, i) => {
          const g = h.currentValue - h.investedAmount
          return (
            <Reveal
              key={h.holdingId}
              i={i}
              delay={dur.state}
              className={i > 0 ? 'border-t border-hairline px-lg py-lg' : 'px-lg py-lg'}
            >
              <View className="flex-row items-start gap-md">
                <MerchantMark merchant={h.name} category="Investment" size={36} />
                <Type role="heading" className="flex-1">
                  {h.name}
                </Type>
                <Type role="label">{rupees(h.currentValue)}</Type>
              </View>
              <View className="mt-xs flex-row items-center justify-between gap-md">
                <Type role="caption" tone="soft" className="flex-1">
                  {h.assetClass} · {rupees(h.investedAmount)} invested
                </Type>
                <Type role="caption" tone={g >= 0 ? 'brand' : 'danger'}>
                  {g >= 0 ? '+' : '−'}
                  {rupees(Math.abs(g))}
                </Type>
              </View>
              <View className="mt-sm flex-row flex-wrap gap-sm">
                {h.sipActive && h.sipAmount !== undefined && (
                  <Chip tone="budget">SIP {rupees(h.sipAmount)}</Chip>
                )}
                {/* The custodian, not "Held elsewhere": the contract calls `custodian` the
                    honest form of that boolean, and a customer who can read the name can go
                    and check the figure against it. Our own book says nothing — every other
                    row on the list would carry the same chip, which is noise, not provenance. */}
                {custodianOf(h) !== HOME_CUSTODIAN && <Chip tone="ground">{custodianOf(h)}</Chip>}
              </View>
            </Reveal>
          )
        })}
      </Card>

      <Type role="caption" tone="faint">
        Gains are on paper, before tax and exit charges. Holdings elsewhere come from your
        consolidated statement, not IDBI.
      </Type>
    </>
  )
}

function Invest({ shelf, onPick }: { shelf: ShelfProduct[]; onPick: (p: ShelfProduct) => void }) {
  // `category.includes('Insurance')` filed "LIC Jeevan Anand Endowment" as market-linked
  // while the Protect tab's name regex called the same product cover. One rule, in the
  // engine, is what stops the two tabs disagreeing about a product again.
  const groups = new Map<string, ShelfProduct[]>()
  for (const p of shelf) {
    const key = GROUP_LABEL[shelfGroup(p)]
    const list = groups.get(key) ?? []
    list.push(p)
    groups.set(key, list)
  }

  return (
    <>
      <Type role="body" tone="soft">
        Everything the bank can sell you. Tap one and I will tell you whether to buy it — including
        when the answer is no.
      </Type>

      {[...groups.entries()].map(([label, items]) => (
        <View key={label} className="gap-md">
          <Section title={label} />
          <Card>
            {items.map((p, i) => (
              <ProductRow key={p.productId} product={p} onPress={() => onPick(p)} divide={i > 0} />
            ))}
          </Card>
        </View>
      ))}
    </>
  )
}

function Allocation({
  label,
  amount,
  total,
  tone,
  divide = false,
}: {
  label: string
  amount: number
  total: number
  tone: string
  divide?: boolean
}) {
  const share = total > 0 ? amount / total : 0
  return (
    <View className={divide ? 'border-t border-hairline px-lg py-md' : 'px-lg py-md'}>
      <View className="flex-row justify-between gap-md">
        <Type role="body" tone="mid" className="flex-1">
          {label}
        </Type>
        <Type role="label">
          {rupees(amount)} · {Math.round(share * 100)}%
        </Type>
      </View>
      <View className="mt-sm">
        <Meter fraction={share} tone={tone} track="bg-ground-deep" delay={dur.state} />
      </View>
    </View>
  )
}

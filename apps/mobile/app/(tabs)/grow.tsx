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
// **A position is still something to act on.** Every pane now has a next step, because a
// pane that only reports gets read once. Save opens with Cleo's set-up checklist until the
// four first moves are made, and offers the challenge the statement points at. A running
// challenge has a gear, and behind it the one control it never had: ending it —
// `api.endChallenge` existed and nothing called it, so a challenge could only be outlived.
// A finished one offers the next instead of stopping dead. Each line of the net worth leads
// to where that number lives, each holding opens the record behind its figure, and the shelf
// can be asked about as well as browsed.
//
// **Any pane can be linked to.** `?pane=` names one — "/grow?pane=invest" from the credit
// screen, a notice opening Challenges — and `usePane` adopts it and clears it. However a pane
// is reached, it opens at its top: the five share one scroll, and Invest used to open
// wherever the reader had left Holdings.
//
// Save and Challenges are served by routes of their own rather than by /view, so they are
// fetched here exactly the way Holdings already was: state on the tab, one effect keyed on
// the snapshot, and the pull-to-refresh pulling all three — which is what `alsoRefresh` on
// `SnapshotScroll` is for. Every screen this tab pushes reads its own payloads the same way.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { View, useWindowDimensions, type ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { TabHeader } from '~/ui/TabHeader'
import { Pills, usePane } from '~/ui/Pills'
import { Pane, Reveal } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Count } from '~/ui/Count'
import { dur } from '~/ui/motion'
import { Button, ButtonStack } from '~/ui/Button'
import { Card } from '~/ui/Card'
import { Chip } from '~/ui/Chip'
import { Meter } from '~/ui/Meter'
import { Note } from '~/ui/Note'
import { Tap } from '~/ui/Tap'
import { Row, type RowTone } from '~/ui/Row'
import { Section } from '~/ui/Section'
import { Sheet } from '~/ui/Sheet'
import { Checklist, type ChecklistStep } from '~/ui/Checklist'
import { MenuGroup, MenuRow } from '~/ui/MenuRow'
import { AskUday } from '~/ui/AskUday'
import { EmptyState, RetryLine, SnapshotScroll } from '~/ui/SnapshotScroll'
import { PayloadPane } from '~/ui/PayloadPane'
import { DayGrid } from '~/ui/DayGrid'
import { SpendBars } from '~/ui/SpendBars'
import { Glyph, GlyphPlate, type GlyphName } from '~/ui/Glyph'
import { GateSheet, ProductRow } from '~/ui/GateSheet'
import { MerchantMark } from '~/ui/MerchantMark'
import { TransactionRow } from '~/ui/TransactionRow'
import { TransactionSheet } from '~/ui/TransactionSheet'
import { SourceStrip } from '~/ui/SourceStrip'
import { useToast } from '~/ui/Toast'
import { cn } from '~/ui/cn'
import { useSnapshot } from '~/state/snapshot'
import { usePayload } from '~/state/payload'
import { goalHorizon, useSaveView, type GoalHorizon } from '~/state/save'
import { ApiError, api } from '~/api/client'
import { rupees, rupeesShort, shortDate } from '~/lib/money'
import { INVEST_OR_CLEAR, SAVINGS_RATE, depositsQuestion, idleCashQuestion } from '~/lib/ask'
import { HACK_GLYPH, HACK_NAME, ordinal } from '~/lib/savehack'
import { holdingsTotals } from '~/lib/holdings'
import {
  HOME_CUSTODIAN,
  UNNAMED_CUSTODIAN,
  custodianOf,
  provenanceLabel,
  sourcesOf,
} from '~/lib/sources'
import { groupByDay } from '~/lib/activity'
import { challengeTitle, inSentence } from '~/lib/names'
import { color, size } from '@dhan/design'
import { netWorth, shelfGroup, type ShelfGroup } from '@dhan/core'
import type {
  ActiveChallenge,
  ChallengeView,
  ConsentScope,
  Habit,
  HoldingRecordResponse,
  SaveDeposit,
  SaveHackCard,
  SaveView,
  ShelfProduct,
  TargetSpend,
  Transaction,
  View as ViewModel,
} from '@dhan/contracts'

// Not exported by the contract: `SaveDepositSchema.source` is an inline union of the five
// hack ids and 'manual', so the name for it is derived here rather than added over there.
type SaveDepositSource = SaveDeposit['source']

type Pane = 'save' | 'challenges' | 'networth' | 'holdings' | 'invest'

/** Moves the tab to another pane, the way a pill does; handed to the panes that lead elsewhere. */
type Go = (next: Pane, dir: number) => void

const PANES: ReadonlyArray<{ value: Pane; label: string }> = [
  { value: 'save', label: 'Save' },
  { value: 'challenges', label: 'Challenges' },
  { value: 'networth', label: 'Net worth' },
  { value: 'holdings', label: 'Holdings' },
  { value: 'invest', label: 'Invest' },
]

/**
 * Hands a question to Uday. Inside the tabs another tab is a jump; the pushed screens pop back to
 * the tabs instead, for the reason `useToTab` gives.
 */
function askUday(question: string) {
  router.navigate({ pathname: '/(tabs)/uday', params: { ask: question } })
}

export default function Grow() {
  const { data: view, refresh } = useSnapshot()
  const { pane, dir, set } = usePane<Pane>('save', PANES)
  const scroller = useRef<ScrollView>(null)
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
  // Read for two fields. Which blocks of the file the customer has switched off: Holdings
  // needs it to tell an empty portfolio apart from a withdrawn one — two states that look
  // identical from /holdings and mean opposite things to the person reading the screen. And
  // whether they have ever set their goal's target themselves, which is the only honest
  // answer to the checklist's "Check your goal": the pot always has a target, because the
  // roadmap suggests one, so "has a target" would tick that step for everybody on day one.
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

  // A pane opens at its top, whichever way it was reached — a pill, a row that leads to
  // another pane, or a link from another screen. Keyed on the pane rather than done in the
  // pill's handler, because the link and the rows never pass through that handler.
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false })
  }, [pane])

  // Null while a read is out, so the checklist waits for it rather than drawing a step unticked
  // and then ticking it. A read that *failed* is not a wait: the checklist used to hold for an
  // answer that was never coming and so never drew at all. A failed session read leaves "Check
  // your goal" open — it leads to the goal editor either way.
  const goalSet =
    session.data !== null
      ? session.data.goalTarget !== null
      : session.state === 'error'
        ? false
        : null

  // /challenges keeps no history: once a challenge is ended or cleared, `active` is null again
  // and nothing on the wire says one ever ran. So the tab remembers having seen one for as long
  // as it is mounted — one signed-in session — and "Start a spending challenge" stays ticked
  // rather than un-ticking the moment the customer ends the challenge it asked them to start.
  const running = challenges.data?.active ?? null
  const [hadChallenge, setHadChallenge] = useState(false)
  useEffect(() => {
    if (running !== null) setHadChallenge(true)
  }, [running])
  const started =
    hadChallenge || running !== null
      ? true
      : challenges.data !== null || challenges.state === 'error'
        ? false
        : null

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
      <SnapshotScroll ref={scroller} loading="Adding it up…" alsoRefresh={loadPanes}>
        {(view) => (
          <Pane key={pane} dir={dir} className="gap-md">
            {pane === 'save' ? (
              <PayloadPane
                payload={save}
                loading="Counting the pot…"
                error="Couldn't load your pot."
                onRetry={reloadSave}
              >
                {(s) => (
                  <Save
                    save={s}
                    horizon={goalHorizon(view.roadmap, view.snapshot)}
                    challenges={challenges.data}
                    started={started}
                    goalSet={goalSet}
                    habits={view.snapshot.discretionary.topHabits}
                  />
                )}
              </PayloadPane>
            ) : pane === 'challenges' ? (
              <PayloadPane
                payload={challenges}
                loading="Reading your challenges…"
                error="Couldn't load your challenges."
                onRetry={reloadChallenges}
              >
                {(c) => (
                  <Challenges challenges={c} reload={reloadChallenges} refreshView={refresh} />
                )}
              </PayloadPane>
            ) : pane === 'networth' ? (
              <NetWorth view={view} go={set} />
            ) : pane === 'holdings' ? (
              <PayloadPane
                payload={holdings}
                loading="Reading your holdings…"
                error="Couldn't load your holdings."
                onRetry={reloadHoldings}
              >
                {(h) => (
                  <Holdings
                    holdings={h.holdings}
                    sipMonthly={view.snapshot.holdings.sipMonthly}
                    scopeOverrides={session.data?.scopeOverrides ?? []}
                    source={provenanceLabel(view.meta.provenance.HOLDINGS)}
                    asOf={view.snapshot.asOf}
                    go={set}
                  />
                )}
              </PayloadPane>
            ) : (
              <Invest
                shelf={view.shelf}
                owes={view.snapshot.debt.total > 0}
                onPick={setChosen}
                onRetry={refresh}
              />
            )}
          </Pane>
        )}
      </SnapshotScroll>

      {/* `onSwitch` moves the open sheet onto the alternative a blocked verdict offers, rather
          than closing it and leaving the customer to find that product on the shelf. */}
      <GateSheet product={chosen} onClose={() => setChosen(null)} onSwitch={setChosen} />
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
 * roadmap. So the gear leads to a settings screen that can edit it, and nothing on this card
 * can.
 *
 * The same goal is on the Plan tab, and the two cards used to read as two goals: this one
 * counted "3 years left" to the target date and "0% progress" off the pot, where Plan said "11
 * months to go", "41% there" and ₹21,516 a month. Every claim about the goal's time and money
 * is now the route's, read through `goalHorizon` exactly as Plan reads it, and the one figure
 * that is this card's own says what it counts: what is in the pot.
 *
 * Everything printed here was computed server-side, including the five hacks' titles and the
 * sentence under each one. Two clients reading one pot should not be able to describe it
 * differently.
 */
function Save({
  save,
  horizon,
  challenges,
  started,
  goalSet,
  habits,
}: {
  save: SaveView
  /** The goal's time and monthly, measured as the Plan tab measures them. */
  horizon: GoalHorizon
  /** Null until /challenges has answered; the suggestion waits for it. */
  challenges: ChallengeView | null
  /** Whether a challenge has run this session; null while /challenges is still out. */
  started: boolean | null
  /** Whether the customer has set the goal's target themselves; null until the session is read. */
  goalSet: boolean | null
  /** The snapshot's habits, which carry the category behind a merchant group like "Fast food". */
  habits: readonly Habit[]
}) {
  const { pot, cards, interest, deposits } = save
  const [explaining, setExplaining] = useState(false)
  const pct = Math.round(pot.progress * 100)
  const activity = groupByDay(deposits)
  // The checklist waits for the two reads its last steps turn on rather than drawing them
  // unticked first: a customer with a challenge running would otherwise be told, for as long
  // as /challenges took, to start one.
  const steps = started === null || goalSet === null ? null : setupSteps(save, started, goalSet)
  const settingUp = steps !== null && steps.some((s) => s.state !== 'done')
  const suggestion =
    challenges === null || challenges.active !== null ? null : recommendation(challenges)

  return (
    <>
      <View className="rounded-lg bg-hero p-xl">
        <View className="flex-row items-start justify-between gap-md">
          {/* The purpose alone, as Cleo title the goal card: "Saving towards" above it was a
              label over a heading that already says what it is. VoiceOver still hears the
              relation, because a goal's name read cold does not say it is a savings pot. */}
          <Type
            role="heading"
            tone="onInk"
            className="flex-1"
            accessibilityLabel={`Saving towards ${pot.purpose}`}
          >
            {pot.purpose}
          </Type>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Save settings"
            haptic="none"
            onPress={() => router.push('/save-settings')}
            scale={0.9}
            className="-mr-sm -mt-sm h-target w-target items-center justify-center rounded-pill bg-surface/20"
          >
            <Glyph name="sliders" size={20} tint={color.onInk} />
          </Tap>
        </View>

        {/* One stop for VoiceOver: the figure and what it counts are one fact. It counts the
            pot, and says so: "of ₹3,68,292 saved" read as the goal's progress, and Plan measures
            that off the whole balance — a buffer 41% there while the pot is still empty. */}
        <View accessible accessibilityLabel={`${rupees(pot.saved)} in your pot`} className="mt-md">
          <Count
            value={pot.saved}
            format={rupees}
            role="display"
            tone="onInk"
            id="grow.saved"
            delay={dur.enter}
            plain
          />
          <Type role="body" tone="onInk" className="mt-xs">
            in your pot
          </Type>
        </View>

        {/* The time is the plan's, to the day the route has the goal's figure: "11 months to
            go" here and on Plan, where this used to count "3 years left" to the target date.
            The share is the pot's, of the target — the bar the deposit screen moves. Wraps
            rather than colliding when a crore target meets 320pt. */}
        <View className="mt-lg flex-row flex-wrap items-center gap-x-md gap-y-xs">
          {horizon.toGo === null ? null : (
            <Type role="label" tone="onInk">
              {horizon.toGo}
            </Type>
          )}
          {/* A fortnight-old pot is genuinely under one percent of a five-year target, and
              rounding that to a flat 0% tells the customer nothing has happened when
              something has. Cleo write "<1%" and they are right to. */}
          <Type role="label" tone="onInk" className="ml-auto">
            {pct === 0 && pot.progress > 0 ? '<1%' : `${pct}%`} of {rupees(pot.target)}
          </Type>
        </View>
        <View className="mt-sm">
          <Meter
            size="thick"
            fraction={pot.progress}
            tone="bg-surface"
            track="bg-surface/25"
            label="Share of the target in your pot"
            delay={dur.enter}
          />
        </View>

        {/* What goes in, each named by where it comes from: the plan's monthly, which is
            Plan's "Every month" to the rupee, and what the hacks add today. Then the plan's
            finish, only where it is not the customer's own date, as Plan prints it. */}
        <View className="mt-lg gap-sm">
          <Leader
            label="Your plan"
            value={horizon.monthly > 0 ? `${rupees(horizon.monthly)} a month` : 'Nothing spare yet'}
          />
          <Leader label="Save hacks add" value={`${rupees(pot.monthlyInflow)} a month`} />
          {horizon.doneBy === null ? null : (
            <Leader label="Done by" value={shortDate(horizon.doneBy, save.asOf)} />
          )}
          <Leader label="Target date" value={shortDate(pot.targetDate, save.asOf)} />
        </View>

        <Button
          variant="light"
          label="Add to goal"
          haptic="none"
          className="mt-lg"
          onPress={() => router.push('/deposit')}
        />
      </View>

      {settingUp && steps !== null ? (
        <>
          <Section
            title="Finish setting up"
            trailing={
              <Progress done={steps.filter((s) => s.state === 'done').length} of={steps.length} />
            }
          />
          <Checklist steps={steps} />
        </>
      ) : null}

      {suggestion === null || challenges === null ? null : (
        <ChallengeSuggestion
          target={suggestion}
          category={targetCategory(suggestion, habits)}
          days={recommendedDays(challenges)}
          windowDays={challenges.windowDays}
        />
      )}

      <Section title="Save hacks" onMore={() => router.push('/save-hacks')} moreLabel="Manage" />
      {/* Each row opens its hack, as Cleo's do. These were a read-only mirror, and a row with a
          plate, a name and a state chip is the shape of a control everywhere else in the app:
          five of them that did nothing on a tap were five dead ends on the one card the
          customer came to change. The chevron on the heading still opens the whole list. Each
          row carries the mark its deposits carry in the activity below, so the two lists can
          be read against each other down the left edge. */}
      <Card className="py-sm">
        {cards.map((c) => (
          <Tap
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={HACK_NAME[c.id]}
            accessibilityValue={{ text: c.enabled ? 'On' : 'Off' }}
            accessibilityHint={c.detail}
            haptic="none"
            onPress={() => router.push({ pathname: '/save-hack', params: { id: c.id } })}
            className="min-h-target flex-row items-center gap-md px-lg py-xs"
          >
            <GlyphPlate
              name={SOURCE_GLYPH[c.id]}
              size={size.plateMd}
              fill={c.enabled ? 'bg-success' : 'bg-ground-deep'}
            />
            {/* The app's name for the hack, not the server's title ("Smart Save"), so this row,
                the list, the editor and the toast all say the same thing. */}
            <Type role="body" weight="semibold" plain className="flex-1">
              {HACK_NAME[c.id]}
            </Type>
            {/* Wrapped: the chip sizes itself with `self-start`, which in a row pins it to the top. */}
            <View>
              <Chip tone={c.enabled ? 'success' : 'ground'}>{c.enabled ? 'On' : 'Off'}</Chip>
            </View>
            <Glyph name="chevronRight" size={20} tint={color.ink} />
          </Tap>
        ))}
      </Card>

      <Section title="Interest" onInfo={() => setExplaining(true)} />
      <View className="flex-row gap-md">
        <Figure
          value={`${interest.ratePct}%`}
          label={`Savings rate ${keep(`on ${shortDate(interest.asOf, save.asOf)}`)}`}
        />
        <Figure value={rupees(interest.earned)} label="Interest earned" />
      </View>

      <Section title="Activity" />
      {activity.length === 0 ? (
        <Card className="px-lg py-lg">
          <Type role="body" tone="mid">
            Nothing added yet.
          </Type>
          {/* While the checklist is up it already offers both of these, first and second, a
              screen above; saying them twice turns an empty list into a wall of buttons. Until
              it is known whether the checklist will draw, they wait with it: drawn first, they
              vanished a moment later when it landed, and the page jumped under the thumb. */}
          {steps === null || settingUp ? null : (
            <ButtonStack className="mt-md">
              <Button
                size="sm"
                variant="secondary"
                label="Add money"
                haptic="none"
                onPress={() => router.push('/deposit')}
              />
              <Button
                size="sm"
                variant="secondary"
                label="Turn on a save hack"
                haptic="none"
                onPress={() => router.push('/save-hacks')}
              />
            </ButtonStack>
          )}
        </Card>
      ) : (
        activity.map((day) => (
          <View key={day.date} className="gap-sm">
            <Type role="label" weight="semibold" tone="mid" className="mt-sm">
              {dayTitle(day.date, save.asOf)}
            </Type>
            <Card>
              {day.items.map((d, i) => (
                <Reveal key={d.id} i={i} delay={dur.state}>
                  <View
                    accessible
                    accessibilityLabel={`${sourceTitle(d.source, cards)}, ${rupees(d.amount)} in. ${d.note}`}
                    className={cn(
                      'flex-row items-center gap-md px-lg py-md',
                      i > 0 && 'border-t border-hairline',
                    )}
                  >
                    <GlyphPlate
                      name={SOURCE_GLYPH[d.source]}
                      size={size.plateMd}
                      fill={d.source === 'manual' ? 'bg-ground-deep' : 'bg-success'}
                    />
                    <View className="flex-1">
                      <Type role="body" weight="semibold">
                        {sourceTitle(d.source, cards)}
                      </Type>
                      <Type role="label" tone="mid" className="mt-xxs">
                        {d.note}
                      </Type>
                    </View>
                    <Type role="body" weight="semibold" tone="brand" plain>
                      +{rupees(d.amount)}
                    </Type>
                  </View>
                </Reveal>
              ))}
            </Card>
          </View>
        ))
      )}

      <Sheet open={explaining} onClose={() => setExplaining(false)} title="What this rate is">
        <Type role="body">
          IDBI&apos;s real savings rate, not a promotional one. It rises above ₹5 lakh.
        </Type>
        <AskUday question={SAVINGS_RATE} onBefore={() => setExplaining(false)} className="mt-md" />
      </Sheet>
    </>
  )
}

/**
 * Cleo's "Complete Savings set up", as four first moves.
 *
 * Each step is ticked by a fact the app can read rather than by having been tapped, so a
 * customer who added money through the hero's button, not through the list, still sees it
 * done. The first unfinished step is the current one; the rest stay tappable, because the
 * order is advice and not a gate.
 */
function setupSteps(save: SaveView, started: boolean, goalSet: boolean): ChecklistStep[] {
  const facts = [
    {
      id: 'deposit',
      title: 'Add money to your goal',
      done: save.deposits.length > 0 || save.pot.saved > 0,
      onPress: () => router.push('/deposit'),
    },
    {
      id: 'hack',
      title: 'Turn on a save hack',
      done: save.cards.some((c) => c.enabled),
      onPress: () => router.push('/save-hacks'),
    },
    {
      id: 'goal',
      title: 'Check your goal',
      done: goalSet,
      onPress: () => router.push('/edit-goal'),
    },
    {
      // The step asked for a challenge to be started, and one was: a finished challenge is
      // still `active` until it is cleared, and one ended or cleared is remembered by the tab.
      id: 'challenge',
      title: 'Start a spending challenge',
      done: started,
      onPress: () => router.push('/challenge-generating'),
    },
  ]
  const current = facts.findIndex((f) => !f.done)
  return facts.map((f, i) => ({
    id: f.id,
    title: f.title,
    state: f.done ? 'done' : i === current ? 'current' : 'locked',
    onPress: f.onPress,
  }))
}

/** "1/4 done", read as "1 of 4 done". */
function Progress({ done, of }: { done: number; of: number }) {
  return (
    <View accessible accessibilityLabel={`${done} of ${of} done`}>
      <Chip tone="ground">{`${done}/${of} done`}</Chip>
    </View>
  )
}

/** The engine's pick, flagged on exactly one target across both lists. */
function recommendation(challenges: ChallengeView): TargetSpend | null {
  return (
    [...challenges.targets.merchants, ...challenges.targets.categories].find(
      (t) => t.recommended,
    ) ?? null
  )
}

/** The length the generator will pick, so the card promises the challenge it is about to build. */
function recommendedDays(challenges: ChallengeView): number {
  return challenges.lengths.find((l) => l.recommended)?.days ?? challenges.lengths[0]?.days ?? 14
}

/**
 * The spend category behind a challenge target, for its plate.
 *
 * A category target is its own. A merchant target is often not a brand but the engine's name
 * for a group of them — "Fast food" is Domino's, KFC and Pizza Hut together — which has no logo
 * and used to draw as a lettered "F" beside plates that carry a glyph. The snapshot's habits
 * already group spending by that same merchant name and say which category it sits in, so the
 * category is read from there rather than guessed from the name. A brand with a logo still
 * shows its logo: `MerchantMark` prefers one when it has it.
 */
function targetCategory(target: TargetSpend, habits: readonly Habit[]): string | undefined {
  const { kind, name } = target.target
  if (kind === 'category') return name
  return habits.find((h) => h.merchant === name)?.category
}

/**
 * Cleo's "Add up to $90 to Savings" card, told the way this app tells it: the habit first,
 * then the number that makes it worth breaking. It opens the generator, which builds exactly
 * this challenge — the same target and the same length — so the card never promises one
 * thing and starts another.
 */
function ChallengeSuggestion({
  target,
  category,
  days,
  windowDays,
}: {
  target: TargetSpend
  /** The category the target sits in, where known; it draws the plate when there is no logo. */
  category: string | undefined
  days: number
  windowDays: number
}) {
  const { kind, name } = target.target
  return (
    <Card className="flex-row items-start gap-md p-lg">
      <MerchantMark
        merchant={kind === 'merchant' ? name : null}
        {...(category === undefined ? {} : { category })}
        size={size.plateLg}
      />
      <View className="flex-1">
        <Type role="heading">
          Spend less on {inSentence(name)} for {days} days
        </Type>
        <Type role="body" tone="mid" className="mt-xs">
          {rupees(target.spent)} went there in the last {windowDays} days.
        </Type>
        <Button
          size="sm"
          variant="secondary"
          label="Start a challenge"
          haptic="none"
          className="mt-md"
          onPress={() => router.push('/challenge-generating')}
        />
      </View>
    </Card>
  )
}

/**
 * What an activity row is called.
 *
 * The five hacks' titles arrive on `cards`, written server-side, so the row reads them from
 * there rather than keeping a second copy of the same five names one screen away from the
 * settings list that shows them. A hand-made deposit has no card, so it says who made it.
 */
function sourceTitle(source: SaveDepositSource, cards: SaveHackCard[]): string {
  if (source === 'manual') return 'Added by you'
  return cards.find((c) => c.id === source)?.title ?? 'Save hack'
}

/** One mark per source, shared with the save-hacks list, so both lists read down the left edge. */
const SOURCE_GLYPH: Record<SaveDepositSource, GlyphName> = { ...HACK_GLYPH, manual: 'plus' }

/**
 * "Monday, 15 Sept" — the day a deposit landed, as Cleo head their activity. Parsed at local
 * midnight, for the reason `SpendBars` gives: a bare ISO date is UTC, and a heading that names
 * the weekday is where being one day out shows.
 */
function dayTitle(iso: string, asOf: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const sameYear = new Date(`${asOf}T00:00:00`).getFullYear() === d.getFullYear()
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/**
 * Binds a short phrase so a line never breaks inside it: "on 1 Sept" wraps as one piece, where
 * the tile used to end a line on "1" and start the next with "Sept".
 */
function keep(phrase: string): string {
  return phrase.replace(/ /g, '\u00A0')
}

/** One of the two interest tiles. Cleo put the figure first and name it underneath. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 rounded-md bg-ground-deep px-lg py-md">
      <Type role="title" plain numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Type>
      <Type role="body" tone="mid" className="mt-xxs">
        {label}
      </Type>
    </View>
  )
}

/** A dotted-leader row, the way Cleo rule the figures under the pot. Cream on green. */
function Leader({ label, value }: { label: string; value: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      className="flex-row items-end gap-sm"
    >
      {/* `shrink` so a long figure at 320pt wraps the label instead of pushing the row wide. */}
      <Type role="body" tone="onInk" className="shrink">
        {label}
      </Type>
      <View className="mb-xs flex-1 border-b border-dotted border-surface/40" />
      <Type role="body" weight="semibold" tone="onInk" plain>
        {value}
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
 * So the pane has two states. Nothing running is the pitch. Something running is the card and
 * then everything Cleo put behind a "View Challenge details" button, inlined: the check-in,
 * the daily chart, the streak and the lines that count against the limit. Cleo need that
 * button because their card and their detail are two screens; ours are one scroll, and a
 * button that scrolls you to what is already under your thumb is furniture.
 *
 * The settings sheet lives here rather than inside the running card, because ending the
 * challenge is what unmounts that card: a sheet drawn inside it would vanish mid-close instead
 * of sliding away over the promo that replaces it.
 */
function Challenges({
  challenges,
  reload,
  refreshView,
}: {
  challenges: ChallengeView
  reload: () => Promise<void>
  refreshView: () => Promise<void>
}) {
  const { active } = challenges
  const [managing, setManaging] = useState(false)
  const [held, setHeld] = useState<ActiveChallenge | null>(active)
  useEffect(() => {
    if (active !== null) setHeld(active)
  }, [active])
  const shown = active ?? held

  return (
    <>
      {active === null ? (
        <ChallengePromo windowDays={challenges.windowDays} target={recommendation(challenges)} />
      ) : (
        <ChallengeRun
          challenge={active}
          asOf={challenges.asOf}
          onManage={() => setManaging(true)}
        />
      )}
      {shown === null ? null : (
        <ChallengeSettings
          challenge={shown}
          open={managing && active !== null}
          onClose={() => setManaging(false)}
          reload={reload}
          refreshView={refreshView}
        />
      )}
    </>
  )
}

function ChallengePromo({
  windowDays,
  target,
}: {
  windowDays: number
  /** The habit the statement points at; its name titles the card when there is one. */
  target: TargetSpend | null
}) {
  return (
    <>
      <View className="rounded-lg bg-streak p-xl">
        <Type role="title" tone="ink">
          {target === null
            ? 'Rescue your spending'
            : `Spend less on ${inSentence(target.target.name)}`}
        </Type>
        <Type role="body" tone="ink" className="mt-xs">
          Pick one habit, set a limit, keep what you don&apos;t spend.
        </Type>

        <View className="mt-lg gap-md">
          <Claim>Built from your own statement</Claim>
          <Claim>Tracked day by day</Claim>
          <Claim>What you don&apos;t spend goes to your goal</Claim>
        </View>

        <ButtonStack className="mt-lg">
          <Button
            label="Start a challenge"
            haptic="none"
            onPress={() => router.push('/challenge-generating')}
          />
          <Button
            variant="secondary"
            label="Choose my own"
            haptic="none"
            onPress={() => router.push('/challenge')}
          />
        </ButtonStack>
      </View>

      {/* Cleo's small print under this card is an interest-rate disclosure. Ours has to say
          the harder thing, which is that starting a challenge moves no money at all: the
          saving is arithmetic against the customer's own recent spending, and a card that
          calls it a prediction while the small print quietly calls it a transfer would have
          those two sentences the wrong way round. */}
      <Type role="caption" tone="mid">
        Starting a challenge moves no money. The saving is your limit against what the last{' '}
        {windowDays} days say you&apos;d normally spend; keeping to it is what puts the difference
        aside.
      </Type>
    </>
  )
}

/** One of the promo's three ticks, in Cleo's ring. */
function Claim({ children }: { children: string }) {
  return (
    <View className="flex-row items-start gap-md">
      <View className="h-radio w-radio items-center justify-center rounded-pill border border-ink">
        <Glyph name="check" size={13} tint={color.ink} />
      </View>
      <Type role="body" tone="ink" className="flex-1">
        {children}
      </Type>
    </View>
  )
}

function ChallengeRun({
  challenge,
  asOf,
  onManage,
}: {
  challenge: ActiveChallenge
  asOf: string
  onManage: () => void
}) {
  const { limit, spent, days, dayIndex, remaining, overspent, daily, tip, complete } = challenge
  const over = Math.max(0, spent - limit)
  // `won === true`, never a truthiness test. Null is "still running", and a screen that folds
  // null into false commiserates with somebody whose result does not exist yet.
  const kept = challenge.won === true
  const [open, setOpen] = useState<Transaction | null>(null)

  return (
    <>
      <View className="rounded-lg bg-streak p-xl">
        <View className="flex-row items-start justify-between gap-md">
          <Type role="heading" tone="ink" className="flex-1">
            {challengeTitle(challenge.target.name)}
          </Type>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Challenge settings"
            haptic="none"
            onPress={onManage}
            scale={0.9}
            className="-mr-sm -mt-sm h-target w-target items-center justify-center rounded-pill bg-ink/10"
          >
            <Glyph name="sliders" size={20} tint={color.ink} />
          </Tap>
        </View>

        <View
          accessible
          accessibilityLabel={`${rupees(spent)} spent of your ${rupees(limit)} limit`}
          className="mt-sm"
        >
          <Count
            value={spent}
            format={rupees}
            role="display"
            tone="ink"
            id="grow.challenge"
            delay={dur.enter}
          />
          <Type role="body" tone="ink" className="mt-xs">
            spent of your{' '}
            <Type weight="semibold" tone="ink">
              {rupees(limit)}
            </Type>{' '}
            limit
          </Type>
        </View>

        {/* Red text is never set on gold (3.5:1), so "over" is said in ink and flagged by the
            chip beside it — the chip carries the colour, the words carry the amount. */}
        {complete ? (
          <View className="mt-lg flex-row flex-wrap items-center gap-sm">
            <Type role="heading" tone="ink" className="shrink">
              {kept
                ? `Kept it — ${rupees(challenge.predictedSaving)} aside`
                : `Finished ${rupees(over)} over`}
            </Type>
            <Chip tone={kept ? 'success' : 'danger'}>{kept ? 'Kept' : 'Over'}</Chip>
          </View>
        ) : (
          <View className="mt-lg flex-row flex-wrap items-center gap-sm">
            <Type role="body" weight="semibold" tone="ink">
              {overspent ? `${rupees(over)} over` : `${rupees(remaining)} left`}
            </Type>
            {overspent ? <Chip tone="danger">Over the limit</Chip> : null}
          </View>
        )}
        <View className="mt-sm">
          <Meter
            size="thick"
            fraction={limit > 0 ? spent / limit : 0}
            tone={overspent ? 'bg-danger' : 'bg-ink'}
            track="bg-surface"
            label="Spent against the limit"
            delay={dur.enter}
          />
        </View>

        {/* A lighter wash of the same gold rather than a white well, which is how Cleo draw
            it and the right call: white on gold reads as a second card sitting on the first,
            and the grid is part of this card's argument rather than a thing beside it. */}
        <View className="mt-lg rounded-md bg-surface/35 p-md">
          <Type role="label" weight="semibold" tone="ink">
            Day {dayIndex} of {days}
          </Type>
          <View className="mt-md">
            <DayGrid days={daily} limitPerDay={limit / days} />
          </View>
        </View>

        {/* A finished challenge used to end the pane: a result and nothing to do about it.
            The habit this feature exists to build is the next one. */}
        {complete ? (
          <ButtonStack className="mt-lg">
            <Button
              label="Start another challenge"
              haptic="none"
              onPress={() => router.push('/challenge-generating')}
            />
            <Button
              variant="secondary"
              label="Choose my own"
              haptic="none"
              onPress={() => router.push('/challenge')}
            />
          </ButtonStack>
        ) : null}
      </View>

      <Section title="Challenge tips" />
      <Note mark="plate" glyph={TIP_GLYPH[tip.tone]} fill={TIP_FILL[tip.tone]} title={tip.headline}>
        {tip.detail}
      </Note>

      <Section title="Daily spending" />
      <Card>
        <View className="px-lg pt-lg">
          <SpendBars days={daily} format={rupeesShort} />
        </View>
        {/* The flame is the only mark in the chart that is not a bar, so it gets named. The
            count beside it is the run so far rather than a legend's decoration: a key that
            also answers "how many" earns the row it costs. */}
        <Row
          glyph="flame"
          plate="bg-streak"
          label="₹0 spend days"
          value={String(challenge.zeroDays)}
        />
      </Card>

      <Card>
        <Row
          glyph="flame"
          plate="bg-streak"
          label="Longest ₹0 spend streak"
          value={
            challenge.longestZeroStreak === 1 ? '1 day' : `${challenge.longestZeroStreak} days`
          }
        />
      </Card>

      <Section title="Challenge transactions" />
      <Card>
        {challenge.transactions.length === 0 ? (
          <View className="px-lg py-lg">
            <Type role="body" tone="mid">
              Nothing has counted against this limit yet.
            </Type>
          </View>
        ) : (
          challenge.transactions.map((t, i) => (
            <Reveal key={t.txnId} i={i} delay={dur.state}>
              <TransactionRow txn={t} asOf={asOf} divide={i > 0} onPress={() => setOpen(t)} />
            </Reveal>
          ))
        )}
      </Card>
      <TransactionSheet txn={open} asOf={asOf} onClose={() => setOpen(null)} />
    </>
  )
}

/**
 * The gear's sheet: the three numbers the challenge was set on, Uday, and the way out.
 *
 * Ending a running challenge asks once more before it goes, because it cannot be taken back —
 * the limit, the streak and the day count are gone with it — and it sits one row under a
 * button that only asks a question. A finished challenge has nothing left to lose, so clearing
 * it happens on the first tap. A 404 means it had already gone (ended on another device, or
 * this screen was stale): the pane is simply re-read and shows what is there now.
 */
function ChallengeSettings({
  challenge,
  open,
  onClose,
  reload,
  refreshView,
}: {
  challenge: ActiveChallenge
  open: boolean
  onClose: () => void
  reload: () => Promise<void>
  refreshView: () => Promise<void>
}) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const finished = challenge.complete

  const close = () => {
    setConfirming(false)
    setFailed(false)
    onClose()
  }

  const end = async () => {
    setBusy(true)
    setFailed(false)
    let gone = false
    try {
      await api.endChallenge(challenge.id)
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) {
        setBusy(false)
        setFailed(true)
        return
      }
      gone = true
    }
    setBusy(false)
    close()
    // Shown after the sheet is told to close: on iOS a toast sits under a native modal.
    if (!gone) toast.show(finished ? 'Challenge cleared' : 'Challenge ended')
    await reload()
    void refreshView()
  }

  return (
    <Sheet open={open} onClose={close} title={challengeTitle(challenge.target.name)}>
      <Card>
        <Fact label="Limit" value={rupees(challenge.limit)} />
        <Fact label="Spent" value={rupees(challenge.spent)} divide />
        <Fact label="Day" value={`${challenge.dayIndex} of ${challenge.days}`} divide />
      </Card>

      {confirming ? (
        <View className="mt-lg">
          <Type role="heading">End it now?</Type>
          <Type role="body" tone="mid" className="mt-xs">
            The limit stops counting today. Nothing you&apos;ve spent changes.
          </Type>
          <ButtonStack className="mt-lg">
            <Button label="End the challenge" loading={busy} onPress={() => void end()} />
            <Button
              variant="secondary"
              label="Keep going"
              haptic="none"
              disabled={busy}
              onPress={() => setConfirming(false)}
            />
          </ButtonStack>
        </View>
      ) : (
        <MenuGroup className="mt-md">
          <MenuRow
            glyph="minus"
            tone="danger"
            label={finished ? 'Clear this challenge' : 'End this challenge'}
            disabled={busy}
            onPress={() => (finished ? void end() : setConfirming(true))}
          />
        </MenuGroup>
      )}

      {failed ? (
        <View className="mt-md">
          <RetryLine
            compact
            message={finished ? "Couldn't clear it. Try again." : "Couldn't end it. Try again."}
            onRetry={() => void end()}
            busy={busy}
          />
        </View>
      ) : null}
    </Sheet>
  )
}

/** A label and its figure in a sheet's table, read as one line. */
function Fact({
  label,
  value,
  divide = false,
  tone,
}: {
  label: string
  value: string
  divide?: boolean
  tone?: RowTone
}) {
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`}>
      <Row label={label} value={value} divide={divide} {...(tone === undefined ? {} : { tone })} />
    </View>
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

/**
 * The plate behind that mark, on Cleo's pastel plates. Amber for a run being kept, as the
 * flame has it; the danger wash for a challenge falling behind, as the day grid marks a day
 * over; never lime, which in this app means done, and a challenge in progress is not.
 */
const TIP_FILL: Record<ActiveChallenge['tip']['tone'], string> = {
  early: 'bg-budget/50',
  ahead: 'bg-streak/35',
  behind: 'bg-danger-soft',
}

function NetWorth({ view, go }: { view: ViewModel; go: Go }) {
  // `balances`, `holdings` and `debt` are still read directly below for the per-line
  // figures; what net worth *means* is the engine's, not this render function's.
  const { balances, holdings, debt } = view.snapshot
  const { assets, net, allocation } = netWorth(view.snapshot)
  const { cash, equity, fixed } = allocation

  return (
    <>
      {/* On the ground rather than on a card: the four lines under it are the card, and a
          figure boxed on its own above them would be a hero announcing its own sum. */}
      <View>
        <Count
          value={net}
          format={rupees}
          role="display"
          plain
          id="grow.networth"
          delay={dur.enter}
        />
        <Type role="body" tone="mid" className="mt-xs">
          {debt.total > 0
            ? `${rupees(assets)} owned, less ${rupees(debt.total)} owed.`
            : `${rupees(assets)} owned, nothing owed.`}
        </Type>
      </View>

      {/* Each line leads to where that number lives. Deposits have no screen of their own —
          a fixed deposit is an account the statement already lists — so that one asks Uday what
          the savings and deposits should do, which he answers from the balances. */}
      <Card>
        <Row
          label="Savings"
          value={rupees(balances.savings)}
          onPress={() => router.push('/statement')}
        />
        <Row
          label="Deposits"
          value={rupees(balances.deposits)}
          divide
          onPress={() => askUday(depositsQuestion(balances.deposits))}
        />
        <Row
          label="Investments"
          value={rupees(holdings.total)}
          divide
          onPress={() => go('holdings', 1)}
        />
        <Row
          label="Borrowing"
          value={debt.total > 0 ? signedRupees(-debt.total) : rupees(0)}
          divide
          tone={debt.total > 0 ? 'danger' : 'ink'}
          onPress={() => router.navigate({ pathname: '/(tabs)/spend', params: { pane: 'debt' } })}
        />
      </Card>

      <Section title="How it's split" />
      <Card>
        <Allocation
          glyph="coins"
          label="Cash and deposits"
          amount={cash}
          total={assets}
          tone="bg-brand"
        />
        <Allocation
          glyph="grow"
          label="Equity"
          amount={equity}
          total={assets}
          tone="bg-streak"
          divide
        />
        <Allocation
          glyph="lock"
          label="Fixed income and other"
          amount={fixed}
          total={assets}
          tone="bg-budget"
          divide
        />
      </Card>
      {/* Whether this split suits the customer is the gate's question, asked product by product
          against their risk profile and horizon; Uday has no rule that judges a split. So the
          button opens the shelf where each product is checked. */}
      <Button
        variant="secondary"
        label="See what suits you"
        haptic="none"
        accessibilityHint="Opens Invest, where each product is checked against your file"
        onPress={() => go('invest', 1)}
      />

      {/* Idle cash is the finding this tab exists to surface. It is not a scolding: it is a
          number with a consequence. The button acts on it; the link asks Uday what to do. */}
      {balances.idleMonths >= 6 && (
        <View className="rounded-lg bg-streak p-xl">
          <Type role="heading" tone="ink">
            {rupees(balances.idleFloor)} hasn&apos;t moved in {balances.idleMonths} months
          </Type>
          <Type role="body" tone="ink" className="mt-xs">
            Your balance never dips below it. At savings rates it loses to inflation every year.
          </Type>
          <Button
            size="sm"
            variant="secondary"
            label="See what it could do"
            haptic="none"
            className="mt-md"
            onPress={() => go('invest', 1)}
          />
          {/* Ink, not the link's mid tone: mid on the streak fill is under 4.5:1. */}
          <AskUday question={idleCashQuestion(balances.idleFloor)} tone="ink" className="mt-xs" />
        </View>
      )}
    </>
  )
}

/** A mark per asset class. Deliberately not a fund-house logo: the class is the true thing to draw. */
const HOLDING_GLYPH: Record<HoldingRecordResponse['assetClass'], GlyphName> = {
  Equity: 'grow',
  Debt: 'lock',
  Hybrid: 'gauge',
  Gold: 'coins',
  Protection: 'shield',
}

/** What each kind of holding is called to a customer. */
const HOLDING_TYPE: Record<HoldingRecordResponse['holdingType'], string> = {
  MUTUAL_FUND: 'Mutual fund',
  EQUITY: 'Shares',
  FD: 'Fixed deposit',
  RD: 'Recurring deposit',
  INSURANCE: 'Insurance',
  NPS: 'NPS',
  PPF: 'PPF',
  EPF: 'EPF',
}

/**
 * "+₹4,12,350" / "−₹3,200": a paper gain in rupees with its sign, never a rate of return. A
 * word joiner holds the sign to the figure; without it a wrapping line could end on a lone "+".
 */
function signedRupees(n: number): string {
  return `${n >= 0 ? '+' : '−'}\u2060${rupees(Math.abs(n))}`
}

const UNITS = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 })

/** The width under which a holding row puts its figures under the name, as SpendBars narrows. */
const NARROW = 360

function Holdings({
  holdings,
  sipMonthly,
  scopeOverrides,
  source,
  asOf,
  go,
}: {
  holdings: HoldingRecordResponse[]
  sipMonthly: number
  /** The blocks of the file the customer has switched off. */
  scopeOverrides: readonly ConsentScope[]
  /** How the holdings block reached us, in the customer's words: "You told us", "Demo data". */
  source: string
  asOf: string
  go: Go
}) {
  const [picked, setPicked] = useState<HoldingRecordResponse | null>(null)

  // An empty portfolio and a withdrawn one arrive here identically — `consent-scope.ts` blanks
  // the holdings block rather than erroring — and they mean opposite things. "Nothing held yet"
  // over a portfolio the customer switched off themselves is the app lying about its own state.
  const withdrawn = scopeOverrides.includes('HOLDINGS')
  if (withdrawn) {
    return <SourceStrip sources={[]} withdrawn onPress={() => router.push('/connections')} />
  }
  if (holdings.length === 0) {
    return (
      <>
        <EmptyState
          glyph="grow"
          title="Nothing held yet"
          body="Anything you buy through IDBI, or list on your consolidated statement, shows here."
        />
        {/* The two ways out drawn here, centred, rather than through EmptyState's own action:
            a small button aligns itself to the start, which in a centred column is off to one
            side of the sentence it answers. */}
        <Centred>
          <Button
            size="sm"
            variant="secondary"
            label="Where this comes from"
            haptic="none"
            onPress={() => router.push('/connections')}
          />
        </Centred>
        <Centred>
          <Button
            size="sm"
            variant="secondary"
            label="See what IDBI sells"
            haptic="none"
            onPress={() => go('invest', 1)}
          />
        </Centred>
      </>
    )
  }
  const { invested, value, gain } = holdingsTotals(holdings)
  const sources = sourcesOf(holdings)

  return (
    <>
      <View className="rounded-lg bg-budget p-xl">
        {/* Stated as rupees and as a share of what went in, never as a return: a notional
            gain annualised into a percentage is a performance claim, and this is not one. */}
        <View
          accessible
          accessibilityLabel={`${rupees(value)} worth today. ${rupees(invested)} put in, ${signedRupees(gain)} on paper.`}
        >
          <Count
            value={value}
            format={rupees}
            role="display"
            tone="ink"
            id="grow.holdings"
            delay={dur.enter}
          />
          <Type role="body" tone="ink" className="mt-xs">
            worth today · {rupees(invested)} put in · {signedRupees(gain)} on paper
          </Type>
        </View>
        {sipMonthly > 0 && (
          <Type role="body" tone="ink" className="mt-sm">
            {rupees(sipMonthly)} a month going in
          </Type>
        )}
      </View>

      {/* Between the total and the list, because it frames the list: these rows are not all
          IDBI's, and the customer is entitled to know whose they are before reading them. */}
      <SourceStrip
        sources={sources}
        withdrawn={false}
        onPress={() => router.push('/connections')}
      />

      <Card>
        {holdings.map((h, i) => {
          const row = <HoldingRow holding={h} divide={i > 0} onPress={() => setPicked(h)} />
          // The entrance is for the first screenful. Sixteen rows staggering in one after
          // another is a queue the customer waits at, not a reveal.
          return i < 5 ? (
            <Reveal key={h.holdingId} i={i} delay={dur.state}>
              {row}
            </Reveal>
          ) : (
            <View key={h.holdingId}>{row}</View>
          )
        })}
      </Card>

      <Type role="caption" tone="mid">
        Gains are on paper, before tax and exit charges. Holdings elsewhere come from your
        consolidated statement, not IDBI.
      </Type>

      <HoldingSheet holding={picked} source={source} asOf={asOf} onClose={() => setPicked(null)} />
    </>
  )
}

function HoldingRow({
  holding: h,
  divide,
  onPress,
}: {
  holding: HoldingRecordResponse
  divide: boolean
  onPress: () => void
}) {
  const gain = h.currentValue - h.investedAmount
  const place = custodianOf(h)
  const narrow = useWindowDimensions().width < NARROW
  // The custodian, not "Held elsewhere": the contract calls `custodian` the honest form of
  // that boolean, and a customer who can read the name can go and check the figure against
  // it. Our own book says nothing — every other row would carry the same word, which is
  // noise, not provenance — and neither does a place the statement never named, whose
  // "Place not recorded" belongs in the sheet's table, not on every third row of the list.
  const meta = [
    h.assetClass,
    h.sipActive && h.sipAmount !== undefined ? `SIP ${rupees(h.sipAmount)}` : null,
    place === HOME_CUSTODIAN || place === UNNAMED_CUSTODIAN ? null : place,
  ]
    .filter(Boolean)
    .join(' · ')

  const figures = (
    <>
      <Type role="body" weight="semibold" plain>
        {rupees(h.currentValue)}
      </Type>
      <Type role="label" tone={gain >= 0 ? 'brand' : 'danger'}>
        {signedRupees(gain)}
      </Type>
    </>
  )

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${h.name}, ${rupees(h.currentValue)}, ${signedRupees(gain)} on paper`}
      accessibilityHint="Shows what is behind this figure"
      haptic="none"
      scale={0.98}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-md px-lg py-lg',
        divide && 'border-t border-hairline',
      )}
    >
      <GlyphPlate name={HOLDING_GLYPH[h.assetClass]} size={size.plateLg} />
      <View className="flex-1">
        {/* Never cut short: "NPS Tier-I, Northwind corporate scheme" is a real name and its
            tail is the part that says which scheme it is. */}
        <Type role="body" weight="semibold">
          {h.name}
        </Type>
        <Type role="label" tone="mid" className="mt-xxs">
          {meta}
        </Type>
        {/* At 320pt a column of figures beside the name left the name a third of the row, and
            the longest names ran out of lines. There the figures read on under the name. */}
        {narrow ? (
          <View className="mt-xs flex-row flex-wrap items-baseline gap-x-sm">{figures}</View>
        ) : null}
      </View>
      {/* The row opens the record behind it and says so the way every row that opens does,
          with the chevron tight to the figures. */}
      <View className="flex-row items-center gap-xs">
        {narrow ? null : <View className="items-end">{figures}</View>}
        <Glyph name="chevronRight" size={20} tint={color.ink} />
      </View>
    </Tap>
  )
}

/**
 * The record behind one holding's figure.
 *
 * Every line is what the record says, in rupees; the gain is rupees with a sign and never a
 * percentage, for the reason the hero gives. The last holding stays drawn while the sheet
 * slides away, so the table does not blank a frame before it goes.
 *
 * No "Ask Uday" here. "Should I keep this fund?" is a question none of his rules answers — it
 * came back "I am not sure what you are asking" for every fund — and the table is what the sheet
 * is for. A holding from another custodian keeps the way to where it came from.
 */
function HoldingSheet({
  holding,
  source,
  asOf,
  onClose,
}: {
  holding: HoldingRecordResponse | null
  source: string
  asOf: string
  onClose: () => void
}) {
  const [held, setHeld] = useState<HoldingRecordResponse | null>(holding)
  useEffect(() => {
    if (holding !== null) setHeld(holding)
  }, [holding])
  const h = holding ?? held

  return (
    <Sheet
      open={holding !== null}
      onClose={onClose}
      title={h?.name ?? ''}
      {...(h === null || custodianOf(h) === HOME_CUSTODIAN
        ? {}
        : {
            footer: (
              <Button
                variant="secondary"
                label="Where this comes from"
                haptic="none"
                onPress={() => {
                  onClose()
                  router.push('/connections')
                }}
              />
            ),
          })}
    >
      {h === null ? null : (
        <Card>
          {holdingFacts(h, source, asOf).map((f, i) => (
            <Fact
              key={f.label}
              label={f.label}
              value={f.value}
              divide={i > 0}
              {...(f.tone === undefined ? {} : { tone: f.tone })}
            />
          ))}
        </Card>
      )}
    </Sheet>
  )
}

function holdingFacts(
  h: HoldingRecordResponse,
  source: string,
  asOf: string,
): Array<{ label: string; value: string; tone?: RowTone }> {
  const gain = h.currentValue - h.investedAmount
  return [
    ...(h.units === undefined ? [] : [{ label: 'Units', value: UNITS.format(h.units) }]),
    { label: 'Invested', value: rupees(h.investedAmount) },
    { label: 'Value today', value: rupees(h.currentValue) },
    { label: 'Paper gain', value: signedRupees(gain), tone: gain >= 0 ? 'brand' : 'danger' },
    ...(h.sipActive && h.sipAmount !== undefined
      ? [
          {
            label: 'SIP',
            value:
              h.sipDebitDay === undefined
                ? `${rupees(h.sipAmount)} a month`
                : `${rupees(h.sipAmount)} on the ${ordinal(h.sipDebitDay)}`,
          },
        ]
      : []),
    ...(h.purchasedOn === undefined
      ? []
      : [{ label: 'Held since', value: shortDate(h.purchasedOn, asOf) }]),
    ...(h.maturityDate === undefined
      ? []
      : [{ label: 'Matures', value: shortDate(h.maturityDate, asOf) }]),
    { label: 'Type', value: HOLDING_TYPE[h.holdingType] },
    { label: 'Held by', value: custodianOf(h) },
    { label: 'Source', value: source },
  ]
}

/** A small button centred on its own line; see the empty holdings for why it needs a row. */
function Centred({ children }: { children: ReactNode }) {
  return <View className="flex-row justify-center">{children}</View>
}

/** The shelf's groups, in the order a customer should meet them: the bank's own book first. */
const ORDER: readonly ShelfGroup[] = ['idbi_own', 'market_linked', 'protection']

/**
 * The copy for each group the domain names. The partition is the engine's; the words are not.
 *
 * `market_linked` is the engine's remainder — neither IDBI's own nor pure cover — and it holds
 * the Public Provident Fund, which pays a fixed government rate, and a traditional endowment
 * beside the funds. "Market-linked" over those two was a false claim about what they are; whose
 * they are is true of every row in the group, and it is what "IDBI's own" above it contrasts.
 */
const GROUP_TITLE: Record<ShelfGroup, string> = {
  idbi_own: "IDBI's own",
  market_linked: 'From other providers',
  protection: 'Protection',
}

function Invest({
  shelf,
  owes,
  onPick,
  onRetry,
}: {
  shelf: ShelfProduct[]
  /**
   * Whether anything is owed. "Which of these suits me?" is the gate's question, product by
   * product, and Uday has no rule for it; what he can answer is the one before it — invest, or
   * clear the debt first — and only while there is debt to weigh.
   */
  owes: boolean
  onPick: (p: ShelfProduct) => void
  /** Re-reads the view, which is what carries the shelf. */
  onRetry: () => Promise<void>
}) {
  if (shelf.length === 0) {
    return (
      <>
        <EmptyState
          glyph="grow"
          title="Nothing on the shelf yet"
          body="The shelf loads with your file."
        />
        <Centred>
          <Button
            size="sm"
            variant="secondary"
            label="Try again"
            haptic="none"
            onPress={() => void onRetry()}
          />
        </Centred>
      </>
    )
  }

  // `category.includes('Insurance')` filed "LIC Jeevan Anand Endowment" as market-linked
  // while the Protect tab's name regex called the same product cover. One rule, in the
  // engine, is what stops the two tabs disagreeing about a product again. The order is fixed
  // here rather than taken from whichever group the first product happened to fall in, so
  // the groups read the same way round for every customer.
  return (
    <>
      <View>
        <Type role="body" tone="mid">
          Everything IDBI can sell you. Tap one and I&apos;ll say whether it suits you — including
          when it doesn&apos;t.
        </Type>
        {owes ? (
          <AskUday
            question={INVEST_OR_CLEAR}
            label="Ask Uday if I should invest"
            className="mt-sm"
          />
        ) : null}
      </View>

      {ORDER.map((group) => {
        const items = shelf.filter((p) => shelfGroup(p) === group)
        if (items.length === 0) return null
        return (
          <View key={group} className="gap-md">
            <Section title={GROUP_TITLE[group]} />
            <Card>
              {items.map((p, i) => (
                <ProductRow
                  key={p.productId}
                  product={p}
                  onPress={() => onPick(p)}
                  divide={i > 0}
                />
              ))}
            </Card>
          </View>
        )
      })}
    </>
  )
}

function Allocation({
  glyph,
  label,
  amount,
  total,
  tone,
  divide = false,
}: {
  glyph: GlyphName
  label: string
  amount: number
  total: number
  tone: string
  divide?: boolean
}) {
  const share = total > 0 ? amount / total : 0
  const pct = Math.round(share * 100)
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${rupees(amount)}, ${pct} percent`}
      className={cn(
        'flex-row items-center gap-md px-lg py-md',
        divide && 'border-t border-hairline',
      )}
    >
      <GlyphPlate name={glyph} size={size.plateMd} />
      <View className="flex-1">
        <View className="flex-row items-baseline justify-between gap-md">
          <Type role="body" tone="mid" className="flex-1">
            {label}
          </Type>
          <Type role="body" weight="semibold" plain>
            {pct}%
          </Type>
        </View>
        <Type role="label" tone="mid">
          {rupees(amount)}
        </Type>
        <View className="mt-sm">
          <Meter fraction={share} tone={tone} track="bg-ground-deep" delay={dur.state} />
        </View>
      </View>
    </View>
  )
}

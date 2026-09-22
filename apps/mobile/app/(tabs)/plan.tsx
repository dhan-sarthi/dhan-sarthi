// Plan — the route to the destination, and the arithmetic under it.
//
// Cleo has no screen with this job, so it is built from the shapes Cleo uses for the nearest
// ones: the Save tab's goal card for the destination (the figure, a meter, two ruled lines, one
// button), the Budget tab's "Next steps" checklist for the stages, and the money-health score's
// glow for the one figure the numbers pane exists to show. Borrowed rather than invented, so a
// stage reads as a step you take and a month count reads as a result about you.
//
// Two panes. The route is the sequence and the reasoning; the numbers are the arithmetic.
// Keeping them apart matters for a regulated product — a customer reading "what should I do"
// should not have a growth curve in their eye, and a customer reading a growth curve must see
// the rate and the assumption attached to it.
//
// Both panes are reached from elsewhere at a particular place, because the screens that send
// people here point at a stage, not at a tab: the Debt pane at the payoff, a notice at the
// buffer, the goal editor at the goal. `?pane=` picks the pane; `?stage=<kind>` opens that stage
// on the route and brings it to the top. `?pane=projection&stage=clear_debt` is the one pairing
// that means something else — the payoff arithmetic, which Credit and Protect ask for even when
// the goal also has a projection. Both are one-shot: read, acted on, cleared, and a pill tap
// always wins over them.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { View, useWindowDimensions, type LayoutChangeEvent, type ScrollView } from 'react-native'
import { router, useLocalSearchParams, useNavigation } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { TabHeader } from '~/ui/TabHeader'
import { Pills, usePane } from '~/ui/Pills'
import { Pane, Reveal } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Count } from '~/ui/Count'
import { Card } from '~/ui/Card'
import { Row } from '~/ui/Row'
import { Section } from '~/ui/Section'
import { EmptyState, SnapshotScroll } from '~/ui/SnapshotScroll'
import { Chip } from '~/ui/Chip'
import { Meter } from '~/ui/Meter'
import { Glyph, GlyphPlate } from '~/ui/Glyph'
import { Tap } from '~/ui/Tap'
import { Button, ButtonStack } from '~/ui/Button'
import { StepPlate, type ChecklistState } from '~/ui/Checklist'
import { ScoreGlow } from '~/ui/ScoreGlow'
import { Sheet } from '~/ui/Sheet'
import { SettingRow } from '~/ui/SettingRow'
import { MenuLink } from '~/ui/MenuRow'
import { AskUday } from '~/ui/AskUday'
import { RulesChip } from '~/ui/RulesChip'
import { RULE_ORDER, ruleIndex, ruleName, shortName } from '~/ui/GateSheet'
import { dur, flat, layoutMove, timing, useReducedMotion } from '~/ui/motion'
import { cn } from '~/ui/cn'
import { useSnapshot } from '~/state/snapshot'
import { finishOf, goalHorizon, haveOf, useSaveView } from '~/state/save'
import { duration } from '~/lib/duration'
import { rupees, rupeesShort, shortDate } from '~/lib/money'
import {
  EMERGENCY_SAVINGS,
  FIRST_THING,
  askFacts,
  debtPayoffQuestion,
  questionForStage,
  whereFromQuestion,
  wontClearQuestion,
} from '~/lib/ask'
import { color, size, space } from '@dhan/design'
import {
  contributionSplit,
  elapsedMonths,
  fundingRatePct,
  monthlyInterest,
  paymentToClear,
  payoffSummary,
} from '@dhan/core'
import type { Payoff } from '@dhan/core'
import type {
  Projection,
  Roadmap,
  SavePot,
  ShelfProduct,
  Stage,
  View as ViewModel,
} from '@dhan/contracts'

// Not exported by the contract: `ScenarioSchema` has no accompanying `export type`, so the
// name for one row of a projection is derived here rather than added over there.
type Scenario = Projection['scenarios'][number]
type StageKind = Stage['kind']
type StageState = 'done' | 'current' | 'later'

type Pane = 'roadmap' | 'projection'

const PANES = [
  { value: 'roadmap' as const, label: 'Route' },
  { value: 'projection' as const, label: 'Numbers' },
]

/**
 * A stage another screen asked to be shown. `seq` counts the asks, so the same stage asked for
 * twice — the Debt pane's link tapped, the customer scrolls away, taps it again — lands twice.
 */
type Focus = { kind: StageKind; seq: number }

/**
 * Every stage kind the wire carries, as a total record rather than a list: a kind added to the
 * contract fails to compile here instead of arriving as a link this screen silently ignores.
 * Held locally because the app takes only types from `@dhan/contracts` — Metro resolves that
 * package to its built output, and a runtime import would bundle whatever build is lying there.
 */
const STAGE_KINDS: Record<StageKind, true> = {
  free_up: true,
  get_cover: true,
  clear_debt: true,
  build_buffer: true,
  grow: true,
}

function isStageKind(value: string | undefined): value is StageKind {
  return value !== undefined && Object.prototype.hasOwnProperty.call(STAGE_KINDS, value)
}

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined
}

/** The step plates speak the checklist's words; a stage that has not started is locked there. */
const PLATE: Record<StageState, ChecklistState> = {
  done: 'done',
  current: 'current',
  later: 'locked',
}

/** How big the payoff and corpus glows get: one figure's worth of light, not a backdrop. */
const GLOW = 208

/** Every "Ask Uday" on this screen: one tab bar, the question asked once, the param cleared. */
function askUday(ask: string) {
  router.navigate({ pathname: '/(tabs)/uday', params: { ask } })
}

/** `duration` says "This month" for one, which reads wrongly after "to go" or "at this rate". */
function span(months: number): string {
  return months === 1 ? '1 month' : duration(months)
}

export default function Plan() {
  const { pane, dir, set } = usePane<Pane>('roadmap', PANES)
  const scroller = useRef<ScrollView>(null)
  // The pot is read beside the view, for the one figure the view does not carry: how much of
  // the goal is already set aside. A moved clock re-reads it with everything else.
  const { data: snapshot } = useSnapshot()
  const save = useSaveView(snapshot)

  const params = useLocalSearchParams()
  const navigation = useNavigation<{
    setParams: (params: Record<string, string | undefined>) => void
  }>()
  const askedStage = first(params.stage)
  const askedPane = first(params.pane)
  const [focus, setFocus] = useState<Focus | null>(null)
  const asks = useRef(0)
  // The rate picked on the numbers, held here rather than in the pane: the pane is keyed on the
  // pill and remounts on every switch, and a choice that quietly resets behind the customer's
  // back — Numbers, Route, Numbers, and 12% is 10% again — reads as the app not listening.
  const [rate, setRate] = useState<number | null>(null)

  useEffect(() => {
    if (askedStage === undefined) return
    if (isStageKind(askedStage)) {
      asks.current += 1
      setFocus({ kind: askedStage, seq: asks.current })
    }
    // A stage on its own means the route. With a pane beside it, `usePane` has taken that one
    // already, so only the stage is cleared; without, the route is asked for through the same
    // param, which is how `usePane` adopts a pane after the first render.
    navigation.setParams(
      askedPane === undefined && isStageKind(askedStage)
        ? { pane: 'roadmap', stage: undefined }
        : { stage: undefined },
    )
  }, [askedStage, askedPane, navigation])

  // A pane starts at the top, whichever way it was reached — a pill, or a link from another tab
  // while this one was scrolled halfway down the route. A stage asked for scrolls again after.
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false })
  }, [pane])

  const goTo = (kind: StageKind | null) => {
    if (kind === null) setFocus(null)
    else {
      asks.current += 1
      setFocus({ kind, seq: asks.current })
    }
    set('roadmap', -1)
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <TabHeader title="Plan" />
      <Pills
        options={PANES}
        value={pane}
        onChange={(next, d) => {
          // The customer chose; whatever a link asked for is done with.
          setFocus(null)
          set(next, d)
        }}
      />

      <SnapshotScroll ref={scroller} loading="Working out the route…" alsoRefresh={save.reload}>
        {(view) => (
          <Pane key={pane} dir={dir} className="gap-md">
            {pane === 'roadmap' ? (
              <RoadmapPane
                view={view}
                pot={save.data?.pot ?? null}
                focus={focus}
                scroller={scroller}
                onStage={goTo}
              />
            ) : (
              <NumbersPane
                view={view}
                focus={focus?.kind ?? null}
                onRoute={goTo}
                rate={rate}
                onRate={setRate}
              />
            )}
          </Pane>
        )}
      </SnapshotScroll>
    </SafeAreaView>
  )
}

/* ── The route ─────────────────────────────────────────────────────────────────────────── */

function keyOf(stage: Stage): string {
  return `${stage.index}-${stage.kind}`
}

/**
 * The stage that is the goal: the last one flagged. A debt goal flags the stage that frees the
 * money for it as well as the payoff itself, and the payoff is the one the goal is about.
 */
function goalStageOf(stages: readonly Stage[]): Stage | undefined {
  return [...stages].reverse().find((s) => s.isGoal)
}

function RoadmapPane({
  view,
  pot,
  focus,
  scroller,
  onStage,
}: {
  view: ViewModel
  pot: SavePot | null
  focus: Focus | null
  scroller: RefObject<ScrollView | null>
  onStage: (kind: StageKind) => void
}) {
  const { roadmap, snapshot } = view
  const asOf = snapshot.asOf
  const reduced = useReducedMotion()
  // The missed instalment is pinned above the route rather than numbered in it (see `Arrears`),
  // so the count, the plates and a stage asked for by a link all read the route without it.
  const arrears = roadmap.stages.find((s) => isArrears(s, snapshot))
  const stages =
    arrears === undefined ? roadmap.stages : roadmap.stages.filter((s) => s !== arrears)

  // Where the route is, asked of the clock rather than read off `currentStageIndex`: that index
  // is fixed when the roadmap is cut, and it says 0 once every stage has finished — which would
  // print a finished route as one not yet started. Same rule as core's `currentStage`.
  const at = stages.findIndex((s) => s.monthsToComplete === 0 || s.completesOn > asOf)
  const done = at === -1 ? stages.length : at
  const goal = goalStageOf(stages)
  const current = stages[done]
  const short = shortOf(roadmap, goal, snapshot)
  // A link about the debt means the payoff, the `clear_debt` with a balance. The missed instalment
  // is the other one, and it is pinned above rather than here; a link for a customer with no
  // payoff finds nothing to scroll to, and the pinned card is already at the top.
  const target =
    focus === null
      ? undefined
      : (stages.find((s) => s.kind === focus.kind && s.targetAmount > 0) ??
        stages.find((s) => s.kind === focus.kind))
  const targetKey = target === undefined ? null : keyOf(target)

  /*
   * Which stages are open, held here rather than in each row, so a link that arrives while the
   * route is already on screen can open its stage — a row's own state is only ever its first.
   *
   * The stage the customer is on starts open, because that is the one they came to read. A
   * stage asked for is added, never swapped in: closing the current one would move the asked-for
   * row up under the scroll that is taking the customer to it.
   */
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        [current === undefined ? null : keyOf(current), targetKey].filter(
          (k): k is string => k !== null,
        ),
      ),
  )
  const seq = focus?.seq ?? 0
  useEffect(() => {
    if (targetKey === null) return
    setOpen((prev) => (prev.has(targetKey) ? prev : new Set(prev).add(targetKey)))
  }, [seq, targetKey])

  /*
   * Bringing the asked-for stage to the top. Two measurements, because a row only knows where it
   * sits in the card: the card's place in the pane and the row's place in the card. The pane is
   * the scroll's only child, so it starts below SnapshotScroll's top padding. Whichever
   * measurement lands second makes the move, once per ask — a relayout after it must not drag
   * the customer back up from wherever they have since scrolled.
   */
  const cardTop = useRef<number | null>(null)
  const rowTops = useRef(new Map<string, number>())
  // A screen under a modal reports every view at 0×0 on the web. Taken as a measurement, that
  // sent a stage asked for from the goal editor to 12pt from the top instead of to the stage;
  // the last real offset is still the right one when the screen shows again.
  const hidden = (e: LayoutChangeEvent) => e.nativeEvent.layout.height === 0
  const landed = useRef(0)
  const land = () => {
    if (focus === null || targetKey === null || landed.current === focus.seq) return
    // Not before the stage is open: a stage asked for while the route is already on screen
    // opens a render later, and a scroll made before it has the height it will have is clamped
    // short — the goal editor's link stopped a stage and a half above the one it asked for.
    if (!open.has(targetKey)) return
    const top = cardTop.current
    const y = rowTops.current.get(targetKey)
    if (top === null || y === undefined) return
    landed.current = focus.seq
    scroller.current?.scrollTo({
      y: Math.max(0, space.xl + top + y - space.md),
      animated: !reduced,
    })
  }
  useEffect(land)

  return (
    <>
      <GoalHero roadmap={roadmap} snapshot={snapshot} pot={pot} />

      {/* Feasibility is stated, never softened. A plan that does not reach is still the right
          plan; hiding the gap is what would make it dishonest. */}
      {short > 0 ? (
        <Shortfall
          short={short}
          stages={stages}
          onStage={onStage}
          ask={whereFromQuestion(
            `I'm ${rupees(short)} a month short of my goal.`,
            askFacts(snapshot).biggestSpend,
          )}
        />
      ) : null}

      {arrears === undefined ? null : (
        <>
          <Section title="Before anything else" />
          <Arrears stage={arrears} view={view} />
        </>
      )}

      {stages.length === 0 ? (
        arrears === undefined ? (
          <EmptyState
            glyph="plan"
            title="Nothing to sequence yet"
            body="Set a goal and the stages appear here."
            action={{ label: 'Set a goal', onPress: () => router.push('/edit-goal') }}
          />
        ) : null
      ) : (
        <>
          <Section
            title="Your plan, in order"
            trailing={<Chip tone="ground">{`${done}/${stages.length} done`}</Chip>}
          />
          {/* One card, one entrance: the stages are a sequence, and a sequence arriving row by
              row reads as a list still loading. */}
          <View
            onLayout={(e: LayoutChangeEvent) => {
              if (hidden(e)) return
              cardTop.current = e.nativeEvent.layout.y
              land()
            }}
          >
            <Reveal delay={dur.state}>
              <Card>
                {stages.map((stage, i) => {
                  const state: StageState = i < done ? 'done' : i === done ? 'current' : 'later'
                  const key = keyOf(stage)
                  const words = wordsOf(stage, view)
                  return (
                    <StageRow
                      // The state is in the key, so a version that moves the route on mounts
                      // the rows fresh instead of animating a plate between two stories.
                      key={`${key}-${state}`}
                      stage={stage}
                      title={words.title}
                      why={words.why}
                      n={i + 1}
                      count={stages.length}
                      state={state}
                      isGoal={stage === goal}
                      divide={i > 0}
                      open={open.has(key)}
                      onToggle={() =>
                        setOpen((prev) => {
                          const next = new Set(prev)
                          if (next.has(key)) next.delete(key)
                          else next.add(key)
                          return next
                        })
                      }
                      asOf={asOf}
                      achieved={achievedOn(stage, snapshot, roadmap)}
                      links={linksFor(stage, view)}
                      onLayout={(e: LayoutChangeEvent) => {
                        if (hidden(e)) return
                        rowTops.current.set(key, e.nativeEvent.layout.y)
                        land()
                      }}
                    />
                  )
                })}
              </Card>
            </Reveal>
          </View>
        </>
      )}

      {/* The version is the audit trail's, and the record is where it is kept. */}
      <Tap
        accessibilityRole="link"
        accessibilityLabel={`Updated: ${roadmap.reasonForChange}`}
        accessibilityHint="Opens your record"
        haptic="none"
        dim
        onPress={() => router.push('/record')}
        className="min-h-target justify-center self-start"
      >
        <Type role="caption" tone="mid" className="underline">
          Updated · {roadmap.reasonForChange}
        </Type>
      </Tap>
    </>
  )
}

/**
 * The destination, in the shape of Cleo's Save goal card: the name, the figure, how far along,
 * and ruled lines of what it takes.
 *
 * One horizon. "To go" and "Done by" are the same date, `finishOf`'s (read through `goalHorizon`,
 * which Grow's Save hero prints as well), which is also the one the numbers pane prints; the customer's own date is a ruled line of its own, labelled as the
 * target, so it never reads as the finish. A route that clears the card in eleven months, a year
 * of arrears after it and a target three years out used to print all three in one card.
 *
 * One measure of progress. `haveOf` is the route's own measure — the balance for a buffer, the
 * cover in force, the corpus already invested — against the figure this card prints. A payoff
 * has none (see `haveOf`), so it draws no bar rather than a bar stuck at nought.
 *
 * "Every month" is what goes toward the goal once the route reaches it — the payoff's ₹21,516,
 * not the premium running beside it. Where nothing leaves the account yet, stage 1 has to free
 * the money first, and quoting the goal's own figure would be a promise the account cannot keep
 * today; it says so instead.
 */
function GoalHero({
  roadmap,
  snapshot,
  pot,
}: {
  roadmap: Roadmap
  snapshot: ViewModel['snapshot']
  pot: SavePot | null
}) {
  const asOf = snapshot.asOf
  const purpose = roadmap.goal.purpose ?? pot?.purpose ?? 'Your goal'
  const target = roadmap.goal.targetAmount
  // The horizon Grow's Save hero prints too (`goalHorizon`), so the two tabs cannot count this
  // goal two ways. Where the route has no finish — a growth goal the monthly falls short of — the
  // time left is counted to the customer's own date; `doneBy` is null when it is that date.
  const { progress, toGo, doneBy, monthly } = goalHorizon(roadmap, snapshot)
  const pct = progress === null ? 0 : Math.round(progress * 100)
  const today = todayValue(roadmap)

  return (
    <View className="rounded-lg bg-hero p-lg">
      <Type role="heading" tone="onInk">
        {purpose}
      </Type>
      <Count
        value={target}
        format={rupeesShort}
        role="display"
        tone="onInk"
        id="plan.goal"
        delay={dur.enter}
        className="mt-lg"
      />

      {toGo === null && progress === null ? null : (
        <>
          <View className="mt-lg flex-row justify-between gap-md">
            {toGo === null ? (
              <View />
            ) : (
              <Type role="caption" tone="onInk">
                {toGo}
              </Type>
            )}
            {/* "<1%", as Cleo write it: a pot a fortnight old is genuinely under one percent,
                and a flat 0% would say nothing has happened when something has. */}
            {progress === null ? null : (
              <Type role="caption" tone="onInk">
                {pct === 0 && progress > 0 ? '<1%' : `${pct}%`} there
              </Type>
            )}
          </View>
          {progress === null ? null : (
            <View className="mt-sm">
              {/* The bar announces its own percentage; the label says what it is of. */}
              <Meter
                fraction={progress}
                tone="bg-surface"
                track="bg-surface/25"
                delay={dur.enter}
                label="Progress to the target"
              />
            </View>
          )}
        </>
      )}

      <View className="mt-lg gap-sm">
        <HeroLine label="Every month" value={monthly > 0 ? rupees(monthly) : 'Nothing spare yet'} />
        {doneBy === null ? null : <HeroLine label="Done by" value={shortDate(doneBy, asOf)} />}
        <HeroLine label="Target date" value={shortDate(roadmap.goal.targetDate, asOf)} />
        {today === null ? null : <HeroLine label="In today's money" value={rupees(today)} />}
      </View>

      <Button
        variant="light"
        label="Change the target"
        haptic="none"
        className="mt-lg"
        onPress={() => router.push('/edit-goal')}
      />
    </View>
  )
}

/** A dotted-leader line on the green card, the way Cleo rule the figures under a goal. */
function HeroLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-end gap-sm">
      <Type role="body" tone="onInk" className="opacity-85">
        {label}
      </Type>
      <View className="mb-xs flex-1 border-b border-dotted border-on-ink/40" />
      <Type role="body" weight="semibold" tone="onInk">
        {value}
      </Type>
    </View>
  )
}

/**
 * A target the customer typed in the rupees of the year it lands, brought back to today's.
 * Only then is there a second figure worth printing; a target already in today's money would
 * print itself twice.
 */
function todayValue(roadmap: Roadmap): number | null {
  const p = roadmap.projection
  if (roadmap.goal.amountBasis !== 'at_horizon' || p === null || p.years <= 0) return null
  return roadmap.goal.targetAmount / (1 + p.inflationPct / 100) ** p.years
}

/**
 * What the goal is short a month of landing by the customer's own date.
 *
 * The engine's figure where it has one: a growth goal the monthly does not reach. It has none for
 * a goal the route finishes after that date, because it judges a buffer on the three months it
 * stages rather than the target — Sunil's six months, due September 2028, came back feasible
 * while the hero dated them February 2031, and nothing on the screen said the two disagreed.
 * There the figure is the arithmetic behind `finishOf`'s date, run back from the target date:
 * what is left over the months from the stage's start to it, less what goes in. A payoff asks
 * core's `paymentToClear` over the same months. Anything else has no monthly that moves its date.
 */
function shortOf(
  roadmap: Roadmap,
  goal: Stage | undefined,
  snapshot: ViewModel['snapshot'],
): number {
  if (roadmap.shortfallMonthly > 0) return roadmap.shortfallMonthly
  if (goal === undefined) return 0
  const have = haveOf(roadmap, goal, snapshot)
  const { doneBy } = finishOf(roadmap, goal, have)
  const due = roadmap.goal.targetDate
  if (doneBy === null || doneBy <= due) return 0
  // A stage that starts after its own due month has no monthly that lands it; the hero's two
  // dates are the whole story there, and a figure would be one nobody could pay.
  const months = elapsedMonths(goal.startsOn, due)
  if (months <= 0) return 0
  if (goal.kind === 'build_buffer' && have !== null) {
    const left = Math.max(0, roadmap.goal.targetAmount - have)
    return Math.max(0, Math.ceil(left / months) - goal.monthly)
  }
  const rate = snapshot.debt.highestRate
  if (goal.kind === 'clear_debt' && goal.targetAmount > 0 && rate > 0) {
    return Math.max(0, paymentToClear(goal.targetAmount, rate, months) - goal.monthly)
  }
  return 0
}

/**
 * The gap, and the two things that close it. Where the route has a stage that frees money up,
 * that stage is the answer, and the pill takes the customer to it rather than repeating the
 * link the stage already carries. Where it has none, the money comes out of the spending or the
 * target — and the hero's own button, just above, already moves the target. Uday is asked where
 * the spending goes: what the biggest category cost last month and where most of it went.
 */
function Shortfall({
  short,
  stages,
  onStage,
  ask,
}: {
  /** A month, from `shortOf`. */
  short: number
  /** The route as numbered on screen, so "See stage 2" names the plate it opens. */
  stages: readonly Stage[]
  onStage: (kind: StageKind) => void
  /** Null when no spending category has a word Uday reads, and then there is no link. */
  ask: string | null
}) {
  const freeUp = stages.findIndex((s) => s.kind === 'free_up')
  return (
    <View className="rounded-lg bg-streak p-lg">
      <Type role="heading">{rupees(short)} a month short of the target</Type>
      <Type role="body" className="mt-xs">
        {freeUp === -1
          ? 'Lower the target, or find the difference in your spending.'
          : 'The stages below come first — they free up the money.'}
      </Type>
      <View className="mt-lg items-start gap-xs">
        {freeUp === -1 ? (
          <Button
            size="sm"
            variant="secondary"
            label="Set a limit"
            haptic="none"
            accessibilityHint="Opens the spending limit"
            onPress={() => router.push('/set-limit')}
          />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            label={`See stage ${freeUp + 1}`}
            haptic="none"
            accessibilityHint="Opens that stage on your plan"
            onPress={() => onStage('free_up')}
          />
        )}
        {/* Ink, not the link's mid tone: mid on the streak fill is under 4.5:1. */}
        {ask === null ? null : <AskUday question={ask} label="Ask Uday where it goes" tone="ink" />}
      </View>
    </View>
  )
}

type StageLink = { label: string; hint: string; onPress: () => void }

/**
 * Where each stage goes. Every stage has somewhere: the screen where the thing it asks for is
 * done, and Uday for the reasoning. A stage row with nothing behind it was the "I cannot click
 * anything" complaint in its purest form — seven cards of advice and not one way to act on it.
 */
function linksFor(stage: Stage, view: ViewModel, ask = 'Ask Uday about this stage'): StageLink[] {
  const links: StageLink[] = []
  switch (stage.kind) {
    case 'clear_debt':
      // GateSheet opens the same door off the same fact, in the same words: two entrances onto
      // one refusal should not read as two places.
      if (isArrears(stage, view.snapshot)) {
        links.push({
          label: 'See what your IDBI file actually shows',
          hint: 'Opens Credit on the Spend tab',
          onPress: () => router.navigate({ pathname: '/(tabs)/spend', params: { pane: 'credit' } }),
        })
      } else if (stage.targetAmount > 0) {
        links.push({
          label: 'See the debt',
          hint: 'Opens Debt on the Spend tab',
          onPress: () => router.navigate({ pathname: '/(tabs)/spend', params: { pane: 'debt' } }),
        })
      }
      break
    case 'get_cover': {
      const id = stage.productId
      const named = stage.productName
      if (id !== null && named !== null) {
        const product: ShelfProduct | undefined = view.shelf.find((p) => p.productId === id)
        links.push({
          label: `Check if ${product === undefined ? named : shortName(product)} suits me`,
          hint: 'Runs the nine suitability rules',
          onPress: () =>
            router.navigate({
              pathname: '/(tabs)/protect',
              params: { pane: 'cover', product: id },
            }),
        })
      } else {
        links.push({
          label: 'See the cover',
          hint: 'Opens the Protect tab',
          onPress: () =>
            router.navigate({ pathname: '/(tabs)/protect', params: { pane: 'cover' } }),
        })
      }
      break
    }
    case 'build_buffer':
      links.push({
        label: 'See the pot',
        hint: 'Opens Save on the Grow tab',
        onPress: () => router.navigate({ pathname: '/(tabs)/grow', params: { pane: 'save' } }),
      })
      break
    case 'grow':
      links.push({
        label: 'See what IDBI can sell you',
        hint: 'Opens Invest on the Grow tab',
        onPress: () => router.navigate({ pathname: '/(tabs)/grow', params: { pane: 'invest' } }),
      })
      break
    case 'free_up':
      links.push({
        label: 'Set a limit',
        hint: 'Opens the spending limit',
        onPress: () => router.push('/set-limit'),
      })
      break
  }
  // Asked by what the stage is for, not by its title: "Explain stage 2: Clear ₹1,86,240 at
  // 34.8%" was answered with whatever finding ranked first, and a growth stage with nothing to
  // weigh it against has no question Uday answers, so it keeps only the link above.
  const question = questionForStage(stage, askFacts(view.snapshot))
  if (question !== null) {
    links.push({ label: ask, hint: 'Asks Uday', onPress: () => askUday(question) })
  }
  return links
}

/**
 * The missed instalment: the one `clear_debt` roadmap.ts pushes with nothing to pay down, checked
 * against the fact it is about, so the card and the screens it opens describe the same customer.
 */
function isArrears(stage: Stage, snapshot: ViewModel['snapshot']): boolean {
  return stage.kind === 'clear_debt' && stage.targetAmount === 0 && snapshot.debt.missedRepayment
}

/** What the gate refuses while a repayment is missed, and what it does not. */
const ARREARS_WHY = 'No investment can be recommended until it clears. Cover still can.'

/**
 * The missed instalment, pinned above the route instead of numbered in it.
 *
 * The engine lays it as a stage like the others, after the payoff: Karan's was dated August 2027,
 * eleven months behind the card, while Home, the notices and Uday all tell him to clear it before
 * anything else. It has no amount and no real date — the wire carries neither — and it is
 * outstanding for as long as the file says so, which makes it the condition on the route rather
 * than a step in it. So it is said first and left out of the count.
 *
 * Its reason is said here too. The engine's "Nothing else can be recommended until it clears" sat
 * two rows under a cover stage the gate had just passed: the gate refuses investments over a
 * missed repayment, never cover, and the route puts cover first on purpose.
 */
function Arrears({ stage, view }: { stage: Stage; view: ViewModel }) {
  const days = view.snapshot.credit.dpdDays
  const late = days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} late` : null
  return (
    <Card>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={[stage.label, late, ARREARS_WHY].filter(Boolean).join('. ')}
        className="flex-row gap-md px-lg"
      >
        <View className="py-lg">
          <GlyphPlate name="alert" fill="bg-danger-soft" tint={color.danger} />
        </View>
        <View className="flex-1 py-lg">
          <Type role="heading" plain>
            {stage.label}
          </Type>
          {late === null ? null : (
            <Chip tone="danger" className="mt-sm">
              {late}
            </Chip>
          )}
          <Type role="body" tone="mid" className="mt-sm">
            {ARREARS_WHY}
          </Type>
        </View>
      </View>
      {linksFor(stage, view, 'Ask Uday about this').map((link) => (
        <StageLinkRow key={link.label} link={link} />
      ))}
    </Card>
  )
}

/**
 * The stage as the customer reads it: the action as an imperative naming its amount, then one
 * sentence of why that leads with the number. The engine's own words already do that for every
 * kind but one. The cover stage's label is a product — "LIC Term Assurance, ₹1 crore cover, ₹985
 * a month" — and its reason runs three sentences, so it is said here as the step it is; the
 * product's name moves into the detail, where "Into …" and the suitability check carry it.
 */
function wordsOf(stage: Stage, view: ViewModel): { title: string; why: string } {
  if (stage.kind !== 'get_cover' || stage.targetAmount <= 0 || stage.monthly <= 0) {
    return { title: stage.label, why: stage.why }
  }
  const product = view.shelf.find((p) => p.productId === stage.productId)
  const cover = product?.category === 'Term Insurance' ? 'term cover' : 'life cover'
  const { gap, dependents } = view.snapshot.protection
  const who =
    dependents === 1
      ? ' for the person who depends on you'
      : dependents > 1
        ? ` for the ${dependents} people who depend on you`
        : ''
  return {
    title: `Buy ${rupeesShort(stage.targetAmount)} ${cover} for ${rupees(stage.monthly)} a month`,
    why: gap > 0 ? `${rupeesShort(gap)} of cover missing${who}.` : stage.why,
  }
}

/**
 * One stage, Cleo's checklist row: a numbered plate, the name, the reason, and a chevron that
 * turns as the detail opens beneath it.
 *
 * Collapsed, a stage is its number, its label and why it is there, which is what makes the route
 * readable *as a sequence*. Open, it is the figures, the verdict and the ways out. The detail and
 * the links are siblings of the row's button, never inside it: a pressable inside a pressable
 * hands the touch to whichever wins, and a customer reaching for a link who collapses the stage
 * instead has been lied to by the layout.
 */
function StageRow({
  stage,
  title,
  why,
  n,
  count,
  state,
  isGoal,
  divide,
  open,
  onToggle,
  asOf,
  achieved,
  links,
  onLayout,
}: {
  stage: Stage
  title: string
  why: string
  n: number
  count: number
  state: StageState
  isGoal: boolean
  divide: boolean
  open: boolean
  onToggle: () => void
  asOf: string
  achieved: number | null
  links: StageLink[]
  onLayout: (e: LayoutChangeEvent) => void
}) {
  const reduced = useReducedMotion()
  const turn = useSharedValue(open ? 90 : 0)

  useEffect(() => {
    // `timing` carries the system's Reduce Motion setting, so the turn snaps when it is on.
    turn.value = withTiming(open ? 90 : 0, timing(dur.state))
  }, [open, turn])

  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }))
  const said = state === 'done' ? 'done' : state === 'current' ? 'now' : 'later'

  return (
    <Animated.View layout={layoutMove(reduced)} onLayout={onLayout}>
      {/* The label is the step; the reason is the hint, read after it. With the paragraph in the
          label a screen reader spoke fifty words before it said "button, collapsed". */}
      <Tap
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        accessibilityLabel={`Stage ${n} of ${count}, ${said}: ${title}`}
        accessibilityHint={why}
        haptic="none"
        scale={0.99}
        onPress={onToggle}
        className="flex-row gap-md pl-lg"
      >
        <View className="py-lg">
          <StepPlate n={n} state={PLATE[state]} size={size.plateLg} />
        </View>
        {/* The hairline starts at the words, as Cleo inset theirs: the plates read as one column
            down the card, and the rule separates what is said rather than the whole row. The
            reason runs under the chevron too — it is the longest thing here, and at 320pt a
            column shared with the chevron wrapped it every three words. The title leads and the
            chips follow it, so every plate sits beside its title, as Cleo's checklist does; with
            the chips first, the rows that had one dropped their title a line below the plate. */}
        <View className={cn('mr-lg flex-1 py-lg', divide && 'border-t border-hairline')}>
          <View className="flex-row gap-md">
            <Type role="heading" plain className="flex-1">
              {title}
            </Type>
            <View className="w-xl items-center pt-xxs">
              <Animated.View style={chevron}>
                <Glyph name="chevronRight" size={22} tint={color.ink} />
              </Animated.View>
            </View>
          </View>
          {state === 'current' || isGoal ? (
            <View className="mt-sm flex-row flex-wrap gap-xs">
              {state === 'current' ? <Chip tone="budget">Now</Chip> : null}
              {isGoal ? <Chip tone="streak">The goal</Chip> : null}
            </View>
          ) : null}
          <Type role="body" tone="mid" className="mt-sm">
            {why}
          </Type>
        </View>
      </Tap>

      {open ? (
        <Animated.View entering={flat(0)}>
          <StageDetail stage={stage} title={title} state={state} asOf={asOf} achieved={achieved} />
          {links.map((link) => (
            <StageLinkRow key={link.label} link={link} />
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

/** What "after this" means for the money, which no label says: a premium goes on being owed. */
function afterThis(stage: Stage): string | null {
  if (stage.cadence === 'ongoing') {
    return stage.monthly > 0 ? `Still costs ${rupees(stage.monthly)} a month` : 'Still costs'
  }
  return stage.monthly > 0 ? `Frees up ${rupees(stage.monthly)} a month` : null
}

function StageDetail({
  stage,
  title,
  state,
  asOf,
  achieved,
}: {
  stage: Stage
  /** The title the row prints, which is what a figure is checked against. */
  title: string
  state: StageState
  asOf: string
  /**
   * What is already standing against this stage's target, or null where the snapshot cannot
   * honestly say. A cleared-debt stage is the null case and stays null: the ledger holds what is
   * left to pay, never what the balance started at, so any fraction drawn for it would be
   * invented. A stage with no bar is the correct rendering of a stage nobody can measure.
   */
  achieved: number | null
}) {
  /**
   * A figure is worth its own line only when the title has not already said it.
   *
   * `roadmap.ts` writes labels that carry most of the arithmetic — "Clear ₹1,86,240 at 34.8%,
   * about 11 months" states the target and the horizon. Printing those again underneath is
   * echo, not information, so each figure is tested against the title it sits under, in both
   * the ways a title writes rupees, and only the genuinely absent ones survive.
   */
  const fresh = (value: string | null): value is string => value !== null && !title.includes(value)

  const metrics: { label: string; value: string; wide?: boolean }[] = []
  if (stage.monthly > 0 && fresh(rupees(stage.monthly))) {
    metrics.push({ label: 'Every month', value: rupees(stage.monthly) })
  }
  if (
    stage.targetAmount > 0 &&
    fresh(rupees(stage.targetAmount)) &&
    fresh(rupeesShort(stage.targetAmount))
  ) {
    metrics.push({ label: targetLabel(stage.kind), value: rupees(stage.targetAmount) })
  }
  if (stage.monthsToComplete > 0 && fresh(span(stage.monthsToComplete))) {
    metrics.push({ label: 'Takes', value: span(stage.monthsToComplete) })
  }
  if (state !== 'done' && stage.startsOn > asOf) {
    metrics.push({ label: 'Starts', value: shortDate(stage.startsOn, asOf) })
  }
  // A phrase, not a figure: in half the band "Still costs ₹985 a month" broke after the "a", so it
  // takes the whole width, after the figures it follows from.
  const after = afterThis(stage)
  if (after !== null) metrics.push({ label: 'After this', value: after, wide: true })

  // A finished stage has its tick on the plate; a full bar under it would say it twice.
  const fraction =
    state !== 'done' && achieved !== null && stage.targetAmount > 0
      ? Math.min(1, achieved / stage.targetAmount)
      : null

  return (
    <View className="flex-row gap-md px-lg pb-lg">
      <View className="w-plate-lg" />
      <View className="flex-1 border-t border-hairline pt-md">
        {metrics.length > 0 ? (
          <View className="flex-row flex-wrap gap-md">
            {metrics.map((m) => (
              <Metric key={m.label} label={m.label} value={m.value} wide={m.wide} />
            ))}
          </View>
        ) : null}

        {fresh(stage.productName) ? (
          <Type role="label" tone="mid" className="mt-md">
            Into {stage.productName}
          </Type>
        ) : null}

        {fraction === null ? null : (
          <View className="mt-md">
            <Meter
              fraction={fraction}
              tone="bg-brand"
              track="bg-ground-deep"
              delay={dur.state}
              label="Already there"
            />
            <Type role="caption" tone="mid" className="mt-sm">
              {rupees(Math.min(achieved ?? 0, stage.targetAmount))} of {rupees(stage.targetAmount)}{' '}
              already there
            </Type>
          </View>
        )}

        {stage.verdict ? <VerdictLine verdict={stage.verdict} /> : null}

        {/* `completesOn` falls back to `startsOn` whenever `monthsToComplete` is zero, and zero
            months is how a stage says it has no end — a balance growing faster than the
            payment. A date there would sit under a label saying it will not clear. */}
        {stage.monthsToComplete > 0 && state !== 'done' ? (
          <Type role="caption" tone="mid" className="mt-md">
            Done by {shortDate(stage.completesOn, asOf)}
          </Type>
        ) : null}
      </View>
    </View>
  )
}

/**
 * The gate's word on the stage's product. Shown on every stage that has one, including the ones
 * that passed: "All 9 rules passed" is a claim the bank is making, and it belongs beside the
 * advice. A refusal says where it stopped — the rule's place in the nine and its name — under
 * the engine's own sentence, never an id in capitals ahead of it.
 */
function VerdictLine({ verdict }: { verdict: NonNullable<Stage['verdict']> }) {
  const blocked = verdict.verdict === 'BLOCKED'
  const rules = RULE_ORDER.length
  const at = ruleIndex(verdict.ruleId)
  const name = ruleName(verdict.ruleId)
  // A pass with nothing to say but that it passed would print the chip twice.
  const sentence = verdict.spoken ?? (blocked ? verdict.recorded : null)

  // The gate sheet's chip, so a pass reads the same here as where it was given. The rule a
  // refusal stopped at is the caption under it, with its name, so the chip does not say it too.
  return (
    <View className="mt-md border-t border-hairline pt-md">
      <RulesChip blocked={blocked} of={rules} passed={verdict.passed.length} />
      {sentence === null ? null : (
        <Type role="body" className="mt-sm">
          {sentence}
        </Type>
      )}
      {blocked && at > 0 ? (
        <Type role="caption" tone="mid" className="mt-xs">
          Stopped at rule {at} of {rules}
          {name === null ? '' : ` · ${name}`}
        </Type>
      ) : null}
      {/* `alternative` is an object on the wire and always was. Rendering it as a child put
          `[object Object]` on screen at best and took the tab down at worst. */}
      {verdict.alternative ? (
        <Type role="body" tone="mid" className="mt-xs">
          Instead: {verdict.alternative.name}
          {verdict.alternative.monthly > 0
            ? `, ${rupees(verdict.alternative.monthly)} a month`
            : ''}
        </Type>
      ) : null}
    </View>
  )
}

/** A way out of a stage, ruled like the stages themselves so it reads as part of this one. */
function StageLinkRow({ link }: { link: StageLink }) {
  return (
    <Tap
      accessibilityRole="link"
      accessibilityLabel={link.label}
      accessibilityHint={link.hint}
      haptic="none"
      dim
      onPress={link.onPress}
      className="min-h-target flex-row gap-md px-lg"
    >
      <View className="w-plate-lg" />
      <View className="min-h-target flex-1 flex-row items-center gap-md border-t border-hairline py-md">
        <Type role="label" tone="brand" className="flex-1">
          {link.label}
        </Type>
        <Glyph name="arrowRight" size={18} tint={color.brand} />
      </View>
    </Tap>
  )
}

/* ── The numbers ───────────────────────────────────────────────────────────────────────── */

/**
 * The arithmetic of the goal, whichever kind of arithmetic it has.
 *
 * Goal first: the numbers pane is about the goal the hero names, so a buffer goal shows the
 * buffer even where the route also clears a card — that payoff is one link away, and printing it
 * here put debt copy on a goal that was not a debt. The only thing that outranks the goal is a
 * screen that asked for the payoff by name.
 */
function NumbersPane({
  view,
  focus,
  onRoute,
  rate: picked,
  onRate,
}: {
  view: ViewModel
  focus: StageKind | null
  onRoute: (kind: StageKind | null) => void
  rate: number | null
  onRate: (rate: number) => void
}) {
  const { roadmap, snapshot } = view
  const { stages, projection } = roadmap
  const goal = goalStageOf(stages)
  const debtStage = stages.find((s) => s.kind === 'clear_debt' && s.targetAmount > 0)
  const rate = snapshot.debt.highestRate
  const payoff =
    debtStage && rate > 0 ? payoffSummary(debtStage.targetAmount, rate, debtStage.monthly) : null

  if (focus === 'clear_debt' && payoff && debtStage) {
    return <PayoffPane payoff={payoff} stage={debtStage} rate={rate} />
  }
  if (projection) {
    return <GrowthPane projection={projection} roadmap={roadmap} rate={picked} onRate={onRate} />
  }
  if (goal?.kind === 'clear_debt' && goal.targetAmount > 0) {
    return payoff && debtStage ? (
      <PayoffPane payoff={payoff} stage={debtStage} rate={rate} />
    ) : (
      <WontClearPane stage={goal} rate={rate} stages={stages} onRoute={onRoute} />
    )
  }
  if (goal?.kind === 'build_buffer') {
    return (
      <BufferPane
        roadmap={roadmap}
        stage={goal}
        have={snapshot.balances.total}
        outgoings={snapshot.commitments.total + snapshot.discretionary.monthly}
        asOf={snapshot.asOf}
      />
    )
  }
  if (payoff && debtStage) {
    return <PayoffPane payoff={payoff} stage={debtStage} rate={rate} />
  }
  // Nothing is going in yet, so there is nothing to compute. A projection off ₹0 a month would
  // be a flat line presented as a forecast, which is the number this product exists not to show.
  return (
    <>
      <EmptyState
        glyph="plan"
        title="Nothing to work out yet"
        body="Your route has no money going into this goal yet. Start with stage 1."
      />
      <NumbersStack
        ask={FIRST_THING}
        secondary={{ label: 'See the route', onPress: () => onRoute(null) }}
      />
    </>
  )
}

/**
 * Every numbers pane ends the same way: change what it is working towards, or ask about it. The
 * change is the button and the ask is the link under it, the one shape "Ask Uday about this"
 * takes across the app. A pane whose question Uday cannot answer — whether an assumed return is
 * fair — opens what can instead, as a second button.
 */
function NumbersStack({
  ask,
  primary,
  secondary,
}: {
  ask?: string
  primary?: { label: string; onPress: () => void }
  secondary?: { label: string; onPress: () => void }
}) {
  const other = {
    label: secondary?.label ?? 'Change the target',
    onPress: secondary?.onPress ?? (() => router.push('/edit-goal')),
  }
  if (ask !== undefined) {
    return (
      <View className="mt-lg">
        <Button label={other.label} haptic="none" onPress={other.onPress} />
        <AskUday question={ask} className="mt-xs" />
      </View>
    )
  }
  return (
    <ButtonStack className="mt-lg">
      {primary === undefined ? null : (
        <Button label={primary.label} haptic="none" onPress={primary.onPress} />
      )}
      <Button variant="secondary" label={other.label} haptic="none" onPress={other.onPress} />
    </ButtonStack>
  )
}

/**
 * One figure in its own light — Cleo's money-health score, "63 out of 100" in a warm bloom —
 * with its unit inside the glow and the sentence that qualifies it just under, so the three read
 * as one statement. They are one stop for a screen reader for the same reason. The ⓘ is the
 * method, kept off the page so the page can be the result. A caveat the figure needs goes in
 * that sentence, not in a chip: a chip under the glow sat above the next heading like a label
 * for it.
 */
function GlowHero({
  children,
  spoken,
  below,
  onInfo,
}: {
  children: ReactNode
  spoken: string
  below: string
  onInfo: () => void
}) {
  const { width } = useWindowDimensions()
  const glow = Math.min(GLOW, width - 2 * space.pad)

  return (
    <View className="items-center">
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={spoken}
        className="items-center"
      >
        <ScoreGlow tone="warm" size={glow}>
          <View className="items-center px-lg">{children}</View>
        </ScoreGlow>
        <Type role="body" tone="mid" className="-mt-xl text-center">
          {below}
        </Type>
      </View>
      {/* Last in the tree so it draws over the glow on a narrow phone. */}
      <Tap
        accessibilityRole="button"
        accessibilityLabel="How this is worked out"
        haptic="none"
        hitSlop={8}
        onPress={onInfo}
        className="absolute right-0 top-0 h-target w-target items-center justify-center"
      >
        <GlyphPlate name="info" size={size.ring} plain />
      </Tap>
    </View>
  )
}

function wholeNumber(n: number): string {
  return String(Math.round(n))
}

/**
 * The numbers pane for a plan whose goal is clearing a debt.
 *
 * Deliberately not dressed as a projection. There are no scenario tiles and no rate to pick,
 * because none of this is an assumption: the balance, the rate and the payment are all the
 * customer's own, and the only modelling is arithmetic they could check on paper.
 *
 * The comparison is the point of the screen. "₹31,336 over 11 months" is a fact with no weight
 * until it sits next to what the same balance costs at the issuer's minimum instead. That gap is
 * the plan's entire argument, in the customer's own money.
 */
function PayoffPane({ payoff, stage, rate }: { payoff: Payoff; stage: Stage; rate: number }) {
  const [method, setMethod] = useState(false)
  const balance = stage.targetAmount
  const payment = stage.monthly
  const unit = payoff.months === 1 ? 'month to clear' : 'months to clear'
  const line = `${rupees(balance)} at ${rate}%, paying ${rupees(payment)} a month.`
  const saved =
    payoff.minimumTotalInterest === null
      ? null
      : Math.max(0, payoff.minimumTotalInterest - payoff.totalInterest)

  return (
    <>
      {/* Where these figures come from — the customer's own balance, rate and payment, not an
          assumption — is the first line of the ⓘ sheet. */}
      <GlowHero
        spoken={`${payoff.months} ${unit} ${line}`}
        below={line}
        onInfo={() => setMethod(true)}
      >
        <Count
          value={payoff.months}
          format={wholeNumber}
          role="display"
          id="plan.payoff"
          delay={dur.enter}
        />
        <Type role="body" tone="mid">
          {unit}
        </Type>
      </GlowHero>

      <Section title="What it costs you" />
      <Card>
        <Row label="Balance" value={rupees(balance)} />
        <Row label="Interest" value={rupees(payoff.totalInterest)} divide />
        <Row label="Total" value={rupees(payoff.totalPaid)} divide />
      </Card>

      {/* The counterfactual, and the only reason the figures above mean anything. Only when the
          minimum actually retires the balance — where it never does, "costs ₹∞" is not a
          sentence, and the honest line is the one in the other branch. */}
      <Section title="If you only paid the minimum" />
      <View className="rounded-lg bg-streak p-lg">
        {payoff.minimumMonths !== null && payoff.minimumTotalInterest !== null ? (
          <>
            <Type role="heading">
              {span(payoff.minimumMonths)} and {rupees(payoff.minimumTotalInterest)} in interest
            </Type>
            <Type role="body" className="mt-xs">
              Your plan takes {span(payoff.months)}
              {saved !== null && saved > 0 ? ` and saves ${rupees(saved)}.` : '.'}
            </Type>
          </>
        ) : (
          <>
            <Type role="heading">It would never clear</Type>
            <Type role="body" className="mt-xs">
              At {rate}% the minimum barely covers the interest, so the balance never falls.
            </Type>
          </>
        )}
      </View>

      <NumbersStack ask={debtPayoffQuestion(balance, rate, payoff.months)} />
      <View>
        <MenuLink
          label="See the debt"
          onPress={() => router.navigate({ pathname: '/(tabs)/spend', params: { pane: 'debt' } })}
        />
        <MenuLink label="See the card lines" onPress={() => router.push('/statement')} />
      </View>

      <Sheet
        open={method}
        onClose={() => setMethod(false)}
        title="How this is worked out"
        footer={<Button label="Got it" haptic="none" onPress={() => setMethod(false)} />}
      >
        <Type role="body">
          The balance, the rate and the payment come from your IDBI file. Each month the interest is
          added and the payment comes off, until nothing is left.
        </Type>
        {payoff.minimumMonths === null ? (
          <Type role="body" className="mt-md">
            At {rate}% the minimum barely covers the interest, so the balance never falls.
          </Type>
        ) : null}
        <Type role="body" className="mt-md">
          The minimum is taken as 5% of the balance, as most card issuers set it.
        </Type>
      </Sheet>
    </>
  )
}

/**
 * The payoff that does not pay off: a payment below the interest, so the balance grows.
 *
 * No glow and no month count, because there is no month. The three rows are the subtraction
 * that proves it, and the callout is the figure that would change it — what clearing it in
 * three years takes, the same three years the engine quotes in the stage's own sentence.
 */
function WontClearPane({
  stage,
  rate,
  stages,
  onRoute,
}: {
  stage: Stage
  rate: number
  stages: readonly Stage[]
  onRoute: (kind: StageKind | null) => void
}) {
  const balance = stage.targetAmount
  const payment = stage.monthly
  const interest = monthlyInterest(balance, rate)
  const short = Math.max(0, interest - payment)
  const needed = paymentToClear(balance, rate, 36)
  const more = Math.max(0, needed - payment)
  const freeUp = stages.findIndex((s) => s.kind === 'free_up')

  return (
    <>
      <View className="gap-sm">
        <Chip tone="danger">Doesn&apos;t clear yet</Chip>
        <Type role="title">
          {rupees(balance)} at {rate}%
        </Type>
        <Type role="body" tone="mid">
          {rupees(short)} a month more interest than you pay, so the balance grows.
        </Type>
      </View>

      <Card>
        <Row label="Interest a month" value={rupees(interest)} />
        <Row label="Paying a month" value={rupees(payment)} divide />
        <Row label="Short by" value={rupees(short)} divide tone="danger" />
      </Card>

      <View className="rounded-lg bg-streak p-lg">
        <Type role="heading">Free up {rupees(more)} more first</Type>
        <Type role="body" className="mt-xs">
          At {rupees(needed)} a month it clears in three years.
        </Type>
        <Button
          size="sm"
          variant="secondary"
          label={freeUp === -1 ? 'See the route' : `See stage ${freeUp + 1}`}
          haptic="none"
          className="mt-lg"
          onPress={() => onRoute(freeUp === -1 ? null : 'free_up')}
        />
      </View>

      <NumbersStack ask={wontClearQuestion(payment)} />
    </>
  )
}

/**
 * The buffer's arithmetic: what goes in, what is there, what is left, and when — for the goal
 * the hero names, measured the way the hero measures it, to the date the hero prints.
 *
 * The route stages a buffer in part. The engine builds three months of outgoings whatever the
 * target asks for, so a six-month goal's stage is its first half, and printing that stage as the
 * card (its label for a title, its ₹1,84,146 for a target, its eight months for a horizon) put a
 * second goal under the first one. The stage is still here — as the first milestone, dated by
 * the engine — and the card itself is the goal.
 *
 * The balance the snapshot holds is the buffer: the same figure the stage's own sentence counts
 * in months. Money added to the goal is the customer's next move, so it is on the card, as
 * Cleo's goal card carries its Deposit.
 */
function BufferPane({
  roadmap,
  stage,
  have,
  outgoings,
  asOf,
}: {
  roadmap: Roadmap
  stage: Stage
  have: number
  /** What a month costs, as the engine sizes a buffer: commitments and discretionary spend. */
  outgoings: number
  asOf: string
}) {
  const target = roadmap.goal.targetAmount
  const still = Math.max(0, target - have)
  const { doneBy } = finishOf(roadmap, stage, have)
  const part = stage.targetAmount > 0 && stage.targetAmount < target && stage.targetAmount > have
  const months = outgoings > 0 ? Math.round(stage.targetAmount / outgoings) : 0

  return (
    <>
      <Card>
        <View className="p-lg">
          <Type role="heading">{roadmap.goal.purpose ?? 'Your safety net'}</Type>
          <View className="mt-lg">
            <Meter
              fraction={target > 0 ? have / target : 0}
              tone="bg-brand"
              track="bg-ground-deep"
              delay={dur.state}
              label="Buffer built"
            />
          </View>
          <Type role="caption" tone="mid" className="mt-sm">
            {still === 0
              ? 'All of it is there.'
              : doneBy === null
                ? `${rupees(have)} of ${rupees(target)} already there.`
                : `Done by ${shortDate(doneBy, asOf)} at this rate.`}
          </Type>
        </View>
        <Row label="Every month" value={rupees(stage.monthly)} divide />
        <Row label="Already there" value={rupees(have)} divide />
        <Row label="Still to build" value={rupees(still)} divide />
        {part ? (
          <Row
            label={months > 0 ? `First ${months} months` : 'First stage'}
            detail={rupees(stage.targetAmount)}
            value={`by ${shortDate(stage.completesOn, asOf)}`}
            divide
          />
        ) : null}
        <View className="border-t border-hairline p-lg">
          <Button
            variant="secondary"
            label="Add money"
            haptic="none"
            accessibilityHint="Adds money to your goal"
            onPress={() => router.push('/deposit')}
          />
        </View>
      </Card>

      <NumbersStack ask={EMERGENCY_SAVINGS} />
    </>
  )
}

/**
 * The growth goal's numbers. Three rates, all visible, none of them a default the customer did
 * not choose: a single projected number reads as a promise; three read as a range, which is what
 * it is. The corpus is the one figure in the app where the motion is the information — tapping
 * 6% then 12% makes it travel between two assumptions, where a hard cut would look like two
 * separate promises made in turn.
 */
function GrowthPane({
  projection,
  roadmap,
  rate,
  onRate,
}: {
  projection: Projection
  roadmap: Roadmap
  /** The rate the customer picked, or null for the middle one. Held by the screen, not here. */
  rate: number | null
  onRate: (rate: number) => void
}) {
  const [method, setMethod] = useState(false)
  const middle = projection.scenarios[Math.min(1, projection.scenarios.length - 1)]
  const chosen =
    projection.scenarios.find((s) => s.ratePct === rate) ?? middle ?? projection.scenarios[0]
  if (!chosen) return null

  // Three rows that add up to the corpus above them, which is a definition rather than a layout:
  // it turns on what `Scenario.contributed` counts, and the rule lives in `@dhan/core`.
  const { already, paidIn, growth } = contributionSplit(projection, chosen)
  const over = span(Math.round(projection.years * 12))
  const unit = `at ${chosen.ratePct}% over ${over}`
  const line =
    `Worth ${rupeesShort(chosen.realCorpus)} today after ${projection.inflationPct}% inflation. ` +
    'An assumption, not a forecast.'

  return (
    <>
      <GlowHero
        spoken={`${rupeesShort(chosen.corpus)} ${unit}. ${line}`}
        below={line}
        onInfo={() => setMethod(true)}
      >
        <Count
          value={chosen.corpus}
          format={rupeesShort}
          role="display"
          id="plan.corpus"
          delay={dur.enter}
        />
        <Type role="body" tone="mid" className="text-center">
          {unit}
        </Type>
      </GlowHero>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Assumed rate of return"
        className="flex-row gap-sm"
      >
        {projection.scenarios.map((s) => (
          <ScenarioTile
            key={s.label}
            scenario={s}
            checked={s.ratePct === chosen.ratePct}
            onPress={() => onRate(s.ratePct)}
          />
        ))}
      </View>

      <AgainstTarget roadmap={roadmap} projection={projection} chosen={chosen} />

      <Section title="Where that comes from" />
      <Card>
        <Row label="Already invested" value={rupees(already)} />
        <Row label={`What you put in over ${over}`} value={rupees(paidIn)} divide />
        <Row label="Growth" value={rupees(growth)} divide tone="brand" />
        <SettingRow
          glyph="target"
          title="Every month"
          value={rupees(projection.monthlyContribution)}
          onPress={() => router.push('/edit-goal')}
          accessibilityHint="Opens the goal editor"
          divide
        />
      </Card>

      <View>
        <Meter
          fraction={Math.min(1, chosen.contributed / Math.max(1, chosen.corpus))}
          tone="bg-brand"
          track="bg-ground-deep"
          delay={dur.state}
          label="Your own money"
        />
        <Type role="caption" tone="mid" className="mt-sm">
          The filled part is your own money. The rest is the assumed return.
        </Type>
      </View>

      {/* Whether the assumed return is fair has no rule behind it; the working does, so the
          pane's first button opens it. */}
      <NumbersStack primary={{ label: 'How this is worked out', onPress: () => setMethod(true) }} />

      <Sheet
        open={method}
        onClose={() => setMethod(false)}
        title="How this is worked out"
        footer={<Button label="Got it" haptic="none" onPress={() => setMethod(false)} />}
      >
        <Type role="body">
          Growth is compounded monthly at the rate you picked. Nothing here is a forecast; it shows
          what the assumption implies.
        </Type>
        <Type role="body" tone="mid" className="mt-md">
          {projection.disclaimer}
        </Type>
      </Sheet>
    </>
  )
}

/**
 * The corpus held against the target, in the same money as the target.
 *
 * A growth target in today's rupees, ten years out or more, is funded at the real rate — the
 * engine's `fundingRatePct` makes that call, and this asks it rather than mirroring it. Such a
 * target has to be read against the corpus after inflation: ₹3.1Cr beside a ₹2.2Cr target reads
 * as the goal beaten, when in today's money it is ₹59L against ₹2.2Cr and the route says the
 * monthly falls short. Where the engine funds at the nominal rate, the nominal corpus is the
 * comparison. Recomputed with the rate tile, so the gap moves with the assumption.
 */
function AgainstTarget({
  roadmap,
  projection,
  chosen,
}: {
  roadmap: Roadmap
  projection: Projection
  chosen: Scenario
}) {
  const { goal } = roadmap
  const real =
    fundingRatePct(goal, projection.years) !==
    fundingRatePct({ kind: goal.kind, amountBasis: 'at_horizon' }, projection.years)
  const gets = real ? chosen.realCorpus : chosen.corpus
  const gap = goal.targetAmount - gets
  // Said once, over both figures, rather than under each of them.
  const money = real ? { subtitle: "In today's money" } : {}

  return (
    <>
      <Section title="Against your target" {...money} />
      <Card>
        <Row label="Your target" value={rupeesShort(goal.targetAmount)} />
        <Row label={`At ${chosen.ratePct}%`} value={rupeesShort(gets)} divide />
        <Row
          label={gap > 0 ? 'Short by' : 'Ahead by'}
          value={rupeesShort(Math.abs(gap))}
          tone={gap > 0 ? 'danger' : 'brand'}
          divide
        />
      </Card>
    </>
  )
}

/** One assumed rate, as a radio: Cleo's quiz ring on a tile that says the rate and its name. */
function ScenarioTile({
  scenario,
  checked,
  onPress,
}: {
  scenario: Scenario
  checked: boolean
  onPress: () => void
}) {
  return (
    <Tap
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={`${scenario.ratePct} percent, ${scenario.label}`}
      haptic="none"
      onPress={onPress}
      className={cn(
        'min-h-target flex-1 rounded-lg border px-sm py-md',
        checked ? 'border-ink bg-surface' : 'border-hairline bg-transparent',
      )}
    >
      <View className="flex-row items-center gap-sm">
        <View className="h-radio w-radio items-center justify-center rounded-pill border-2 border-ink">
          {checked ? <View className="h-radio-dot w-radio-dot rounded-pill bg-ink" /> : null}
        </View>
        <Type role="heading" plain>
          {scenario.ratePct}%
        </Type>
      </View>
      <Type role="caption" tone="mid" numberOfLines={1} adjustsFontSizeToFit className="mt-xs">
        {scenario.label}
      </Type>
    </Tap>
  )
}

/**
 * What this stage's `targetAmount` actually is, which is a different thing per kind. A cover
 * stage's target is a sum assured, a debt stage's is a balance to retire, and only a buffer or a
 * growth stage is accumulating toward a number.
 */
function targetLabel(kind: StageKind): string {
  switch (kind) {
    case 'get_cover':
      return 'Cover'
    case 'clear_debt':
      return 'To clear'
    case 'free_up':
      return 'To free up'
    default:
      return 'Target'
  }
}

/**
 * One figure in the stage's band. Two to a row, wrapping to a second at 320pt, with the label
 * above its value because a label beside a value is a table and a stage is not one. `wide` is for
 * a value that is a phrase rather than a figure, which half the band breaks mid-thought.
 */
function Metric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View className={wide ? 'basis-full' : 'grow basis-[45%]'}>
      <Type role="caption" tone="mid">
        {label}
      </Type>
      <Type role="label" numberOfLines={2} className="mt-xxs">
        {value}
      </Type>
    </View>
  )
}

/**
 * What the snapshot can honestly say is already standing against a stage's target.
 *
 * Only two of the five kinds have an answer, and the silence on the other three is the point.
 * A cleared-debt stage knows what is left to pay and never what the balance began at, and a
 * freed-up stage has no target at all — so both return null and draw no bar rather than a bar at
 * a number nobody computed. A cover stage's target is the policy it buys, not the cover the
 * family needs: the cover already held is not part of that policy, and "₹2,70,000 of
 * ₹1,00,00,000 already there" read as a new policy nearly 3% bought. The hero measures a cover
 * goal against its own target, which is the need. `grow` deliberately reads the projection's own
 * `existingCorpus` rather than total holdings: that is the corpus the roadmap itself counted
 * toward this goal.
 */
function achievedOn(
  stage: Stage,
  snapshot: ViewModel['snapshot'],
  roadmap: Roadmap,
): number | null {
  switch (stage.kind) {
    case 'build_buffer':
      return snapshot.balances.total
    case 'grow':
      return roadmap.projection?.existingCorpus ?? null
    default:
      return null
  }
}

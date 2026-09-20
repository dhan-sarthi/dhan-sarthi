// Plan — the route to the destination.
//
// Cleo has no equivalent screen, so this is built in the language the other tabs
// established rather than copied: dark hero for the goal, white cards on cream for the
// stages, one saturated surface where something needs to be loud.
//
// Two panes. The roadmap is the sequence and the reasoning; the projection is the
// arithmetic. Keeping them apart matters for a regulated product — a customer reading
// "what should I do" should not have a growth curve in their eye, and a customer reading
// a growth curve must see the rate and the disclaimer attached to it.
import { useRef, useState } from 'react'
import { View, type ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { TabHeader } from '~/ui/TabHeader'
import { Pills, usePane } from '~/ui/Pills'
import { Pane, Reveal } from '~/ui/Reveal'
import { Type } from '~/ui/Text'
import { Count } from '~/ui/Count'
import { Card } from '~/ui/Card'
import { Row } from '~/ui/Row'
import { Section } from '~/ui/Section'
import { SnapshotScroll } from '~/ui/SnapshotScroll'
import { Chip } from '~/ui/Chip'
import { Meter } from '~/ui/Meter'
import { Glyph } from '~/ui/Glyph'
import { Tap } from '~/ui/Tap'
import { dur } from '~/ui/motion'
import { cn } from '~/ui/cn'
import { duration } from '~/lib/duration'
import { rupees, rupeesShort, shortDate } from '~/lib/money'
import { color } from '@dhan/design'
import { contributionSplit, payoffSummary } from '@dhan/core'
import type { Payoff } from '@dhan/core'
import type { Projection, Roadmap, Stage, View as ViewModel } from '@dhan/contracts'

// Not exported by the contract: `ScenarioSchema` has no accompanying `export type`, so the
// name for one row of a projection is derived here rather than added over there.
type Scenario = Projection['scenarios'][number]

type Pane = 'roadmap' | 'projection'

const PANES = [
  { value: 'roadmap' as const, label: 'The route' },
  { value: 'projection' as const, label: 'The numbers' },
]

export default function Plan() {
  const { pane, dir, set } = usePane<Pane>('roadmap')
  const scroller = useRef<ScrollView>(null)

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ground">
      <StatusBar style="dark" />
      <TabHeader title="Plan" />
      <Pills
        options={PANES}
        value={pane}
        onChange={(next, d) => {
          set(next, d)
          scroller.current?.scrollTo({ y: 0, animated: false })
        }}
      />

      <SnapshotScroll ref={scroller} loading="Working out the route…">
        {(view) => (
          <Pane key={pane} dir={dir} className="gap-md">
            {pane === 'roadmap' ? <RoadmapPane view={view} /> : <ProjectionPane view={view} />}
          </Pane>
        )}
      </SnapshotScroll>
    </SafeAreaView>
  )
}

function RoadmapPane({ view }: { view: ViewModel }) {
  const { roadmap, snapshot } = view
  const router = useRouter()
  const years = Math.round(roadmap.totalMonths / 12)

  return (
    <>
      {/* The goal is the one thing on this screen the customer owns, and until now the only way
          to change it was three taps deep in save settings — so the tab that shows you where you
          are headed was the one place you could not say you wanted to head somewhere else. The
          hero is the obvious affordance and it was inert. */}
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`${roadmap.goal.purpose}. Change this goal.`}
        haptic="selection"
        scale={0.99}
        onPress={() => router.push('/edit-goal')}
        className="rounded-lg bg-hero p-lg"
      >
        <View className="flex-row items-center justify-between">
          <Type role="caption" tone="onInk" className="opacity-85">
            WHERE YOU ARE HEADED
          </Type>
          <Type role="caption" tone="onInk" className="opacity-85 underline">
            Change
          </Type>
        </View>
        <Type role="title" tone="onInk" className="mt-xs">
          {roadmap.goal.purpose}
        </Type>
        <View className="mt-lg flex-row items-baseline gap-sm">
          <Count
            value={roadmap.goal.targetAmount}
            format={rupeesShort}
            role="display"
            tone="onInk"
            delay={dur.enter}
          />
          <Type role="body" tone="onInk" className="opacity-85">
            by {shortDate(roadmap.goal.targetDate, snapshot.asOf)}
          </Type>
        </View>
        <Type role="caption" tone="onInk" className="mt-sm opacity-85">
          In today's money · {rupees(roadmap.monthlyCommitment)} a month over {years} years
        </Type>
      </Tap>

      {/* Feasibility is stated, never softened. A plan that does not reach is still the
          right plan; hiding the gap is what would make it dishonest. */}
      {!roadmap.feasible && (
        <View className="rounded-lg bg-streak p-lg">
          <Type role="heading">Does not reach the target yet</Type>
          <Type role="body" className="mt-xs opacity-80">
            On what is spare today you are {rupees(roadmap.shortfallMonthly)} a month short. The
            stages below still come first — they are what makes the rest possible.
          </Type>
        </View>
      )}

      <Section title="The order things happen in" />
      {/* The stages are a sequence — that is the entire point of the screen — so they arrive as
          one, top to bottom, rather than as a block. The cap in `stagger` keeps a seven-stage
          roadmap from taking most of a second to finish drawing itself. */}
      {roadmap.stages.map((stage, i) => (
        <Reveal key={`${stage.index}-${stage.kind}`} i={i} delay={dur.state}>
          <StageRow
            stage={stage}
            asOf={snapshot.asOf}
            achieved={achievedOn(stage, snapshot, roadmap)}
            state={
              i < roadmap.currentStageIndex
                ? 'done'
                : i === roadmap.currentStageIndex
                  ? 'current'
                  : 'later'
            }
            /* The one stage row that goes somewhere, which closes the gap logged at
               `docs/slices/03-plan.md:66` — "stage rows do not link anywhere" — for the row
               whose destination is not a product.

               `targetAmount === 0` is what picks the arrears stage out of the two `clear_debt`
               pushes: `roadmap.ts:509-523` is the only one with a zero target, because it is
               the only one asking the customer to catch up rather than to clear a balance, and
               every other `clear_debt` carries the principal. That is a shape test, so the
               field the stage is actually *about* is checked beside it — the same
               `snapshot.debt.missedRepayment` the roadmap itself branched on at
               `roadmap.ts:508`. Reading it here rather than trusting the stage's presence
               keeps the row and the screen it opens from describing different customers. */
            onCredit={
              stage.kind === 'clear_debt' &&
              stage.targetAmount === 0 &&
              snapshot.debt.missedRepayment
                ? () => router.push('/credit')
                : undefined
            }
          />
        </Reveal>
      ))}

      <Type role="caption" tone="faint" className="mt-sm">
        Version {roadmap.version} · {roadmap.reasonForChange}
      </Type>
    </>
  )
}

function StageRow({
  stage,
  state,
  asOf,
  achieved,
  onCredit,
}: {
  stage: Stage
  state: 'done' | 'current' | 'later'
  asOf: string
  /**
   * What is already standing against this stage's target, or null where the snapshot cannot
   * honestly say. A cleared-debt stage is the null case and stays null: the ledger holds what is
   * left to pay, never what the balance started at, so any fraction drawn for it would be
   * invented. A stage with no bar is the correct rendering of a stage nobody can measure.
   */
  achieved: number | null
  /**
   * Where the arrears stage goes, and nothing else on this screen has anywhere to go yet.
   *
   * A callback rather than a flag, because a stage row has never held the snapshot and should
   * not start: it is handed a `Stage`, a date and a number, and everything it draws is a
   * function of those. The caller already holds `view` and is the only place that can say
   * which customer this route is being offered to.
   */
  onCredit?: () => void
}) {
  const blocked = stage.verdict?.verdict === 'BLOCKED'
  /**
   * A figure is worth its own line only when the label has not already said it.
   *
   * `roadmap.ts` writes labels that carry most of the arithmetic — "Clear ₹1,86,240 at 34.8%,
   * about 11 months" states the target and the horizon, and the term cover stage names the
   * scheme, the sum assured and the premium in one breath. Printing those again underneath is
   * echo, not information, and a band of four figures that restate the sentence above them is
   * exactly the kind of density that makes a screen look busy while telling you nothing new.
   * So each metric is tested against the label it sits under, and only the genuinely absent ones
   * survive — which on a `grow` stage is the monthly amount and the horizon in years, the two
   * figures its label happens never to mention.
   */
  const fresh = (value: string | null): value is string =>
    value !== null && !stage.label.includes(value)
  const fraction =
    state === 'done'
      ? 1
      : achieved !== null && stage.targetAmount > 0
        ? Math.min(1, achieved / stage.targetAmount)
        : null
  /*
   * The detail is behind a tap, and the current stage is the one that starts open.
   *
   * Every stage used to render everything it had at once — the reasoning, a five-figure metrics
   * band, the suitability verdict, a progress meter and a completion date — so a seven-stage
   * route was seven walls of text with nothing to do on any of them. That is the "feels empty
   * and I cannot click anything" complaint: not too little on the screen, too much of it inert.
   *
   * Collapsed, a stage is its number, its label and its one live figure, which is what makes the
   * route readable *as a sequence*. Open, it is everything it always showed. The stage the
   * customer is actually on is expanded to begin with, because that is the one they came to read.
   */
  const [open, setOpen] = useState(state === 'current')

  return (
    <Card className={state === 'later' ? 'opacity-60' : undefined}>
      <Tap
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${stage.label}. ${open ? 'Hide' : 'Show'} the detail.`}
        haptic="selection"
        scale={0.995}
        onPress={() => setOpen((o) => !o)}
        className="flex-row gap-lg px-lg py-lg"
      >
        <View
          className={
            state === 'done'
              ? 'h-8 w-8 items-center justify-center rounded-pill bg-success'
              : state === 'current'
                ? 'h-8 w-8 items-center justify-center rounded-pill bg-ink'
                : 'h-8 w-8 items-center justify-center rounded-pill bg-ground-deep'
          }
        >
          {state === 'done' ? (
            <Glyph name="check" size={16} tint={color.ink} />
          ) : (
            <Type role="label" tone={state === 'current' ? 'onInk' : 'soft'}>
              {stage.index}
            </Type>
          )}
        </View>

        <View className="flex-1">
          <View className="flex-row items-start justify-between gap-md">
            <Type role="heading" className="flex-1">
              {stage.label}
            </Type>
            {state === 'current' && <Chip tone="budget">Now</Chip>}
            {/* An inline transform, not a `rotate-180` utility: that class appears nowhere
                else in this app and NativeWind does not register it here, so it would have
                been a chevron that silently never turned. The rest of the codebase animates
                this with Reanimated (`Chevron` in the Uday tab); a static flip is enough for
                a row that is already animating its own height. */}
            <View style={{ marginTop: 2, transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
              <Glyph name="chevronDown" size={16} tint={color.inkSoft} />
            </View>
          </View>

          <Type role="body" tone="soft" className="mt-xs">
            {stage.why}
          </Type>

          {stage.isGoal && (
            <View className="mt-md flex-row">
              <Chip tone="streak">The goal</Chip>
            </View>
          )}

          {!open && stage.monthly > 0 && (
            <Type role="caption" tone="faint" className="mt-md">
              {rupees(stage.monthly)} a month
              {stage.monthsToComplete > 0 ? ` · ${duration(stage.monthsToComplete)}` : ''}
            </Type>
          )}

          {open && (
            <>
              {/* The figures the stage was always carrying. A monthly amount with no target beside it
              is half a recommendation — "₹9,948 a month" has nothing to be a fraction of — and it
              was the reason seven stages of six, four and ninety-six months drew as seven
              identical cards. Laid on a hairline-bounded band rather than in a second Card:
              a card inside a card is a box drawn around nothing. */}
              <View className="mt-md border-t border-hairline pt-md">
                <View className="flex-row flex-wrap">
                  {stage.monthly > 0 && fresh(rupees(stage.monthly)) && (
                    <Metric label="Every month" value={rupees(stage.monthly)} />
                  )}
                  {stage.targetAmount > 0 && fresh(rupees(stage.targetAmount)) && (
                    <Metric label={targetLabel(stage.kind)} value={rupees(stage.targetAmount)} />
                  )}
                  {stage.monthsToComplete > 0 && fresh(duration(stage.monthsToComplete)) && (
                    <Metric label="Takes" value={duration(stage.monthsToComplete)} />
                  )}
                  {/* Cadence is the difference between a cost that stops and a cost that does not,
                  and no label anywhere says which this is. A premium goes on being owed after
                  the stage is ticked; a sequential stage hands its money to the next one. */}
                  <Metric
                    label="Then"
                    value={stage.cadence === 'ongoing' ? 'Keeps costing' : 'Frees up'}
                  />
                  {state !== 'done' && stage.startsOn > asOf && (
                    <Metric label="Starts" value={shortDate(stage.startsOn, asOf)} />
                  )}
                </View>

                {fresh(stage.productName) && (
                  <Type role="caption" tone="soft" className="mt-sm">
                    Into {stage.productName}
                  </Type>
                )}

                {fraction !== null && (
                  <View className="mt-md">
                    <Meter
                      fraction={fraction}
                      tone="bg-brand"
                      track="bg-ground-deep"
                      delay={dur.state}
                    />
                    <Type role="caption" tone="faint" className="mt-sm">
                      {rupees(Math.min(achieved ?? 0, stage.targetAmount))} of{' '}
                      {rupees(stage.targetAmount)} standing today
                    </Type>
                  </View>
                )}
              </View>

              {/* The verdict is the point of the whole product, so it is shown on every stage
              that has one — including the ones that passed. "All 9 rules passed" is a
              claim the bank is making, and it belongs on screen next to the advice. */}
              {stage.verdict && (
                <View
                  className={
                    blocked
                      ? 'mt-md rounded-md bg-danger-soft p-md'
                      : 'mt-md rounded-md bg-ground-deep p-md'
                  }
                >
                  <Type role="caption" tone={blocked ? 'danger' : 'brand'}>
                    {blocked ? `BLOCKED · ${stage.verdict.ruleId ?? ''}` : 'SUITABILITY CHECKED'}
                  </Type>
                  <Type role="caption" tone="mid" className="mt-xs">
                    {stage.verdict.spoken ?? stage.verdict.recorded}
                  </Type>
                  {/* `alternative` is an object on the wire and always was. Rendering it as a child
                  put `[object Object]` on screen at best and took the tab down at worst. */}
                  {stage.verdict.alternative && (
                    <Type role="caption" tone="mid" className="mt-xs">
                      Instead: {stage.verdict.alternative.name}
                      {stage.verdict.alternative.monthly > 0
                        ? `, ${rupees(stage.verdict.alternative.monthly)} a month`
                        : ''}
                    </Type>
                  )}
                </View>
              )}

              {/* `completesOn` falls back to `startsOn` whenever `monthsToComplete` is zero
              (packages/core/src/roadmap.ts), and zero months is how a stage says it has no end —
              a card balance growing faster than the payment, for one. Guarding on truthiness
              alone printed "Done by <today>" directly under a label saying it will not clear. */}
              {stage.monthsToComplete > 0 && state !== 'done' && (
                <Type role="caption" tone="faint" className="mt-sm">
                  Done by {shortDate(stage.completesOn, asOf)}
                </Type>
              )}
            </>
          )}
        </View>
      </Tap>

      {/* A sibling of the disclosure, never a child of it. Two pressables inside one another
          hand the touch to whichever wins the responder race, and a customer reaching for a
          link who collapses the stage instead has been lied to by the layout. Out here it is
          its own target, under its own hairline, and it survives the collapse — folded into
          the detail it would be a footnote on the one row where the link is the point.

          The row is already printing the sentence this link answers: `roadmap.ts:512-514` is
          the `why` above, and it tells the customer the mark on their credit file costs them
          more, and for longer, than any return — then stops, with nothing behind it to look
          at. `GateSheet.tsx` opens the same door off the same fact, so it is worded the same
          here: two entrances onto one refusal should not read as two different places. */}
      {onCredit && (
        <Tap
          accessibilityRole="button"
          onPress={onCredit}
          dim
          className="border-t border-hairline px-lg py-md"
        >
          <Type role="caption" tone="brand">
            See what your IDBI file actually shows
          </Type>
        </Tap>
      )}
    </Card>
  )
}

/**
 * The numbers pane for a plan whose goal is clearing a debt.
 *
 * Deliberately not dressed as a projection. There are no scenario tiles and no rate to pick,
 * because none of this is an assumption: the balance, the rate and the payment are all the
 * customer's own, and the only modelling is arithmetic they could check on paper. So it carries
 * no disclaimer — adding one would imply a forecast where there is none.
 *
 * The comparison is the point of the screen. "₹29,878 over 10 months" is a fact with no weight
 * until it sits next to "₹2,48,551 over 14 years", which is what the same balance costs if the
 * minimum is paid instead. That gap is the plan's entire argument, in the customer's own money.
 */
function PayoffPane({ payoff, stage, rate }: { payoff: Payoff; stage: Stage; rate: number }) {
  const saved =
    payoff.minimumTotalInterest === null
      ? null
      : Math.max(0, payoff.minimumTotalInterest - payoff.totalInterest)

  return (
    <>
      <Type role="body" tone="soft">
        Your own balance and your own payment. Nothing here is an assumption.
      </Type>

      <View className="mt-sm rounded-lg bg-hero p-lg">
        <Type role="caption" tone="onInk" className="opacity-85">
          CLEAR IN
        </Type>
        <View className="flex-row items-baseline gap-sm">
          <Count
            value={payoff.months}
            format={(n) => String(Math.round(n))}
            role="display"
            tone="onInk"
            delay={dur.enter}
          />
          <Type role="title" tone="onInk">
            {payoff.months === 1 ? 'month' : 'months'}
          </Type>
        </View>
        <Type role="body" tone="onInk" className="mt-sm opacity-85">
          Paying {rupees(stage.monthly)} a month against {rupees(stage.targetAmount)} at {rate}%.
        </Type>
      </View>

      <Section title="What it costs you" />
      <Card>
        <Row label="The balance itself" value={rupees(stage.targetAmount)} />
        <Row label="Interest on top" value={rupees(payoff.totalInterest)} divide tone="brand" />
        <Row label="Total you will pay" value={rupees(payoff.totalPaid)} divide />
      </Card>

      {/* The counterfactual, and the only reason the figures above mean anything. Rendered only
          when the minimum actually retires the balance — on a balance where it never does,
          "costs ₹∞" is not a sentence, and the honest line is the one in the else branch. */}
      <Section title="If you only paid the minimum" />
      <View className="rounded-lg bg-streak p-lg">
        {payoff.minimumMonths !== null && payoff.minimumTotalInterest !== null ? (
          <>
            <Type role="heading">
              {payoff.minimumMonths} months, and {rupees(payoff.minimumTotalInterest)} in interest
            </Type>
            <Type role="body" className="mt-xs opacity-80">
              That is {duration(payoff.minimumMonths)} instead of {duration(payoff.months)}.
              {saved !== null && saved > 0 ? ` Your plan saves you ${rupees(saved)}.` : ''}
            </Type>
          </>
        ) : (
          <>
            <Type role="heading">It would never clear</Type>
            <Type role="body" className="mt-xs opacity-80">
              At {rate}% the minimum barely covers the interest, so the balance stops falling. That
              is what your plan is getting you out of.
            </Type>
          </>
        )}
      </View>

      <Type role="caption" tone="faint" className="mt-sm">
        Worked out from your balance at {rate}% a year, paying {rupees(stage.monthly)} a month. The
        minimum is taken as 5% of the balance, which is the shape most issuers use.
      </Type>
    </>
  )
}

function ProjectionPane({ view }: { view: ViewModel }) {
  const { roadmap, snapshot } = view
  const { projection } = roadmap
  // Hooks before the early return, because a customer whose plan is "clear the 34.8% card" has
  // no projection at all and React will not accept a pane that calls a different number of hooks
  // depending on which customer logged in.
  const [rate, setRate] = useState(
    projection?.scenarios[Math.min(1, projection.scenarios.length - 1)]?.ratePct ?? 0,
  )

  /*
   * A debt payoff has numbers too — they are just not a compounding curve.
   *
   * `buildRoadmap` only builds a `projection` for a goal that grows, so a customer whose plan
   * *is* "clear the 34.8% card" reached this pane and got a paragraph explaining that there was
   * nothing to show. For Karan that is the entire numbers tab: an empty screen on the tab
   * labelled with the thing he most needs to see.
   *
   * His plan has an arithmetic, and it is a better screen than a projection: how long at this
   * payment, what it costs in total, and — the part that makes the case — what the same balance
   * costs at the issuer's minimum instead. All of it computed off his own balance, none of it a
   * forecast, so it carries no disclaimer and makes no promise.
   */
  const debtStage = roadmap.stages.find((st) => st.kind === 'clear_debt' && st.targetAmount > 0)
  const payoff =
    debtStage && snapshot.debt.highestRate > 0
      ? payoffSummary(debtStage.targetAmount, snapshot.debt.highestRate, debtStage.monthly)
      : null

  if (!projection && payoff && debtStage) {
    return <PayoffPane payoff={payoff} stage={debtStage} rate={snapshot.debt.highestRate} />
  }

  // Nothing is going in yet, so there is nothing to compound. Saying that plainly is the honest
  // screen — a projection off a ₹0 monthly contribution would be a flat line presented as a
  // forecast, which is the kind of number this product exists not to show.
  if (!projection) {
    return (
      <>
        <Type role="title">Nothing to project yet</Type>
        <Type role="body" tone="soft" className="mt-sm">
          Your plan clears the debt first, so nothing is going into this goal yet. Once a stage
          frees up money each month, the numbers show up here.
        </Type>
      </>
    )
  }

  const chosen = projection.scenarios.find((s) => s.ratePct === rate) ?? projection.scenarios[0]
  if (!chosen) return null

  // Three rows that have to add up to the corpus printed above them, which is a definition
  // rather than a layout: it turns on what `Scenario.contributed` counts, and reading that
  // wrong is what made this card net the existing corpus out twice. The rule and the
  // assumption it rests on live in `@dhan/core`, where they are tested.
  const { already, paidIn, growth } = contributionSplit(projection, chosen)

  return (
    <>
      {/* Three rates, all visible, none of them a default the customer did not choose.
          A single projected number reads as a promise; three read as a range, which is
          what it actually is. */}
      <Type role="body" tone="soft">
        Pick a rate. All three are assumptions, not forecasts.
      </Type>

      <View className="flex-row gap-sm">
        {projection.scenarios.map((s) => (
          <ScenarioTile
            key={s.label}
            scenario={s}
            active={s.ratePct === rate}
            onPress={() => setRate(s.ratePct)}
          />
        ))}
      </View>

      {/* The one figure in the app where the motion is the information. Tapping 8% then 12%
          makes the corpus *travel* between two assumptions, which is the honest reading of a
          projection — a range, not a forecast. A number that hard-cut between them would look
          like two separate promises being made in turn. */}
      <View className="mt-sm rounded-lg bg-hero p-lg">
        <Type role="caption" tone="onInk" className="opacity-85">
          AT {chosen.ratePct}% OVER {projection.years} YEARS
        </Type>
        <Count
          value={chosen.corpus}
          format={rupeesShort}
          role="display"
          tone="onInk"
          className="mt-xs"
          delay={dur.enter}
        />
        <Type role="body" tone="onInk" className="mt-sm opacity-85">
          Worth {rupeesShort(chosen.realCorpus)} in today's money, after {projection.inflationPct}%
          inflation.
        </Type>
      </View>

      <Section title="Where that comes from" />
      <Card>
        <Row label="Already invested" value={rupees(already)} />
        <Row
          label={`What you put in over ${projection.years} years`}
          value={rupees(paidIn)}
          divide
        />
        <Row label="Growth on top" value={rupees(growth)} divide tone="brand" />
      </Card>

      <View className="mt-sm">
        <Meter
          fraction={Math.min(1, chosen.contributed / Math.max(1, chosen.corpus))}
          tone="bg-brand"
          track="bg-ground-deep"
          delay={dur.state}
        />
        <Type role="caption" tone="faint" className="mt-sm">
          The filled part is your own money. The rest is the assumed return.
        </Type>
      </View>

      <Section title="Contributing" />
      <Card>
        <Row label="Every month" value={rupees(projection.monthlyContribution)} />
      </Card>

      <View className="mt-md rounded-md bg-ground-deep p-md">
        <Type role="caption" tone="mid">
          {projection.disclaimer}
        </Type>
      </View>
    </>
  )
}

function ScenarioTile({
  scenario,
  active,
  onPress,
}: {
  scenario: Scenario
  active: boolean
  onPress: () => void
}) {
  return (
    <Tap
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${scenario.label}, ${scenario.ratePct} percent`}
      haptic="selection"
      onPress={onPress}
      className={cn(
        'flex-1 items-center rounded-lg border bg-surface px-sm py-md',
        active ? 'border-ink' : 'border-hairline',
      )}
    >
      <Type role="heading" tone={active ? 'ink' : 'soft'}>
        {scenario.ratePct}%
      </Type>
      <Type role="caption" tone="soft" className="mt-xs">
        {scenario.label}
      </Type>
    </Tap>
  )
}

/**
 * What this stage's `targetAmount` actually is, which is a different thing per kind. A cover
 * stage's target is a sum assured, a debt stage's is a balance to retire, and only a buffer or a
 * growth stage is accumulating toward a number. One shared label for all five would be wrong on
 * three of them.
 */
function targetLabel(kind: string): string {
  switch (kind) {
    case 'get_cover':
      return 'Cover'
    case 'clear_debt':
      return 'To clear'
    case 'free_up':
      return 'To free up'
    default:
      return 'Until it reaches'
  }
}

/**
 * One figure in the stage's metric band. Two to a row on a phone, so four figures make a block
 * rather than a column, and the label sits above its value because a label beside a value is a
 * table and a stage is not one.
 */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 pb-md pr-md">
      <Type role="caption" tone="faint">
        {label}
      </Type>
      <Type role="label" className="mt-xs">
        {value}
      </Type>
    </View>
  )
}

/**
 * What the snapshot can honestly say is already standing against a stage's target.
 *
 * Only three of the five kinds have an answer, and the silence on the other two is the point.
 * A cleared-debt stage knows what is left to pay and never what the balance began at, and a
 * freed-up stage has no target at all — so both return null and draw no bar rather than a bar at
 * a number nobody computed. `grow` deliberately reads the projection's own `existingCorpus`
 * rather than total holdings: that is the corpus the roadmap itself counted toward this goal,
 * and every other rupee the customer owns is earmarked elsewhere or earmarked for nothing.
 */
function achievedOn(
  stage: Stage,
  snapshot: ViewModel['snapshot'],
  roadmap: Roadmap,
): number | null {
  switch (stage.kind) {
    case 'build_buffer':
      return snapshot.balances.total
    case 'get_cover':
      return snapshot.protection.lifeCoverInForce
    case 'grow':
      return roadmap.projection?.existingCorpus ?? null
    default:
      return null
  }
}

/** Months, said the way a person would. 372 months is a number nobody holds in their head. */

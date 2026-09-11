/**
 * Plan — the route, and the fact that it gets re-cut.
 *
 * This is what replaces the cut Future Self screen. It has to do the emotional job that an aged
 * photograph was going to do, and it does it differently: by being *specific about the order of
 * operations*. A customer who says "I want to invest" and has a card at 34.8% sees three stages
 * before the investing one, each with the sentence explaining why it comes first.
 *
 * The projection is a band, never a number, with the assumed rate on screen and changeable. That
 * is not a nicety — nobody may present a projected corpus as a fact, and a single confident
 * figure is what a risk officer marks us down for. See `docs/product/decisions.md` §B2.
 *
 * ## What this screen took from Model Portfolios
 *
 * `11-model-portfolios` was scoped out when this was written, on the argument that the roadmap
 * *is* a sequenced basket and a second curated flow would compete with this screen. It was later
 * built as its own surface (`screens/baskets/**`), so only half of that stands. The half that
 * does is the boundary, and both screens now say it out loud: **Plan decides what comes first;
 * a basket decides how the growing money is split once you get there.** `planStance` reads this
 * roadmap and prints that sentence over there, naming whichever stage of *this* customer's route
 * comes ahead of investing. What came across to *this* screen is the **presentation**, in three
 * places.
 *
 * - **The destination is the promo panel's shape.** `02-discover`'s dark card with two benefit
 *   sub-cards under a headline, an under-line and one action. The sub-cards carry what the route
 *   actually gives you — the order of operations, and the refusal — where the source's carried
 *   `Expert Advice` and `High Returns`, two near-identical placeholder strings its own spec flags.
 *   Its social-proof line (`23K+ users gained 13%+ returns in 6 months`) is a claim about other
 *   customers' returns; ours is a fact about this customer's month.
 * - **Every stage lays its figures out as constituents.** `select-basket` gives a scheme a
 *   labelled metric strip — small grey caption over a bold value, two or three across — instead
 *   of a run-on line, and that is the single biggest legibility win available here. `StageCard`
 *   in `plan/parts.tsx` does it with the three columns this app can actually fill.
 * - **State is said at the foot of a card, not floated in it.** `StatusBand`, which is the
 *   reference's primary status treatment and the more distinctive of the two.
 *
 * **Nothing about what the roadmap computes has changed.** Every figure here is the same field
 * off the same `Roadmap` the engine built; this file only draws it differently.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Roadmap, Snapshot, Verdict, View } from '@dhan/contracts'
import { ListOrdered, Scale, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { Button, Card, Eyebrow, Head, Leader, Pill } from '../components/ui.tsx'
import { InfoBanner } from '../components/InfoBanner.tsx'
import { Screen } from '../components/Screen.tsx'
import { approx, dayMonth, inr, monthYear } from '../lib/money.ts'
import { band } from '../lib/projection.ts'
import { StageTrack } from '../components/charts/index.ts'
import { BenefitCards, StageCard } from './plan/parts.tsx'
import { Rebalance } from './plan/Rebalance.tsx'
import type { RebalanceDecisions } from './plan/Rebalance.tsx'
import { detectDrift, STAGE_LABEL } from './plan/drift.ts'

/* Card meta line (the old `.card .meta`) and the small grey note (the old `.note`). */
const META = 'm-0 text-[13px] text-ink-soft'
const NOTE = 'text-xs leading-relaxed text-ink-soft'

const DEFAULT_RATE = 10
/** The engine's assumption when the roadmap carries no projection of its own. */
const DEFAULT_INFLATION_PCT = 5.5

/**
 * What Plan needs to be able to open the rebalancing surface.
 *
 * Additive and optional on purpose. `App.tsx` renders this screen with `snapshot`, `roadmap` and
 * `asOf` today, and two other agents are working in the same tree — so the wiring is one new prop
 * rather than a changed signature, and nothing here breaks while it is absent. Left out, the
 * drift banner and the rebalancing route are simply not drawn.
 */
export interface PlanRebalance {
  view: View
  /** The suitability gate, injected. `askBackend.evaluate` in `App.tsx`, as Discover passes it. */
  evaluate: (productId: string, monthly: number) => Promise<Verdict>
  onSeeRecord: () => void
  decisions?: RebalanceDecisions | undefined
}

export function Plan({
  snapshot,
  roadmap,
  asOf,
  onEditGoal,
  onRefresh,
  rebalance,
}: {
  snapshot: Snapshot
  roadmap: Roadmap
  asOf: string
  /** The plan offers to move the target in words; this is where it actually happens. */
  onEditGoal: () => void
  /** Pull down at the top to re-read the view. */
  onRefresh: () => Promise<void>
  /** Given, the route into `plan/Rebalance.tsx`. See `PlanRebalance`. */
  rebalance?: PlanRebalance | undefined
}): ReactNode {
  const [rate, setRate] = useState(DEFAULT_RATE)
  const [rebalancing, setRebalancing] = useState(false)

  const growth = roadmap.stages.find((s) => s.kind === 'grow')
  /** The customer inflated the target themselves, so every figure it is read against is nominal. */
  const atHorizon = roadmap.goal.amountBasis === 'at_horizon'
  const contribution = roadmap.projection?.monthlyContribution ?? growth?.monthly ?? 0
  const years =
    roadmap.projection?.years ?? Math.max(1, Math.round((growth?.monthsToComplete ?? 360) / 12))
  const existing = roadmap.projection?.existingCorpus ?? snapshot.holdings.equity
  const inflationPct = roadmap.projection?.inflationPct ?? DEFAULT_INFLATION_PCT
  const scenarios = band(
    contribution,
    years,
    existing,
    [
      { label: 'Cautious', ratePct: Math.max(2, rate - 4) },
      { label: 'Assumed', ratePct: rate },
      { label: 'Optimistic', ratePct: rate + 2 },
    ],
    inflationPct,
    roadmap.disclaimer,
  ).scenarios
  const mid = scenarios[1]

  /* The drift the app can prove, so a stage that is off says so where the stage is. Computed
     here rather than inside each card: it is one pass over the roadmap, not one per stage. */
  const drifts = detectDrift(roadmap, snapshot)
  const driftFor = (index: number): (typeof drifts)[number] | undefined =>
    drifts.find((d) => d.stage?.index === index)

  if (rebalancing && rebalance) {
    return (
      <Rebalance
        view={rebalance.view}
        evaluate={rebalance.evaluate}
        onSeeRecord={rebalance.onSeeRecord}
        onBack={() => setRebalancing(false)}
        {...(rebalance.decisions ? { decisions: rebalance.decisions } : {})}
      />
    )
  }

  return (
    <Screen
      header={
        <Head
          title="Plan"
          sub={`${roadmap.goal.purpose ?? 'Your goal'} · version ${roadmap.version}`}
        />
      }
      notice={
        rebalance && drifts.length > 0 ? (
          <InfoBanner
            tone={drifts.some((d) => d.severity === 'bad') ? 'danger' : 'clay'}
            action="Rebalance"
            onAction={() => setRebalancing(true)}
          >
            {drifts.length === 1
              ? `${drifts[0]?.title}.`
              : `${drifts.length} things have moved away from what this plan was built on.`}
          </InfoBanner>
        ) : null
      }
      onRefresh={onRefresh}
    >
      {/* ------------------------------------------------ Destination */}
      <div className="mt-3">
        <BenefitCards
          art="hero-plan"
          eyebrow="Where you are going"
          benefits={[
            {
              icon: <ListOrdered size={18} strokeWidth={2} />,
              title: 'In order',
              body: 'Each step needs the one before it, and says why.',
            },
            {
              icon: <ShieldCheck size={18} strokeWidth={2} />,
              title: 'Checked, then placed',
              body: 'Anything it proposes runs past the suitability rules first.',
            },
          ]}
          note={
            roadmap.feasible
              ? `${inr(roadmap.monthlyCommitment)} a month, starting now.`
              : `${inr(roadmap.shortfallMonthly)} a month short at your present pace.`
          }
          /* Filled, and orange. The source's promo card ends in a filled periwinkle CTA and
             `DESIGN.md` is explicit that a primary stays orange on an ink card — a white-filled
             secondary pill on a dark green ground is neither the reference's shape nor ours. */
          action={
            <Button full onClick={onEditGoal}>
              <SlidersHorizontal size={16} strokeWidth={2.5} />
              Change the target
            </Button>
          }
        >
          {/* "₹2.18 crore" is a number somebody can hold in their head; ₹2,18,00,000 is a number
              they have to count the digits of — and at eleven digits it ran off the card. */}
          <div className="mb-1 mt-3 text-[34px] font-bold leading-none tracking-tight tabular-nums text-on-dark">
            {approx(roadmap.goal.targetAmount)}
          </div>
          {/* Which money the figure above is in, said rather than assumed. It used to read
              "in today's money" unconditionally, which was true of every goal the engine could
              hold; a customer who takes the inflation adjustment on the create screen is now
              stating a target in the rupees of the year it lands, and a card that called that
              today's money would be wrong by three decades of prices. */}
          <p className="m-0 text-[13px] text-on-dark/80">
            {roadmap.goal.purpose} by {monthYear(roadmap.goal.targetDate)},{' '}
            {atHorizon ? `in ${roadmap.goal.targetDate.slice(0, 4)} rupees` : 'in today’s money'}
          </p>
          {/* The three ways out — push the date, lower the target, find the difference — used to
              be spelled out here too. The growing stage below says them already, one scroll down,
              with the two figures beside them. Twice on one screen is once too many. */}
        </BenefitCards>
      </div>

      {/* ------------------------------------------------ The route */}
      <Eyebrow>
        The route · {roadmap.stages.length} {roadmap.stages.length === 1 ? 'stage' : 'stages'}
      </Eyebrow>
      {/*
        The route on one time axis, above the cards that detail it.

        The numbered spine below says the *order*; what it cannot say is the *shape* — that
        getting covered is over in a month and growing into the goal runs thirty-one years, drawn
        at thirty-one times the length — or what each of those costs while it runs. Every card
        below carries its own month and its own figure, but they are in separate boxes a scroll
        apart, and "₹985 for one month against ₹9,948 for three decades" is a comparison, not a
        pair of facts. The comparison is the only thing here that is new, so the track carries the
        two columns it needs for one and nothing else: no dates per lane, because the axis ends
        name the span and the card names the month. One stage has nothing to compare against, and
        draws nothing.
      */}
      {roadmap.stages.length > 1 ? (
        <div className="mb-4">
          <StageTrack
            asOf={asOf}
            from={monthYear(roadmap.stages[0]?.startsOn ?? asOf)}
            to={monthYear(roadmap.completesOn)}
            stages={roadmap.stages.map((stage) => ({
              key: String(stage.index),
              /* The kind, not `stage.label` — the label is a sentence with the figures in it
                 ("Enough to stop working at 60: ₹2,20,00,000 by September 2057") and a lane is
                 about 200px wide. */
              label: STAGE_LABEL[stage.kind],
              startsOn: stage.startsOn,
              completesOn: stage.completesOn,
              /* A stage with nothing going into it — one that only frees money up, or one queued
                 behind another — gets no figure rather than a zero. */
              ...(stage.monthly > 0 ? { figure: inr(stage.monthly) } : {}),
            }))}
          />
        </div>
      ) : null}
      {roadmap.stages.map((stage, i) => {
        const drift = driftFor(stage.index)
        return (
          <StageCard
            key={stage.index}
            stage={stage}
            last={i === roadmap.stages.length - 1}
            /* The band carries the state and nothing else. The sentence behind it is already
               one tap away — the ⓘ opens rebalancing, where the same drift is laid out with
               the two figures under it — and printing it here too puts the same paragraph
               twice on one card, directly under the stage's own `why`. */
            {...(drift
              ? {
                  status: {
                    tone: drift.severity === 'bad' ? ('bad' as const) : ('warn' as const),
                    label: drift.title,
                  },
                }
              : {})}
            {...(drift && rebalance ? { onStatusInfo: () => setRebalancing(true) } : {})}
          />
        )
      })}

      {/* ------------------------------------------------ Projection */}
      {contribution > 0 ? (
        <>
          <Eyebrow>If you keep it up</Eyebrow>
          <Card>
            {/*
             * Whichever money the target is in leads, because the target is the last row of the
             * list below and the two have to be comparable.
             *
             * For a target in today's money that is the real-terms corpus: quoting the nominal
             * figure first invites someone to read ₹3.15 crore against a ₹2.18 crore target and
             * conclude they are ahead. For a target the customer inflated to the year it lands
             * the same reasoning runs the other way — a real-terms corpus under a nominal target
             * reads as a shortfall that is not there — so the nominal figure leads instead and
             * the other one is the aside.
             */}
            <h2>{approx((atHorizon ? mid?.corpus : mid?.realCorpus) ?? 0)}</h2>
            <p className={META}>
              {atHorizon
                ? `in ${Number(asOf.slice(0, 4)) + years} rupees, after ${years} years at an assumed ${rate}% — which is `
                : `in today’s money, after ${years} years at an assumed ${rate}% — which is `}
              {approx((atHorizon ? mid?.realCorpus : mid?.corpus) ?? 0)}
              {atHorizon ? ' in today’s money' : ` in ${Number(asOf.slice(0, 4)) + years} rupees`}
            </p>

            <div className="mb-1.5 mt-[18px]">
              {scenarios.map((sc) => (
                <Leader
                  key={sc.label}
                  label={`${sc.label} · ${sc.ratePct}%`}
                  value={approx(atHorizon ? sc.corpus : sc.realCorpus)}
                  filled={sc.ratePct === rate}
                />
              ))}
              <Leader label="Of which you put in" value={approx(mid?.contributed ?? 0)} />
              <Leader label="Your target" value={approx(roadmap.goal.targetAmount)} total />
            </div>

            <label className="mt-4 block text-[12.5px] text-ink-soft">
              Assumed annual return
              <input
                type="range"
                min={4}
                max={14}
                step={0.5}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="mt-2 block w-full accent-accent"
              />
            </label>

            <p className={`${NOTE} mb-0 mt-1.5`}>{roadmap.disclaimer}</p>
          </Card>
        </>
      ) : null}

      {/* ------------------------------------------------ Recalculation */}
      <Eyebrow>Why this version</Eyebrow>
      <Card>
        <div className="mb-2.5 flex flex-wrap gap-2">
          <Pill>Version {roadmap.version}</Pill>
          <Pill>{dayMonth(roadmap.createdAt)}</Pill>
          {drifts.length === 0 ? <Pill tone="ok">Still on its own figures</Pill> : null}
        </div>
        <p className="m-0 text-[15px] leading-normal text-ink">{roadmap.reasonForChange}</p>
        <p className={`${NOTE} mb-0 mt-3`}>
          Every version is kept with the reason it changed and the figures it was built on, so the
          advice stays auditable.
        </p>
      </Card>

      {rebalance ? (
        <Card tint="sky">
          <h2>
            <Scale size={19} strokeWidth={2.2} className="mr-1.5 inline-block align-[-3px]" />
            Check this plan against your month
          </h2>
          <p className="m-0 mt-2 text-sm leading-relaxed text-ink-mid">
            {drifts.length === 0
              ? 'Nothing has moved since this version was cut. See which checks say so.'
              : 'Where the money is meant to go, against where your statements show it going.'}
          </p>
          <div className="mt-4">
            <Button full tone="secondary" onClick={() => setRebalancing(true)}>
              Open rebalancing
            </Button>
          </div>
        </Card>
      ) : null}
    </Screen>
  )
}

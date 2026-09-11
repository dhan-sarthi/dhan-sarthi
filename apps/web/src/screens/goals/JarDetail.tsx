/**
 * One jar, opened.
 *
 * The reference never filmed this screen — `flows/04-smart-jars.md` lists "jar detail" among the
 * things the 74 seconds do not contain, and the jar card's chevron in `12-rebalancing` goes to an
 * `unknown`. So the layout is the reference's grammar (hero figure, band, cards) around the four
 * questions this app can actually answer about a pot: how full it is, what is going in, where
 * that lands against the target, and why the pot is on the route at all.
 *
 * The last one is the difference from a distribution app. `stage.why` is the engine's own
 * sentence — *"nothing on the shelf returns 34.8% a year, so every rupee that goes here beats
 * every rupee that goes anywhere else"* — and it is why a customer is looking at a debt jar
 * before an investing one. Hiding it behind an ⓘ nobody presses would waste the best thing on
 * the screen, so it is a card.
 */
import type { ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { Projection, Roadmap, Snapshot } from '@dhan/contracts'
import { Screen } from '../../components/Screen.tsx'
import { StatusBand } from '../../components/StatusBand.tsx'
import { Bar, Button, Card, Head, Leader, Pill } from '../../components/ui.tsx'
import { GrowthCard } from '../../components/charts/index.ts'
import { approx, inr, monthYear } from '../../lib/money.ts'
import { band } from '../../lib/projection.ts'
import { STAGE_ICON } from './dreams.ts'
import {
  DEPOSIT_RATE_PCT,
  fundingRatePct,
  INFLATION_PCT,
  monthsBetween,
  share,
  statusLabel,
  statusTone,
} from './jar.ts'
import type { Jar } from './jar.ts'

/** Contracts exports the projection but not one line of its band; this is that line. */
type Scenario = Projection['scenarios'][number]

export function JarDetail({
  jar,
  roadmap,
  snapshot,
  asOf,
  onBack,
  onEditTarget,
}: {
  jar: Jar
  roadmap: Roadmap
  snapshot: Snapshot
  asOf: string
  onBack: () => void
  /** Only the goal jar has a target the customer chose; the others are the engine's. */
  onEditTarget?: (() => void) | undefined
}): ReactNode {
  const stage = jar.stage
  const years = monthsBetween(asOf, jar.by) / 12
  const existing = jar.achieved ?? 0
  /*
   * Only the goal stage can be market-linked. A buffer goes into a sweep-in deposit whatever the
   * goal at the end of the route is, so reading the goal's rate here would illustrate a sweep
   * account at 10% for a customer whose goal happens to be retirement. Deposit rate, and the
   * scenario is labelled `Contractual` — which is what `buildRoadmap` calls it too, because the
   * rate is in a contract rather than in an assumption.
   */
  const marketLinked =
    jar.kind === 'grow' &&
    (roadmap.goal.kind === 'wealth_target' || roadmap.goal.kind === 'retirement')
  const ratePct = marketLinked ? fundingRatePct(roadmap.goal, years) : DEPOSIT_RATE_PCT

  /*
   * The server's own band for the goal, and a single-rate illustration for the rest.
   *
   * The goal's projection was computed by the engine against the snapshot the plan was cut on,
   * so it is quoted rather than recomputed. A buffer or a debt jar has no band at all — the
   * engine funds them at a contractual rate and does not project them — so where one is drawn
   * here it says so, at one rate, with the same disclaimer.
   */
  const projection: Projection | null =
    jar.isGoal && roadmap.projection
      ? roadmap.projection
      : jar.monthly > 0
        ? band(
            jar.monthly,
            years,
            existing,
            [{ label: marketLinked ? 'Assumed' : 'Contractual', ratePct }],
            INFLATION_PCT,
            roadmap.disclaimer,
          )
        : null

  const scenarios: Scenario[] = projection?.scenarios ?? []
  const lands = scenarios[Math.min(1, scenarios.length - 1)]
  /*
   * The shortfall, in the money the target is quoted in.
   *
   * This used to be `jar.target - lands.corpus`, and that was the wrong subtraction: a target the
   * customer set today is in today's rupees and `corpus` is in the rupees of the year it lands,
   * so a ₹2.20 crore goal came out "cleared" by a ₹2.79 crore projection that is worth ₹53.1
   * lakh. `Plan` has always read it the other way and so does the engine — `buildRoadmap` sizes
   * the contribution against a real return, which is why it asks for ₹26,555 a month where the
   * nominal arithmetic would ask for ₹7,826 — so the two screens were disagreeing about the same
   * goal. Drawing the curve is what made it visible; correcting it is what lets the curve be
   * drawn under a true sentence.
   */
  const shortBy = lands ? Math.max(0, jar.target - lands.realCorpus) : 0
  /*
   * Only a band gets drawn. `GrowthCard` separates its three lines by weight and dash — the
   * expected rate solid, what you put in dashed, the cautious-to-optimistic spread as a wash
   * between them — and with one scenario the wash has no width and its key row reads "if it runs
   * 7% to 7%". A jar the engine funds at a contractual rate has no band by construction
   * (`buildRoadmap` gives it one rate), so that jar keeps the list it already had, which is the
   * right shape for one number anyway.
   */
  const banded = projection !== null && scenarios.length > 1

  return (
    <Screen
      header={
        <Head
          onBack={onBack}
          title={jar.name}
          sub={
            jar.dated
              ? `Target of ${approx(jar.target)} by ${monthYear(jar.by)}`
              : `${approx(jar.target)} outstanding, and growing`
          }
          /* `06-jar-investment-details.png` puts the jar's own illustration on a white tile at
             the right of the hero, opposite the title and the target line, and it is the one
             thing that makes the screen belong to this jar rather than to any jar. The picture
             comes from the stage kind: nothing on the record says which dream the target was
             named after, because nothing on the record can (`dreams.ts`). */
          right={
            <span
              aria-hidden="true"
              className="grid size-12 flex-none place-items-center overflow-hidden rounded-sm bg-surface shadow-card"
            >
              <img
                src={`/icons/${STAGE_ICON[jar.kind] ?? 'goal-wealth'}.png`}
                alt=""
                width={224}
                height={224}
                decoding="async"
                className="size-9 select-none object-contain"
              />
            </span>
          }
        />
      }
    >
      {/* ------------------------------------------------ How full it is */}
      <Card tint="sage">
        {jar.achieved === null ? (
          <>
            <h2>{approx(jar.target)} outstanding</h2>
            <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">
              What is left, not what has been paid. Your statements show the balance and the
              repayments, not the principal you started with — so there is no share to draw.
            </p>
          </>
        ) : (
          <>
            <div className="text-[34px] font-bold leading-none tracking-tight tabular-nums text-ink">
              {approx(jar.achieved)}
            </div>
            <p className="m-0 mt-1.5 text-[13px] text-ink-soft">
              of {approx(jar.target)} · {share(jar.fraction ?? 0)}
            </p>
            <div className="mt-3.5">
              <Bar used={(jar.fraction ?? 0) * 100} />
            </div>
          </>
        )}
        <StatusBand
          tone={statusTone(jar.status)}
          label={statusLabel(jar.status)}
          {...(jar.status === 'queued'
            ? {
                children: `It starts ${monthYear(stage.startsOn)}, once the jar before it is done.`,
              }
            : jar.status === 'attention' && jar.isGoal && roadmap.shortfallMonthly > 0
              ? {
                  children: `${inr(roadmap.shortfallMonthly)} a month more than there is spare would be needed to reach it on time.`,
                }
              : {})}
        />
      </Card>

      {/* ------------------------------------------------ What funds it */}
      <Card>
        <h2>What is funding it</h2>
        {jar.monthly > 0 ? (
          <div className="mb-1.5 mt-2.5">
            <Leader filled label="Each month" value={inr(jar.monthly)} />
            {stage.productName ? <Leader label="Into" value={stage.productName} /> : null}
            <Leader label="Running from" value={monthYear(stage.startsOn)} />
            {/* No completion date on a balance the payment does not beat. See `Jar.dated`. */}
            {jar.dated ? <Leader total label="Finishes" value={monthYear(jar.by)} /> : null}
          </div>
        ) : (
          <p className="m-0 mt-2 text-[13.5px] leading-relaxed text-ink-mid">
            Nothing is going in yet.{' '}
            {jar.running
              ? 'Nothing is spare once the commitments and a normal month are out, so the plan has committed nothing to this.'
              : `The jar in front has the money until ${monthYear(stage.startsOn)}. One at a time on purpose — a small surplus split four ways finishes nothing.`}
          </p>
        )}
        {stage.verdict?.verdict === 'PASS' ? (
          <div className="mt-3">
            <Pill tone="ok">
              <CheckCircle2 size={13} strokeWidth={2.6} />
              Suitability passed
            </Pill>
          </div>
        ) : null}
        {onEditTarget ? (
          <div className="mt-4">
            <Button tone="secondary" size="sm" onClick={onEditTarget}>
              Change this target
            </Button>
          </div>
        ) : null}
      </Card>

      {/* ------------------------------------------------ Against the projection */}
      {lands && jar.dated ? (
        <Card tint="sky">
          {/*
            Three rates and a contribution over thirty-one years was five figures in a column and
            no shape at all: the thing a customer wants off this card is how far apart the
            cautious and the optimistic line get, and how much of the end figure is growth rather
            than money they put in. Both of those are the picture and neither is the list, so the
            list is gone and the four figures that were in it are the chart's own key, at the
            weight and dash of the mark each one names.

            The disclaimer stays in the card's voice underneath. `DESIGN.md` is explicit that it
            belongs to the card and not to the chart, and `GrowthCard` deliberately does not
            carry it.
          */}
          {banded && projection ? (
            <GrowthCard projection={projection} to={monthYear(jar.by)} />
          ) : (
            <>
              <h2>{approx(lands.corpus)}</h2>
              {/* The today's-money translation used to run on the end of this line and now runs
                  under the target below, where the comparison it is for actually happens. */}
              <p className="m-0 mt-1.5 text-[13px] text-ink-soft">
                by {monthYear(jar.by)} at {marketLinked ? 'an assumed' : 'a contractual'}{' '}
                {lands.ratePct}%
              </p>
              <div className="mb-1.5 mt-4">
                <Leader label="Of which you put in" value={approx(lands.contributed)} />
              </div>
            </>
          )}
          <div className={banded ? 'mt-1' : 'mb-1.5'}>
            <Leader total label="Target" value={approx(jar.target)} />
          </div>
          {/* Everything the chart draws is in the rupees of {jar.by}; the target is in today's.
              One line carries the conversion and the verdict, because a card that shows both
              numbers and does not say they are different kinds of number is the trap. */}
          <p className="mb-0 mt-1 text-[13.5px] leading-snug text-ink">
            {approx(lands.corpus)} in {jar.by.slice(0, 4)} is about {approx(lands.realCorpus)} in
            today&rsquo;s money —{' '}
            {shortBy > 0
              ? `about ${approx(shortBy)} short of the target ${banded ? 'on the middle line' : 'at that rate'}.`
              : `which clears the target ${banded ? 'on the middle line' : 'at that rate'}.`}
          </p>
          <p className="mb-0 mt-3 text-xs leading-relaxed text-ink-soft">{roadmap.disclaimer}</p>
        </Card>
      ) : null}

      {/* ------------------------------------------------ Why it is here */}
      <Card tint="clay">
        <h2>Why this jar is here</h2>
        <p className="m-0 mt-2 text-[14px] leading-relaxed text-ink-mid">{stage.why}</p>
        {!jar.isGoal ? (
          <p className="mb-0 mt-3 text-xs leading-relaxed text-ink-soft">
            You did not create this one and cannot delete it. Your statements put it in front of{' '}
            {roadmap.goal.purpose ?? 'your goal'}; it comes off the route when it is done, not when
            it is dismissed.
          </p>
        ) : jar.target !== roadmap.goal.targetAmount ? (
          /* The buffer case, and it is not a bug in either number: `suggestGoal` proposes six
             months of breathing room, `buildRoadmap` aims at the three-month floor first because
             that is the line the suitability gate holds everything else behind. Two figures on
             one jar is confusing exactly until somebody says which is which. */
          <p className="mb-0 mt-3 text-xs leading-relaxed text-ink-soft">
            Your goal asks for {approx(roadmap.goal.targetAmount)}. This stage aims at{' '}
            {approx(jar.target)} first — the floor the rest of the plan waits on, and the point
            anything with a lock-in can be recommended.
          </p>
        ) : null}
      </Card>

      {snapshot.quality.monthsOfHistory < 3 ? (
        <Card>
          <h2>Read from {snapshot.quality.monthsOfHistory} months of statements</h2>
          <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed text-ink-mid">
            Short history makes every figure above a wider guess than it looks.
          </p>
        </Card>
      ) : null}
    </Screen>
  )
}

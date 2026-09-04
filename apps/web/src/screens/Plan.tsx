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
 * Three surfaces, three roles, and nothing nested inside anything:
 *
 *   the destination   the green panel with the bank's wave — the one thing on this screen
 *   the route         bare rows threaded on a spine; the order *is* the content
 *   the band          one hairline card with a legend chip, because it is evidence
 *   this version      no container at all
 *
 * The route used to be five cards in a list, each the same radius and padding as the projection
 * card above it and the destination card above that. Five identical rounded blocks is how a plan
 * stops reading as a sequence and starts reading as a menu.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Roadmap, Snapshot, Stage } from '@dhan/contracts'
import { Eyebrow, Head, HeroPanel, Leader, Pill } from '../components/ui.tsx'
import { approx, dayMonth, inr, monthYear } from '../lib/money.ts'
import { riseDelay, useCountUp } from '../lib/motion.ts'
import { band } from '../lib/projection.ts'

/* A quiet sub-line under a row, and the small grey footnote. */
const META = 'm-0 text-[13px] text-ink-soft'
const NOTE = 'text-xs leading-relaxed text-ink-soft'

/* The GO Mobile+ section legend: a chip sitting on the card's own top edge. Used once here,
   on the only card this screen has. */
const LEGEND =
  'absolute -top-2 left-3.5 rounded-pill bg-legend-chip px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand'

const DEFAULT_RATE = 10
/** The engine's assumption when the roadmap carries no projection of its own. */
const DEFAULT_INFLATION_PCT = 5.5

export function Plan({
  snapshot,
  roadmap,
  asOf,
}: {
  snapshot: Snapshot
  roadmap: Roadmap
  asOf: string
}): ReactNode {
  const [rate, setRate] = useState(DEFAULT_RATE)
  const growth = roadmap.stages.find((s) => s.kind === 'grow')
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
  // The target resolves in front of you when the plan is re-cut, because it *was* recomputed.
  const target = useCountUp(roadmap.goal.targetAmount)

  return (
    <>
      <Head
        title="Plan"
        sub={`${roadmap.goal.purpose ?? 'Your goal'} · version ${roadmap.version}`}
      />

      <div className="scroll">
        <div className="mt-3" />

        {/* ------------------------------------------------ Destination
            The one thing, and the only surface on this screen shaped like this. The shortfall
            sits on the same panel as the target because a destination you cannot reach at your
            present pace is one fact, not two — and burying the second half in a note underneath
            is how a plan quietly becomes a sales page. */}
        <HeroPanel
          label="Where you are going"
          meta={`${roadmap.goal.purpose ?? ''} by ${monthYear(roadmap.goal.targetDate)}`}
          settled={roadmap.goal.targetAmount}
          footer={
            <>
              <p className="m-0 text-[17px] font-semibold leading-snug tabular-nums">
                {roadmap.feasible
                  ? `${inr(roadmap.monthlyCommitment)} a month, starting now.`
                  : `${inr(roadmap.shortfallMonthly)} a month short at your present pace.`}
              </p>
              {!roadmap.feasible ? (
                <p className="mb-0 mt-2 text-[13.5px] leading-normal text-on-dark/75">
                  I would rather show you that than move the number until it fits. We can push the
                  date, lower the target, or find the difference in your spending — and the last one
                  is usually the least painful.
                </p>
              ) : null}
            </>
          }
        >
          {/* "₹2.18 crore" is a number somebody can hold in their head; ₹2,18,00,000 is a number
              they have to count the digits of — and at eleven digits it ran off the card. */}
          <div className="text-[34px] font-bold leading-none tracking-tight tabular-nums">
            {approx(target)}
          </div>
          <p className="mb-0 mt-2 text-sm text-on-dark/75">in today&rsquo;s money</p>
        </HeroPanel>

        {/* ------------------------------------------------ The route
            Rows on a spine, not cards. The stages are a sequence; giving each one its own
            container made them read as five interchangeable offers. */}
        <Eyebrow>The route · {roadmap.stages.length} stages</Eyebrow>
        {roadmap.stages.map((stage, i) => (
          <StageRow
            key={stage.index}
            stage={stage}
            index={i}
            last={i === roadmap.stages.length - 1}
          />
        ))}

        {/* ------------------------------------------------ Projection
            The one card on the screen, because a band with a control in it genuinely is a
            container: three scenarios, what you put in, what you are aiming at, and the rate
            you can move. Evidence, presented as evidence. */}
        {contribution > 0 ? (
          <section className="relative mb-3 mt-6 min-w-0 rounded-md border border-solid border-hairline bg-surface p-4 pt-5">
            <span className={LEGEND}>If you keep it up</span>

            {/* Today's money leads, because the goal above is stated in today's money and the
                two have to be comparable. Quoting the nominal figure first invites someone to
                read ₹3.15 crore against a ₹2.18 crore target and conclude they are ahead. It is
                deliberately half the size of the panel's figure: this is the working, not the
                headline. */}
            <div className="text-[18px] font-semibold leading-none tracking-tight tabular-nums text-ink">
              {approx(mid?.realCorpus ?? 0)}
            </div>
            <p className={`${META} mt-2`}>
              in today&rsquo;s money, after {years} years at an assumed {rate}% — which is{' '}
              {approx(mid?.corpus ?? 0)} in {Number(asOf.slice(0, 4)) + years} rupees
            </p>

            <div className="mt-[18px]">
              {scenarios.map((sc) => (
                <Leader
                  key={sc.label}
                  label={`${sc.label} · ${sc.ratePct}%`}
                  value={approx(sc.realCorpus)}
                  filled={sc.ratePct === rate}
                />
              ))}
            </div>
            {/* The rule separates what the band produces from what it is being measured against. */}
            <div className="mt-1.5 border-0 border-t border-solid border-hairline-mint pt-0.5">
              <Leader label="Of which you put in" value={approx(mid?.contributed ?? 0)} />
              <Leader label="Your target" value={approx(roadmap.goal.targetAmount)} />
            </div>

            <label className="mt-4 block border-0 border-t border-solid border-hairline-mint pt-3.5 text-[12.5px] text-ink-soft">
              Assumed annual return — change it and see
              <input
                type="range"
                min={4}
                max={14}
                step={0.5}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="mt-2.5 block w-full accent-accent"
              />
            </label>

            <p className={`${NOTE} mb-0 mt-3`}>{roadmap.disclaimer}</p>
          </section>
        ) : null}

        {/* ------------------------------------------------ Recalculation
            No container. It is the colophon of the screen, not a claim. */}
        <Eyebrow>Why this version</Eyebrow>
        <div className="flex flex-wrap gap-2">
          <Pill>Version {roadmap.version}</Pill>
          <Pill>{dayMonth(roadmap.createdAt)}</Pill>
        </div>
        <p className="m-0 mt-2.5 text-[15px] leading-normal text-ink">{roadmap.reasonForChange}</p>
        <p className={`${NOTE} mb-0 mt-3`}>
          Every version of this plan is kept, with the reason it changed and the figures it was
          built on. That record is what makes the advice auditable five years from now — and it is
          the same record that lets the plan learn what you actually do.
        </p>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Stage */

const STAGE_LABEL: Record<Stage['kind'], string> = {
  free_up: 'Free up money',
  get_cover: 'Get covered',
  clear_debt: 'Clear the debt',
  build_buffer: 'Build the buffer',
  grow: 'Grow it',
}

/*
 * One stage: a numbered disc on the spine, the stage, what it costs a month, and what
 * suitability said about it. No card — the spine is the only structure the sequence needs.
 *
 * The disc carries the state: green for a step on the way, orange for the goal itself, and red
 * when suitability blocked it. A blocked stage that looked exactly like a passing one was the
 * worst thing on this screen: the check ran, the customer was never told.
 */
function StageRow({
  stage,
  index,
  last,
}: {
  stage: Stage
  index: number
  last: boolean
}): ReactNode {
  const [open, setOpen] = useState(stage.index === 1)
  const blocked = stage.verdict?.verdict === 'BLOCKED'

  return (
    <div className="rise flex gap-3.5" style={riseDelay(index)}>
      {/* The spine. Makes the order the point rather than a detail. */}
      <div className="flex flex-none flex-col items-center">
        <span
          className={`grid size-7 place-items-center rounded-pill text-[12.5px] font-bold text-white ${
            blocked ? 'bg-danger' : stage.isGoal ? 'bg-accent' : 'bg-brand'
          }`}
        >
          {stage.index}
        </span>
        {!last ? <span className="mt-2 w-0.5 flex-1 rounded-pill bg-hairline-mint" /> : null}
      </div>

      {/* pt-[3px] centres the title's line box on the 28px disc rather than top-aligning it. */}
      <div className={`min-w-0 flex-1 pt-[3px] ${last ? 'pb-1' : 'pb-5'}`}>
        <div className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 text-[15.5px] font-semibold leading-snug text-ink">
            {stage.label}
          </span>
          {stage.monthly > 0 ? (
            <span className="shrink-0 text-right leading-none">
              <span className="block text-[15px] font-semibold tabular-nums text-ink">
                {inr(stage.monthly)}
              </span>
              <span className="mt-1 block text-[11px] text-ink-soft">a month</span>
            </span>
          ) : null}
        </div>

        {stage.productName ? <p className={`${META} mt-1`}>{stage.productName}</p> : null}

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill tone={stage.isGoal ? 'warn' : 'plain'}>{STAGE_LABEL[stage.kind]}</Pill>
          {stage.cadence === 'ongoing' ? <Pill>Ongoing</Pill> : null}
          {stage.verdict?.verdict === 'PASS' ? <Pill tone="ok">Suitability passed</Pill> : null}
          {blocked ? <Pill tone="bad">Suitability blocked</Pill> : null}
        </div>

        {open ? (
          <p className="mb-0 mt-2.5 text-sm leading-relaxed text-ink-mid">{stage.why}</p>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1.5 h-9 border-0 bg-transparent px-0 text-[13px] font-medium text-brand underline underline-offset-2 transition-transform duration-100 active:scale-[0.985]"
        >
          {open ? 'Hide' : 'Why this first?'}
        </button>
      </div>
    </div>
  )
}

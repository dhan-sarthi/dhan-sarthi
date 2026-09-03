/**
 * Plan — the route, and the fact that it gets re-cut.
 *
 * This is what replaces the cut Future Self screen. It has to do the emotional job that an aged
 * photograph was going to do, and it does it differently: by being *specific about the order of
 * operations*. A customer who says "I want to invest" and has a card at 42% sees three stages
 * before the investing one, each with the sentence explaining why it comes first.
 *
 * The projection is a band, never a number, with the assumed rate on screen and changeable. That
 * is not a nicety — nobody may present a projected corpus as a fact, and a single confident
 * figure is what a risk officer marks us down for. See `docs/product/decisions.md` §B2.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Roadmap, Snapshot, Stage } from '@dhan/contracts'
import { Card, Eyebrow, Head, Leader, Pill } from '../components/ui.tsx'
import { approx, dayMonth, inr, monthYear } from '../lib/money.ts'
import { band } from '../lib/projection.ts'

/* Card meta line (the old `.card .meta`) and the small grey note (the old `.note`). */
const META = 'm-0 text-[13px] text-ink-soft'
const NOTE = 'text-xs leading-relaxed text-ink-soft'

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

  return (
    <>
      <Head
        title="Plan"
        sub={`${roadmap.goal.purpose ?? 'Your goal'} · version ${roadmap.version}`}
      />

      <div className="scroll">
        {/* ------------------------------------------------ Destination */}
        <div className="mt-3">
          <Card tint="sky">
            <h2>Where you are going</h2>
            <p className={META}>
              {roadmap.goal.purpose} by {monthYear(roadmap.goal.targetDate)}
            </p>
            {/* "₹2.18 crore" is a number somebody can hold in their head; ₹2,18,00,000 is a
              number they have to count the digits of — and at eleven digits it ran off the card. */}
            <div className="mb-1 mt-3.5 text-[34px] font-bold leading-none tracking-tight tabular-nums text-ink">
              {approx(roadmap.goal.targetAmount)}
            </div>
            <p className={`${META} mb-1.5`}>in today&rsquo;s money</p>
            <p className={META}>
              {roadmap.feasible
                ? `${inr(roadmap.monthlyCommitment)} a month, starting now.`
                : `${inr(roadmap.shortfallMonthly)} a month short at your present pace.`}
            </p>

            {!roadmap.feasible ? (
              <p className="mb-0 mt-3 text-[13.5px] leading-normal text-ink-mid">
                I would rather show you that than move the number until it fits. We can push the
                date, lower the target, or find the difference in your spending — and the last one
                is usually the least painful.
              </p>
            ) : null}
          </Card>
        </div>

        {/* ------------------------------------------------ The route */}
        <Eyebrow>The route · {roadmap.stages.length} stages</Eyebrow>
        {roadmap.stages.map((stage, i) => (
          <StageCard key={stage.index} stage={stage} last={i === roadmap.stages.length - 1} />
        ))}

        {/* ------------------------------------------------ Projection */}
        {contribution > 0 ? (
          <>
            <Eyebrow>If you keep it up</Eyebrow>
            <Card>
              {/* Today's money leads, because the goal above is stated in today's money and the
                  two have to be comparable. Quoting the nominal figure first invites someone to
                  read ₹3.15 crore against a ₹2.18 crore target and conclude they are ahead. */}
              <h2>{approx(mid?.realCorpus ?? 0)}</h2>
              <p className={META}>
                in today&rsquo;s money, after {years} years at an assumed {rate}% — which is{' '}
                {approx(mid?.corpus ?? 0)} in {Number(asOf.slice(0, 4)) + years} rupees
              </p>

              <div className="mb-1.5 mt-[18px]">
                {scenarios.map((sc) => (
                  <Leader
                    key={sc.label}
                    label={`${sc.label} · ${sc.ratePct}%`}
                    value={approx(sc.realCorpus)}
                    filled={sc.ratePct === rate}
                  />
                ))}
                <Leader label="Of which you put in" value={approx(mid?.contributed ?? 0)} />
                <Leader label={`Your target`} value={approx(roadmap.goal.targetAmount)} />
              </div>

              <label className="mt-4 block text-[12.5px] text-ink-soft">
                Assumed annual return — change it and see
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
          <div className="mb-2.5 flex gap-2">
            <Pill>Version {roadmap.version}</Pill>
            <Pill>{dayMonth(roadmap.createdAt)}</Pill>
          </div>
          <p className="m-0 text-[15px] leading-normal text-ink">{roadmap.reasonForChange}</p>
          <p className={`${NOTE} mb-0 mt-3`}>
            Every version of this plan is kept, with the reason it changed and the figures it was
            built on. That record is what makes the advice auditable five years from now — and it is
            the same record that lets the plan learn what you actually do.
          </p>
        </Card>
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

function StageCard({ stage, last }: { stage: Stage; last: boolean }): ReactNode {
  const [open, setOpen] = useState(stage.index === 1)

  return (
    <div className="flex gap-3">
      {/* The spine. Makes the order the point rather than a detail. */}
      <div className="flex flex-col items-center pt-[22px]">
        <span
          className={`grid size-[30px] shrink-0 place-items-center rounded-pill text-[13px] font-bold text-white ${
            stage.isGoal ? 'bg-accent' : 'bg-brand'
          }`}
        >
          {stage.index}
        </span>
        {!last ? <span className="mt-1.5 w-0.5 flex-1 bg-hairline-mint" /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <Card>
          <div className="mb-2 flex flex-wrap gap-2">
            <Pill tone={stage.isGoal ? 'warn' : 'plain'}>{STAGE_LABEL[stage.kind]}</Pill>
            {stage.cadence === 'ongoing' ? <Pill>Ongoing</Pill> : null}
            {stage.verdict?.verdict === 'PASS' ? <Pill tone="ok">Suitability passed</Pill> : null}
          </div>

          <div className="text-[16.5px] font-semibold leading-snug text-ink">{stage.label}</div>

          {stage.monthly > 0 ? (
            <p className={`${META} mt-1.5`}>
              {inr(stage.monthly)} a month
              {stage.productName ? ` · ${stage.productName}` : ''}
            </p>
          ) : null}

          {open ? (
            <p className="mb-0 mt-[11px] text-sm leading-relaxed text-ink-mid">{stage.why}</p>
          ) : null}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="-mb-1.5 mt-1 h-10 border-0 bg-transparent px-0 text-sm font-semibold text-brand underline-offset-2 hover:underline"
          >
            {open ? 'Hide' : 'Why this first?'}
          </button>
        </Card>
      </div>
    </div>
  )
}

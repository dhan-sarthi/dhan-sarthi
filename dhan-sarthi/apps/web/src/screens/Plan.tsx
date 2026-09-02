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
 * figure is what a risk officer marks us down for. See `docs/product/09-decisions.md` §B2.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { project } from '@dhan/core'
import type { Roadmap, Snapshot, Stage } from '@dhan/core'
import { Card, Eyebrow, Head, Leader, Pill } from '../components/ui.tsx'
import { approx, dayMonth, inr, monthYear } from '../lib/money.ts'

export function Plan({
  snapshot,
  roadmap,
}: {
  snapshot: Snapshot
  roadmap: Roadmap
}): ReactNode {
  const [rate, setRate] = useState(10)
  const growth = roadmap.stages.find((s) => s.kind === 'grow')
  const contribution = growth?.monthly ?? snapshot.surplus.deployable
  const years = Math.max(1, Math.round((growth?.monthsToComplete ?? 360) / 12))
  const band = project(contribution, years, snapshot.holdings.equity, {
    rates: [
      { label: 'Cautious', ratePct: Math.max(2, rate - 4) },
      { label: 'Assumed', ratePct: rate },
      { label: 'Optimistic', ratePct: rate + 2 },
    ],
  })
  const mid = band.scenarios[1]

  return (
    <>
      <Head
        title="Plan"
        sub={`${roadmap.goal.purpose ?? 'Your goal'} · version ${roadmap.version}`}
      />

      <div className="scroll">
        {/* ------------------------------------------------ Destination */}
        <Card tint="sky">
          <h2>Where you are going</h2>
          <p className="meta">
            {roadmap.goal.purpose} by {monthYear(roadmap.goal.targetDate)}
          </p>
          {/* "₹2.18 crore" is a number somebody can hold in their head; ₹2,18,00,000 is a
              number they have to count the digits of — and at eleven digits it ran off the card. */}
          <div
            style={{
              margin: '14px 0 4px',
              fontSize: 46,
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1,
            }}
          >
            {approx(roadmap.goal.targetAmount)}
          </div>
          <p className="meta" style={{ marginBottom: 6 }}>
            in today&rsquo;s money
          </p>
          <p className="meta">
            {roadmap.feasible
              ? `${inr(roadmap.monthlyCommitment)} a month, starting now.`
              : `${inr(roadmap.shortfallMonthly)} a month short at your present pace.`}
          </p>

          {!roadmap.feasible ? (
            <p style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 12, color: '#1c3d55' }}>
              I would rather show you that than move the number until it fits. We can push the
              date, lower the target, or find the difference in your spending — and the last one
              is usually the least painful.
            </p>
          ) : null}
        </Card>

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
              <p className="meta">
                in today&rsquo;s money, after {years} years at an assumed {rate}% — which is{' '}
                {approx(mid?.corpus ?? 0)} in {Number(new Date().getFullYear()) + years} rupees
              </p>

              <div style={{ margin: '18px 0 6px' }}>
                {band.scenarios.map((sc) => (
                  <Leader
                    key={sc.label}
                    label={`${sc.label} · ${sc.ratePct}%`}
                    value={approx(sc.realCorpus)}
                    filled={sc.ratePct === rate}
                  />
                ))}
                <Leader label="Of which you put in" value={approx(mid?.contributed ?? 0)} />
                <Leader
                  label={`Your target`}
                  value={approx(roadmap.goal.targetAmount)}
                />
              </div>

              <label
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  color: 'var(--ink-soft)',
                  marginTop: 16,
                }}
              >
                Assumed annual return — change it and see
                <input
                  type="range"
                  min={4}
                  max={14}
                  step={0.5}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  style={{ width: '100%', marginTop: 8, accentColor: 'var(--ink)' }}
                />
              </label>

              <p className="note" style={{ marginTop: 6 }}>
                {band.disclaimer}
              </p>
            </Card>
          </>
        ) : null}

        {/* ------------------------------------------------ Recalculation */}
        <Eyebrow>Why this version</Eyebrow>
        <Card>
          <div style={{ display: 'flex', gap: 9, marginBottom: 10 }}>
            <Pill>Version {roadmap.version}</Pill>
            <Pill>{dayMonth(roadmap.createdAt)}</Pill>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0 }}>{roadmap.reasonForChange}</p>
          <p className="note" style={{ marginTop: 12 }}>
            Every version of this plan is kept, with the reason it changed and the figures it was
            built on. That record is what makes the advice auditable five years from now — and it
            is the same record that lets the plan learn what you actually do.
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
    <div style={{ display: 'flex', gap: 13 }}>
      {/* The spine. Makes the order the point rather than a detail. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 22 }}>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            flex: '0 0 auto',
            background: stage.isGoal ? 'var(--accent)' : 'var(--ink)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {stage.index}
        </span>
        {!last ? (
          <span style={{ flex: 1, width: 2, background: 'rgb(22 52 42 / 14%)', marginTop: 6 }} />
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Card>
          <div style={{ display: 'flex', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
            <Pill tone={stage.isGoal ? 'warn' : 'plain'}>{STAGE_LABEL[stage.kind]}</Pill>
            {stage.cadence === 'ongoing' ? <Pill>Ongoing</Pill> : null}
            {stage.verdict?.verdict === 'PASS' ? <Pill tone="ok">Suitability passed</Pill> : null}
          </div>

          <div style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.3 }}>
            {stage.label}
          </div>

          {stage.monthly > 0 ? (
            <p className="meta" style={{ marginTop: 6 }}>
              {inr(stage.monthly)} a month
              {stage.productName ? ` · ${stage.productName}` : ''}
            </p>
          ) : null}

          {open ? (
            <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-mid)', margin: '11px 0 0' }}>
              {stage.why}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              border: 0,
              background: 'none',
              color: 'var(--ink-soft)',
              fontSize: 13,
              padding: '10px 0 0',
              textDecoration: 'underline',
            }}
          >
            {open ? 'Hide' : 'Why this first?'}
          </button>
        </Card>
      </div>
    </div>
  )
}

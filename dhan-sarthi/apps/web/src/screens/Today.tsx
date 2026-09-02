/**
 * Today — the screen someone actually returns to.
 *
 * Deliberately not a dashboard. The layout follows Cleo's budget card almost exactly, because
 * that card solves the right problem: one enormous number, what it is left *of*, how many days it
 * has to last, and a per-day figure small enough to hold in your head. Then exactly one thing to
 * do.
 *
 * "One action at a time" from `03-app-ux.md` is the entire differentiation. Every rival built a
 * feature-rich dashboard. The extra actions exist, but below the fold and unemphasised — offered
 * because the customer went looking, not because we pushed them.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Action, DailyPlan, Insight, Snapshot } from '@dhan/core'
import { Amount, Bar, Card, Eyebrow, Head, Leader, Pill, Tile } from '../components/ui.tsx'
import { Clock } from '../components/Clock.tsx'
import { approx, dayMonth, inr } from '../lib/money.ts'

export function Today({
  snapshot,
  plan,
  accepted,
  declined,
  asOf,
  onAdvance,
  onReset,
  onDecide,
  onAsk,
}: {
  snapshot: Snapshot
  plan: DailyPlan
  accepted: string[]
  declined: string[]
  asOf: string
  onAdvance: (days: number) => void
  onReset: () => void
  onDecide: (action: Action, kind: 'did_it' | 'declined') => void
  onAsk: () => void
}): ReactNode {
  const s = plan.safeToSpend
  const envelope = s.pot + (s.reserved.find((r) => r.label.startsWith('Already'))?.amount ?? 0)
  const spent = envelope - s.pot
  const usedPct = envelope > 0 ? (spent / envelope) * 100 : 100

  const primary = plan.primary && !accepted.includes(plan.primary.id) && !declined.includes(plan.primary.id)
    ? plan.primary
    : (plan.secondary.find((a) => !accepted.includes(a.id) && !declined.includes(a.id)) ?? null)

  return (
    <>
      <Head
        title="Today"
        sub={`${dayMonth(asOf)} · ${snapshot.customer.name.split(' ')[0]}`}
        right={
          <div className="chips">
            <button
              type="button"
              className="chip-btn"
              data-count={plan.insights.length > 0 ? String(plan.insights.length) : undefined}
              aria-label="Insights"
            >
              ◔
            </button>
            <button type="button" className="chip-btn" aria-label="Profile" onClick={onAsk}>
              U
            </button>
          </div>
        }
      />

      <div className="scroll">
        <Clock asOf={asOf} onAdvance={onAdvance} onReset={onReset} />

        {/* ------------------------------------------------ Safe to spend */}
        <Card tint="sage">
          <h2>Safe to spend</h2>
          <p className="meta">
            {s.daysToSalary} {s.daysToSalary === 1 ? 'day' : 'days'} until your salary on{' '}
            {dayMonth(s.nextSalaryDate)}
          </p>

          <div style={{ margin: '14px 0 4px' }}>
            <Amount value={s.pot} size="xl" />
          </div>
          <p className="meta" style={{ marginBottom: 14 }}>
            Left of <b>{inr(envelope)}</b> · about <b>{inr(s.perDay)}</b> a day
          </p>

          <Bar used={usedPct} />

          {/* A waterfall, with signs, that visibly sums. Listing the reserved amounts without
              them read as though ₹52,488 of bills came out of a ₹20,266 envelope — the figures
              were all correct and the panel still looked like it did not add up. */}
          <div style={{ marginTop: 12 }}>
            <Leader label="Comes in" value={inr(snapshot.income.monthly)} filled />
            {s.reserved.map((r) => (
              <Leader key={r.label} label={r.label} value={`−${inr(r.amount)}`} />
            ))}
            <div
              style={{
                borderTop: '1.5px solid rgb(22 52 42 / 22%)',
                marginTop: 6,
                paddingTop: 2,
              }}
            >
              <Leader label="Still yours to spend" value={inr(s.pot)} filled />
            </div>
          </div>

          <div className="tiles">
            <Tile label="Comes in each month" value={snapshot.income.monthly} />
            <Tile label="Goes out each month" value={snapshot.commitments.total} />
          </div>
        </Card>

        {/* ------------------------------------------------ The one action */}
        {primary ? (
          <ActionCard action={primary} onDecide={onDecide} onWhy={onAsk} />
        ) : (
          <Card tint="sky">
            <h2>Nothing needs you today</h2>
            <p className="meta" style={{ marginTop: 6 }}>
              {plan.routeNote}
            </p>
          </Card>
        )}

        {/* ------------------------------------------------ Since you were away */}
        {plan.since.transactions.length > 0 ? (
          <>
            <Eyebrow>Since {dayMonth(plan.since.from)}</Eyebrow>
            <Card>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Amount value={plan.since.spent} size="md" />
                <span className="meta">
                  across {plan.since.transactions.length}{' '}
                  {plan.since.transactions.length === 1 ? 'payment' : 'payments'}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                {plan.since.transactions.slice(-6).reverse().map((t) => (
                  <div className="txn" key={t.txnId}>
                    <span className="avatar-glyph" style={{ width: 32, height: 32, fontSize: 12 }}>
                      {t.spendCategory[0]}
                    </span>
                    <span className="who">
                      <b>{prettyMerchant(t.narration)}</b>
                      <span>
                        {dayMonth(t.txnDate)} · {t.spendCategory}
                      </span>
                    </span>
                    <span className="amt">−{inr(t.txnAmount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        ) : null}

        {/* ------------------------------------------------ The rest */}
        <Eyebrow>What I noticed</Eyebrow>
        {plan.insights.map((i) => (
          <InsightCard key={i.kind} insight={i} />
        ))}

        <p className="note" style={{ marginTop: 20 }}>
          Every figure on this screen is computed from {snapshot.quality.transactions} transactions
          across {snapshot.quality.monthsOfHistory} months.{' '}
          {Math.round(snapshot.quality.categorisedShare * 100)}% of them could be matched to a
          merchant or a mandate.
        </p>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Action */

function ActionCard({
  action,
  onDecide,
  onWhy,
}: {
  action: Action
  onDecide: (a: Action, kind: 'did_it' | 'declined') => void
  onWhy: () => void
}): ReactNode {
  const [showWhy, setShowWhy] = useState(false)

  return (
    <Card tint="ink">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <h2 style={{ fontSize: 20, lineHeight: 1.2 }}>{action.label}</h2>
      </div>
      <p style={{ fontSize: 14.5, lineHeight: 1.5, margin: '9px 0 0', opacity: 0.82 }}>
        {action.detail}
      </p>

      {/* Never a promise. The rate is on screen and the wording is conditional. */}
      {action.projected ? (
        <p style={{ fontSize: 13.5, margin: '12px 0 0', opacity: 0.72 }}>
          Over {action.projected.years} years at an assumed {action.projected.ratePct}%, that would
          be about <b>{approx(action.projected.becomes)}</b>. An illustration, not a promise.
        </p>
      ) : null}

      {showWhy ? (
        <div
          style={{
            marginTop: 14,
            paddingTop: 13,
            borderTop: '1px solid rgb(244 241 234 / 18%)',
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              opacity: 0.6,
              marginBottom: 7,
            }}
          >
            What this is based on
          </div>
          {action.evidence.map((e) => (
            <div key={e} style={{ fontSize: 13, opacity: 0.85, padding: '3px 0' }}>
              · {e}
            </div>
          ))}
        </div>
      ) : null}

      <div className="btn-row">
        <button type="button" className="btn on-dark" onClick={() => onDecide(action, 'did_it')}>
          Do it
        </button>
        <button
          type="button"
          className="btn on-dark ghost"
          onClick={() => onDecide(action, 'declined')}
        >
          Not now
        </button>
        <button
          type="button"
          className="btn on-dark ghost"
          style={{ paddingInline: 18 }}
          onClick={() => setShowWhy((v) => !v)}
        >
          Why?
        </button>
      </div>

      <button
        type="button"
        onClick={onWhy}
        style={{
          border: 0,
          background: 'none',
          color: 'inherit',
          opacity: 0.62,
          fontSize: 13,
          padding: '12px 0 0',
          textDecoration: 'underline',
        }}
      >
        Talk to Uday about this
      </button>
    </Card>
  )
}

/* ---------------------------------------------------------------- Insight */

function InsightCard({ insight }: { insight: Insight }): ReactNode {
  const [open, setOpen] = useState(false)
  const tone = insight.severity === 'urgent' ? 'bad' : insight.severity === 'important' ? 'warn' : 'ok'

  return (
    <Card>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 8 }}>
        <Pill tone={tone}>
          {insight.severity === 'urgent'
            ? 'Needs attention'
            : insight.severity === 'important'
              ? 'Worth doing'
              : 'Opportunity'}
        </Pill>
        {insight.monthlyValue > 0 ? (
          <span className="note">{inr(insight.monthlyValue)}/month</span>
        ) : null}
      </div>

      <div style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.3 }}>
        {insight.headline}
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-mid)', margin: '8px 0 0' }}>
        {insight.detail}
      </p>

      {open ? (
        <div style={{ marginTop: 12, paddingTop: 11, borderTop: '1px solid rgb(22 52 42 / 8%)' }}>
          {insight.evidence.map((e) => (
            <div key={e} style={{ fontSize: 13, color: 'var(--ink-mid)', padding: '3px 0' }}>
              · {e}
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          border: 0,
          background: 'none',
          color: 'var(--ink-soft)',
          fontSize: 13,
          padding: '11px 0 0',
          textDecoration: 'underline',
        }}
      >
        {open ? 'Hide the numbers' : 'Show me the numbers'}
      </button>
    </Card>
  )
}

/** `UPI/SWIGGY/412683940281` reads as "Swiggy" to a person. */
export function prettyMerchant(narration: string): string {
  const parts = narration.split(/[/\-]/).map((p) => p.trim()).filter(Boolean)
  const named = parts.find(
    (p) => p.length > 2 && !/^\d+$/.test(p) && !['UPI', 'POS', 'NEFT', 'IMPS', 'ACH', 'D', 'CR', 'SI', 'ATW', 'P2A'].includes(p),
  )
  const raw = named ?? parts[0] ?? narration
  return raw
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

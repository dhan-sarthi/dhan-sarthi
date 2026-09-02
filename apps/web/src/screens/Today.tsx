/**
 * Today — the screen someone actually returns to.
 *
 * Deliberately not a dashboard. The layout follows Cleo's budget card almost exactly, because
 * that card solves the right problem: one enormous number, what it is left *of*, how many days it
 * has to last, and a per-day figure small enough to hold in your head. Then exactly one thing to
 * do.
 *
 * "One action at a time" is the entire differentiation. Most money apps built a
 * feature-rich dashboard. The extra actions exist, but below the fold and unemphasised — offered
 * because the customer went looking, not because we pushed them.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Action, DailyPlan, Insight, Snapshot } from '@dhan/core'
import { Amount, Bar, Card, Eyebrow, Head, Leader, Pill, Tile } from '../components/ui.tsx'
import { Clock } from '../components/Clock.tsx'
import { approx, dayMonth, inr } from '../lib/money.ts'

/* Header chips: white pills with a mint hairline. The count badge is a small orange disc. */
const CHIP =
  'relative grid size-10 shrink-0 place-items-center rounded-pill border border-solid border-hairline-mint bg-white text-ink'
const CHIP_BADGE =
  "after:absolute after:-right-0.5 after:-top-0.5 after:grid after:h-[17px] after:min-w-[17px] after:place-items-center after:rounded-pill after:bg-accent after:px-1 after:text-[10.5px] after:font-bold after:text-white after:content-[attr(data-count)]"

/* Card subtitle and footnote text. */
const META = 'm-0 text-sm text-ink-soft'
const NOTE = 'text-xs leading-relaxed text-ink-soft'

/* Buttons on the brand-green hero card: primary stays orange, secondary becomes a white outline. */
const BTN_ON_INK_PRIMARY =
  'h-12 min-w-0 flex-auto whitespace-nowrap rounded-pill border-0 bg-accent px-5 text-[15px] font-semibold text-white transition-transform duration-100 active:scale-[0.985]'
const BTN_ON_INK_SECONDARY =
  'h-12 min-w-0 flex-auto whitespace-nowrap rounded-pill border-[1.5px] border-solid border-white/40 bg-transparent px-3 text-[15px] font-semibold text-on-dark transition-transform duration-100 active:scale-[0.985]'

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
          <div className="flex gap-2">
            <button
              type="button"
              className={plan.insights.length > 0 ? `${CHIP} ${CHIP_BADGE}` : CHIP}
              data-count={plan.insights.length > 0 ? String(plan.insights.length) : undefined}
              aria-label="Insights"
            >
              ◔
            </button>
            <button type="button" className={CHIP} aria-label="Profile" onClick={onAsk}>
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
          <p className={META}>
            {s.daysToSalary} {s.daysToSalary === 1 ? 'day' : 'days'} until your salary on{' '}
            {dayMonth(s.nextSalaryDate)}
          </p>

          <div className="mb-1 mt-3.5">
            <Amount value={s.pot} size="xl" />
          </div>
          <p className={`${META} mb-3.5`}>
            Left of <b className="text-ink">{inr(envelope)}</b> · about <b className="text-ink">{inr(s.perDay)}</b> a day
          </p>

          <Bar used={usedPct} />

          {/* A waterfall, with signs, that visibly sums. Listing the reserved amounts without
              them read as though ₹52,488 of bills came out of a ₹20,266 envelope — the figures
              were all correct and the panel still looked like it did not add up. */}
          <div className="mt-3">
            <Leader label="Comes in" value={inr(snapshot.income.monthly)} filled />
            {s.reserved.map((r) => (
              <Leader key={r.label} label={r.label} value={`−${inr(r.amount)}`} />
            ))}
            <div className="mt-1.5 border-t-[1.5px] border-solid border-hairline-mint pt-0.5">
              <Leader label="Still yours to spend" value={inr(s.pot)} filled />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
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
            <p className={`${META} mt-1.5`}>
              {plan.routeNote}
            </p>
          </Card>
        )}

        {/* ------------------------------------------------ Since you were away */}
        {plan.since.transactions.length > 0 ? (
          <>
            <Eyebrow>Since {dayMonth(plan.since.from)}</Eyebrow>
            <Card>
              <div className="flex items-baseline gap-2">
                <Amount value={plan.since.spent} size="md" />
                <span className={META}>
                  across {plan.since.transactions.length}{' '}
                  {plan.since.transactions.length === 1 ? 'payment' : 'payments'}
                </span>
              </div>
              <div className="mt-2 divide-y divide-solid divide-hairline-mint">
                {plan.since.transactions.slice(-6).reverse().map((t) => (
                  <div className="flex items-center gap-3 py-[11px]" key={t.txnId}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-tint-sage text-xs font-bold text-brand">
                      {t.spendCategory[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[15px] font-semibold text-ink">{prettyMerchant(t.narration)}</b>
                      <span className="text-xs text-ink-soft">
                        {dayMonth(t.txnDate)} · {t.spendCategory}
                      </span>
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">−{inr(t.txnAmount)}</span>
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

        <p className={`${NOTE} mb-0 mt-5`}>
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
      <div className="flex justify-between gap-2.5">
        <h2>{action.label}</h2>
      </div>
      <p className="mb-0 mt-2 text-[14.5px] leading-normal opacity-80">
        {action.detail}
      </p>

      {/* Never a promise. The rate is on screen and the wording is conditional. */}
      {action.projected ? (
        <p className="mb-0 mt-3 text-[13.5px] leading-normal opacity-70">
          Over {action.projected.years} years at an assumed {action.projected.ratePct}%, that would
          be about <b>{approx(action.projected.becomes)}</b>. An illustration, not a promise.
        </p>
      ) : null}

      {showWhy ? (
        <div className="mt-3.5 border-t border-solid border-white/20 pt-3">
          <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-wide opacity-70">
            What this is based on
          </div>
          {action.evidence.map((e) => (
            <div key={e} className="py-[3px] text-[13px] opacity-85">
              · {e}
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={BTN_ON_INK_PRIMARY} onClick={() => onDecide(action, 'did_it')}>
          Do it
        </button>
        <button
          type="button"
          className={BTN_ON_INK_SECONDARY}
          onClick={() => onDecide(action, 'declined')}
        >
          Not now
        </button>
        <button
          type="button"
          className={`${BTN_ON_INK_SECONDARY} px-[18px]`}
          onClick={() => setShowWhy((v) => !v)}
        >
          Why?
        </button>
      </div>

      <button
        type="button"
        onClick={onWhy}
        className="border-0 bg-transparent p-0 pt-3 text-[13px] font-medium text-inherit underline underline-offset-2 opacity-60"
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
      <div className="mb-2 flex items-center gap-[9px]">
        <Pill tone={tone}>
          {insight.severity === 'urgent'
            ? 'Needs attention'
            : insight.severity === 'important'
              ? 'Worth doing'
              : 'Opportunity'}
        </Pill>
        {insight.monthlyValue > 0 ? (
          <span className={`${NOTE} tabular-nums`}>{inr(insight.monthlyValue)}/month</span>
        ) : null}
      </div>

      <div className="text-[16.5px] font-semibold leading-snug text-ink">
        {insight.headline}
      </div>
      <p className="mb-0 mt-2 text-sm leading-normal text-ink-mid">
        {insight.detail}
      </p>

      {open ? (
        <div className="mt-3 border-t border-solid border-hairline-mint pt-[11px]">
          {insight.evidence.map((e) => (
            <div key={e} className="py-[3px] text-[13px] text-ink-mid">
              · {e}
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border-0 bg-transparent p-0 pt-[11px] text-[13px] font-medium text-brand underline underline-offset-2"
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

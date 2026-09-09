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
 *
 * Everything here is read from the View the API returned. A decision goes back to the API with
 * an idempotency key and the screen re-reads; nothing is computed in the browser.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, ChevronDown, Lightbulb, UserRound } from 'lucide-react'
import type { Action, Insight, LeadOutcomeResponse, Snapshot, View } from '@dhan/contracts'
import { Amount, Bar, Button, Card, Eyebrow, Head, Leader, Pill, Tile } from '../components/ui.tsx'
import { Clock } from '../components/Clock.tsx'
import { DataSourceRibbon } from '../components/DataSourceRibbon.tsx'
import { PullToRefresh } from '../components/PullToRefresh.tsx'
import type { Tier } from '../components/TierBadge.tsx'
import { isNamed, merchantOf } from '../lib/merchant.ts'
import { approx, dayMonth, inr } from '../lib/money.ts'
import type { DecisionKind } from '../lib/mutations.ts'
import { useRipple } from '../lib/motion.ts'

/* Header chips: white pills with a mint hairline. The count badge is a small orange disc. */
const CHIP =
  'relative grid size-10 shrink-0 place-items-center rounded-pill border border-solid border-hairline-mint bg-white text-ink'
const CHIP_BADGE =
  'after:absolute after:-right-0.5 after:-top-0.5 after:grid after:h-[17px] after:min-w-[17px] after:place-items-center after:rounded-pill after:bg-accent after:px-1 after:text-[10.5px] after:font-bold after:text-white after:content-[attr(data-count)]'

/* Card subtitle and footnote text. */
const META = 'm-0 text-sm text-ink-soft'
const NOTE = 'text-xs leading-relaxed text-ink-soft'

/* Buttons on the brand-green hero card: primary stays orange, secondary becomes a white outline. */
const BTN_ON_INK_PRIMARY =
  'ds-press h-12 min-w-0 flex-auto whitespace-nowrap rounded-pill border-0 bg-accent px-5 text-[15px] font-semibold text-white disabled:opacity-55'
const BTN_ON_INK_SECONDARY =
  'ds-press h-12 min-w-0 flex-auto whitespace-nowrap rounded-pill border-[1.5px] border-solid border-white/40 bg-transparent px-3 text-[15px] font-semibold text-on-dark disabled:opacity-55'

export interface ClockControls {
  /** False under a real bank feed, where today is today. */
  show: boolean
  /** The last date the feed has data for; a step past it is refused by the server. */
  horizonTo: string
  notice: string | null
  disabled: boolean
  onAdvance: (days: 1 | 7 | 30) => void
  onReset: () => void
}

export function Today({
  view,
  tier,
  clock,
  decided,
  decisionsEnabled,
  busy,
  lead,
  onDecide,
  onAsk,
  onOpenProfile,
  onRefresh,
}: {
  view: View
  tier: Tier
  clock: ClockControls
  /** Action ids decided since the page loaded, so the card moves on before the server re-cuts. */
  decided: ReadonlySet<string>
  /** False offline: nothing is recorded, so nothing can be decided. */
  decisionsEnabled: boolean
  busy: boolean
  /** What IDBI did with the last accepted recommendation, where one was handed over. */
  lead: LeadOutcomeResponse | null
  onDecide: (action: Action, kind: DecisionKind) => void
  onAsk: () => void
  /** The header's avatar. It said "Profile" and opened the advisor; now it opens the profile. */
  onOpenProfile: () => void
  /** Pull down at the top to re-read the view. */
  onRefresh: () => Promise<void>
}): ReactNode {
  const { snapshot, plan } = view
  const asOf = view.meta.asOf
  const s = plan.safeToSpend
  const envelope = s.pot + (s.reserved.find((r) => r.label.startsWith('Already'))?.amount ?? 0)
  const spent = envelope - s.pot
  const usedPct = envelope > 0 ? (spent / envelope) * 100 : 100

  const primary =
    plan.primary && !decided.has(plan.primary.id)
      ? plan.primary
      : (plan.secondary.find((a) => !decided.has(a.id)) ?? null)

  return (
    <>
      <Head
        title="Today"
        sub={`${dayMonth(asOf)} · ${snapshot.customer.name.split(' ')[0]}`}
        right={
          <div className="flex gap-2">
            {/* Both of these were decoration. The first counted insights and did nothing when
                pressed; the second was labelled Profile and opened the advisor. */}
            <button
              type="button"
              className={`ds-press ${plan.insights.length > 0 ? `${CHIP} ${CHIP_BADGE}` : CHIP}`}
              data-count={plan.insights.length > 0 ? String(plan.insights.length) : undefined}
              aria-label={
                plan.insights.length > 0
                  ? `${plan.insights.length} things I noticed`
                  : 'Nothing I noticed'
              }
              onClick={() => {
                document
                  .getElementById('what-i-noticed')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              <Lightbulb size={17} strokeWidth={2.3} />
            </button>
            <button
              type="button"
              className={`ds-press ${CHIP}`}
              aria-label="About you"
              onClick={onOpenProfile}
            >
              <UserRound size={17} strokeWidth={2.3} />
            </button>
          </div>
        }
      />
      <DataSourceRibbon meta={view.meta} tier={tier} />

      <PullToRefresh className="scroll" contentClassName="ds-enter" onRefresh={onRefresh}>
        {/*
          Hidden, not disabled, when the ledger ends where the session opens.
          A control that can never do anything is worse than no control: it reads as broken, and
          on IDBI's feed that is its permanent state. It comes back the moment a source has
          headroom, which the generator and the seeded database both do.
        */}
        {clock.show && clock.horizonTo > asOf ? (
          <div className="mt-3">
            <Clock
              asOf={asOf}
              horizonTo={clock.horizonTo}
              notice={clock.notice}
              disabled={clock.disabled}
              onAdvance={clock.onAdvance}
              onReset={clock.onReset}
            />
          </div>
        ) : (
          <div className="mt-3" />
        )}

        {/* ------------------------------------------------ Safe to spend */}
        {/*
          With no recognisable salary there is no allowance to give, and the panel used to
          invent one anyway: it printed "13 days until your salary on 2 June" for a customer
          whose statement contains no salary at all, then "₹0 · about ₹0 a day" under a
          headline of "Left of ₹1,03,910". Every figure in that sentence was either fabricated
          or meaningless. IDBI's own statement makes this the normal case — `txnCat` is `TCI`
          on every row and no narration carries a payroll marker — so it needs a state of its
          own rather than a graceful-looking zero.
        */}
        {snapshot.income.monthly <= 0 ? (
          <Card tint="clay">
            {/*
              Two versions of the same state, because "I cannot see your income" is the wrong
              sentence to show somebody who has just typed their income in. A declared figure is
              used by the plan and the goal — `goal.ts` falls back to it, `insights.ts` labels it
              — it simply does not become a daily allowance, and the difference between those two
              is worth one sentence rather than a headline that reads as amnesia.
            */}
            <h2>
              {snapshot.customer.declaredMonthlyIncome > 0
                ? 'No salary in this statement'
                : 'I cannot see your income yet'}
            </h2>
            {snapshot.customer.declaredMonthlyIncome > 0 ? (
              <p className={`${META} mt-1.5`}>
                You told me {inr(snapshot.customer.declaredMonthlyIncome)} a month comes in, and the
                plan is built on it. Nothing in this statement looks like it, though, so I am not
                going to turn it into a daily allowance I cannot check against the ledger.
              </p>
            ) : (
              <p className={`${META} mt-1.5`}>
                Nothing in this statement looks like a salary or a regular credit, so there is no
                daily allowance I can stand behind. What I can see is below, and everything else on
                this screen is built only from what is actually in the ledger.
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Tile label="In your accounts" value={snapshot.balances.total} />
              {/* The observed total, not `discretionary.monthly`. That field is a normal
                  month's rate and needs whole months to mean anything, so over a twenty-day
                  statement it is zero — which printed "Spent in this window ₹0" directly above
                  a list of four payments totalling ₹29,293. */}
              <Tile label="Spent in this window" value={observedSpend(snapshot)} />
            </div>
            <div className="mt-4">
              <Button tone="secondary" size="sm" onClick={onOpenProfile}>
                <UserRound size={15} strokeWidth={2.5} />
                {snapshot.customer.declaredMonthlyIncome > 0
                  ? 'Change what you told me'
                  : 'Tell me your income'}
              </Button>
            </div>
          </Card>
        ) : (
          <Card tint="sage">
            <h2>Safe to spend</h2>
            <p className={META}>
              {s.daysToSalary} {s.daysToSalary === 1 ? 'day' : 'days'}{' '}
              {s.incomeStability === 'regular'
                ? `until your salary on ${dayMonth(s.nextSalaryDate)}`
                : `left in this month`}
            </p>

            <div className="mb-1 mt-3.5">
              <Amount value={s.pot} size="xl" />
            </div>
            <p className={`${META} mb-3.5`}>
              Left of <b className="text-ink">{inr(envelope)}</b> · about{' '}
              <b className="text-ink">{inr(s.perDay)}</b> a day
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

            {/*
              The second tile only where there is a commitment to name.
              "Goes out each month ₹0" is a derived zero standing in for an observation: on
              Neha's feed nothing in the statement is recognisable as a mandate, and the screen
              was reporting that as a customer with no outgoings, directly above ₹6.03 lakh of
              borrowing. One tile that is true beats two where one is invented.
            */}
            <div
              className={`mt-4 grid gap-2.5 ${snapshot.commitments.total > 0 ? 'grid-cols-2' : ''}`}
            >
              <Tile label="Comes in each month" value={snapshot.income.monthly} />
              {snapshot.commitments.total > 0 ? (
                <Tile label="Goes out each month" value={snapshot.commitments.total} />
              ) : null}
            </div>
          </Card>
        )}

        {/* ------------------------------------------------ The one action */}
        {primary ? (
          <ActionCard
            action={primary}
            enabled={decisionsEnabled}
            busy={busy}
            onDecide={onDecide}
            onWhy={onAsk}
          />
        ) : (
          <Card tint="sky">
            <h2>Nothing needs you today</h2>
            <p className={`${META} mt-1.5`}>{plan.routeNote}</p>
            {/* What the bank did with the last acceptance. A customer who presses "Do it" has a
                right to know whether it reached anybody — and this is the only place in the app
                where something is handed *to* IDBI rather than read from it. */}
            {lead ? <p className={`${META} mt-2.5`}>{leadSentence(lead)}</p> : null}
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

              {/* A limit the customer set themselves, and the only place on Today that reports
                  it. The safe-to-spend panel says it too, but only when there is an income to
                  build one from, and a cap is worth knowing about either way. */}
              {plan.since.capBreached ? (
                <p className="ds-rise m-0 mt-2.5 rounded-sm bg-tint-clay px-3 py-2 text-[13px] font-semibold leading-snug text-danger">
                  You are over a limit you set. Money &rarr; Spending has the figure.
                </p>
              ) : null}
              <div className="mt-2 divide-y divide-solid divide-hairline-mint">
                {plan.since.transactions
                  .slice(-6)
                  .reverse()
                  .map((t) => (
                    <div className="flex items-center gap-3 py-[11px]" key={t.txnId}>
                      {/* Same rule as the full list on Money: the category's initial where
                          there is a name to go with it, the direction where the line names
                          nobody, and the narration in place of a category that is only a
                          fallback. */}
                      <span
                        className={`grid size-8 shrink-0 place-items-center rounded-pill text-xs font-bold ${
                          isNamed(t) ? 'bg-tint-sage text-brand' : 'bg-ground-deep text-ink-mid'
                        }`}
                      >
                        {isNamed(t) ? (
                          t.spendCategory[0]
                        ) : (
                          <ArrowUpRight size={15} strokeWidth={2.6} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[15px] font-semibold text-ink">
                          {merchantOf(t)}
                        </b>
                        <span className="block truncate text-xs text-ink-soft">
                          {dayMonth(t.txnDate)} · {isNamed(t) ? t.spendCategory : t.narration}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">
                        −{inr(t.txnAmount)}
                      </span>
                    </div>
                  ))}
              </div>
            </Card>
          </>
        ) : null}

        {/* ------------------------------------------------ The rest */}
        {/* No heading without something under it. An insight list can legitimately be empty —
            it is over a statement whose narrations carry no habit and no mandate — and
            "What I noticed" over nothing reads as a section that failed to load. */}
        {plan.insights.length > 0 ? (
          <>
            <div id="what-i-noticed" className="scroll-mt-3">
              <Eyebrow>What I noticed</Eyebrow>
            </div>
            {plan.insights.map((i) => (
              <InsightCard key={i.kind} insight={i} />
            ))}
          </>
        ) : null}

        <p className={`${NOTE} mb-0 mt-5`}>
          Every figure on this screen is computed from {snapshot.quality.transactions}{' '}
          {snapshot.quality.transactions === 1 ? 'transaction' : 'transactions'}{' '}
          {historySpan(snapshot.quality.monthsOfHistory)}.{' '}
          {Math.round(snapshot.quality.categorisedShare * 100)}% of them could be matched to a
          merchant or a mandate.
        </p>
      </PullToRefresh>
    </>
  )
}

/** What became of the lead, in a sentence a customer would accept. */
function leadSentence(lead: LeadOutcomeResponse): string {
  switch (lead.status) {
    case 'created':
      return 'IDBI has your request. Someone from the bank will pick it up.'
    case 'duplicate':
      return 'IDBI already had this request on file, so nothing was sent twice.'
    case 'refused':
      return `The bank did not accept the request: ${lead.message}`
    case 'incomplete':
      return lead.message
    case 'unavailable':
      return 'Your decision is recorded. The bank could not be reached to pass it on, so it will need sending again.'
  }
}

/**
 * Everything the ledger actually shows going out, across every category.
 *
 * Summed from `byCategory`, which is the observed window rather than a monthly rate, so it is
 * the right figure whenever the window is shorter than a month.
 */
function observedSpend(snapshot: Snapshot): number {
  return Math.round(snapshot.discretionary.byCategory.reduce((sum, [, amount]) => sum + amount, 0))
}

/**
 * How much history the figures rest on, in words.
 *
 * `monthsOfHistory` is a whole number of months and IDBI's own statement is twenty days, so it
 * rounds to zero — which read as "across 0 months", and then "across 1 months" once a second
 * feed pushed it over. Neither is something a person would write.
 */
function historySpan(months: number): string {
  if (months <= 0) return 'from under a month of statement'
  if (months === 1) return 'across a month'
  return `across ${months} months`
}

/* ---------------------------------------------------------------- Action */

function ActionCard({
  action,
  enabled,
  busy,
  onDecide,
  onWhy,
}: {
  action: Action
  enabled: boolean
  busy: boolean
  onDecide: (a: Action, kind: DecisionKind) => void
  onWhy: () => void
}): ReactNode {
  const [showWhy, setShowWhy] = useState(false)
  const locked = !enabled || busy
  const ripple = useRipple()

  return (
    <Card tint="ink">
      <div className="flex justify-between gap-2.5">
        <h2>{action.label}</h2>
      </div>
      <p className="mb-0 mt-2 text-[14.5px] leading-normal opacity-80">{action.detail}</p>

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
        <button
          type="button"
          className={BTN_ON_INK_PRIMARY}
          onPointerDown={ripple}
          disabled={locked}
          onClick={() => onDecide(action, 'did_it')}
        >
          {busy ? 'Recording…' : 'Do it'}
        </button>
        <button
          type="button"
          className={BTN_ON_INK_SECONDARY}
          onPointerDown={ripple}
          disabled={locked}
          onClick={() => onDecide(action, 'declined')}
        >
          Not now
        </button>
        <button
          type="button"
          className={`${BTN_ON_INK_SECONDARY} px-[18px]`}
          onPointerDown={ripple}
          onClick={() => setShowWhy((v) => !v)}
        >
          Why?
        </button>
      </div>

      {!enabled ? (
        <p className="mb-0 mt-3 text-[13px] leading-normal opacity-70">
          Decisions are written to the record on the advisor service. Reconnect to act on this.
        </p>
      ) : null}
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
  const tone =
    insight.severity === 'urgent' ? 'bad' : insight.severity === 'important' ? 'warn' : 'ok'

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

      <div className="text-[16.5px] font-semibold leading-snug text-ink">{insight.headline}</div>
      <p className="mb-0 mt-2 text-sm leading-normal text-ink-mid">{insight.detail}</p>

      {/* `grid-template-rows` from 0fr to 1fr, which is the one way to transition to a height
          nobody has measured. The evidence stays mounted so a screen reader can reach it and so
          the rows do not re-animate every time it is reopened. */}
      <div
        className="grid transition-[grid-template-rows] duration-[260ms] ease-[cubic-bezier(0.22,0.8,0.3,1)]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="mt-3 border-t border-solid border-hairline-mint pt-[11px]">
            {insight.evidence.map((e) => (
              <div key={e} className="py-[3px] text-[13px] text-ink-mid">
                · {e}
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="ds-press inline-flex items-center gap-1 border-0 bg-transparent p-0 pt-[11px] text-[13px] font-medium text-brand underline underline-offset-2"
      >
        {open ? 'Hide the numbers' : 'Show me the numbers'}
        <ChevronDown
          size={14}
          strokeWidth={2.6}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
    </Card>
  )
}

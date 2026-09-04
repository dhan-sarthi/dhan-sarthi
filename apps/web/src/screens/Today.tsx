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
import type { Action, Insight, View } from '@dhan/contracts'
import { Amount, Bar, Card, Eyebrow, Head, HeroPanel, Leader, Pill } from '../components/ui.tsx'
import { Clock } from '../components/Clock.tsx'
import { DataSourceRibbon } from '../components/DataSourceRibbon.tsx'
import { InsightIcon } from '../components/InsightIcon.tsx'
import type { Tier } from '../components/TierBadge.tsx'
import { merchantOf } from '../lib/merchant.ts'
import { riseDelay, useCountUp } from '../lib/motion.ts'
import { approx, dayMonth, inr } from '../lib/money.ts'
import type { DecisionKind } from '../lib/mutations.ts'

/* Header chips: white pills with a mint hairline. The count badge is a small orange disc. */
const CHIP =
  'relative grid size-10 shrink-0 place-items-center rounded-pill border border-solid border-hairline-mint bg-white text-ink'
const CHIP_BADGE =
  'after:absolute after:-right-0.5 after:-top-0.5 after:grid after:h-[17px] after:min-w-[17px] after:place-items-center after:rounded-pill after:bg-accent after:px-1 after:text-[10.5px] after:font-bold after:text-white after:content-[attr(data-count)]'

/* Card subtitle and footnote text. */
const META = 'm-0 text-sm text-ink-soft'
const NOTE = 'text-xs leading-relaxed text-ink-soft'

/* The bank's pair, on white: a solid orange pill to act, an orange outline to defer. The weight
   between them is the whole hierarchy — a third pill of the same shape is how a screen stops
   having a primary action at all, so anything further is a quiet link. */
const BTN_PRIMARY =
  'h-12 min-w-0 flex-auto whitespace-nowrap rounded-pill border-0 bg-accent px-5 text-[15px] font-semibold text-white transition-transform duration-100 active:scale-[0.985] disabled:opacity-55'
const BTN_SECONDARY =
  'h-12 min-w-0 flex-auto whitespace-nowrap rounded-pill border-[1.5px] border-solid border-accent bg-white px-3 text-[15px] font-semibold text-accent-text transition-transform duration-100 active:scale-[0.985] disabled:opacity-55'

/* The quiet link: how every disclosure in this app is offered — here, on the insight rows below,
   on a stage in Plan, and under an answer from Uday. Never a third pill. */
const LINK =
  'border-0 bg-transparent p-0 text-[13px] font-medium text-brand underline underline-offset-2'

export interface ClockControls {
  /** False under a real bank feed, where today is today. */
  show: boolean
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
  notice,
  onDecide,
  onAsk,
}: {
  view: View
  tier: Tier
  clock: ClockControls
  /** Action ids decided since the page loaded, so the card moves on before the server re-cuts. */
  decided: ReadonlySet<string>
  /** False offline: nothing is recorded, so nothing can be decided. */
  decisionsEnabled: boolean
  busy: boolean
  /** The last decision failed; the server's sentence. */
  notice: string | null
  onDecide: (action: Action, kind: DecisionKind) => void
  onAsk: () => void
}): ReactNode {
  const { snapshot, plan } = view
  const asOf = view.meta.asOf
  const s = plan.safeToSpend
  const envelope = s.pot + (s.reserved.find((r) => r.label.startsWith('Already'))?.amount ?? 0)
  const spent = envelope - s.pot
  const usedPct = envelope > 0 ? (spent / envelope) * 100 : 100
  // Counts on first paint and whenever the clock moves the figure, and not at all under
  // prefers-reduced-motion.
  const counted = useCountUp(s.pot)

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
      <DataSourceRibbon meta={view.meta} tier={tier} asOf={asOf} />

      <div className="scroll">
        {clock.show ? (
          <div className="mt-3">
            <Clock
              asOf={asOf}
              notice={clock.notice}
              disabled={clock.disabled}
              onAdvance={clock.onAdvance}
              onReset={clock.onReset}
            />
          </div>
        ) : (
          <div className="mt-3" />
        )}

        {/* ------------------------------------------------ Safe to spend
            The one thing on this screen, and the only surface shaped like this. The figure
            counts up because it is derived in front of you, not fetched. */}
        <HeroPanel
          label="Safe to spend"
          meta={`${s.daysToSalary} ${s.daysToSalary === 1 ? 'day' : 'days'} ${
            s.incomeStability === 'regular'
              ? `until your salary on ${dayMonth(s.nextSalaryDate)}`
              : 'left in this month'
          }`}
          settled={s.pot}
        >
          <Amount value={counted} size="xl" />
          <p className="mb-3.5 mt-1 text-sm text-on-dark/75">
            Left of <b className="font-semibold text-on-dark">{inr(envelope)}</b> · about{' '}
            <b className="font-semibold text-on-dark">{inr(s.perDay)}</b> a day
          </p>
          <Bar used={usedPct} onDark />
        </HeroPanel>

        {/* The waterfall sits below the panel as a plain ledger rather than inside another
            card: nesting a card in a card is what made every block on this page weigh the same.
            It shows signs and visibly sums, because listing the reserved amounts without them
            read as though ₹51,997 of bills came out of a ₹22,070 envelope.

            It is also the *only* place income and commitments appear. The panel used to repeat
            both in a footer, eight pixels above the rows that state them again — so the screen's
            three loudest figures were each printed twice. The panel answers; the ledger shows the
            working and lands on the same number, which is what makes the answer believable. */}
        <div className="mb-3 px-1">
          <Leader label="Comes in" value={inr(snapshot.income.monthly)} filled />
          {s.reserved.map((r) => (
            <Leader key={r.label} label={r.label} value={`−${inr(r.amount)}`} />
          ))}
          <div className="mt-1.5 border-0 border-t-[1.5px] border-solid border-hairline-mint pt-0.5">
            <Leader label="Still yours to spend" value={inr(s.pot)} filled />
          </div>
        </div>

        {/* ------------------------------------------------ The one action */}
        {primary ? (
          <ActionCard
            action={primary}
            enabled={decisionsEnabled}
            busy={busy}
            notice={notice}
            onDecide={onDecide}
            onWhy={onAsk}
          />
        ) : (
          <Card tint="sky">
            <h2>Nothing needs you today</h2>
            <p className={`${META} mt-1.5`}>{plan.routeNote}</p>
          </Card>
        )}

        {/* ------------------------------------------------ Since you were away
            A ledger, not a card: merchant left, amount right, hairline rules between. The total
            leads it at 18px rather than 22 — the one big figure on this screen is on the green
            panel, and repeating that shape down the page is what made nothing lead. */}
        {plan.since.transactions.length > 0 ? (
          <>
            <Eyebrow>Since {dayMonth(plan.since.from)}</Eyebrow>
            <div className="mb-3 min-w-0 px-1">
              <div className="flex items-baseline gap-2 pb-2">
                <Amount value={plan.since.spent} size="sm" />
                <span className={META}>
                  across {plan.since.transactions.length}{' '}
                  {plan.since.transactions.length === 1 ? 'payment' : 'payments'}
                </span>
              </div>
              <div className="divide-y divide-solid divide-hairline-mint border-0 border-t border-solid border-hairline-mint">
                {plan.since.transactions
                  .slice(-6)
                  .reverse()
                  .map((t) => (
                    <div className="flex items-baseline gap-3 py-2.5" key={t.txnId}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium leading-snug text-ink">
                          {merchantOf(t)}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-soft">
                          {dayMonth(t.txnDate)} · {t.spendCategory}
                        </span>
                      </span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">
                        −{inr(t.txnAmount)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        ) : null}

        {/* ------------------------------------------------ The rest
            Six findings are a list, not six cards. One hairline container, hairline rules inside
            it, and the severity carried by the tint behind the icon rather than by six identical
            borders. The rows rise in sequence because they are the last thing to arrive. */}
        <Eyebrow>What I noticed</Eyebrow>
        <div className="mb-3 min-w-0 divide-y divide-solid divide-hairline-mint rounded-md border border-solid border-hairline-mint bg-surface px-3.5">
          {plan.insights.map((i, idx) => (
            <InsightRow key={i.kind} insight={i} index={idx} />
          ))}
        </div>

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
  enabled,
  busy,
  notice,
  onDecide,
  onWhy,
}: {
  action: Action
  enabled: boolean
  busy: boolean
  notice: string | null
  onDecide: (a: Action, kind: DecisionKind) => void
  onWhy: () => void
}): ReactNode {
  const [showWhy, setShowWhy] = useState(false)
  const locked = !enabled || busy

  return (
    <section className="relative mb-3 min-w-0 rounded-md border border-solid border-hairline bg-surface p-4 pt-5">
      {/* The legend chip, sitting on the card's own edge, is how GO Mobile+ titles a section. */}
      <span className="absolute -top-2 left-3.5 rounded-pill bg-legend-chip px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand">
        Today's one thing
      </span>
      <h2 className="m-0 text-[18px] font-semibold leading-tight text-ink">{action.label}</h2>
      <p className="mb-0 mt-2 text-[14.5px] leading-normal text-ink-mid">{action.detail}</p>

      {/* Never a promise. The rate is on screen and the wording is conditional. */}
      {action.projected ? (
        <p className="mb-0 mt-3 text-[13.5px] leading-normal text-ink-soft">
          Over {action.projected.years} years at an assumed {action.projected.ratePct}%, that would
          be about <b className="text-ink">{approx(action.projected.becomes)}</b>. An illustration,
          not a promise.
        </p>
      ) : null}

      {showWhy ? (
        <div className="mt-3.5 border-0 border-t border-solid border-hairline-mint pt-3">
          {/* Grey, not the Eyebrow's orange: an orange cap inside a card reads as a section
              heading, and this card already carries an orange edge and an orange button. Same
              micro-label the Record timeline uses over its own evidence. */}
          <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            What this is based on
          </div>
          {action.evidence.map((e) => (
            <div key={e} className="py-[3px] text-[13px] text-ink-mid">
              · {e}
            </div>
          ))}
        </div>
      ) : null}

      {/* Two buttons, not three. A filled pill and an outlined one *are* the hierarchy; a third
          pill of the same shape as the second is how a card stops having a primary action. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={locked}
          onClick={() => onDecide(action, 'did_it')}
        >
          {busy ? 'Recording…' : 'Do it'}
        </button>
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={locked}
          onClick={() => onDecide(action, 'declined')}
        >
          Not now
        </button>
      </div>

      {!enabled ? (
        <p className="mb-0 mt-3 text-[13px] leading-normal text-ink-soft">
          Decisions are written to the record on the advisor service. Reconnect to act on this.
        </p>
      ) : null}
      {notice ? (
        <p role="alert" className="mb-0 mt-3 text-[13px] leading-normal text-danger">
          {notice}
        </p>
      ) : null}

      {/* Revealing the evidence is a quiet link on every other surface in the app — the insight
          rows below, a stage on Plan, an answer from Uday — so it is a quiet link here too. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-3">
        <button type="button" onClick={() => setShowWhy((v) => !v)} className={LINK}>
          Why?
        </button>
        <button type="button" onClick={onWhy} className={LINK}>
          Talk to Uday about this
        </button>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- Insight */

/* Severity reads through the disc behind the icon: a red wash, a peach one, a mint one. The icon
   itself stays green-with-one-orange, the way every icon in GO Mobile+ is drawn. */
const DISC_TINT = {
  urgent: 'bg-danger-soft',
  important: 'bg-accent-soft',
  opportunity: 'bg-tint-sage',
} as const

const PILL_TONE = {
  urgent: 'bad',
  important: 'warn',
  opportunity: 'plain',
} as const

function InsightRow({ insight, index }: { insight: Insight; index: number }): ReactNode {
  const [open, setOpen] = useState(false)

  return (
    <div className="rise flex items-start gap-3 py-3.5" style={riseDelay(index)}>
      <span
        className={`mt-px grid size-9 shrink-0 place-items-center rounded-pill text-brand ${DISC_TINT[insight.severity]}`}
      >
        <InsightIcon kind={insight.kind} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink">
            {insight.headline}
          </span>
          {insight.monthlyValue > 0 ? (
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">
              {inr(insight.monthlyValue)}
              <span className="text-[11px] font-medium text-ink-soft">/month</span>
            </span>
          ) : null}
        </div>

        <p className="mb-0 mt-1 text-[13.5px] leading-normal text-ink-soft">{insight.detail}</p>

        {/* The evidence is an annotation on the row, so it hangs off a vertical rule rather than
            sitting under another horizontal one that would read as a divider. */}
        {open ? (
          <div className="mt-2.5 border-0 border-l-[1.5px] border-solid border-hairline-mint pl-3">
            {insight.evidence.map((e) => (
              <div key={e} className="py-[3px] text-[13px] text-ink-mid">
                · {e}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Pill tone={PILL_TONE[insight.severity]}>
            {insight.severity === 'urgent'
              ? 'Needs attention'
              : insight.severity === 'important'
                ? 'Worth doing'
                : 'Opportunity'}
          </Pill>
          <button type="button" onClick={() => setOpen((v) => !v)} className={LINK}>
            {open ? 'Hide the numbers' : 'Show me the numbers'}
          </button>
        </div>
      </div>
    </div>
  )
}

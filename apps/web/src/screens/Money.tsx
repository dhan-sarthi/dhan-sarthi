/**
 * Money — the 360° view. Boring on purpose.
 *
 * The product notes call this the "you know everything about me" proof, and that is the whole job.
 * It is also where every number on Today and Plan can be traced back to, which matters when a
 * judge decides to check one.
 *
 * The commitments tab carries the distinction the engine works hardest for: a *commitment* is
 * money that leaves whether you think about it or not, and a *habit* is money you choose to
 * spend. Sixty-seven Swiggy orders is not a subscription, and telling a customer it is would read
 * as broken.
 *
 * Accounts are read from the snapshot's facts — balances, holdings, debt, protection — because
 * that is what crosses the wire. The statement itself comes from `/transactions`, a page at a
 * time, newest first, and only as far as the session's clock has reached.
 *
 * ── On the shape of this screen ──────────────────────────────────────────────────────────────
 * Each segment leads with exactly one green panel and then drops in weight: the accounts are
 * solid cards (the bank's own deck), everything that is a list is a bare ledger with hairline
 * rules, and the two blocks that genuinely need containing — the protection gap and the habits
 * argument — get a white card with an orange hairline and a legend chip on its edge. Three
 * surfaces, three jobs. Wrapping every block in the same card is what made nothing lead.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Series, Snapshot } from '@dhan/contracts'
import { Amount, Bar, Eyebrow, Head, HeroPanel, Leader, Pill, Segments } from '../components/ui.tsx'
import { Wave } from '../components/Wave.tsx'
import { dayMonth, inr, monthYear } from '../lib/money.ts'
import { merchantOf, prettyMerchant } from '../lib/merchant.ts'
import { riseDelay, useCountUp } from '../lib/motion.ts'
import { useTransactions } from '../lib/transactions.ts'
import type { TransactionSource } from '../lib/transactions.ts'

type Tab = 'accounts' | 'spending' | 'commitments'

/* Shared strings for the small text on this screen (the retired `.meta` / `.note` classes). */
const NOTE = 'm-0 text-xs leading-[1.5] text-ink-soft'

/* A bare ledger: no ground, no border of its own, one hairline above the first row and between
   the rest. Most of this screen is this. */
const LEDGER = 'mb-3 min-w-0 px-1'
const RULES =
  'divide-y divide-solid divide-hairline-mint border-0 border-t border-solid border-hairline-mint'

/* The hairline card, and the legend chip that sits on its top edge the way GO Mobile+ titles a
   section. Reserved for the two blocks that are an argument rather than a list. */
const PANEL =
  'relative mb-3 mt-6 min-w-0 rounded-md border border-solid border-hairline bg-surface p-4 pt-5'
const LEGEND =
  'absolute -top-2 left-3.5 rounded-pill bg-legend-chip px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-brand'

/* A second-level heading inside a section: quieter and smaller than the orange Eyebrow above it,
   so a group of mandates reads as a subdivision rather than as a new section. */
const SUBHEAD = 'mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft'

/* The section figure. Deliberately 18px, not the panel's 34: repeating the hero-metric shape all
   the way down a page is exactly what stops anything on it leading. */
const FIGURE_ROW = 'flex items-baseline gap-3'
const ROW_TITLE = 'block text-[15px] font-semibold leading-snug text-ink'
const ROW_META = 'mt-0.5 block text-xs text-ink-soft'

export function Money({
  snapshot,
  source,
  asOf,
}: {
  snapshot: Snapshot
  /** Pages of the statement, from the API or the offline ledger. */
  source: TransactionSource
  asOf: string
}): ReactNode {
  const [tab, setTab] = useState<Tab>('accounts')

  return (
    <>
      <Head title="Money" sub="Everything, in one place" />
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          { id: 'accounts', label: 'Accounts' },
          { id: 'spending', label: 'Spending' },
          { id: 'commitments', label: 'Commitments' },
        ]}
      />

      <div className="scroll">
        {/* The same 12px the un-segmented screens put under their header slab, so a tab on Money
            and a tab on Record start at the same line. */}
        <div className="mt-3" />
        {tab === 'accounts' ? <Accounts snapshot={snapshot} /> : null}
        {tab === 'spending' ? <Spending snapshot={snapshot} source={source} asOf={asOf} /> : null}
        {tab === 'commitments' ? <Commitments snapshot={snapshot} /> : null}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Panel ledger */

/**
 * A dotted leader line on the green panel.
 *
 * The panel's supporting figures are a statement, not a dashboard, so they run label · rule ·
 * amount rather than sitting in a grid of tiles — which also lets a long label like "Reachable
 * savings" wrap without shunting its amount out of line with the others.
 */
function PanelLine({ label, value }: { label: string; value: number }): ReactNode {
  return (
    <div className="flex items-baseline gap-2.5 py-[3px]">
      <span className="text-[13px] text-on-dark/70">{label}</span>
      <span className="flex-1 -translate-y-1 border-0 border-b border-dotted border-white/30" />
      <span className="text-[15px] font-semibold tabular-nums text-on-dark">{inr(value)}</span>
    </div>
  )
}

/* ---------------------------------------------------------------- Accounts */

/**
 * The account number we hold is not on the wire: `Snapshot` carries balances, not accounts, so
 * there is no `accountNumberMasked` to print. The deck still shows the masked line because that
 * is the shape of the bank's card and its absence reads as a missing field — but it shows the
 * mask only, never invented digits.
 */
const MASKED = '•••• •••• •••• ••••'

function Accounts({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const { balances, holdings, debt, protection } = snapshot
  const net = balances.total + holdings.outsideAccounts - debt.total
  const counted = useCountUp(net)

  return (
    <>
      {/* ------------------------------------------------ Net position
          The one thing on this tab, and the only surface shaped like this. */}
      <HeroPanel
        label="Net position"
        settled={net}
        footer={
          <>
            <PanelLine label="Account balances" value={balances.total} />
            <PanelLine label="Other investments" value={holdings.outsideAccounts} />
            <PanelLine label="Owed" value={debt.total} />
          </>
        }
      >
        <Amount value={counted} size="xl" />
      </HeroPanel>

      {/* ------------------------------------------------ The card deck
          GO Mobile+ shows accounts as solid cards, one colour per kind, and it is the single
          most recognisable thing in the app. Green for the account the salary lands in, the warm
          tint for money that is locked away. They are flat and 14px-radius against the panel's
          20px and its lift, and their figures sit at 22px against its 34: a second big white
          number on green eight pixels under the first is the hero shape repeating, which is the
          one thing this screen must not do. The deck reads as the accounts, not as more heroes.

          The eyebrow is doing structural work here, not labelling the obvious. Without it the
          deck butted straight against the panel and two green wave surfaces ten pixels apart
          read as one green mass running a third of the way down the screen. It also makes this
          section open the way Investments and Commitments already do. */}
      <Eyebrow>Accounts</Eyebrow>
      <div className="mb-3 grid gap-2.5">
        <section
          className="rise relative isolate min-w-0 overflow-hidden rounded-md bg-brand p-4 text-on-dark"
          style={riseDelay(0)}
        >
          <Wave tone="dark" className="-z-10" />
          <div className="flex items-start justify-between gap-3">
            <p className="m-0 text-[13px] text-on-dark/75">Savings account</p>
            <Pill>Savings</Pill>
          </div>
          <p className="m-0 mt-2 text-xs tracking-[0.14em] text-on-dark/55">{MASKED}</p>
          <div className="mt-1.5">
            <Amount value={balances.savings} size="md" paise />
          </div>
          <div className="mt-3 border-0 border-t border-solid border-white/20 pt-2">
            <PanelLine label="Available to use" value={balances.availableSavings} />
            {balances.lockedSavings > 0 ? (
              <PanelLine label="Unavailable or held" value={balances.lockedSavings} />
            ) : null}
          </div>
          {balances.idleFloor > 0 ? (
            <p className="mb-0 mt-2.5 text-xs leading-[1.5] text-on-dark/75">
              Never fell below {inr(balances.idleFloor)} in {balances.idleMonths} months — that part
              has not been needed once.
            </p>
          ) : null}
        </section>

        {balances.deposits > 0 ? (
          <section className="rise min-w-0 rounded-md bg-tint-clay p-4" style={riseDelay(1)}>
            <div className="flex items-start justify-between gap-3">
              <p className="m-0 text-[13px] text-ink-soft">Deposits</p>
              <Pill>FD · RD</Pill>
            </div>
            <div className="mt-2.5">
              <Amount value={balances.deposits} size="md" />
            </div>
          </section>
        ) : null}
      </div>

      {/* ------------------------------------------------ What you hold
          A ledger, not a card. The split beneath it is the existing Leader row, which already
          reads as a statement line. */}
      {holdings.total > 0 ? (
        <>
          <Eyebrow>Investments</Eyebrow>
          <div className={LEDGER}>
            <div className={`${FIGURE_ROW} pb-2`}>
              <span className="min-w-0 flex-1">
                <span className={ROW_TITLE}>What you hold</span>
                <span className={ROW_META}>
                  {snapshot.commitments.investments > 0
                    ? `${inr(snapshot.commitments.investments)}/month already going in`
                    : 'Nothing going in each month'}
                </span>
              </span>
              <Amount value={holdings.total} size="sm" />
            </div>
            <div className="border-0 border-t border-solid border-hairline-mint pt-0.5">
              <Leader label="Equity" value={inr(holdings.equity)} filled />
              <Leader label="Debt and deposits" value={inr(holdings.debt)} filled />
            </div>
          </div>
        </>
      ) : null}

      {/* ------------------------------------------------ What you owe
          The peach card this used to be said "attention" by tinting a whole block. Small orange
          text on the rate line says it in the one place the attention belongs. */}
      {debt.total > 0 ? (
        <>
          <Eyebrow>What you owe</Eyebrow>
          <div className={LEDGER}>
            <div
              className={`${FIGURE_ROW} border-0 border-b border-solid border-hairline-mint pb-2.5`}
            >
              <span className="min-w-0 flex-1">
                <span className={ROW_TITLE}>Loans and cards</span>
                <span
                  className={`mt-0.5 block text-xs ${
                    debt.hasHighInterest ? 'font-semibold text-accent-text' : 'text-ink-soft'
                  }`}
                >
                  {inr(debt.monthlyOutgo)}/month at up to {debt.highestRate}%
                </span>
              </span>
              <Amount value={debt.total} size="sm" />
            </div>
            {debt.endingSoon ? (
              <p className={`${NOTE} mt-2.5`}>
                Your {debt.endingSoon.loanType.toLowerCase()} ends in {debt.endingSoon.monthsLeft}{' '}
                {debt.endingSoon.monthsLeft === 1 ? 'month' : 'months'}, freeing{' '}
                {inr(debt.endingSoon.emiAmount)} a month.
              </p>
            ) : null}
            {debt.missedRepayment ? (
              <p className="m-0 mt-2.5 text-[13.5px] leading-normal text-danger">
                A repayment is past due. This blocks every investment recommendation until it is
                cleared.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ------------------------------------------------ Protection
          The one block on this tab that is a finding rather than a balance, so it is the one
          block that gets a container: white, orange hairline, and the section title as a legend
          chip on the card's own edge. */}
      <section className={PANEL}>
        <span className={LEGEND}>Protection</span>
        <div className={FIGURE_ROW}>
          <span className="min-w-0 flex-1">
            <span className={ROW_TITLE}>Life cover in force</span>
            <span className={ROW_META}>
              {protection.dependents} {protection.dependents === 1 ? 'dependent' : 'dependents'} ·
              indicative need {inr(protection.lifeCoverNeeded)}
            </span>
          </span>
          <Amount value={protection.lifeCoverInForce} size="sm" />
        </div>
        {protection.gap > 0 ? (
          <p className="m-0 mt-2.5 text-xs font-semibold leading-[1.5] text-accent-text">
            {inr(protection.gap)} short of what your dependents would need. This comes before any
            investment.
          </p>
        ) : null}
      </section>
    </>
  )
}

/* ---------------------------------------------------------------- Spending */

function Spending({
  snapshot,
  source,
  asOf,
}: {
  snapshot: Snapshot
  source: TransactionSource
  asOf: string
}): ReactNode {
  const cats = snapshot.discretionary.byCategory
  const max = cats[0]?.[1] ?? 1
  const counted = useCountUp(snapshot.discretionary.monthly)

  return (
    <>
      {/* ------------------------------------------------ A normal month */}
      <HeroPanel
        label="A normal month"
        meta="Median of the last twelve, so one Diwali does not distort it"
        settled={snapshot.discretionary.monthly}
        footer={
          <>
            <PanelLine label="Committed each month" value={snapshot.commitments.total} />
            <PanelLine label="Left over" value={snapshot.surplus.monthly} />
          </>
        }
      >
        <Amount value={counted} size="xl" />
        <p className="mb-0 mt-1 text-sm text-on-dark/75">
          on everything you choose, out of {inr(snapshot.income.monthly)} coming in
        </p>
      </HeroPanel>

      {/* ------------------------------------------------ Where it goes
          Twelve categories are a ledger, not twelve cards and not one card around all of them.
          The bar is the row's own evidence, so nothing else has to hold it. */}
      <Eyebrow>Where it goes · last twelve months</Eyebrow>
      <div className={LEDGER}>
        {cats.map(([category, total], i) => {
          const trend = snapshot.discretionary.categoryTrends.find((t) => t.category === category)
          return (
            <div key={category} className="rise py-2" style={riseDelay(i)}>
              <div className="flex items-baseline justify-between gap-3 text-[14.5px]">
                <span className="min-w-0 font-medium text-ink">
                  {category}
                  {trend ? (
                    <span
                      className={`ml-[7px] text-xs font-bold ${
                        trend.changePct > 0 ? 'text-danger' : 'text-good'
                      }`}
                    >
                      {trend.changePct > 0 ? '▲' : '▼'}
                      {Math.round(Math.abs(trend.changePct) * 100)}%
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">
                  {inr(total / 12)}
                  <span className="text-[11px] font-medium text-ink-soft">/mo</span>
                </span>
              </div>
              <div className="mt-1.5">
                <Bar used={(total / max) * 100} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ------------------------------------------------ Habits
          This block is an argument — these are choices, not obligations — and an argument is the
          thing that earns a container on a page of ledgers. */}
      <section className={PANEL}>
        <span className={LEGEND}>Habits · not commitments</span>
        <p className={NOTE}>
          Merchants you use often. These are choices, not obligations — which is exactly why they
          are the only real lever you have.
        </p>
        <div className={`mt-2.5 ${RULES}`}>
          {snapshot.discretionary.topHabits.map((h, i) => (
            <div className="rise flex items-center gap-3 py-2.5" key={h.key} style={riseDelay(i)}>
              <span className="grid size-9 flex-none place-items-center rounded-pill bg-tint-sage text-xs font-bold text-brand">
                {(h.merchant ?? h.key)[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium leading-snug text-ink">
                  {h.merchant ?? prettyMerchant(h.key)}
                </span>
                <span className={ROW_META}>
                  {h.timesPerMonth}× a month · typically {inr(h.typicalAmount)}
                </span>
              </span>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">
                {inr(h.annualTotal)}
                <span className="text-[11px] font-medium text-ink-soft">/yr</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <Eyebrow>Recent</Eyebrow>
      <Recent source={source} asOf={asOf} />
    </>
  )
}

/** The statement, a page at a time. Mounted only while the Spending tab is open. */
function Recent({ source, asOf }: { source: TransactionSource; asOf: string }): ReactNode {
  const txns = useTransactions(source, asOf)

  return (
    <div className={LEDGER}>
      {txns.error ? (
        <p role="alert" className={`${NOTE} mb-2 text-danger`}>
          {txns.error}
        </p>
      ) : null}
      {txns.items.length === 0 && txns.loading ? (
        <p className={NOTE} aria-live="polite">
          Reading the statement…
        </p>
      ) : null}
      {txns.items.length === 0 && !txns.loading && !txns.error ? (
        <p className={NOTE}>No statement lines up to {dayMonth(asOf)}.</p>
      ) : null}

      {/* No merchant disc here, unlike the habits above: a habit is a relationship and a
          statement line is a fact, and 20 discs down a page is decoration. */}
      <div className={txns.items.length > 0 ? RULES : undefined}>
        {txns.items.map((t) => (
          <div className="flex items-baseline gap-3 py-2.5" key={t.txnId}>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium leading-snug text-ink">
                {merchantOf(t)}
              </span>
              <span className={ROW_META}>
                {dayMonth(t.txnDate)} · {t.spendCategory} · {t.txnMode}
              </span>
            </span>
            <span
              className={`shrink-0 text-[15px] font-semibold tabular-nums ${
                t.txnType === 'CREDIT' ? 'text-good' : 'text-ink'
              }`}
            >
              {t.txnType === 'CREDIT' ? '+' : '−'}
              {inr(t.txnAmount)}
            </span>
          </div>
        ))}
      </div>

      {txns.hasMore ? (
        <button
          type="button"
          onClick={() => void txns.loadMore()}
          disabled={txns.loading}
          className="mt-3 h-11 w-full rounded-pill border-[1.5px] border-solid border-accent bg-white px-3 text-[15px] font-semibold text-accent-text transition-transform duration-100 active:scale-[0.985] disabled:opacity-55"
        >
          {txns.loading ? 'Reading…' : 'Show earlier'}
        </button>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Commitments */

/*
 * Mandates are grouped by the kind the engine already assigned them, under the same names the
 * breakdown above uses, so the list reads as the evidence for that breakdown rather than as a
 * second, differently-worded taxonomy. `transfer` and `obligation` share a heading because
 * `derive.ts` sums them into the same line.
 */
const GROUP_ORDER = [
  'Rent',
  'Loan repayments',
  'Insurance',
  'Bills',
  'Family and fees',
  'Subscriptions',
  'Already investing',
  'Income',
  'Other',
] as const

/* Typed against GROUP_ORDER rather than `string`, so a kind mapped to a heading that is not in
   the order above fails the build instead of quietly dropping its mandates off the screen. */
const GROUP_LABEL: Record<Series['kind'], (typeof GROUP_ORDER)[number]> = {
  rent: 'Rent',
  emi: 'Loan repayments',
  insurance: 'Insurance',
  bill: 'Bills',
  obligation: 'Family and fees',
  transfer: 'Family and fees',
  subscription: 'Subscriptions',
  sip: 'Already investing',
  income: 'Income',
  unknown: 'Other',
}

function Commitments({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const c = snapshot.commitments
  const counted = useCountUp(c.total)
  const groups = GROUP_ORDER.map((label) => ({
    label,
    items: c.series.filter((s) => GROUP_LABEL[s.kind] === label),
  })).filter((g) => g.items.length > 0)

  return (
    <>
      {/* ------------------------------------------------ Gone before you decide */}
      <HeroPanel
        label="Gone before you decide"
        meta="Detected from the pattern of your statements, not from a form"
        settled={c.total}
      >
        <Amount value={counted} size="xl" />
        <p className="mb-0 mt-1 text-sm text-on-dark/75">a month, {inr(c.total * 12)} a year</p>
      </HeroPanel>

      {/* The anatomy of the figure above: six lines, contained, because they are one object
          rather than a list of many. Everything below this is the evidence for them. The mint
          hairline, not the orange one: orange edges are for the cards that carry a legend chip
          and make an argument, and this is a neutral list. */}
      <section className="mb-3 min-w-0 rounded-md border border-solid border-hairline-mint bg-surface px-3.5 py-2.5">
        <Leader label="Rent" value={inr(c.rent)} filled />
        <Leader label="Loan repayments" value={inr(c.emis)} filled />
        <Leader label="Bills" value={inr(c.bills)} filled />
        <Leader label="Family and fees" value={inr(c.obligations)} filled />
        <Leader label="Subscriptions" value={inr(c.subscriptions)} filled />
        <Leader label="Already investing" value={inr(c.investments)} />
      </section>

      {/* ------------------------------------------------ Every mandate we found */}
      <Eyebrow>Every mandate we found</Eyebrow>
      {groups.map((g) => (
        <div key={g.label} className={LEDGER}>
          <div className={SUBHEAD}>{g.label}</div>
          <div className={RULES}>
            {g.items.map((s, i) => (
              <MandateRow key={s.key} series={s} index={i} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

/* One mandate. A row, not a card: the monthly figure sits at row weight rather than at 22px,
   because ten mandates each leading with a big number is ten things competing with the panel. */
function MandateRow({ series: s, index }: { series: Series; index: number }): ReactNode {
  return (
    <div className="rise py-3" style={riseDelay(index)}>
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug text-ink">
            {s.merchant ?? prettyMerchant(s.key)}
          </span>
          <span className={ROW_META}>
            {s.cadence}
            {s.dayOfMonth ? ` on day ${s.dayOfMonth}` : ''} · {s.occurrences} charges ·{' '}
            {s.fixed ? 'same amount every time' : 'varies'}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-semibold tabular-nums text-ink">
            {inr(s.monthlyCost)}
          </span>
          <span className="mt-0.5 block text-xs tabular-nums text-ink-soft">
            {inr(s.annualCost)}/yr
          </span>
        </span>
      </div>

      {/* A price that moved without anyone being told is the one thing on this list that wants
          the eye, so it is the one thing carrying the peach ground. */}
      {s.priceChanges.length > 0 ? (
        <p className="m-0 mt-2 rounded-sm bg-accent-soft px-3 py-2 text-[13px] leading-normal text-accent-text">
          Went from {inr(s.priceChanges[0]?.from ?? 0)} to {inr(s.priceChanges[0]?.to ?? 0)} in{' '}
          {monthYear(s.priceChanges[0]?.on ?? '')} —{' '}
          {inr(((s.priceChanges[0]?.to ?? 0) - (s.priceChanges[0]?.from ?? 0)) * 12)} a year you did
          not agree to.
        </p>
      ) : null}

      <p className={`${NOTE} mt-1.5`}>
        Counted as a commitment because: {s.reason.replace(/-/g, ' ')}.
      </p>
    </div>
  )
}

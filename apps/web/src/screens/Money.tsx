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
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Snapshot } from '@dhan/contracts'
import {
  Amount,
  Bar,
  Card,
  Eyebrow,
  Head,
  Leader,
  Pill,
  Segments,
  Tile,
} from '../components/ui.tsx'
import { dayMonth, inr, monthYear } from '../lib/money.ts'
import { merchantOf, prettyMerchant } from '../lib/merchant.ts'
import { useTransactions } from '../lib/transactions.ts'
import type { TransactionSource } from '../lib/transactions.ts'

type Tab = 'accounts' | 'spending' | 'commitments'

/* Shared strings for the small text on this screen (the retired `.meta` / `.note` classes). */
const META = 'm-0 text-[13px] text-ink-soft'
const NOTE = 'm-0 text-xs leading-[1.5] text-ink-soft'

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
        {tab === 'accounts' ? <Accounts snapshot={snapshot} /> : null}
        {tab === 'spending' ? <Spending snapshot={snapshot} source={source} asOf={asOf} /> : null}
        {tab === 'commitments' ? <Commitments snapshot={snapshot} /> : null}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Accounts */

function Accounts({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const { balances, holdings, debt, protection } = snapshot

  return (
    <>
      <Card>
        <div className="flex items-start justify-between">
          <p className={META}>Savings account</p>
          <Pill>Savings</Pill>
        </div>
        <div className="mt-2">
          <Amount value={balances.savings} size="lg" paise />
        </div>
        {balances.idleFloor > 0 ? (
          <p className={`${NOTE} mt-2`}>
            Never fell below {inr(balances.idleFloor)} in {balances.idleMonths} months — that part
            has not been needed once.
          </p>
        ) : null}
      </Card>

      {balances.deposits > 0 ? (
        <Card>
          <div className="flex items-start justify-between">
            <p className={META}>Deposits</p>
            <Pill>FD · RD</Pill>
          </div>
          <div className="mt-2">
            <Amount value={balances.deposits} size="lg" />
          </div>
        </Card>
      ) : null}

      {holdings.total > 0 ? (
        <>
          <Eyebrow>Investments</Eyebrow>
          <Card>
            <div className="flex justify-between gap-2.5">
              <div className="flex-1">
                <div className="text-[15.5px] font-bold text-ink">What you hold</div>
                <p className={`${META} mt-[3px]`}>
                  {snapshot.commitments.investments > 0
                    ? `${inr(snapshot.commitments.investments)}/month already going in`
                    : 'Nothing going in each month'}
                </p>
              </div>
              <Amount value={holdings.total} size="md" />
            </div>
            <div className="mt-2">
              <Leader label="Equity" value={inr(holdings.equity)} filled />
              <Leader label="Debt and deposits" value={inr(holdings.debt)} filled />
            </div>
          </Card>
        </>
      ) : null}

      {debt.total > 0 ? (
        <>
          <Eyebrow>What you owe</Eyebrow>
          <Card {...(debt.hasHighInterest ? ({ tint: 'clay' } as const) : {})}>
            <div className="flex justify-between gap-2.5">
              <div className="flex-1">
                <div className="text-[15.5px] font-bold text-ink">Loans and cards</div>
                <p className={`${META} mt-[3px]`}>
                  {inr(debt.monthlyOutgo)}/month at up to {debt.highestRate}%
                </p>
              </div>
              <Amount value={debt.total} size="md" />
            </div>
            {debt.endingSoon ? (
              <p className={`${NOTE} mt-2.5`}>
                Your {debt.endingSoon.loanType.toLowerCase()} ends in {debt.endingSoon.monthsLeft}{' '}
                {debt.endingSoon.monthsLeft === 1 ? 'month' : 'months'}, freeing{' '}
                {inr(debt.endingSoon.emiAmount)} a month.
              </p>
            ) : null}
            {debt.missedRepayment ? (
              <p className="m-0 mt-2.5 text-[13.5px] text-danger">
                A repayment is past due. This blocks every investment recommendation until it is
                cleared.
              </p>
            ) : null}
          </Card>
        </>
      ) : null}

      <Eyebrow>Protection</Eyebrow>
      <Card {...(protection.gap > 0 ? ({ tint: 'clay' } as const) : {})}>
        <div className="flex justify-between gap-2.5">
          <div className="flex-1">
            <div className="text-[15.5px] font-bold text-ink">Life cover in force</div>
            <p className={`${META} mt-[3px]`}>
              {protection.dependents} {protection.dependents === 1 ? 'dependent' : 'dependents'} ·
              indicative need {inr(protection.lifeCoverNeeded)}
            </p>
          </div>
          <Amount value={protection.lifeCoverInForce} size="md" />
        </div>
        {protection.gap > 0 ? (
          <p className={`${NOTE} mt-2.5`}>
            {inr(protection.gap)} short of what your dependents would need. This comes before any
            investment.
          </p>
        ) : null}
      </Card>

      <Eyebrow>Position</Eyebrow>
      <Card tint="sage">
        <div className="grid grid-cols-2 gap-2.5">
          <Tile label="Reachable savings" value={balances.total} />
          <Tile label="Invested" value={holdings.total} />
          <Tile label="Owed" value={debt.total} />
          <Tile label="Net" value={balances.total + holdings.total - debt.total} />
        </div>
      </Card>
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

  return (
    <>
      <div className="mt-3">
        <Card tint="sage">
          <h2>A normal month</h2>
          <p className={META}>Median of the last twelve, so one Diwali does not distort it</p>
          <div className="mb-1 mt-3.5">
            <Amount value={snapshot.discretionary.monthly} size="xl" />
          </div>
          <p className={META}>
            on everything you choose, out of {inr(snapshot.income.monthly)} coming in
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Tile label="Committed each month" value={snapshot.commitments.total} />
            <Tile label="Left over" value={snapshot.surplus.monthly} />
          </div>
        </Card>
      </div>

      <Eyebrow>Where it goes · last twelve months</Eyebrow>
      <Card>
        {cats.map(([category, total]) => {
          const trend = snapshot.discretionary.categoryTrends.find((t) => t.category === category)
          return (
            <div key={category} className="py-[9px]">
              <div className="flex justify-between text-[14.5px]">
                <span className="font-semibold text-ink">
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
                <span className="font-bold tabular-nums text-ink">
                  {inr(total / 12)}
                  <span className="font-medium text-ink-soft">/mo</span>
                </span>
              </div>
              <div className="mt-1.5">
                <Bar used={(total / max) * 100} />
              </div>
            </div>
          )
        })}
      </Card>

      <Eyebrow>Habits · not commitments</Eyebrow>
      <Card>
        <p className={`${NOTE} mb-3`}>
          Merchants you use often. These are choices, not obligations — which is exactly why they
          are the only real lever you have.
        </p>
        <div className="divide-y divide-solid divide-hairline-mint">
          {snapshot.discretionary.topHabits.map((h) => (
            <div className="flex items-center gap-3 py-[11px]" key={h.key}>
              <span className="grid size-[34px] flex-none place-items-center rounded-pill bg-tint-sage text-xs font-bold text-brand">
                {(h.merchant ?? h.key)[0]}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[14.5px] font-bold text-ink">
                  {h.merchant ?? prettyMerchant(h.key)}
                </b>
                <span className="block text-xs text-ink-soft">
                  {h.timesPerMonth}× a month · typically {inr(h.typicalAmount)}
                </span>
              </span>
              <span className="text-[14.5px] font-bold tabular-nums text-ink">
                {inr(h.annualTotal)}/yr
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Eyebrow>Recent</Eyebrow>
      <Recent source={source} asOf={asOf} />
    </>
  )
}

/** The statement, a page at a time. Mounted only while the Spending tab is open. */
function Recent({ source, asOf }: { source: TransactionSource; asOf: string }): ReactNode {
  const txns = useTransactions(source, asOf)

  return (
    <Card>
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

      <div className="divide-y divide-solid divide-hairline-mint">
        {txns.items.map((t) => (
          <div className="flex items-center gap-3 py-[11px]" key={t.txnId}>
            <span className="grid size-8 flex-none place-items-center rounded-pill bg-tint-sage text-[11px] font-bold text-brand">
              {t.spendCategory[0]}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px] font-bold text-ink">{merchantOf(t)}</b>
              <span className="block text-xs text-ink-soft">
                {dayMonth(t.txnDate)} · {t.spendCategory} · {t.txnMode}
              </span>
            </span>
            <span
              className={`text-[14.5px] font-bold tabular-nums ${
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
          className="mt-3 h-11 w-full rounded-pill border-[1.5px] border-solid border-accent bg-white px-3 text-[15px] font-semibold text-accent-text transition-transform duration-100 active:scale-[0.985] disabled:opacity-60"
        >
          {txns.loading ? 'Reading…' : 'Show earlier'}
        </button>
      ) : null}
    </Card>
  )
}

/* ---------------------------------------------------------------- Commitments */

function Commitments({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const c = snapshot.commitments

  return (
    <>
      <div className="mt-3">
        <Card tint="clay">
          <h2>Gone before you decide</h2>
          <p className={META}>Detected from the pattern of your statements, not from a form</p>
          <div className="mb-1 mt-3.5">
            <Amount value={c.total} size="xl" />
          </div>
          <p className={META}>a month, {inr(c.total * 12)} a year</p>

          <div className="mt-4">
            <Leader label="Rent" value={inr(c.rent)} filled />
            <Leader label="Loan repayments" value={inr(c.emis)} filled />
            <Leader label="Bills" value={inr(c.bills)} filled />
            <Leader label="Family and fees" value={inr(c.obligations)} filled />
            <Leader label="Subscriptions" value={inr(c.subscriptions)} filled />
            <Leader label="Already investing" value={inr(c.investments)} />
          </div>
        </Card>
      </div>

      <Eyebrow>Every mandate we found</Eyebrow>
      {c.series.map((s) => (
        <Card key={s.key}>
          <div className="flex justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[15.5px] font-bold text-ink">
                {s.merchant ?? prettyMerchant(s.key)}
              </div>
              <p className={`${META} mt-[3px]`}>
                {s.cadence}
                {s.dayOfMonth ? ` on day ${s.dayOfMonth}` : ''} · {s.occurrences} charges ·{' '}
                {s.fixed ? 'same amount every time' : 'varies'}
              </p>
            </div>
            <div className="text-right">
              <Amount value={s.monthlyCost} size="md" />
              <div className={NOTE}>{inr(s.annualCost)}/yr</div>
            </div>
          </div>

          {s.priceChanges.length > 0 ? (
            <p className="m-0 mt-[11px] rounded-sm bg-accent-soft px-3 py-2.5 text-[13.5px] leading-normal text-accent-text">
              Went from {inr(s.priceChanges[0]?.from ?? 0)} to {inr(s.priceChanges[0]?.to ?? 0)} in{' '}
              {monthYear(s.priceChanges[0]?.on ?? '')} —{' '}
              {inr(((s.priceChanges[0]?.to ?? 0) - (s.priceChanges[0]?.from ?? 0)) * 12)} a year you
              did not agree to.
            </p>
          ) : null}

          <p className={`${NOTE} mt-[9px]`}>
            Counted as a commitment because: {s.reason.replace(/-/g, ' ')}.
          </p>
        </Card>
      ))}
    </>
  )
}

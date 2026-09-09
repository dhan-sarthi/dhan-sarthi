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
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Account as AccountRow, SpendCategory, Snapshot } from '@dhan/contracts'
import { Link2, Pencil, Plus } from 'lucide-react'
import {
  Amount,
  Bar,
  Button,
  Card,
  Eyebrow,
  Head,
  Leader,
  Pill,
  Segments,
  Skeleton,
  Tile,
} from '../components/ui.tsx'
import { PullToRefresh } from '../components/PullToRefresh.tsx'
import { dayMonth, inr, monthYear } from '../lib/money.ts'
import { merchantOf, prettyMerchant } from '../lib/merchant.ts'
import { useTransactions } from '../lib/transactions.ts'
import { useRipple } from '../lib/motion.ts'
import type { TransactionSource } from '../lib/transactions.ts'

type Tab = 'accounts' | 'spending' | 'commitments'

/* Shared strings for the small text on this screen (the retired `.meta` / `.note` classes). */
const META = 'm-0 text-[13px] text-ink-soft'
const NOTE = 'm-0 text-xs leading-[1.5] text-ink-soft'

export function Money({
  snapshot,
  accounts,
  source,
  asOf,
  onEditHoldings,
  onLinkAccounts,
  onRefresh,
}: {
  snapshot: Snapshot
  /** One row per account, rather than the snapshot's two totals. */
  accounts: readonly AccountRow[]
  /** Pages of the statement, from the API or the offline ledger. */
  source: TransactionSource
  asOf: string
  /** The holdings block is the app's own, so this screen is where it is changed. */
  onEditHoldings: () => void
  /** Accounts at other banks, through the Account Aggregator. */
  onLinkAccounts: () => void
  /** Pull down at the top to re-read the view. */
  onRefresh: () => Promise<void>
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

      <PullToRefresh className="scroll" contentClassName="ds-enter" onRefresh={onRefresh}>
        {tab === 'accounts' ? (
          <Accounts
            snapshot={snapshot}
            accounts={accounts}
            onEditHoldings={onEditHoldings}
            onLinkAccounts={onLinkAccounts}
          />
        ) : null}
        {tab === 'spending' ? <Spending snapshot={snapshot} source={source} asOf={asOf} /> : null}
        {tab === 'commitments' ? <Commitments snapshot={snapshot} /> : null}
      </PullToRefresh>
    </>
  )
}

/* ---------------------------------------------------------------- Accounts */

function Accounts({
  snapshot,
  accounts,
  onEditHoldings,
  onLinkAccounts,
}: {
  snapshot: Snapshot
  /** The accounts themselves. Empty where the customer has withdrawn the block. */
  accounts: readonly AccountRow[]
  onEditHoldings: () => void
  onLinkAccounts: () => void
}): ReactNode {
  const { balances, holdings, debt, protection } = snapshot

  return (
    <>
      {/* One row per account, which is what somebody opening a banking app came to see. The
          screen used to show two totals, and a customer with four accounts got two numbers
          neither of which was any of their balances. */}
      {accounts.map((a, i) => (
        <AccountCard key={a.accountNumberMasked} account={a} index={i} />
      ))}

      {accounts.length === 0 ? (
        <>
          <Card>
            <div className="flex items-start justify-between">
              <p className={META}>Savings account</p>
              <Pill>Savings</Pill>
            </div>
            <div className="mt-2">
              <Amount value={balances.savings} size="lg" paise />
            </div>
            {/* The claim needs whole months behind it. With `idleMonths` at 0 it read "never fell
            below ₹56,780 in 0 months", which asserts a floor over no period at all. */}
            {balances.idleFloor > 0 && balances.idleMonths > 0 ? (
              <p className={`${NOTE} mt-2`}>
                Never fell below {inr(balances.idleFloor)} in{' '}
                {balances.idleMonths === 1 ? 'a month' : `${balances.idleMonths} months`} — that
                part has not been needed once.
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
        </>
      ) : null}

      {/* The whole block is the app's own record, so it is editable from where it is shown
          rather than from a settings screen somebody has to go looking for. */}
      <Eyebrow>Investments</Eyebrow>
      {holdings.total > 0 ? (
        <>
          <Card>
            <div className="flex justify-between gap-2.5">
              <div className="flex-1">
                <div className="text-[15.5px] font-bold text-ink">What you hold</div>
                {/* Prefer the SIP debits seen in the statement; fall back to what the holdings
                    themselves declare, since a feed with no recognisable narration finds no
                    debits and would otherwise report "nothing going in" over a live mandate. */}
                <p className={`${META} mt-[3px]`}>
                  {snapshot.commitments.investments > 0
                    ? `${inr(snapshot.commitments.investments)}/month already going in`
                    : holdings.sipMonthly > 0
                      ? `${inr(holdings.sipMonthly)}/month going in, on your own record`
                      : 'Nothing going in each month'}
                </p>
              </div>
              <Amount value={holdings.total} size="md" />
            </div>
            <div className="mt-2">
              <Leader label="Equity" value={inr(holdings.equity)} filled />
              <Leader label="Debt and deposits" value={inr(holdings.debt)} filled />
            </div>
            <div className="mt-3.5">
              <Button tone="secondary" size="sm" full onClick={onEditHoldings}>
                <Pencil size={15} strokeWidth={2.5} />
                Change what you own
              </Button>
            </div>
          </Card>
        </>
      ) : (
        <Card tint="clay">
          <h2>Tell us what you already own</h2>
          <p className={`${META} mt-1.5`}>
            The bank has no record of your funds, deposits elsewhere or insurance. Without them we
            cannot tell whether you already hold what we are about to suggest.
          </p>
          <div className="mt-3.5">
            <Button size="sm" full onClick={onEditHoldings}>
              <Plus size={16} strokeWidth={2.6} />
              Add what you own
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15.5px] font-bold text-ink">Accounts at other banks</div>
            <p className={`${META} mt-[3px]`}>
              Link them and the plan works from all of your money, not just the part held here.
            </p>
          </div>
          <Link2 size={19} strokeWidth={2.2} className="mt-0.5 flex-none text-accent-text" />
        </div>
        <div className="mt-3.5">
          <Button tone="secondary" size="sm" full onClick={onLinkAccounts}>
            Link an account
          </Button>
        </div>
      </Card>

      {debt.total > 0 ? (
        <>
          <Eyebrow>What you owe</Eyebrow>
          <Card {...(debt.hasHighInterest ? ({ tint: 'clay' } as const) : {})}>
            <div className="flex justify-between gap-2.5">
              <div className="flex-1">
                <div className="text-[15.5px] font-bold text-ink">Loans and cards</div>
                {/* Terms come from 391 and 433, and IDBI holds them for one loan account out
                    of five. "₹0/month at up to 0%" on a ₹6 lakh balance is not a fact about the
                    loan, it is the absence of one. */}
                <p className={`${META} mt-[3px]`}>
                  {debt.monthlyOutgo > 0 || debt.highestRate > 0
                    ? `${inr(debt.monthlyOutgo)}/month at up to ${debt.highestRate}%`
                    : 'The bank sends no rate or instalment for these'}
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
            {/* With nobody depending on the income there is no requirement to quote, and
                "0 dependents · indicative need ₹0" reads as a calculation that failed rather
                than as the right answer. */}
            <p className={`${META} mt-[3px]`}>
              {protection.dependents === 0
                ? 'Nobody on record depends on your income'
                : `${protection.dependents} ${protection.dependents === 1 ? 'dependent' : 'dependents'} · indicative need ${inr(protection.lifeCoverNeeded)}`}
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
  const [filter, setFilter] = useState<SpendCategory | null>(null)
  const txns = useTransactions(source, asOf, filter)
  const ripple = useRipple()
  const empty = txns.items.length === 0

  /*
   * The chips are the categories actually present, learned from the unfiltered list.
   *
   * Not `discretionary.byCategory`, which is the obvious source and the wrong one: it excludes
   * income and charges by design, so over this feed it offered a single chip reading
   * "Transfers" while the statement also held Income and Fees & charges. Learned rather than
   * derived per render because a filtered list only ever contains one category, and chips that
   * vanish the moment you use them are not a filter.
   */
  const [seen, setSeen] = useState<SpendCategory[]>([])
  useEffect(() => {
    if (filter !== null) return
    const next = [...new Set(txns.items.map((t) => t.spendCategory))].sort()
    queueMicrotask(() => setSeen((prev) => (next.length > prev.length ? next : prev)))
  }, [txns.items, filter])

  return (
    <Card>
      {/* Filtering happens on the server, which is why this resets the list rather than hiding
          rows: a cursor issued under one category means nothing under another. */}
      {seen.length > 1 ? (
        <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {[null, ...seen].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              aria-pressed={filter === c}
              onPointerDown={ripple}
              onClick={() => setFilter(c)}
              className={`ds-press h-9 flex-none rounded-pill px-3.5 text-[13px] font-semibold ${
                filter === c
                  ? 'border-0 bg-accent text-white'
                  : 'border border-solid border-hairline bg-surface text-ink-mid'
              }`}
            >
              {c ?? 'All'}
            </button>
          ))}
        </div>
      ) : null}

      {txns.error ? (
        <p role="alert" className={`${NOTE} mb-2 text-danger`}>
          {txns.error}
        </p>
      ) : null}

      {empty && txns.loading ? (
        <div aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 py-[11px]">
              <Skeleton h={32} w={32} className="flex-none rounded-pill" />
              <div className="min-w-0 flex-1">
                <Skeleton h={13} w="52%" className="mb-1.5" />
                <Skeleton h={11} w="34%" />
              </div>
              <Skeleton h={13} w={62} />
            </div>
          ))}
        </div>
      ) : null}

      {empty && !txns.loading && !txns.error ? (
        <p className={NOTE}>
          {filter === null
            ? `No statement lines up to ${dayMonth(asOf)}.`
            : `Nothing under ${filter} up to ${dayMonth(asOf)}.`}
        </p>
      ) : null}

      <div className="divide-y divide-solid divide-hairline-mint">
        {txns.items.map((t, i) => (
          <div
            className="ds-rise ds-stagger flex items-center gap-3 py-[11px]"
            key={t.txnId}
            style={{ '--i': i } as CSSProperties}
          >
            <span className="grid size-8 flex-none place-items-center rounded-pill bg-tint-sage text-[11px] font-bold text-brand">
              {t.spendCategory[0]}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px] font-bold text-ink">{merchantOf(t)}</b>
              <span className="block text-xs text-ink-soft">
                {/* The mode is UNKNOWN on every row of IDBI's own statement, which sends none.
                    Printing the word is worse than leaving the gap. */}
                {dayMonth(t.txnDate)} · {t.spendCategory}
                {t.txnMode === 'UNKNOWN' ? '' : ` · ${t.txnMode}`}
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
        <div className="mt-3">
          <Button tone="secondary" full busy={txns.loading} onClick={() => void txns.loadMore()}>
            Show earlier
          </Button>
        </div>
      ) : null}
    </Card>
  )
}

/* ---------------------------------------------------------------- Commitments */

function Commitments({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const c = snapshot.commitments

  /*
   * Nothing recognised is not the same as nothing committed.
   *
   * The card is built to break a total into rent, loans, bills and the rest, and over a
   * statement whose narrations carry no merchant every one of those is zero — so it read
   * "₹0 a month, ₹0 a year" over six rows of ₹0, which looks like a customer with no
   * obligations rather than a statement we could not read. IDBI's own feed makes that the
   * normal case.
   */
  if (c.total <= 0) {
    return (
      <div className="mt-3">
        <Card tint="clay">
          <h2>Nothing recognisable as a commitment</h2>
          <p className={`${META} mt-1.5`}>
            Rent, loan repayments, bills and standing instructions are found by reading the
            narration on each line. Nothing in this statement carries one, so there is no breakdown
            to show — not because there is nothing going out, but because the bank does not say what
            it was for.
          </p>
          {snapshot.debt.monthlyOutgo > 0 ? (
            <p className={`${NOTE} mt-3`}>
              The one exception is {inr(snapshot.debt.monthlyOutgo)} a month of loan repayment,
              which comes from the loan record rather than from the statement.
            </p>
          ) : null}
        </Card>
      </div>
    )
  }

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

/* ---------------------------------------------------------------- One account */

const ACCOUNT_PILL: Record<AccountRow['accountType'], string> = {
  Savings: 'Savings',
  Current: 'Current',
  FD: 'Fixed deposit',
  RD: 'Recurring deposit',
  PPF: 'PPF',
  NPS: 'NPS',
}

/**
 * One account, with the detail the aggregate threw away.
 *
 * The spendable figure is the bank's own `EFFAVL`, not the balance less the lien: on a current
 * account IDBI withholds a minimum balance on top of the lien, so the two are different numbers
 * and the smaller one is the true one. Shown only when it differs from the balance, because
 * "₹56,780 · ₹56,780 available" is noise.
 */
function AccountCard({ account, index }: { account: AccountRow; index: number }): ReactNode {
  const held =
    account.effectiveAvailableBalance !== undefined &&
    account.effectiveAvailableBalance < account.currentBalance
      ? account.currentBalance - account.effectiveAvailableBalance
      : 0
  // Never more than what is actually withheld: a lien larger than the gap would mean the two
  // figures disagree, and the smaller one is the one the customer can go and verify.
  const lien = Math.min(held, account.lienAmount ?? 0)

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <p className={META}>
          {account.accountNumberMasked.slice(-8)}
          {account.branchIfsc ? ` · ${account.branchIfsc}` : ''}
        </p>
        <Pill>{ACCOUNT_PILL[account.accountType]}</Pill>
      </div>
      <div className="mt-2">
        <Amount value={account.currentBalance} size="lg" paise />
      </div>

      {held > 0 ? (
        <div className="mt-2.5">
          <Leader
            label="Yours to spend"
            value={inr(account.effectiveAvailableBalance ?? 0)}
            filled
          />
          {/* The lien is only part of it. On the current account IDBI withholds ₹2,000 of lien
              and a further ₹3,000 of minimum balance, so calling the whole ₹5,000 a lien would
              be wrong about a figure the customer could go and check. */}
          {lien > 0 ? <Leader label="Held by a lien" value={`−${inr(lien)}`} /> : null}
          {held - lien > 0.005 ? (
            <Leader
              label={lien > 0 ? 'Also held back' : 'Held back'}
              value={`−${inr(held - lien)}`}
            />
          ) : null}
        </div>
      ) : null}

      <p className={`${NOTE} mt-2.5`}>
        {account.maturityDate !== undefined
          ? `Matures ${dayMonth(account.maturityDate)} ${account.maturityDate.slice(0, 4)}`
          : account.accountOpeningDate > '1970-01-01'
            ? `Open since ${monthYear(account.accountOpeningDate)}`
            : 'The bank sends no opening date for this one'}
        {account.interestRate !== undefined ? ` · ${account.interestRate}%` : ''}
      </p>
      {/* Index is only here so the stagger has something to key on when the list is long. */}
      <span hidden>{index}</span>
    </Card>
  )
}

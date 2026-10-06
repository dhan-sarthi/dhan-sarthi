import type { Customer360Liability } from '@dhan/contracts'
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Flame,
  HeartPulse,
  Landmark,
  ShieldOff,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatDate, formatMonth, formatPct } from '../../lib/format.ts'
import {
  ALLOCATION_PARTS,
  AllocationBar,
  AreaChart,
  Button,
  Card,
  CardHeader,
  Chip,
  DeltaPill,
  EmptyState,
  Money,
  type SeriesDef,
} from '../../ui/index.ts'
import {
  firstName,
  gainPct,
  groupByBank,
  groupHoldings,
  lastFour,
  plural,
  possessive,
  useCustomerFile,
  type CustomerFile,
  type HoldingGroup,
} from './customer-file.ts'
import { Block, CardSkeleton, Meter, TAB_STACK, TabLoading } from './parts.tsx'
import { ProseInr } from './figures.tsx'
import { midSentence } from './prose.ts'

/**
 * Money: everything the customer has and owes, across every bank we can see. Net worth and its
 * mix first, then twelve months of balances (balances only: holdings and loans are flat before the
 * as-of date in the record, so charting them would draw a flat line and call it growth), then the
 * accounts by bank, holdings by type, loans, and cover against need.
 */
export function CustomerMoney() {
  const { query } = useCustomerFile()
  const customer = query.data
  if (!customer) {
    return (
      <TabLoading label="Loading money">
        <CardSkeleton lines={3} />
        <CardSkeleton lines={6} />
        <CardSkeleton rows={3} />
        <CardSkeleton rows={5} />
      </TabLoading>
    )
  }
  return (
    <div className={TAB_STACK}>
      <NetWorth customer={customer} />
      <BalanceHistory customer={customer} />
      <Accounts customer={customer} />
      <Holdings customer={customer} />
      <Loans customer={customer} />
      <Protection customer={customer} />
    </div>
  )
}

/** "As at 1 Sep 2026", in the API's words, beside every figure read on the as-of date. */
function AsAt({ customer }: { customer: CustomerFile }) {
  return <span className="text-caption-plain text-ink-faint">{customer.basis.asOfLabel}</span>
}

/* ---------------------------------------------------------------- Net worth */

function NetWorth({ customer }: { customer: CustomerFile }) {
  const { assets, liabilities, net, allocation } = customer.money.netWorth
  const total = allocation.cash + allocation.equity + allocation.fixed
  return (
    <Card>
      <CardHeader title="Net worth" actions={<AsAt customer={customer} />} />
      <div className="grid grid-cols-1 gap-8 @min-[41rem]/tab:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0">
          <Money value={net} className={cn('text-figure', net < 0 ? 'text-danger' : 'text-ink')} />
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-hairline-soft pt-4">
            <div>
              <dt className="text-caption text-ink-faint">Assets we can see</dt>
              <dd className="mt-1 text-heading text-ink">
                <Money value={assets} />
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-faint">Loans and cards</dt>
              <dd className="mt-1 text-heading text-ink">
                {liabilities > 0 ? <Money value={-liabilities} /> : <Money value={0} />}
              </dd>
            </div>
          </dl>
        </div>
        <div className="min-w-0">
          <p className="mb-2.5 text-caption text-ink-faint">What the assets are in</p>
          <AllocationBar allocation={allocation} size="regular" />
          <ul className="mt-3 grid gap-2">
            {ALLOCATION_PARTS.map((part) => {
              const value = allocation[part.key]
              return (
                <li
                  key={part.key}
                  className={cn(
                    'grid grid-cols-[minmax(0,1fr)_auto_3rem] items-baseline gap-3 text-label',
                    value === 0 && 'opacity-60',
                  )}
                >
                  <span className="inline-flex items-center gap-2 text-ink-soft">
                    <span aria-hidden className={cn('size-2 rounded-full', part.fill)} />
                    {part.label}
                  </span>
                  <Money value={value} className="text-ink" />
                  <span className="text-right tabular text-ink-faint">
                    {total > 0 ? formatPct(Math.round((value / total) * 100)) : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------- Balance history */

/** A short line in the series' own stroke, so the legend reads as the chart does. */
function LineSwatch({ dashed = false, tone }: { dashed?: boolean; tone: 'brand' | 'neutral' }) {
  return (
    <svg
      aria-hidden
      width="16"
      height="8"
      className={tone === 'brand' ? 'text-chart-1' : 'text-chart-comparison'}
    >
      <line
        x1="1"
        x2="15"
        y1="4"
        y2="4"
        stroke="currentColor"
        strokeWidth={dashed ? 1.5 : 2}
        strokeLinecap="round"
        {...(dashed ? { strokeDasharray: '4 3' } : {})}
      />
    </svg>
  )
}

function changePct(first: number | undefined, last: number | undefined): number | null {
  if (first === undefined || last === undefined || first === 0) return null
  return Math.round(((last - first) / Math.abs(first)) * 1000) / 10
}

function BalanceHistory({ customer }: { customer: CustomerFile }) {
  const { basis } = customer
  const series = customer.money.balanceSeries
  const first = series[0]
  const last = series[series.length - 1]
  // The chart's last point is a month-end; the share on the header is as at the 1st, a payday
  // later. Where the two differ by a point or more, the caption says both, so 12% here and 26%
  // on the header read as two dates, not two answers.
  const monthEndShare =
    last && last.total > 0 ? Math.round((last.withIdbi / last.total) * 100) : null
  const asAtShare =
    customer.money.walletSharePct !== null ? Math.round(customer.money.walletSharePct) : null
  // Where every balance is already with IDBI the two lines are one; drawing both would only
  // lay a dashed line over a solid one.
  const allIdbi = customer.money.accounts.every((a) => a.isIdbi)
  const defs: SeriesDef[] = [{ key: 'total', label: 'All banks' }]
  if (!allIdbi) defs.push({ key: 'withIdbi', label: 'With IDBI', role: 'comparison' })

  return (
    <Card>
      <CardHeader title="Balances, last 12 months" />
      {series.length < 2 || !first || !last ? (
        <EmptyState
          className="py-5"
          title="Not enough history to chart"
          body="A balance line needs at least two month-ends on record."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-10 gap-y-3">
            <LegendStat
              swatch={<LineSwatch tone="brand" />}
              label={allIdbi ? 'All balances, all with IDBI' : 'All banks'}
              value={last.total}
              change={changePct(first.total, last.total)}
              basis={basis.lastMonthEndLabel}
            />
            {allIdbi ? null : (
              <LegendStat
                swatch={<LineSwatch tone="neutral" dashed />}
                label="With IDBI"
                value={last.withIdbi}
                change={changePct(first.withIdbi, last.withIdbi)}
                basis={basis.lastMonthEndLabel}
              />
            )}
          </div>
          {/* From zero: a customer's balances moving 5% should look like 5%, not a climb. The
              change itself is the pill in the legend above. */}
          <AreaChart
            data={series}
            x="month"
            series={defs}
            height={200}
            zeroBased
            label={`Month-end balances from ${formatMonth(first.month)} to ${formatMonth(last.month)}`}
          />
          <p className="mt-3 text-caption-plain text-ink-faint">
            {basis.seriesLabel}, every linked account. Holdings and loans are not charted; they are
            shown below, {midSentence(basis.asOfLabel)}.
            {!allIdbi &&
            monthEndShare !== null &&
            asAtShare !== null &&
            Math.abs(monthEndShare - asAtShare) >= 1 ? (
              <>
                {' '}
                With IDBI is {formatPct(monthEndShare)} of balances at the{' '}
                {formatDate(basis.lastMonthEnd, { year: false })} month-end and{' '}
                {formatPct(asAtShare)} {midSentence(basis.asOfLabel)}, after payday.
              </>
            ) : null}
          </p>
        </>
      )}
    </Card>
  )
}

function LegendStat({
  swatch,
  label,
  value,
  change,
  basis,
}: {
  swatch: ReactNode
  label: string
  value: number
  change: number | null
  /** "Month-end, 31 Aug 2026": the date the figure is read on. */
  basis: string
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-caption text-ink-soft">
        {swatch}
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <Money value={value} className="text-title text-ink" />
        {change !== null ? <DeltaPill value={change} /> : null}
      </div>
      <p className="mt-0.5 text-caption-plain text-ink-faint">
        {basis}
        {change !== null ? ' · change over 12 month-ends' : ''}
      </p>
    </div>
  )
}

/* ---------------------------------------------------------------- Accounts */

function Accounts({ customer }: { customer: CustomerFile }) {
  const { accounts, walletSharePct, balances: total, withIdbi } = customer.money
  const groups = groupByBank(accounts)
  const name = firstName(customer.profile.name)

  return (
    <Block title="Accounts" count={accounts.length} actions={<AsAt customer={customer} />}>
      {accounts.length === 0 ? (
        <EmptyState
          className="py-5"
          icon={<Landmark />}
          title="No bank accounts on record"
          body={`Neither IDBI nor a linked bank shows an account for ${name}.`}
        />
      ) : (
        <>
          {walletSharePct !== null ? (
            <div className="mb-5 rounded-md bg-canvas-top px-4 py-3">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-label text-ink">
                  <span className="tabular">{formatPct(Math.round(walletSharePct))}</span> of
                  balances with IDBI
                </p>
                <p className="text-caption-plain text-ink-soft">
                  <Money value={withIdbi} /> of <Money value={total} /> across{' '}
                  {plural(groups.length, 'bank')}
                </p>
              </div>
              <Meter
                value={walletSharePct}
                max={100}
                tone={walletSharePct < 30 ? 'streak' : 'brand'}
                label={`${formatPct(Math.round(walletSharePct))} of balances with IDBI`}
              />
            </div>
          ) : null}
          <ul className="divide-y divide-hairline-soft">
            {groups.map((group) => {
              const only = group.accounts.length === 1 ? group.accounts[0] : undefined
              return (
                <li key={group.institution} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          'mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4',
                          group.isIdbi
                            ? 'bg-brand-soft text-brand-deep'
                            : 'bg-ground-deep text-ink-soft',
                        )}
                      >
                        <Landmark />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-heading text-ink">{group.institution}</h3>
                        <p className="truncate text-caption-plain text-ink-faint">
                          {only ? (
                            <>
                              {only.type}{' '}
                              <span className="tabular">····&thinsp;{lastFour(only.masked)}</span>
                            </>
                          ) : (
                            plural(group.accounts.length, 'account')
                          )}
                          {' · '}
                          {group.isIdbi ? 'With IDBI' : 'Through Account Aggregator'}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money value={group.total} className="text-label font-semibold text-ink" />
                      <p className="text-caption-plain tabular text-ink-faint">
                        {total > 0 ? formatPct(Math.round((group.total / total) * 100)) : '—'} of
                        balances
                      </p>
                    </div>
                  </div>
                  {only ? null : (
                    <ul className="mt-2 ml-11 grid gap-1 border-l border-hairline-soft pl-3">
                      {group.accounts.map((account) => (
                        <li
                          key={account.id}
                          className="flex items-baseline justify-between gap-3 text-label"
                        >
                          <span className="text-ink-soft">
                            {account.type}{' '}
                            <span className="tabular text-ink-faint">
                              ····&thinsp;{lastFour(account.masked)}
                            </span>
                          </span>
                          <Money value={account.balance} className="text-ink" />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Block>
  )
}

/* ---------------------------------------------------------------- Holdings */

/*
 * The holdings and loans lists are tables drawn as grids. Where the tab's column is narrow (a
 * phone), the name takes its own line and the figures share the line under it, so the name is
 * never squeezed to nothing and the figures never run off the card.
 */
const HOLDING_COLS =
  'grid grid-cols-3 items-baseline gap-x-3 gap-y-1 @xl/tab:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_4.75rem] @xl/tab:gap-y-3'
const HOLDING_NAME = 'col-span-3 @xl/tab:col-span-1'

function Holdings({ customer }: { customer: CustomerFile }) {
  const holdings = customer.money.holdings
  const groups = groupHoldings(holdings)
  const invested = groups.reduce((s, g) => s + g.invested, 0)
  const current = groups.reduce((s, g) => s + g.current, 0)
  const sip = groups.reduce((s, g) => s + g.sipMonthly, 0)
  const name = firstName(customer.profile.name)

  return (
    <Block title="Holdings" count={holdings.length} actions={<AsAt customer={customer} />}>
      {holdings.length === 0 ? (
        <EmptyState
          className="py-5"
          title="No holdings on record"
          body={`${name} holds no funds, shares, deposits or provident savings we can see.`}
        />
      ) : (
        <>
          <dl className="mb-5 grid grid-cols-2 gap-4 @xl/tab:grid-cols-3">
            {/* The gain belongs to the value, so its pill sits there, with what was put in under
                it as the base it is measured from. */}
            <div className="col-span-2 @xl/tab:col-span-1">
              <dt className="text-caption text-ink-faint">Value</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-title text-ink">
                <Money value={current} />
                <GainPill invested={invested} current={current} />
              </dd>
              <dd className="mt-0.5 text-caption-plain text-ink-faint">
                on <Money value={invested} /> put in
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-faint">Gain</dt>
              <dd className="mt-1 text-title text-ink">
                <Money value={current - invested} signed toned />
              </dd>
              <dd className="mt-0.5 text-caption-plain text-ink-faint">
                Value less what was put in
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-faint">SIPs running</dt>
              <dd className="mt-1 text-title text-ink">
                {sip > 0 ? (
                  <>
                    <Money value={sip} />
                    <span className="text-label-plain whitespace-nowrap text-ink-soft">
                      {' '}
                      a month
                    </span>
                  </>
                ) : (
                  <span className="text-ink-soft">None</span>
                )}
              </dd>
            </div>
          </dl>
          <div
            className={cn(
              HOLDING_COLS,
              'border-b border-hairline pb-2 text-caption text-ink-faint',
            )}
            aria-hidden
          >
            <span className="hidden @xl/tab:block">Holding</span>
            <span className="text-right">Put in</span>
            <span className="text-right">Value</span>
            <span className="text-right">Change</span>
          </div>
          <div className="grid">
            {groups.map((group) => (
              <HoldingGroupSection key={group.type} group={group} />
            ))}
          </div>
        </>
      )}
    </Block>
  )
}

/** Groups longer than this show their largest holdings first and the rest on request. */
const GROUP_PREVIEW = 4

function HoldingGroupSection({ group }: { group: HoldingGroup }) {
  const [all, setAll] = useState(false)
  const hidden = group.holdings.length - GROUP_PREVIEW
  const shown = all || hidden <= 1 ? group.holdings : group.holdings.slice(0, GROUP_PREVIEW)
  return (
    <section aria-label={group.label}>
      <header className={cn(HOLDING_COLS, 'border-b border-hairline-soft pt-3.5 pb-2 text-label')}>
        <h3 className={cn('truncate text-heading text-ink', HOLDING_NAME)}>
          {group.label}{' '}
          <span className="text-caption-plain tabular text-ink-hint">{group.holdings.length}</span>
        </h3>
        <Money value={group.invested} className="text-right text-ink-soft" />
        <Money value={group.current} className="text-right font-semibold text-ink" />
        <span className="text-right">
          <GainPill invested={group.invested} current={group.current} />
        </span>
      </header>
      <ul>
        {shown.map((h, i) => (
          <li key={`${h.name}-${i}`} className={cn(HOLDING_COLS, 'py-2 text-label')}>
            <div className={cn('min-w-0', HOLDING_NAME)}>
              <p className="truncate text-ink" title={h.name}>
                {h.name}
              </p>
              <p className="truncate text-caption-plain text-ink-faint">
                {h.assetClass}
                {h.sipMonthly ? (
                  <>
                    {' · '}
                    <Money value={h.sipMonthly} /> SIP a month
                  </>
                ) : null}
              </p>
            </div>
            <Money value={h.invested} className="text-right text-ink-soft" />
            <Money value={h.current} className="text-right text-ink" />
            <span className="text-right">
              <GainPill invested={h.invested} current={h.current} />
            </span>
          </li>
        ))}
      </ul>
      {hidden > 1 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-0.5 mb-1 -ml-2.5"
          aria-expanded={all}
          icon={
            <ChevronDown aria-hidden className={cn('transition-transform', all && 'rotate-180')} />
          }
          onClick={() => setAll((v) => !v)}
        >
          {all ? 'Show fewer' : `Show ${hidden} more ${group.label.toLowerCase()}`}
        </Button>
      ) : null}
    </section>
  )
}

function GainPill({ invested, current }: { invested: number; current: number }) {
  const pct = gainPct(invested, current)
  return pct === null ? (
    <span className="text-caption text-ink-hint" title="Carried at what was put in">
      —
    </span>
  ) : (
    <DeltaPill value={pct} />
  )
}

/* ---------------------------------------------------------------- Loans */

const LOAN_COLS =
  'grid grid-cols-2 items-baseline gap-x-3 gap-y-2 @xl/tab:grid-cols-[minmax(0,1fr)_6.5rem_4rem_5.5rem_5.5rem] @xl/tab:gap-y-3'

function Loans({ customer }: { customer: CustomerFile }) {
  const loans = customer.money.liabilities
  const name = firstName(customer.profile.name)
  const outstanding = loans.reduce((s, l) => s + l.outstanding, 0)
  const emi = loans.reduce((s, l) => s + l.emi, 0)
  const share = customer.credit.emiToIncomePct

  return (
    <Block
      title="Loans and cards"
      count={loans.length}
      actions={loans.length > 0 ? <AsAt customer={customer} /> : null}
    >
      {loans.length === 0 ? (
        <EmptyState
          className="py-5"
          icon={<CircleCheck />}
          title="No loans or cards"
          body={`Nothing owed that we can see across ${possessive(name)} linked accounts.`}
        />
      ) : (
        <>
          <p className="mb-4 text-body text-ink-soft">
            <ProseInr value={outstanding} className="font-semibold text-ink" /> outstanding,{' '}
            <ProseInr value={emi} className="font-semibold text-ink" /> a month in repayments
            {share !== null ? <>, {formatPct(Math.round(share))} of income</> : null}.
          </p>
          {/* On a narrow card the header row is not drawn; each figure names itself instead. */}
          <div
            className={cn(
              LOAN_COLS,
              'hidden border-b border-hairline pb-2 text-caption text-ink-faint @xl/tab:grid',
            )}
            aria-hidden
          >
            <span>Loan</span>
            <span className="text-right">Outstanding</span>
            <span className="text-right">Rate</span>
            <span className="text-right">EMI</span>
            <span className="text-right">Left</span>
          </div>
          <ul>
            {loans.map((loan, i) => (
              <LoanRow key={`${loan.loanType}-${i}`} loan={loan} />
            ))}
          </ul>
        </>
      )}
    </Block>
  )
}

function LoanRow({ loan }: { loan: Customer360Liability }) {
  const flagged = loan.highInterest || loan.missedRepayment
  return (
    <li className={cn(LOAN_COLS, 'border-b border-hairline-soft py-3 text-label last:border-0')}>
      <div className="col-span-2 min-w-0 @xl/tab:col-span-1">
        <p className="text-ink">{loan.loanType}</p>
        <p className="truncate text-caption-plain text-ink-faint">{loan.lender}</p>
        {flagged ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {loan.missedRepayment ? (
              <Chip tone="danger" icon={<CircleAlert aria-hidden />}>
                Repayment missed
              </Chip>
            ) : null}
            {loan.highInterest ? (
              <Chip tone="danger" icon={<Flame aria-hidden />}>
                High interest
              </Chip>
            ) : null}
          </div>
        ) : null}
      </div>
      <LoanFigure label="Outstanding">
        <Money value={loan.outstanding} className="text-ink" />
      </LoanFigure>
      <LoanFigure label="Rate">
        <span
          className={cn('tabular', loan.highInterest ? 'font-semibold text-danger' : 'text-ink')}
        >
          {formatPct(loan.ratePct)}
        </span>
      </LoanFigure>
      <LoanFigure label="EMI">
        <Money value={loan.emi} className="text-ink-soft" />
      </LoanFigure>
      <LoanFigure label="Left">
        <span className="tabular text-ink-soft">
          {loan.monthsLeft === null ? 'Revolving' : plural(loan.monthsLeft, 'month')}
        </span>
      </LoanFigure>
    </li>
  )
}

/**
 * One figure of a loan row: right-aligned under the header row on a wide card; on a narrow one
 * its own caption above it, since the header row is not drawn there. The caption is always there
 * for a screen reader, which the drawn header row is hidden from.
 */
function LoanFigure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 @xl/tab:text-right">
      <span className="block text-caption-plain text-ink-faint @xl/tab:sr-only">{label}</span>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- Protection */

function Protection({ customer }: { customer: CustomerFile }) {
  const p = customer.money.protection
  const dependents = customer.profile.dependents
  const covered = p.lifeCoverNeeded > 0 && p.gap <= 0
  return (
    <Block title="Protection" actions={<AsAt customer={customer} />}>
      <div className="grid grid-cols-1 gap-6 @min-[41rem]/tab:grid-cols-2">
        <div className="min-w-0">
          <p className="text-caption text-ink-faint">Life cover</p>
          {p.lifeCoverNeeded === 0 ? (
            <>
              <p className="mt-1 text-heading text-ink">
                {p.lifeCover > 0 ? <ProseInr value={p.lifeCover} /> : 'None'}
              </p>
              <p className="mt-1 text-caption-plain text-ink-soft">
                No dependents, so the rule of thumb asks for no life cover.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-heading text-ink">
                <ProseInr value={p.lifeCover} />{' '}
                <span className="text-label-plain text-ink-soft">
                  of <ProseInr value={p.lifeCoverNeeded} /> needed
                </span>
              </p>
              <Meter
                className="mt-2.5"
                value={p.lifeCover}
                max={p.lifeCoverNeeded}
                tone={covered ? 'brand' : 'danger'}
                label={`Life cover is ${formatPct(Math.round(Math.min(1, p.lifeCover / p.lifeCoverNeeded) * 100))} of the need`}
              />
              <p
                className={cn(
                  'mt-2 text-caption',
                  covered ? 'text-brand-deep' : 'font-semibold text-danger',
                )}
              >
                {covered ? (
                  'Covers the need'
                ) : (
                  <>
                    <ProseInr value={p.gap} /> short · {plural(dependents, 'dependent')}
                  </>
                )}
              </p>
            </>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-caption text-ink-faint">Health cover</p>
          {p.healthCover ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-heading text-ink">
              <HeartPulse aria-hidden className="size-4 text-brand" />
              In place
            </p>
          ) : (
            <p className="mt-1 inline-flex items-center gap-1.5 text-heading text-danger">
              <ShieldOff aria-hidden className="size-4" />
              None on record
            </p>
          )}
          <p className="mt-1 text-caption-plain text-ink-soft">
            {p.healthCover
              ? 'A health policy is on record.'
              : 'Neither IDBI nor a linked statement shows a health policy.'}
          </p>
        </div>
      </div>
      <div className="mt-5 border-t border-hairline-soft pt-4">
        <p className="mb-2 text-caption text-ink-faint">
          Policies <span className="tabular text-ink-hint">{p.policies.length}</span>
        </p>
        {p.policies.length === 0 ? (
          <p className="text-label-plain text-ink-soft">No policy on record.</p>
        ) : (
          <ul className="grid gap-1.5">
            {p.policies.map((policy, i) => (
              <li
                key={`${policy.name}-${i}`}
                className="flex items-baseline justify-between gap-3 text-label"
              >
                <span className="min-w-0 text-ink">{policy.name}</span>
                {policy.cover !== null ? (
                  <span className="shrink-0 text-ink-soft">
                    <ProseInr value={policy.cover} /> cover
                  </span>
                ) : (
                  <span className="shrink-0 text-ink-faint">Cover not stated</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Block>
  )
}

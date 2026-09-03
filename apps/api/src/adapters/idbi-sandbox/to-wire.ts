/**
 * Core → wire: a seed bundle written the way IDBI's sandbox would write it.
 *
 * The reverse of `mapping.ts`, used by the offline sandbox and by the sample generator, so the
 * whole adapter can be exercised without a bank: the fake bank serves the same rows the seed
 * CLI writes to Postgres, shaped by the same `@dhan/core` as-of functions, in the snake_case,
 * DD-MM-YY, `"184500.00"` conventions of `docs/integration/data-requirements.md`. Every code
 * goes out through the label the code tables register for it, so a value round-trips through
 * the mapping and the port contract suite can prove the wire loses nothing.
 *
 * Block 07 is the one place this file computes rather than copies. The spec asks IDBI for
 * pre-computed behavioural features; nobody expects them to arrive (schema README C.3), but a
 * sample has to show what they would look like, so they are descriptive arithmetic over the
 * ledger — the same spirit as `@dhan/fixtures`' summary, never advice.
 */
import {
  accountFactsAsOf,
  addMonths,
  categorize,
  liabilityAsOf,
  monthKey,
  sipHoldingAsOf,
  ymd,
} from '@dhan/core'
import type { Holding, SpendCategory, Transaction } from '@dhan/core'
import type { IsoDate } from '@dhan/contracts'
import type { SeedBundle, SeedProductRow } from '@dhan/fixtures'
import type { z } from 'zod'
import {
  ACCOUNT_TYPE,
  ASSET_CLASS,
  CONSENT_STATUS,
  EMPLOYMENT_TYPE,
  HOLDING_TYPE,
  PRODUCT_CATEGORY,
  RISKOMETER,
  RISK_PROFILE,
  SPEND_CATEGORY,
  TXN_MODE,
  TXN_TYPE,
  wireLabel,
} from './code-maps.ts'
import { dateToDdmmyy, fixed2 } from './transforms.ts'
import type {
  AccountFields,
  DepositAccountExtension,
  HoldingFields,
  LiabilityFields,
  MetaFields,
  ProfileFields,
  ShelfFields,
  SignalFields,
  TransactionFields,
} from './wire.ts'

export type ProfileOut = z.input<typeof ProfileFields>
export type AccountOut = z.input<typeof AccountFields> & z.input<typeof DepositAccountExtension>
export type TransactionOut = z.input<typeof TransactionFields>
export type HoldingOut = z.input<typeof HoldingFields>
export type LiabilityOut = z.input<typeof LiabilityFields>
export type ShelfOut = z.input<typeof ShelfFields>
export type SignalsOut = z.input<typeof SignalFields>
export type MetaOut = z.input<typeof MetaFields>

export interface WirePeriod {
  from: IsoDate
  to: IsoDate
}

const dd = (iso: string): string => dateToDdmmyy(iso)

function ageOn(dob: string, asOf: string): number {
  const b = ymd(dob)
  const a = ymd(asOf)
  let age = a.year - b.year
  if (a.month < b.month || (a.month === b.month && a.day < b.day)) age -= 1
  return age
}

/** The rows a request window covers, oldest first, as the ledger holds them. */
export function windowLedger(b: SeedBundle, period: WirePeriod): Transaction[] {
  return b.transactions.filter((t) => t.txnDate >= period.from && t.txnDate <= period.to)
}

/* 01 ------------------------------------------------------------------ */

export function profileToWire(b: SeedBundle, asOf: IsoDate): ProfileOut {
  const c = b.customer
  return {
    date_of_birth: dateToDdmmyy(c.dateOfBirth, { century: true }),
    age: ageOn(c.dateOfBirth, asOf),
    gender: c.gender,
    marital_status: c.maritalStatus,
    dependents_count: c.dependents,
    employment_type: wireLabel(EMPLOYMENT_TYPE, c.employmentType),
    declared_annual_income: fixed2(c.declaredAnnualIncome),
    city: c.city,
    state_code: c.stateCode,
    preferred_language: c.preferredLanguage,
    risk_profile: wireLabel(RISK_PROFILE, c.riskProfile),
    kyc_status: c.kycStatus,
    customer_since_date: dd(c.customerSince),
  }
}

/* 02 ------------------------------------------------------------------ */

export function accountsToWire(
  b: SeedBundle,
  ledger: readonly Transaction[],
  asOf: IsoDate,
): AccountOut[] {
  return b.accounts.map((row): AccountOut => {
    if (row.isPrimary) {
      const facts = accountFactsAsOf(ledger, asOf, {
        ...(row.openingBalance === undefined ? {} : { openingBalance: row.openingBalance }),
      })
      return {
        account_number_masked: row.accountNumberMasked,
        account_type: wireLabel(ACCOUNT_TYPE, row.accountType),
        current_balance: fixed2(facts.currentBalance),
        avg_monthly_balance_3m: fixed2(facts.avgMonthlyBalance3m),
        avg_monthly_balance_12m: fixed2(facts.avgMonthlyBalance12m),
        min_balance_12m: fixed2(facts.minBalance12m),
        account_opening_date: dd(row.accountOpeningDate),
      }
    }
    const principal = row.currentBalance ?? 0
    return {
      account_number_masked: row.accountNumberMasked,
      account_type: wireLabel(ACCOUNT_TYPE, row.accountType),
      current_balance: fixed2(principal),
      // A deposit's average is its principal. Mandatory on the wire; the mapping ignores it here.
      avg_monthly_balance_3m: fixed2(principal),
      account_opening_date: dd(row.accountOpeningDate),
      ...(row.maturityDate === undefined ? {} : { maturity_date: dd(row.maturityDate) }),
      ...(row.interestRate === undefined ? {} : { interest_rate: fixed2(row.interestRate) }),
    }
  })
}

/* 03 ------------------------------------------------------------------ */

export function transactionsToWire(rows: readonly Transaction[]): TransactionOut[] {
  return rows.map((t): TransactionOut => {
    const merchant = categorize(t).merchant
    return {
      txn_id: t.txnId,
      txn_date: dd(t.txnDate),
      txn_amount: fixed2(t.txnAmount),
      txn_type: wireLabel(TXN_TYPE, t.txnType),
      txn_mode: wireLabel(TXN_MODE, t.txnMode),
      narration: t.narration,
      ...(merchant === null ? {} : { merchant_name: merchant }),
      spend_category: wireLabel(SPEND_CATEGORY, t.spendCategory),
      is_salary_credit: t.isSalaryCredit,
      is_recurring: t.isRecurring,
      ...(t.balanceAfterTxn === null ? {} : { balance_after_txn: fixed2(t.balanceAfterTxn) }),
    }
  })
}

/* 04 ------------------------------------------------------------------ */

/** Holdings as the bundle rolls them to a date: SIPs by instalment, the rest as declared. */
export function holdingsAsOf(
  b: SeedBundle,
  asOf: IsoDate,
): { holdings: Holding[]; policies: Holding[] } {
  return {
    holdings: [
      ...b.sipContracts.map((c) =>
        sipHoldingAsOf(c, b.horizon.anchor, asOf, b.horizon.historyMonths),
      ),
      ...b.holdings,
    ],
    policies: b.policies,
  }
}

export function holdingsToWire(b: SeedBundle, asOf: IsoDate): HoldingOut[] {
  const { holdings, policies } = holdingsAsOf(b, asOf)
  const common = (h: Holding) => ({
    holding_type: wireLabel(HOLDING_TYPE, h.holdingType),
    scheme_or_product_name: h.name,
    asset_class: wireLabel(ASSET_CLASS, h.assetClass),
    invested_amount: fixed2(h.investedAmount),
    current_value: fixed2(h.currentValue),
    sip_active: h.sipActive,
    ...(h.sipDebitDay === undefined ? {} : { sip_debit_day: h.sipDebitDay }),
    ...(h.maturityDate === undefined ? {} : { maturity_date: dd(h.maturityDate) }),
    ...(h.interestRate === undefined ? {} : { interest_rate: fixed2(h.interestRate) }),
  })
  return [
    ...holdings.map((h): HoldingOut => ({
      ...common(h),
      ...(h.sipAmount === undefined ? {} : { sip_amount: fixed2(h.sipAmount) }),
    })),
    ...policies.map((p): HoldingOut => ({
      ...common(p),
      sum_assured: fixed2(p.investedAmount),
      ...(p.sipAmount === undefined ? {} : { premium_amount: fixed2(p.sipAmount) }),
    })),
  ]
}

/* 05 ------------------------------------------------------------------ */

export function liabilitiesToWire(b: SeedBundle, asOf: IsoDate): LiabilityOut[] {
  const out: LiabilityOut[] = []
  for (const c of b.liabilityContracts) {
    const l = liabilityAsOf(c, b.horizon.anchor, asOf)
    if (l === null) continue
    out.push({
      loan_type: l.loanType,
      outstanding_principal: fixed2(l.outstandingPrincipal),
      emi_amount: fixed2(l.emiAmount),
      loan_interest_rate: fixed2(l.loanInterestRate),
      tenure_remaining_months: l.tenureRemainingMonths,
      dpd_status: l.dpdStatus,
      ...(l.isRevolving ? { credit_card_outstanding: fixed2(l.outstandingPrincipal) } : {}),
    })
  }
  return out
}

/* 06 ------------------------------------------------------------------ */

export function shelfToWire(rows: readonly SeedProductRow[]): ShelfOut[] {
  return rows.map((p): ShelfOut => ({
    product_id: p.productId,
    product_name: p.name,
    product_category: wireLabel(PRODUCT_CATEGORY, p.category),
    riskometer: wireLabel(RISKOMETER, p.riskometer),
    min_investment: fixed2(p.minInvestment),
    ...(p.expenseRatio === undefined ? {} : { expense_ratio: fixed2(p.expenseRatio) }),
    ...(p.insuranceProduct === undefined ? {} : { insurance_product_flag: p.insuranceProduct }),
    is_transactable_sandbox: p.transactable,
  }))
}

/* 07 ------------------------------------------------------------------ */

/** Outflows that are commitments rather than choices, as the fixtures summary counts them. */
const FIXED: ReadonlySet<SpendCategory> = new Set<SpendCategory>([
  'Rent & bills',
  'Loan EMI',
  'Insurance',
  'Education',
  'Transfers',
  'Investment',
])

interface MonthTotals {
  inflow: number
  outflow: number
  fixed: number
  emi: number
  invest: number
  recurring: number
  closing: number | null
}

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length
const stdev = (xs: readonly number[]): number => {
  const m = mean(xs)
  return xs.length < 2 ? 0 : Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}
const pct = (num: number, den: number): number | null =>
  den === 0 || !Number.isFinite(num / den) ? null : (num / den) * 100

/** Descriptive aggregates over complete months before `asOf`'s month. Nothing here is advice. */
export function signalsToWire(
  b: SeedBundle,
  ledger: readonly Transaction[],
  asOf: IsoDate,
): SignalsOut {
  const months = new Map<string, MonthTotals>()
  const current = monthKey(asOf)
  let salary: Transaction | null = null
  let firstInvestment: Transaction | null = null

  for (const t of ledger) {
    if (t.txnType === 'CREDIT' && t.isSalaryCredit) salary = t
    if (t.txnType === 'DEBIT' && t.spendCategory === 'Investment' && firstInvestment === null) {
      firstInvestment = t
    }
    const key = monthKey(t.txnDate)
    if (key >= current) continue
    const m = months.get(key) ?? {
      inflow: 0,
      outflow: 0,
      fixed: 0,
      emi: 0,
      invest: 0,
      recurring: 0,
      closing: null,
    }
    if (t.txnType === 'CREDIT') m.inflow += t.txnAmount
    else {
      m.outflow += t.txnAmount
      if (FIXED.has(t.spendCategory)) m.fixed += t.txnAmount
      if (t.spendCategory === 'Loan EMI') m.emi += t.txnAmount
      if (t.spendCategory === 'Investment') m.invest += t.txnAmount
      if (t.isRecurring) m.recurring += t.txnAmount
    }
    if (t.balanceAfterTxn !== null) m.closing = t.balanceAfterTxn
    months.set(key, m)
  }

  const keys = [...months.keys()].sort()
  const rows = (n: number): MonthTotals[] =>
    keys
      .slice(-n)
      .map((k) => months.get(k))
      .filter((m): m is MonthTotals => m !== undefined)
  const last3 = rows(3)
  const last12 = rows(12)
  const lastMonth = rows(1)[0]

  const inflow3 = mean(last3.map((m) => m.inflow))
  const outflow3 = mean(last3.map((m) => m.outflow))
  const surplus12 = last12.map((m) => m.inflow - m.outflow)
  const inflow12 = last12.map((m) => m.inflow)
  const outflow12 = last12.reduce((s, m) => s + m.outflow, 0)
  const fixed12 = last12.reduce((s, m) => s + m.fixed, 0)

  const byCategory = new Map<string, number>()
  const from12 = addMonths(asOf, -12)
  for (const t of ledger) {
    if (t.txnType !== 'DEBIT' || t.txnDate < from12 || t.txnDate > asOf) continue
    const label = wireLabel(SPEND_CATEGORY, t.spendCategory)
    byCategory.set(label, (byCategory.get(label) ?? 0) + t.txnAmount)
  }

  const closing = ledger[ledger.length - 1]?.balanceAfterTxn ?? null
  const { holdings } = holdingsAsOf(b, asOf)
  const invested = holdings.reduce((s, h) => s + h.currentValue, 0)
  const deposits = b.accounts
    .filter((a) => !a.isPrimary)
    .reduce((s, a) => s + (a.currentBalance ?? 0), 0)
  const networth = invested + deposits + (closing ?? 0)

  const sixAgo = months.get(keys[keys.length - 7] ?? '')?.closing ?? null
  const latest = lastMonth?.closing ?? null
  const trend =
    sixAgo !== null && latest !== null && sixAgo !== 0
      ? ((latest - sixAgo) / Math.abs(sixAgo)) * 100
      : null

  const out: SignalsOut = {}
  const put = <K extends keyof SignalsOut>(key: K, value: number | null): void => {
    if (value !== null && Number.isFinite(value)) out[key] = fixed2(value) as SignalsOut[K]
  }
  if (last3.length === 3) {
    put('avg_monthly_inflow_3m', inflow3)
    put('avg_monthly_outflow_3m', outflow3)
    put('avg_monthly_surplus_3m', inflow3 - outflow3)
    put('emi_to_income_ratio_pct', pct(mean(last3.map((m) => m.emi)), inflow3))
    put('savings_rate_pct', pct(mean(last3.map((m) => m.invest)), inflow3))
    put(
      'emergency_fund_months',
      closing === null ? null : outflow3 === 0 ? null : closing / outflow3,
    )
  }
  if (salary !== null) {
    out.salary_credit_amount = fixed2(salary.txnAmount)
    out.salary_credit_day = ymd(salary.txnDate).day
  }
  if (last12.length >= 6) {
    put('surplus_volatility_pct', pct(stdev(surplus12), Math.abs(mean(surplus12))))
    put('discretionary_spend_pct', pct(outflow12 - fixed12, outflow12))
    const cv = mean(inflow12) === 0 ? null : stdev(inflow12) / mean(inflow12)
    put('inflow_stability_score', cv === null ? null : Math.min(1, Math.max(0, 1 - cv)))
  }
  if (byCategory.size > 0) {
    out.spend_by_category_12m = JSON.stringify(
      Object.fromEntries([...byCategory.entries()].map(([k, v]) => [k, Math.round(v)])),
    )
  }
  if (lastMonth !== undefined) put('recurring_debit_total', lastMonth.recurring)
  put('balance_trend_6m_pct', trend)
  put('investment_to_networth_pct', pct(invested, networth))
  if (firstInvestment !== null) out.first_investment_date = dd(firstInvestment.txnDate)
  return out
}

/* 08 ------------------------------------------------------------------ */

export function metaToWire(b: SeedBundle, period: WirePeriod, freshness: IsoDate): MetaOut {
  return {
    consent_reference: b.consent.consentId,
    consent_purpose: b.consent.purpose,
    consent_valid_to: dd(b.consent.validTo),
    consent_status: wireLabel(CONSENT_STATUS, b.consent.status),
    data_period_from: dd(period.from),
    data_period_to: dd(period.to),
    data_freshness_date: dd(freshness),
    response_status: 'SUCCESS',
  }
}

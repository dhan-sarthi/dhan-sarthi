/**
 * Wire → CustomerFile: the anti-corruption layer's one job.
 *
 * `FIELD_MAP` is the contract: every one of the 93 response fields in
 * `docs/integration/data-requirements.md` appears exactly once, either mapped to a target with
 * a named transform or ignored with the reason written down. A test counts them. The functions
 * below are those rows executed, and they never throw on a value we did not anticipate — a
 * code outside the tables lands on the map's fallback with the raw string kept in the
 * `MappingReport`, and a key outside the spec lands in `unmappedPaths` (schema README §E.2
 * step 5). Only two things are fatal: a transaction whose direction cannot be read, and a
 * date that is not a date. Both are spec deviations to read on day one, not rows to guess at.
 *
 * Three fields on `Customer` are not the bank's to send — `custId`, `custName` and
 * `taxRegime` are app-held identity (`app.customers`), so the caller supplies them.
 */
import type {
  Account,
  Customer,
  CustomerFile,
  Holding,
  Liability,
  Product,
  Transaction,
} from '@dhan/core'
import type { Consent, ConsentScope, IsoDate, LedgerHorizon } from '@dhan/contracts'
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
  lookupCode,
} from './code-maps.ts'
import type { CodeMap } from './code-maps.ts'
import type { DataBlock } from './endpoints.ts'
import { WireFormatError, ageToDob, ddmmyyToDate, jsonMap, money, rate } from './transforms.ts'
import type { AmountUnit, TransformName } from './transforms.ts'
import { EXTENSION_FIELDS, WIRE_FIELDS } from './wire.ts'
import type {
  WireAccount,
  WireGroup,
  WireHolding,
  WireLiability,
  WireMeta,
  WireProfile,
  WireShelfProduct,
  WireSignals,
  WireTransaction,
} from './wire.ts'

/* ------------------------------------------------------------------ *
 * The field map
 * ------------------------------------------------------------------ */

export type ResponseGroup = Exclude<WireGroup, 'REQUEST'>

export interface FieldMapping {
  group: ResponseGroup
  /** The row as the spec writes it. One spec row may cover several wire keys. */
  field: string
  keys: readonly string[]
  /** Where the value lands, in dotted form, or null when ignored. */
  target: string | null
  transform: TransformName | null
  /** Why the field is not mapped. Exactly one of `target` and `ignored` is set. */
  ignored: string | null
  note?: string
}

const map = (
  group: ResponseGroup,
  field: string,
  target: string,
  transform: TransformName,
  note?: string,
): FieldMapping => ({
  group,
  field,
  keys: [field],
  target,
  transform,
  ignored: null,
  ...(note === undefined ? {} : { note }),
})

const ignore = (group: ResponseGroup, field: string, reason: string): FieldMapping => ({
  group,
  field,
  keys: [field],
  target: null,
  transform: null,
  ignored: reason,
})

/** Block 07 is computed by `derive()` regardless; the bank's figure is kept beside it for the audit record. */
const twin = (field: string, enginePath: string): FieldMapping => ({
  group: 'SIGNALS',
  field,
  keys: [field],
  target: null,
  transform: null,
  ignored: `Engine twin: derive() computes it into ${enginePath}. The bank's value is parsed into BankSignals and kept in the mapping report so the audit record can say which was used (schema README C.1, group 07).`,
})

export const FIELD_MAP: readonly FieldMapping[] = [
  /* 01 ------------------------------------------------------------------ */
  map(
    'PROFILE',
    'date_of_birth',
    'file.customer.dateOfBirth',
    'ddmmyy_to_date',
    'DD-MM-YYYY accepted',
  ),
  map(
    'PROFILE',
    'age',
    'file.customer.dateOfBirth',
    'age_to_dob',
    'Only when date_of_birth is withheld: the same calendar day, age years before the freshness date.',
  ),
  map('PROFILE', 'gender', 'file.customer.gender', 'text', 'Raw; absent → Undisclosed'),
  map(
    'PROFILE',
    'marital_status',
    'file.customer.maritalStatus',
    'text',
    'Raw; absent → Undisclosed',
  ),
  map('PROFILE', 'dependents_count', 'file.customer.dependents', 'int', 'Absent → 0'),
  map(
    'PROFILE',
    'employment_type',
    'file.customer.employmentType',
    'code_map:employment_type',
    'Retired lands on Self-employed and is flagged',
  ),
  map('PROFILE', 'declared_annual_income', 'file.customer.declaredAnnualIncome', 'inr_18_2'),
  map('PROFILE', 'city', 'file.customer.city', 'text', "Absent → ''"),
  map('PROFILE', 'state_code', 'file.customer.stateCode', 'text', 'GSTN convention, kept as sent'),
  map(
    'PROFILE',
    'preferred_language',
    'file.customer.preferredLanguage',
    'text',
    'BCP-47 tag as sent',
  ),
  map(
    'PROFILE',
    'risk_profile',
    'file.customer.riskProfile',
    'code_map:risk_profile',
    'Five-band label → three; absent or unknown → Conservative (flagged)',
  ),
  ignore(
    'PROFILE',
    'risk_profile_date',
    'No CustomerFile field. It drives a re-profiling prompt that is not built yet; parsed and kept in the mapping report.',
  ),
  map(
    'PROFILE',
    'kyc_status',
    'file.customer.kycStatus',
    'text',
    'Raw label; the gate reads it verbatim',
  ),
  map(
    'PROFILE',
    'customer_since_date',
    'file.customer.customerSince',
    'ddmmyy_to_date',
    'Absent → earliest account_opening_date, else data_period_from',
  ),

  /* 02 ------------------------------------------------------------------ */
  map('ACCOUNTS', 'account_number_masked', 'file.accounts[].accountNumberMasked', 'text'),
  map(
    'ACCOUNTS',
    'account_type',
    'file.accounts[].accountType',
    'code_map:account_type',
    'Salary → Savings',
  ),
  map('ACCOUNTS', 'current_balance', 'file.accounts[].currentBalance', 'inr_18_2'),
  map(
    'ACCOUNTS',
    'avg_monthly_balance_3m',
    'file.accounts[].avgMonthlyBalance3m',
    'inr_18_2',
    'Savings and current accounts only; a deposit has no monthly average',
  ),
  map(
    'ACCOUNTS',
    'avg_monthly_balance_12m',
    'file.accounts[].avgMonthlyBalance12m',
    'inr_18_2',
    'Savings and current accounts only',
  ),
  map(
    'ACCOUNTS',
    'min_balance_12m',
    'file.accounts[].minBalance12m',
    'inr_18_2',
    'Savings and current accounts only',
  ),
  map(
    'ACCOUNTS',
    'account_opening_date',
    'file.accounts[].accountOpeningDate',
    'ddmmyy_to_date',
    'Absent → customer_since_date',
  ),

  /* 03 ------------------------------------------------------------------ */
  map('TXN', 'txn_id', 'file.transactions[].txnId', 'text'),
  map('TXN', 'txn_date', 'file.transactions[].txnDate', 'ddmmyy_to_date'),
  map(
    'TXN',
    'txn_amount',
    'file.transactions[].txnAmount',
    'inr_18_2',
    'Absolute; direction comes from txn_type',
  ),
  map(
    'TXN',
    'txn_type',
    'file.transactions[].txnType',
    'code_map:txn_type',
    'Strict: an unreadable direction is fatal',
  ),
  map(
    'TXN',
    'txn_mode',
    'file.transactions[].txnMode',
    'code_map:txn_mode',
    'Unknown → NEFT (flagged)',
  ),
  map(
    'TXN',
    'narration',
    'file.transactions[].narration',
    'text',
    'Never rewritten; the categoriser reads it',
  ),
  ignore(
    'TXN',
    'merchant_name',
    "No CustomerFile field: core names the merchant from the narration (categorize().merchant) and treats the bank's as a second opinion. Kept in the mapping report.",
  ),
  ignore(
    'TXN',
    'mcc_code',
    'No CustomerFile field: core categorises on narration; MCC is reserved for ref.mcc_codes (schema README C.4). Kept in the mapping report.',
  ),
  map(
    'TXN',
    'spend_category',
    'file.transactions[].spendCategory',
    'code_map:spend_category',
    "The bank's label; core's categoriser falls back to it. Absent or unknown → Transfers (flagged)",
  ),
  map(
    'TXN',
    'is_salary_credit',
    'file.transactions[].isSalaryCredit',
    'bool',
    'Absent → false; core infers from narration',
  ),
  map(
    'TXN',
    'is_recurring',
    'file.transactions[].isRecurring',
    'bool',
    'Absent → false; core infers from periodicity (decisions.md D3)',
  ),
  map(
    'TXN',
    'balance_after_txn',
    'file.transactions[].balanceAfterTxn',
    'inr_18_2',
    'Absent → null; balances then come from block 02 only',
  ),
  ignore(
    'TXN',
    'counterparty_vpa',
    'No CustomerFile field: a masked or hashed VPA is an audit aid, not an advice input. Kept in the mapping report.',
  ),

  /* 04 ------------------------------------------------------------------ */
  map(
    'HOLDINGS',
    'holding_type',
    'file.holdings[].holdingType',
    'code_map:holding_type',
    'INSURANCE rows are routed to file.policies[]; EQUITY and GOLD are valued as MUTUAL_FUND with their asset class',
  ),
  map('HOLDINGS', 'scheme_or_product_name', 'file.holdings[].name', 'text'),
  ignore(
    'HOLDINGS',
    'isin',
    'No CustomerFile field: overlap analysis is not built; the name is the key today. Kept in the mapping report.',
  ),
  map(
    'HOLDINGS',
    'asset_class',
    'file.holdings[].assetClass',
    'code_map:asset_class',
    'Cash → Debt; an INSURANCE row is Protection regardless',
  ),
  map(
    'HOLDINGS',
    'invested_amount',
    'file.holdings[].investedAmount',
    'inr_18_2',
    'For INSURANCE rows sum_assured wins: cover in force is what the protection gap reads',
  ),
  map('HOLDINGS', 'current_value', 'file.holdings[].currentValue', 'inr_18_2'),
  ignore(
    'HOLDINGS',
    'units',
    'No CustomerFile field: advice reads value, not units. Kept in the mapping report.',
  ),
  map('HOLDINGS', 'sip_active', 'file.holdings[].sipActive', 'bool'),
  map('HOLDINGS', 'sip_amount', 'file.holdings[].sipAmount', 'inr_18_2'),
  map('HOLDINGS', 'sip_debit_day', 'file.holdings[].sipDebitDay', 'int'),
  map('HOLDINGS', 'maturity_date', 'file.holdings[].maturityDate', 'ddmmyy_to_date'),
  map('HOLDINGS', 'interest_rate', 'file.holdings[].interestRate', 'rate_5_2'),
  ignore(
    'HOLDINGS',
    'insurer_name',
    'No CustomerFile field: the policy is identified by scheme_or_product_name; the insurer (an existing LIC relationship) is kept in the mapping report for a future insight.',
  ),
  ignore(
    'HOLDINGS',
    'policy_type',
    'No CustomerFile field: cover type is read off the shelf product a recommendation names, not off the in-force policy. Kept in the mapping report (term versus savings-linked).',
  ),
  map(
    'HOLDINGS',
    'sum_assured',
    'file.policies[].investedAmount',
    'inr_18_2',
    'Cover in force, on the policy row',
  ),
  map(
    'HOLDINGS',
    'premium_amount',
    'file.policies[].sipAmount',
    'inr_18_2',
    'Committed monthly outgo; sets sipActive on the policy row',
  ),

  /* 05 ------------------------------------------------------------------ */
  map(
    'LIABILITIES',
    'loan_type',
    'file.liabilities[].loanType',
    'text',
    'Free text kept verbatim; the debt rules read the rate, not the label',
  ),
  map(
    'LIABILITIES',
    'outstanding_principal',
    'file.liabilities[].outstandingPrincipal',
    'inr_18_2',
  ),
  map('LIABILITIES', 'emi_amount', 'file.liabilities[].emiAmount', 'inr_18_2'),
  map('LIABILITIES', 'loan_interest_rate', 'file.liabilities[].loanInterestRate', 'rate_5_2'),
  map(
    'LIABILITIES',
    'tenure_remaining_months',
    'file.liabilities[].tenureRemainingMonths',
    'int',
    'Absent → 0 (flagged)',
  ),
  map('LIABILITIES', 'dpd_status', 'file.liabilities[].dpdStatus', 'int', 'Absent → 0'),
  ignore(
    'LIABILITIES',
    'credit_card_limit',
    'No CustomerFile field: a utilisation insight is not built. Kept in the mapping report.',
  ),
  map(
    'LIABILITIES',
    'credit_card_outstanding',
    'file.liabilities[].outstandingPrincipal',
    'inr_18_2',
    'A card row is a revolving liability: outstanding wins and isRevolving is set, so the debt rules see one list',
  ),

  /* 06 ------------------------------------------------------------------ */
  map('SHELF', 'product_id', 'product.productId', 'text'),
  map('SHELF', 'product_name', 'product.name', 'text'),
  map(
    'SHELF',
    'product_category',
    'product.category',
    'code_map:product_category',
    'Strict: a product whose category cannot be placed is dropped and reported',
  ),
  map(
    'SHELF',
    'riskometer',
    'product.riskometer',
    'code_map:riskometer',
    'Strict: the gate reads it',
  ),
  map('SHELF', 'min_investment', 'product.minInvestment', 'inr_18_2'),
  map('SHELF', 'expense_ratio', 'product.expenseRatio', 'rate_5_2'),
  ignore(
    'SHELF',
    'plan_type',
    'No Product field yet: Direct/Regular is disclosed alongside a recommendation, not gated on. Kept in the mapping report.',
  ),
  {
    group: 'SHELF',
    field: 'return_1y / _3y / _5y',
    keys: ['return_1y', 'return_3y', 'return_5y'],
    target: null,
    transform: null,
    ignored:
      'Never mapped, by the spec’s own rule: trailing returns are shown with mandated disclaimers only and are never a projection input. Kept in the mapping report.',
  },
  map('SHELF', 'insurance_product_flag', 'product.insuranceProduct', 'bool'),
  map('SHELF', 'is_transactable_sandbox', 'product.transactable', 'bool'),

  /* 07 ------------------------------------------------------------------ */
  twin('avg_monthly_surplus_3m', 'snapshot.surplus.monthly'),
  twin('salary_credit_amount', 'snapshot.income.monthly'),
  twin('salary_credit_day', 'snapshot.income.payDay'),
  twin('avg_monthly_inflow_3m', 'snapshot.income'),
  twin('avg_monthly_outflow_3m', 'snapshot.commitments.total + snapshot.discretionary.monthly'),
  twin('surplus_volatility_pct', 'snapshot.income.variation'),
  twin('spend_by_category_12m', 'snapshot.discretionary.byCategory'),
  twin('discretionary_spend_pct', 'snapshot.discretionary / outflow'),
  twin('recurring_debit_total', 'recurring series, sum of monthlyCost'),
  twin('emi_to_income_ratio_pct', 'snapshot.debt.monthlyOutgo / income'),
  twin('savings_rate_pct', 'snapshot.surplus.alreadyInvested'),
  twin('emergency_fund_months', 'snapshot.buffer.monthsCovered'),
  twin('inflow_stability_score', '1 - snapshot.income.variation'),
  twin('balance_trend_6m_pct', 'snapshot.discretionary.trendPct'),
  twin('investment_to_networth_pct', 'snapshot.holdings / balances'),
  twin('first_investment_date', 'earliest Investment debit in the ledger'),

  /* 08 ------------------------------------------------------------------ */
  map(
    'META',
    'consent_reference',
    'consent.consentId',
    'text',
    "The bank's echo; a mismatch with the id we sent is reported",
  ),
  map('META', 'consent_purpose', 'consent.purpose', 'text'),
  map('META', 'consent_valid_to', 'consent.validTo', 'ddmmyy_to_date'),
  map(
    'META',
    'consent_status',
    'consent.status',
    'code_map:consent_status',
    'Unknown → REVOKED: fail closed',
  ),
  map(
    'META',
    'data_period_from',
    'horizon.from',
    'ddmmyy_to_date',
    'Also consent.validFrom when the app holds no valid_from: the consented window opens the consent',
  ),
  map(
    'META',
    'data_period_to',
    'client.request',
    'ddmmyy_to_date',
    'Echo of the window requested; a mismatch with what was sent is reported',
  ),
  map(
    'META',
    'data_freshness_date',
    'horizon.to',
    'ddmmyy_to_date',
    'Also describe.dataFreshnessDate and view.meta.dataFreshnessDate; refreshed on every response',
  ),
  map(
    'META',
    'response_status',
    'client.errors',
    'text',
    'Anything but SUCCESS raises before a row is mapped',
  ),
  map(
    'META',
    'error_code',
    'client.errors',
    'text',
    'CONSENT_EXPIRED/REVOKED → ConsentInactive; CONSENT_* → Forbidden; CUSTOMER_NOT_FOUND → NotFound; else Unavailable',
  ),
]

/* ------------------------------------------------------------------ *
 * The report
 * ------------------------------------------------------------------ */

export interface CodeFallback {
  block: DataBlock | 'META'
  field: string
  /** What IDBI sent. Null when the field was absent. */
  raw: string | null
  mapped: string
  /** The row it happened on: a txn_id, a masked account number, a product id. */
  key: string | null
}

export interface DroppedRow {
  block: DataBlock
  key: string
  reason: string
}

export interface MappingReport {
  /** Code-map lookups that fell back to a default, with the raw value retained. */
  fallbacks: CodeFallback[]
  /** Payload keys no mapping consumed, as `$.accounts[*].foo`. */
  unmappedPaths: string[]
  dropped: DroppedRow[]
  /** Spec fields the payload left out and a default filled. */
  defaulted: { block: DataBlock | 'META'; field: string; key: string | null; value: string }[]
}

export function newReport(): MappingReport {
  return { fallbacks: [], unmappedPaths: [], dropped: [], defaulted: [] }
}

export interface MapContext {
  report: MappingReport
  amountUnit: AmountUnit
  /** The date "today" fallbacks are measured from: age → date of birth. */
  asOf: IsoDate
  /** The observation window requested, for the last-resort date fallbacks. */
  period: { from: IsoDate; to: IsoDate }
}

export function mapContext(
  opts: { asOf: IsoDate; period: { from: IsoDate; to: IsoDate }; amountUnit?: AmountUnit },
  report: MappingReport = newReport(),
): MapContext {
  return { report, amountUnit: opts.amountUnit ?? 'inr', asOf: opts.asOf, period: opts.period }
}

function code<T extends string>(
  ctx: MapContext,
  block: DataBlock | 'META',
  field: string,
  table: CodeMap<T>,
  raw: string | undefined,
  key: string | null,
): T {
  if (raw === undefined) {
    if (table.fallback === null) throw new WireFormatError(field, raw, 'required')
    ctx.report.defaulted.push({ block, field, key, value: table.fallback })
    return table.fallback
  }
  const hit = lookupCode(table, raw)
  if (hit.value === null) throw new WireFormatError(field, raw, `not in code_map:${table.name}`)
  if (!hit.matched) ctx.report.fallbacks.push({ block, field, raw, mapped: hit.value, key })
  return hit.value
}

/** Keys the spec does not name, recorded once per block as a path pattern. */
function noteUnmapped(ctx: MapContext, group: ResponseGroup, row: object, path: string): void {
  const known = new Set([...WIRE_FIELDS[group], ...(EXTENSION_FIELDS[group] ?? [])])
  for (const key of Object.keys(row)) {
    if (known.has(key)) continue
    const p = `${path}.${key}`
    if (!ctx.report.unmappedPaths.includes(p)) ctx.report.unmappedPaths.push(p)
  }
}

const date = (raw: string, field: string): IsoDate => ddmmyyToDate(raw, field)

/* ------------------------------------------------------------------ *
 * 01. Profile
 * ------------------------------------------------------------------ */

/** What the app holds about the customer that the bank does not send. */
export interface CustomerIdentity {
  custId: string
  custName: string
  taxRegime: Customer['taxRegime']
}

export function mapProfile(
  wire: WireProfile,
  cif: string,
  identity: CustomerIdentity,
  ctx: MapContext,
  hints: { earliestAccountOpening?: IsoDate } = {},
): Customer {
  noteUnmapped(ctx, 'PROFILE', wire, '$.profile')
  const r = ctx.report

  let dateOfBirth: IsoDate
  if (wire.date_of_birth !== undefined) {
    dateOfBirth = date(wire.date_of_birth, 'date_of_birth')
  } else {
    dateOfBirth = ageToDob(wire.age ?? 0, ctx.asOf)
    r.defaulted.push({ block: 'PROFILE', field: 'date_of_birth', key: cif, value: 'age_to_dob' })
  }

  let riskProfile: Customer['riskProfile']
  if (wire.risk_profile === undefined) {
    riskProfile = 'Conservative'
    r.defaulted.push({ block: 'PROFILE', field: 'risk_profile', key: cif, value: riskProfile })
  } else {
    riskProfile = code(ctx, 'PROFILE', 'risk_profile', RISK_PROFILE, wire.risk_profile, cif)
  }

  let customerSince: IsoDate
  if (wire.customer_since_date !== undefined) {
    customerSince = date(wire.customer_since_date, 'customer_since_date')
  } else {
    customerSince = hints.earliestAccountOpening ?? ctx.period.from
    r.defaulted.push({
      block: 'PROFILE',
      field: 'customer_since_date',
      key: cif,
      value: customerSince,
    })
  }

  return {
    cif,
    custId: identity.custId,
    custName: identity.custName,
    dateOfBirth,
    gender: wire.gender ?? 'Undisclosed',
    maritalStatus: wire.marital_status ?? 'Undisclosed',
    dependents: wire.dependents_count ?? 0,
    employmentType: code(
      ctx,
      'PROFILE',
      'employment_type',
      EMPLOYMENT_TYPE,
      wire.employment_type,
      cif,
    ),
    declaredAnnualIncome: money(wire.declared_annual_income, ctx.amountUnit),
    city: wire.city ?? '',
    stateCode: wire.state_code ?? '',
    preferredLanguage: wire.preferred_language,
    riskProfile,
    kycStatus: wire.kyc_status,
    customerSince,
    taxRegime: identity.taxRegime,
  }
}

/* ------------------------------------------------------------------ *
 * 02. Accounts
 * ------------------------------------------------------------------ */

const CASA: ReadonlySet<Account['accountType']> = new Set(['Savings', 'Current'])

export function mapAccount(
  row: WireAccount,
  ctx: MapContext,
  hints: { customerSince?: IsoDate } = {},
): Account {
  const key = row.account_number_masked
  noteUnmapped(ctx, 'ACCOUNTS', row, '$.accounts[*]')
  const accountType = code(ctx, 'ACCOUNTS', 'account_type', ACCOUNT_TYPE, row.account_type, key)
  // Balance facts belong to the account the ledger runs through. A deposit's "average balance"
  // is its principal, and putting it on the row would make the floor arithmetic count it twice.
  const casa = CASA.has(accountType)
  const unit = ctx.amountUnit

  let accountOpeningDate: IsoDate
  if (row.account_opening_date !== undefined) {
    accountOpeningDate = date(row.account_opening_date, 'account_opening_date')
  } else {
    accountOpeningDate = hints.customerSince ?? ctx.period.from
    ctx.report.defaulted.push({
      block: 'ACCOUNTS',
      field: 'account_opening_date',
      key,
      value: accountOpeningDate,
    })
  }

  return {
    accountNumberMasked: row.account_number_masked,
    accountType,
    currentBalance: money(row.current_balance, unit),
    accountOpeningDate,
    ...(casa && row.avg_monthly_balance_3m !== undefined
      ? { avgMonthlyBalance3m: money(row.avg_monthly_balance_3m, unit) }
      : {}),
    ...(casa && row.avg_monthly_balance_12m !== undefined
      ? { avgMonthlyBalance12m: money(row.avg_monthly_balance_12m, unit) }
      : {}),
    ...(casa && row.min_balance_12m !== undefined
      ? { minBalance12m: money(row.min_balance_12m, unit) }
      : {}),
    ...(row.maturity_date === undefined
      ? {}
      : { maturityDate: date(row.maturity_date, 'maturity_date') }),
    ...(row.interest_rate === undefined ? {} : { interestRate: rate(row.interest_rate) }),
  }
}

/* ------------------------------------------------------------------ *
 * 03. Transactions
 * ------------------------------------------------------------------ */

export function mapTransaction(row: WireTransaction, ctx: MapContext): Transaction {
  const key = row.txn_id
  noteUnmapped(ctx, 'TXN', row, '$.transactions[*]')
  const unit = ctx.amountUnit

  let spendCategory: Transaction['spendCategory']
  if (row.spend_category === undefined) {
    spendCategory = 'Transfers'
    ctx.report.defaulted.push({ block: 'TXN', field: 'spend_category', key, value: spendCategory })
  } else {
    spendCategory = code(ctx, 'TXN', 'spend_category', SPEND_CATEGORY, row.spend_category, key)
  }

  return {
    txnId: row.txn_id,
    txnDate: date(row.txn_date, 'txn_date'),
    txnAmount: Math.abs(money(row.txn_amount, unit)),
    txnType: code(ctx, 'TXN', 'txn_type', TXN_TYPE, row.txn_type, key),
    txnMode: code(ctx, 'TXN', 'txn_mode', TXN_MODE, row.txn_mode, key),
    narration: row.narration,
    spendCategory,
    balanceAfterTxn:
      row.balance_after_txn === undefined ? null : money(row.balance_after_txn, unit),
    isSalaryCredit: row.is_salary_credit ?? false,
    isRecurring: row.is_recurring ?? false,
  }
}

/* ------------------------------------------------------------------ *
 * 04. Holdings
 * ------------------------------------------------------------------ */

export interface MappedHolding {
  /** INSURANCE rows are protection in force, which the file keeps apart from investments. */
  kind: 'holding' | 'policy'
  value: Holding
}

export function mapHolding(row: WireHolding, ctx: MapContext): MappedHolding {
  const key = row.scheme_or_product_name
  noteUnmapped(ctx, 'HOLDINGS', row, '$.holdings[*]')
  const unit = ctx.amountUnit
  const holdingType = code(ctx, 'HOLDINGS', 'holding_type', HOLDING_TYPE, row.holding_type, key)
  const maturity =
    row.maturity_date === undefined
      ? {}
      : { maturityDate: date(row.maturity_date, 'maturity_date') }

  if (holdingType === 'INSURANCE') {
    const premium = row.premium_amount !== undefined
    return {
      kind: 'policy',
      value: {
        holdingType,
        name: row.scheme_or_product_name,
        assetClass: 'Protection',
        investedAmount: money(row.sum_assured ?? row.invested_amount, unit),
        currentValue: money(row.current_value, unit),
        sipActive: premium || row.sip_active,
        ...(premium ? { sipAmount: money(row.premium_amount as number, unit) } : {}),
        ...(row.sip_debit_day === undefined ? {} : { sipDebitDay: row.sip_debit_day }),
        ...maturity,
      },
    }
  }

  return {
    kind: 'holding',
    value: {
      holdingType,
      name: row.scheme_or_product_name,
      assetClass: code(ctx, 'HOLDINGS', 'asset_class', ASSET_CLASS, row.asset_class, key),
      investedAmount: money(row.invested_amount, unit),
      currentValue: money(row.current_value, unit),
      sipActive: row.sip_active,
      ...(row.sip_amount === undefined ? {} : { sipAmount: money(row.sip_amount, unit) }),
      ...(row.sip_debit_day === undefined ? {} : { sipDebitDay: row.sip_debit_day }),
      ...maturity,
      ...(row.interest_rate === undefined ? {} : { interestRate: rate(row.interest_rate) }),
    },
  }
}

/* ------------------------------------------------------------------ *
 * 05. Liabilities
 * ------------------------------------------------------------------ */

const REVOLVING = /credit\s*card|revolving/i

export function mapLiability(row: WireLiability, ctx: MapContext): Liability {
  const key = row.loan_type
  noteUnmapped(ctx, 'LIABILITIES', row, '$.liabilities[*]')
  const unit = ctx.amountUnit
  const revolving = row.credit_card_outstanding !== undefined || REVOLVING.test(row.loan_type)

  let tenure: number
  if (row.tenure_remaining_months === undefined) {
    tenure = 0
    ctx.report.defaulted.push({
      block: 'LIABILITIES',
      field: 'tenure_remaining_months',
      key,
      value: '0',
    })
  } else {
    tenure = row.tenure_remaining_months
  }

  return {
    loanType: row.loan_type,
    outstandingPrincipal: money(row.credit_card_outstanding ?? row.outstanding_principal, unit),
    emiAmount: money(row.emi_amount, unit),
    loanInterestRate: rate(row.loan_interest_rate),
    tenureRemainingMonths: tenure,
    dpdStatus: row.dpd_status ?? 0,
    ...(revolving ? { isRevolving: true } : {}),
  }
}

/* ------------------------------------------------------------------ *
 * 06. Shelf
 * ------------------------------------------------------------------ */

/**
 * A shelf row as a core `Product`, or null when the category or riskometer cannot be placed.
 * Lock-in and manufacturer are not on the wire; the caller passes what it knows (today: the
 * fixtures shelf, ADR-0007), else they default and are reported.
 */
export function mapShelfProduct(
  row: WireShelfProduct,
  ctx: MapContext,
  known: Partial<
    Pick<
      Product,
      | 'lockInYears'
      | 'manufacturer'
      | 'coverAmount'
      | 'coverType'
      | 'bundlesProtectionAndInvestment'
    >
  > = {},
): Product | null {
  const key = row.product_id
  noteUnmapped(ctx, 'SHELF', row, '$.shelf[*]')
  const category = lookupCode(PRODUCT_CATEGORY, row.product_category)
  const riskometer = lookupCode(RISKOMETER, row.riskometer)
  if (category.value === null || riskometer.value === null) {
    ctx.report.dropped.push({
      block: 'SHELF',
      key,
      reason: `product_category=${row.product_category} riskometer=${row.riskometer} not in the code tables`,
    })
    return null
  }
  if (known.manufacturer === undefined) {
    ctx.report.defaulted.push({ block: 'SHELF', field: 'manufacturer', key, value: 'unknown' })
  }
  if (known.lockInYears === undefined) {
    ctx.report.defaulted.push({ block: 'SHELF', field: 'lockInYears', key, value: '0' })
  }
  return {
    productId: row.product_id,
    name: row.product_name,
    category: category.value,
    riskometer: riskometer.value,
    minInvestment: money(row.min_investment, ctx.amountUnit),
    lockInYears: known.lockInYears ?? 0,
    transactable: row.is_transactable_sandbox,
    manufacturer: known.manufacturer ?? 'unknown',
    ...(row.expense_ratio === undefined ? {} : { expenseRatio: rate(row.expense_ratio) }),
    ...(row.insurance_product_flag === undefined
      ? {}
      : { insuranceProduct: row.insurance_product_flag }),
    ...(known.bundlesProtectionAndInvestment === undefined
      ? {}
      : { bundlesProtectionAndInvestment: known.bundlesProtectionAndInvestment }),
    ...(known.coverAmount === undefined ? {} : { coverAmount: known.coverAmount }),
    ...(known.coverType === undefined ? {} : { coverType: known.coverType }),
  }
}

/* ------------------------------------------------------------------ *
 * 07. Signals
 * ------------------------------------------------------------------ */

/** Block 07 parsed and typed. Never an advice input; the audit record may cite it beside the engine's own. */
export interface BankSignals {
  avgMonthlySurplus3m?: number
  salaryCreditAmount?: number
  salaryCreditDay?: number
  avgMonthlyInflow3m?: number
  avgMonthlyOutflow3m?: number
  surplusVolatilityPct?: number
  spendByCategory12m?: Record<string, number>
  discretionarySpendPct?: number
  recurringDebitTotal?: number
  emiToIncomeRatioPct?: number
  savingsRatePct?: number
  emergencyFundMonths?: number
  inflowStabilityScore?: number
  balanceTrend6mPct?: number
  investmentToNetworthPct?: number
  firstInvestmentDate?: IsoDate
}

export function mapSignals(wire: WireSignals, ctx: MapContext): BankSignals {
  noteUnmapped(ctx, 'SIGNALS', wire, '$.signals')
  const unit = ctx.amountUnit
  const m = (v: number | undefined): number | undefined =>
    v === undefined ? undefined : money(v, unit)
  const p = (v: number | undefined): number | undefined => (v === undefined ? undefined : rate(v))
  const out: BankSignals = {}
  const set = <K extends keyof BankSignals>(k: K, v: BankSignals[K] | undefined | null): void => {
    if (v !== undefined && v !== null) out[k] = v
  }
  set('avgMonthlySurplus3m', m(wire.avg_monthly_surplus_3m))
  set('salaryCreditAmount', m(wire.salary_credit_amount))
  set('salaryCreditDay', wire.salary_credit_day)
  set('avgMonthlyInflow3m', m(wire.avg_monthly_inflow_3m))
  set('avgMonthlyOutflow3m', m(wire.avg_monthly_outflow_3m))
  set('surplusVolatilityPct', p(wire.surplus_volatility_pct))
  set(
    'spendByCategory12m',
    wire.spend_by_category_12m === undefined ? undefined : jsonMap(wire.spend_by_category_12m),
  )
  set('discretionarySpendPct', p(wire.discretionary_spend_pct))
  set('recurringDebitTotal', m(wire.recurring_debit_total))
  set('emiToIncomeRatioPct', p(wire.emi_to_income_ratio_pct))
  set('savingsRatePct', p(wire.savings_rate_pct))
  set('emergencyFundMonths', p(wire.emergency_fund_months))
  set('inflowStabilityScore', p(wire.inflow_stability_score))
  set('balanceTrend6mPct', p(wire.balance_trend_6m_pct))
  set('investmentToNetworthPct', p(wire.investment_to_networth_pct))
  set(
    'firstInvestmentDate',
    wire.first_investment_date === undefined
      ? undefined
      : date(wire.first_investment_date, 'first_investment_date'),
  )
  return out
}

/* ------------------------------------------------------------------ *
 * 08. Consent and horizon
 * ------------------------------------------------------------------ */

/** The consent artefact as the app holds it: what was asked for, and since when. */
export interface HeldConsent {
  consentId: string
  scopes: ConsentScope[]
  validFrom?: IsoDate
}

export function mapConsent(meta: WireMeta, held: HeldConsent, ctx: MapContext): Consent {
  noteUnmapped(ctx, 'META', meta, '$.meta')
  if (meta.consent_reference !== held.consentId) {
    ctx.report.fallbacks.push({
      block: 'META',
      field: 'consent_reference',
      raw: meta.consent_reference,
      mapped: held.consentId,
      key: null,
    })
  }
  return {
    consentId: meta.consent_reference,
    purpose: meta.consent_purpose,
    scopes: held.scopes,
    status: code(ctx, 'META', 'consent_status', CONSENT_STATUS, meta.consent_status, null),
    validFrom: held.validFrom ?? date(meta.data_period_from, 'data_period_from'),
    validTo: date(meta.consent_valid_to, 'consent_valid_to'),
  }
}

/** The dates the feed spans: the window's start to the date the bank says it is fresh through. */
export function mapHorizon(meta: WireMeta): LedgerHorizon {
  return {
    from: date(meta.data_period_from, 'data_period_from'),
    to: date(meta.data_freshness_date, 'data_freshness_date'),
  }
}

/* ------------------------------------------------------------------ *
 * The file
 * ------------------------------------------------------------------ */

/** The four blocks the catalogue can answer, plus block 04 when a feed does supply it. */
export interface BankBlocks {
  profile: WireProfile
  accounts: WireAccount[]
  transactions: WireTransaction[]
  liabilities: WireLiability[]
  holdings?: WireHolding[]
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function mapCustomerFile(
  blocks: BankBlocks,
  cif: string,
  identity: CustomerIdentity,
  ctx: MapContext,
): CustomerFile {
  const openings = blocks.accounts
    .map((a) => a.account_opening_date)
    .filter((d): d is string => d !== undefined)
    .map((d) => date(d, 'account_opening_date'))
    .sort(cmp)

  const customer = mapProfile(blocks.profile, cif, identity, ctx, {
    ...(openings[0] === undefined ? {} : { earliestAccountOpening: openings[0] }),
  })
  const accounts = blocks.accounts.map((row) =>
    mapAccount(row, ctx, { customerSince: customer.customerSince }),
  )
  // Oldest first, intra-day order as delivered: what the running-balance arithmetic assumes.
  const transactions = blocks.transactions
    .map((row) => mapTransaction(row, ctx))
    .sort((a, b) => cmp(a.txnDate, b.txnDate))
  const liabilities = blocks.liabilities.map((row) => mapLiability(row, ctx))

  const holdings: Holding[] = []
  const policies: Holding[] = []
  for (const row of blocks.holdings ?? []) {
    const mapped = mapHolding(row, ctx)
    if (mapped.kind === 'policy') policies.push(mapped.value)
    else holdings.push(mapped.value)
  }

  return { customer, accounts, transactions, liabilities, holdings, policies }
}

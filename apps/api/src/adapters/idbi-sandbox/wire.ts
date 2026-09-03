/**
 * The wire: the 93 response fields and 5 request parameters of
 * `docs/integration/data-requirements.md`, as zod, named exactly as the spec names them.
 *
 * Conventions follow the GSTN reference schema the organisers circulated: snake_case keys,
 * dates as `DD-MM-YY` (`DD-MM-YYYY` where a century matters, as the date-of-birth sample
 * shows), money as `18,2` decimals which a JSON feed may serialise as `"184500.00"` or as a
 * bare number. Every schema accepts both. Rows are parsed with `passthrough()` so a key we
 * did not anticipate lands in the mapping report as an unmapped path rather than failing
 * ingestion — the schema README's E.3 rule, applied at the edge.
 *
 * Mandatory/optional follows the spec except where our own domain says a row cannot carry
 * the field: a term deposit has no three-month average balance, so block 02's mandatory
 * averages are optional here and the mapping only reads them on savings and current accounts.
 */
import { z } from 'zod'
import type { DataBlock } from './endpoints.ts'

/* ------------------------------------------------------------------ *
 * Scalars
 * ------------------------------------------------------------------ */

/** `01-08-25`, or `14-06-1991` where the century matters. Calendar validity is the transform's job. */
export const WireDate = z.string().regex(/^\d{2}-\d{2}-(\d{2}|\d{4})$/, 'expected DD-MM-YY')

/** `18,2` / `5,2` / `7,2` decimals: `"2450.00"` on the wire, or a bare number. */
export const WireDecimal = z
  .union([
    z.number().finite(),
    z
      .string()
      .trim()
      .regex(/^-?\d+(\.\d+)?$/, 'expected a decimal'),
  ])
  .transform((v) => (typeof v === 'number' ? v : Number(v)))

export const WireInt = z
  .union([
    z.number().int(),
    z
      .string()
      .trim()
      .regex(/^-?\d+$/, 'expected an integer'),
  ])
  .transform((v) => (typeof v === 'number' ? v : Number(v)))

const TRUE = new Set(['true', 'y', 'yes', '1', 't'])
const FALSE = new Set(['false', 'n', 'no', '0', 'f'])

/** `true`, or the `Y`/`N` and `1`/`0` a Finacle extract writes. */
export const WireBool = z.union([z.boolean(), z.string(), z.number()]).transform((v, ctx) => {
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (TRUE.has(s)) return true
  if (FALSE.has(s)) return false
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `expected a boolean, got ${String(v)}` })
  return z.NEVER
})

/* ------------------------------------------------------------------ *
 * 00. Request parameters
 * ------------------------------------------------------------------ */

export const RequestFields = z.object({
  customer_id: z.string().max(20),
  consent_id: z.string().max(50),
  data_period_from: WireDate,
  data_period_to: WireDate,
  data_blocks: z.string().max(200).optional(),
})

/* ------------------------------------------------------------------ *
 * 01. Customer profile
 * ------------------------------------------------------------------ */

export const ProfileFields = z.object({
  date_of_birth: WireDate.optional(),
  age: WireInt.optional(),
  gender: z.string().optional(),
  marital_status: z.string().optional(),
  dependents_count: WireInt.optional(),
  employment_type: z.string(),
  declared_annual_income: WireDecimal,
  city: z.string().optional(),
  state_code: z.string().optional(),
  preferred_language: z.string(),
  risk_profile: z.string().optional(),
  risk_profile_date: WireDate.optional(),
  kyc_status: z.string(),
  customer_since_date: WireDate.optional(),
})

/** The spec: "Age alone is acceptable if DOB cannot be shared." One of the two must be present. */
export const ProfileBlockSchema = ProfileFields.passthrough().superRefine((p, ctx) => {
  if (p.date_of_birth === undefined && p.age === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['date_of_birth'],
      message: 'one of date_of_birth or age is required',
    })
  }
})
export type WireProfile = z.output<typeof ProfileBlockSchema>

/* ------------------------------------------------------------------ *
 * 02. Accounts and balances
 * ------------------------------------------------------------------ */

export const AccountFields = z.object({
  account_number_masked: z.string(),
  account_type: z.string(),
  current_balance: WireDecimal,
  avg_monthly_balance_3m: WireDecimal.optional(),
  avg_monthly_balance_12m: WireDecimal.optional(),
  min_balance_12m: WireDecimal.optional(),
  account_opening_date: WireDate.optional(),
})

/**
 * Beyond the 93: a deposit account's contract terms. Block 02 has no maturity or rate, but a
 * Finacle term-deposit row (394) carries both and the engine needs them on the account. The
 * names are block 04's, on purpose, so one transform serves both. Absent on a thinner feed.
 */
export const DepositAccountExtension = z.object({
  maturity_date: WireDate.optional(),
  interest_rate: WireDecimal.optional(),
})
export const AccountRowSchema = AccountFields.merge(DepositAccountExtension).passthrough()
export type WireAccount = z.output<typeof AccountRowSchema>

/* ------------------------------------------------------------------ *
 * 03. Transactions
 * ------------------------------------------------------------------ */

export const TransactionFields = z.object({
  txn_id: z.string(),
  txn_date: WireDate,
  /** Optional: not every statement API sends it, and where it is absent it is the posting date. */
  value_date: WireDate.optional(),
  txn_amount: WireDecimal,
  txn_type: z.string(),
  txn_mode: z.string(),
  narration: z.string(),
  merchant_name: z.string().optional(),
  mcc_code: z.string().optional(),
  spend_category: z.string().optional(),
  is_salary_credit: WireBool.optional(),
  is_recurring: WireBool.optional(),
  balance_after_txn: WireDecimal.optional(),
  counterparty_vpa: z.string().optional(),
})
export const TransactionRowSchema = TransactionFields.passthrough()
export type WireTransaction = z.output<typeof TransactionRowSchema>

/* ------------------------------------------------------------------ *
 * 04. Holdings and existing investments
 * ------------------------------------------------------------------ */

export const HoldingFields = z.object({
  holding_type: z.string(),
  scheme_or_product_name: z.string(),
  isin: z.string().optional(),
  asset_class: z.string(),
  invested_amount: WireDecimal,
  current_value: WireDecimal,
  units: WireDecimal.optional(),
  sip_active: WireBool,
  sip_amount: WireDecimal.optional(),
  sip_debit_day: WireInt.optional(),
  maturity_date: WireDate.optional(),
  interest_rate: WireDecimal.optional(),
  insurer_name: z.string().optional(),
  policy_type: z.string().optional(),
  sum_assured: WireDecimal.optional(),
  premium_amount: WireDecimal.optional(),
})
export const HoldingRowSchema = HoldingFields.passthrough()
export type WireHolding = z.output<typeof HoldingRowSchema>

/* ------------------------------------------------------------------ *
 * 05. Liabilities
 * ------------------------------------------------------------------ */

export const LiabilityFields = z.object({
  loan_type: z.string(),
  outstanding_principal: WireDecimal,
  emi_amount: WireDecimal,
  loan_interest_rate: WireDecimal,
  tenure_remaining_months: WireInt.optional(),
  dpd_status: WireInt.optional(),
  credit_card_limit: WireDecimal.optional(),
  credit_card_outstanding: WireDecimal.optional(),
})
export const LiabilityRowSchema = LiabilityFields.passthrough()
export type WireLiability = z.output<typeof LiabilityRowSchema>

/* ------------------------------------------------------------------ *
 * 06. Product shelf
 * ------------------------------------------------------------------ */

export const ShelfFields = z.object({
  product_id: z.string(),
  product_name: z.string(),
  product_category: z.string(),
  riskometer: z.string(),
  min_investment: WireDecimal,
  expense_ratio: WireDecimal.optional(),
  plan_type: z.string().optional(),
  return_1y: WireDecimal.optional(),
  return_3y: WireDecimal.optional(),
  return_5y: WireDecimal.optional(),
  insurance_product_flag: WireBool.optional(),
  is_transactable_sandbox: WireBool,
})
export const ShelfRowSchema = ShelfFields.passthrough()
export type WireShelfProduct = z.output<typeof ShelfRowSchema>

/* ------------------------------------------------------------------ *
 * 07. Derived behavioural signals
 * ------------------------------------------------------------------ */

export const SignalFields = z.object({
  avg_monthly_surplus_3m: WireDecimal.optional(),
  salary_credit_amount: WireDecimal.optional(),
  salary_credit_day: WireInt.optional(),
  avg_monthly_inflow_3m: WireDecimal.optional(),
  avg_monthly_outflow_3m: WireDecimal.optional(),
  surplus_volatility_pct: WireDecimal.optional(),
  spend_by_category_12m: z.string().max(500).optional(),
  discretionary_spend_pct: WireDecimal.optional(),
  recurring_debit_total: WireDecimal.optional(),
  emi_to_income_ratio_pct: WireDecimal.optional(),
  savings_rate_pct: WireDecimal.optional(),
  emergency_fund_months: WireDecimal.optional(),
  inflow_stability_score: WireDecimal.optional(),
  balance_trend_6m_pct: WireDecimal.optional(),
  investment_to_networth_pct: WireDecimal.optional(),
  first_investment_date: WireDate.optional(),
})
export const SignalsBlockSchema = SignalFields.passthrough()
export type WireSignals = z.output<typeof SignalsBlockSchema>

/* ------------------------------------------------------------------ *
 * 08. Consent, audit and response metadata
 * ------------------------------------------------------------------ */

export const MetaFields = z.object({
  consent_reference: z.string(),
  consent_purpose: z.string(),
  consent_valid_to: WireDate,
  consent_status: z.string(),
  data_period_from: WireDate,
  data_period_to: WireDate,
  data_freshness_date: WireDate,
  response_status: z.string(),
  error_code: z.string().optional(),
})
export const ResponseMetaSchema = MetaFields.passthrough()
export type WireMeta = z.output<typeof ResponseMetaSchema>

/**
 * A failure carries `response_status` and `error_code` and may carry nothing else, so the
 * client reads status first and only parses the full meta on SUCCESS.
 */
export const StatusEnvelopeSchema = z
  .object({
    meta: z
      .object({ response_status: z.string(), error_code: z.string().optional() })
      .passthrough(),
  })
  .passthrough()

/* ------------------------------------------------------------------ *
 * The envelope every block endpoint answers with
 * ------------------------------------------------------------------ */

export const BLOCK_SCHEMAS = {
  PROFILE: ProfileBlockSchema,
  ACCOUNTS: z.array(AccountRowSchema),
  TXN: z.array(TransactionRowSchema),
  HOLDINGS: z.array(HoldingRowSchema),
  LIABILITIES: z.array(LiabilityRowSchema),
  SHELF: z.array(ShelfRowSchema),
  SIGNALS: SignalsBlockSchema,
} as const satisfies Record<DataBlock, z.ZodTypeAny>

export type BlockData<B extends DataBlock> = z.output<(typeof BLOCK_SCHEMAS)[B]>

export function blockEnvelope<B extends DataBlock>(block: B) {
  return z
    .object({
      customer_id: z.string().optional(),
      data_block: z.string().optional(),
      page: WireInt.optional(),
      page_size: WireInt.optional(),
      total_pages: WireInt.optional(),
      total_rows: WireInt.optional(),
      data: BLOCK_SCHEMAS[block],
      meta: ResponseMetaSchema,
    })
    .passthrough()
}

export type BlockEnvelope<B extends DataBlock> = z.output<ReturnType<typeof blockEnvelope<B>>>

/* ------------------------------------------------------------------ *
 * The field list, for the coverage test and the mapping report
 * ------------------------------------------------------------------ */

export type WireGroup = 'REQUEST' | DataBlock | 'META'

/** Every key the spec names, by group, read off the schemas so the two cannot drift. */
export const WIRE_FIELDS: Readonly<Record<WireGroup, readonly string[]>> = {
  REQUEST: Object.keys(RequestFields.shape),
  PROFILE: Object.keys(ProfileFields.shape),
  ACCOUNTS: Object.keys(AccountFields.shape),
  TXN: Object.keys(TransactionFields.shape),
  HOLDINGS: Object.keys(HoldingFields.shape),
  LIABILITIES: Object.keys(LiabilityFields.shape),
  SHELF: Object.keys(ShelfFields.shape),
  SIGNALS: Object.keys(SignalFields.shape),
  META: Object.keys(MetaFields.shape),
}

/** Keys accepted beyond the 93, by group. Anything else on a row is an unmapped path. */
export const EXTENSION_FIELDS: Readonly<Partial<Record<WireGroup, readonly string[]>>> = {
  ACCOUNTS: Object.keys(DepositAccountExtension.shape),
}

/**
 * BankDataPort over the seeded mirrors: the demo's source of truth.
 *
 * Every read is bounded by `asOf`. Statement lines dated after it are never returned, and the
 * account facts, loan tenures and SIP instalments are rolled to that date through `@dhan/core`'s
 * `asof` module — the same functions the generator calls — so the file this returns for Rohan on
 * any date derives to the same snapshot the generator's file does. Parity is by construction, and
 * the integration suite proves it anyway.
 *
 * Bank rows are read through the `*_current` views (latest sync run per entity). Contracts (a
 * loan's remaining tenure, a SIP's start) are taken as measured at the run's `as_of`, which the
 * seed sets to the persona anchor.
 *
 * The whole file is one round trip: one statement returns every block as a JSON array over the
 * customer row it finds. The database is a continent away, and a dozen sequential reads of a
 * few rows each cost far more in latency than the rows cost in bytes — the first view of a
 * customer took five seconds that way. The blocks are then held in process for a minute per
 * (customer, as-of, window): the ledger is seeded and immutable until the next seed, and every
 * view asks for the same rows.
 */
import { accountFactsAsOf, elapsedMonths, liabilityAsOf, sipHoldingAsOf, ymd } from '@dhan/core'
import type {
  Account,
  Customer,
  CustomerFile,
  Holding,
  Liability,
  LiabilityContract,
  SipContract,
  SpendCategory,
  Transaction,
} from '@dhan/core'
import type {
  BankSource,
  Consent,
  ConsentScope,
  CustomerSummary,
  IsoDate,
  LedgerHorizon,
  ProvenanceMap,
} from '@dhan/contracts'
import { NotFound } from '../../application/errors.ts'
import type { Db } from '../../db/pool.ts'
import type { BankDataDescription, BankDataPort, LoadedCustomerFile } from '../../ports/index.ts'
import {
  accountTypeForCasa,
  accountTypeForDeposit,
  heldOutsideIdbi,
  kycLabel,
  loanTypeLabel,
  modeForChannel,
} from './codes.ts'
import type { DepositType, HeldVia } from './codes.ts'

const SOURCE: BankSource = 'postgres'
const PROVENANCE: ProvenanceMap = {
  PROFILE: 'postgres',
  ACCOUNTS: 'postgres',
  TXN: 'postgres',
  LIABILITIES: 'postgres',
  HOLDINGS: 'postgres',
}
const SCOPES: ReadonlySet<string> = new Set<ConsentScope>([
  'PROFILE',
  'ACCOUNTS',
  'TXN',
  'LIABILITIES',
  'HOLDINGS',
])

/** How long a customer's rows are trusted in process. Long enough to serve a demo, short enough to notice a reseed. */
const DEFAULT_CACHE_TTL_MS = 60_000
/** Four personas at a handful of clock positions each; the ledger is ~300 KB a file. */
const BLOCKS_CACHE_SIZE = 32

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

interface CustomerRow {
  id: string
  cif: string
  cust_id: string
  display_name: string
  preferred_language: string
  tax_regime: 'old' | 'new' | null
  display_order: number | null
  persona_slug: string | null
  pitch: string | null
  demonstrates: string | null
  ledger_anchor: IsoDate | null
  ledger_history_from: IsoDate | null
  ledger_horizon: IsoDate | null
  cust_name: string | null
  date_of_birth: IsoDate | null
  age: number | null
  gender: string | null
  gender_raw: string | null
  marital_status: string | null
  marital_status_raw: string | null
  dependents_count: number | null
  employment_type: string | null
  employment_type_raw: string | null
  declared_annual_income: number | null
  city: string | null
  state_code: string | null
  profile_language: string | null
  risk_profile: Customer['riskProfile'] | null
  kyc_status: string | null
  kyc_status_raw: string | null
  customer_since: IsoDate | null
}

interface TransactionRow {
  account_id: string
  tran_id: string
  tran_date: IsoDate
  value_date: IsoDate
  mcc: string | null
  counterparty_vpa: string | null
  merchant_name_bank: string | null
  amount: number
  tran_type: 'CREDIT' | 'DEBIT'
  channel_code: string
  channel_raw: string | null
  narration: string
  spend_category_bank: string | null
  balance_after: number | null
  is_salary_credit_bank: boolean | null
  is_recurring_bank: boolean | null
  is_self_transfer: boolean
  /** The account's masked number where the customer holds more than one ledger, else null. */
  account_stamp: string | null
}

interface Placement {
  institution_name: string | null
  institution_ifsc_prefix: string | null
  institution_is_home: boolean | null
}

interface CasaRow extends Placement {
  id: string
  account_number_masked: string
  account_type: string
  account_type_raw: string | null
  opening_date: IsoDate | null
  interest_rate: number | null
  branch_ifsc: string | null
  is_primary: boolean
}

interface DepositRow extends Placement {
  account_number_masked: string
  deposit_type: DepositType
  description: string | null
  principal_amount: number
  current_value: number | null
  opening_date: IsoDate
  maturity_date: IsoDate | null
  interest_rate: number
  branch_ifsc: string | null
}

interface LoanRow {
  lender: string
  loan_type: string
  loan_type_raw: string | null
  emi_amount: number
  interest_rate: number
  tenure_remaining_months: number | null
  dpd: number
  is_revolving: boolean
  as_of_date: IsoDate
}

interface SipRow {
  scheme_name: string
  asset_class: Holding['assetClass']
  amount: number
  instalment_day: number | null
  start_date: IsoDate | null
  held_via: HeldVia
  as_of_date: IsoDate
}

interface MfRow {
  scheme_name: string
  asset_class: string
  cost_value: number | null
  current_value: number | null
  held_via: HeldVia
  position: number | null
}

interface OtherHoldingRow {
  position: number | null
  holding_type: Holding['holdingType']
  name: string
  asset_class: Holding['assetClass']
  invested_amount: number
  current_value: number
  sip_active: boolean
  sip_amount: number | null
  sip_debit_day: number | null
  maturity_date: IsoDate | null
  interest_rate: number | null
  held_via: HeldVia
  custodian: string | null
  ticker: string | null
  isin: string | null
  units: number | null
  avg_cost: number | null
  purchased_on: IsoDate | null
}

interface PolicyRow {
  plan_name: string
  sum_assured: number | null
  cover_amount: number | null
  premium_amount: number | null
  premium_frequency: string | null
  fund_value: number | null
  maturity_date: IsoDate | null
  policy_start_date: IsoDate | null
  sold_via: string
  custodian: string | null
}

interface OpeningRow {
  account_id: string
  tran_type: 'CREDIT' | 'DEBIT'
  amount: number
  balance_after: number | null
}

interface ConsentRow {
  consent_reference: string
  purpose_text: string
  scopes: string[]
  status: string
  valid_from: IsoDate
  valid_to: IsoDate
}

/** One statement's worth of a customer: every block the engine reads, bounded by as-of. */
interface FileRow {
  customer: CustomerRow | null
  transactions: TransactionRow[]
  openings: OpeningRow[]
  casa: CasaRow[]
  deposits: DepositRow[]
  loans: LoanRow[]
  sips: SipRow[]
  funds: MfRow[]
  others: OtherHoldingRow[]
  policies: PolicyRow[]
}

type Blocks = FileRow & { customer: CustomerRow }

/* ------------------------------------------------------------------ *
 * SQL
 * ------------------------------------------------------------------ */

const CUSTOMER_COLUMNS = `
  c.id, c.cif, c.cust_id, c.display_name, c.preferred_language, c.tax_regime, c.display_order,
  c.persona_slug, c.pitch, c.demonstrates, c.ledger_anchor, c.ledger_history_from, c.ledger_horizon,
  p.cust_name, p.date_of_birth, p.age, p.gender, p.gender_raw, p.marital_status, p.marital_status_raw,
  p.dependents_count, p.employment_type, p.employment_type_raw, p.declared_annual_income,
  p.city, p.state_code, p.preferred_language AS profile_language, p.risk_profile,
  p.kyc_status, p.kyc_status_raw, p.customer_since`

const CUSTOMER_SQL = `
  SELECT ${CUSTOMER_COLUMNS}
  FROM app.customers c
  LEFT JOIN bank.customer_profiles_current p ON p.customer_id = c.id
  WHERE c.erased_at IS NULL AND c.cif IS NOT NULL`

/**
 * The whole file, one round trip. `$1` cif, `$2` months of history, `$3` as-of. The window
 * starts on the first day of the month `$2 - 1` months before the ledger anchor, exactly as
 * the generator measures it, so the file at any clock position is a prefix of one ledger.
 * Dates inside the JSON arrive as 'YYYY-MM-DD' and numerics as numbers, the same shapes the
 * pool's type parsers give a plain row, so the mapping below does not know which path it took.
 */
const FILE_SQL = `
  WITH cust AS (${CUSTOMER_SQL} AND c.cif = $1),
  win AS (
    SELECT cust.id AS customer_id,
           -- More than one ledger means an aggregated statement, which names each line's account.
           (SELECT count(*) FROM bank.accounts x
            WHERE x.customer_id = cust.id AND x.product_kind = 'CASA') AS ledgers,
           date_trunc('month', coalesce(cust.ledger_anchor, cust.ledger_horizon, DATE '1970-01-01')
                               - make_interval(months => greatest(1, $2::int) - 1))::date AS from_date
    FROM cust
  )
  SELECT
    (SELECT row_to_json(cust) FROM cust) AS customer,
    (SELECT coalesce(json_agg(x ORDER BY x.tran_date, x.seq, x.tran_id), '[]'::json) FROM (
       SELECT t.account_id, t.tran_id, t.tran_date, t.value_date, t.seq, t.amount, t.tran_type,
              t.channel_code, t.channel_raw, t.narration, t.spend_category_bank, t.balance_after,
              t.is_salary_credit_bank, t.is_recurring_bank, t.mcc, t.counterparty_vpa,
              t.merchant_name_bank, t.is_self_transfer,
              CASE WHEN win.ledgers > 1 THEN a.account_number_masked END AS account_stamp
       FROM bank.transactions t
       JOIN bank.accounts a ON a.id = t.account_id, win
       WHERE t.customer_id = win.customer_id AND t.tran_date >= win.from_date AND t.tran_date <= $3
         AND t.status = 'POSTED') x) AS transactions,
    (SELECT coalesce(json_agg(x), '[]'::json) FROM (
       SELECT DISTINCT ON (t.account_id) t.account_id, t.tran_type, t.amount, t.balance_after
       FROM bank.transactions t, win
       WHERE t.customer_id = win.customer_id AND t.status = 'POSTED'
       ORDER BY t.account_id, t.tran_date, t.seq, t.tran_id) x) AS openings,
    (SELECT coalesce(json_agg(x ORDER BY x.display_order NULLS LAST, x.created_at, x.account_ref), '[]'::json) FROM (
       SELECT a.id, a.account_number_masked, a.created_at, a.account_ref, a.display_order, a.is_primary,
              a.institution_name, a.institution_ifsc_prefix, a.institution_is_home,
              s.account_type, s.account_type_raw, s.opening_date, s.interest_rate, s.branch_ifsc
       FROM bank.accounts a
       JOIN bank.account_snapshots_current s ON s.account_id = a.id, win
       WHERE a.customer_id = win.customer_id AND a.product_kind = 'CASA' AND s.status <> 'CLOSED'
         AND (s.opening_date IS NULL OR s.opening_date <= $3)) x) AS casa,
    (SELECT coalesce(json_agg(x ORDER BY x.display_order NULLS LAST, x.created_at, x.account_ref), '[]'::json) FROM (
       SELECT a.account_number_masked, a.created_at, a.account_ref, a.display_order,
              a.institution_name, a.institution_ifsc_prefix, a.institution_is_home,
              td.deposit_type, td.description,
              td.principal_amount, td.current_value, td.opening_date, td.maturity_date,
              td.interest_rate, td.branch_ifsc
       FROM bank.accounts a
       JOIN bank.term_deposits_current td ON td.account_id = a.id, win
       WHERE a.customer_id = win.customer_id AND a.product_kind IN ('TERM_DEPOSIT', 'RECURRING_DEPOSIT')
         AND td.status IN ('ACTIVE', 'MATURED', 'RENEWED') AND td.opening_date <= $3) x) AS deposits,
    (SELECT coalesce(json_agg(x ORDER BY x.created_at, x.account_ref), '[]'::json) FROM (
       SELECT a.created_at, a.account_ref, ln.lender, ln.loan_type, ln.loan_type_raw, ln.emi_amount,
              ln.interest_rate, ln.tenure_remaining_months, ln.dpd, ln.is_revolving,
              (ln.as_of AT TIME ZONE 'UTC')::date AS as_of_date
       FROM bank.accounts a
       JOIN bank.loans_current ln ON ln.account_id = a.id, win
       WHERE a.customer_id = win.customer_id AND ln.status = 'ACTIVE') x) AS loans,
    (SELECT coalesce(json_agg(x ORDER BY x.registration_ref), '[]'::json) FROM (
       SELECT s.registration_ref, s.scheme_name, s.asset_class, s.amount, s.instalment_day, s.start_date,
              s.held_via, (s.as_of AT TIME ZONE 'UTC')::date AS as_of_date
       FROM bank.sip_registrations_current s, win
       WHERE s.customer_id = win.customer_id AND s.status = 'ACTIVE'
         AND (s.start_date IS NULL OR s.start_date <= $3)) x) AS sips,
    (SELECT coalesce(json_agg(x ORDER BY x.position NULLS LAST, x.folio_no, x.scheme_name), '[]'::json) FROM (
       SELECT m.folio_no, m.scheme_name, m.asset_class, m.cost_value, m.current_value, m.held_via, m.position
       FROM bank.mf_holdings_current m, win
       WHERE m.customer_id = win.customer_id
         AND NOT EXISTS (SELECT 1 FROM bank.sip_registrations_current s
                         WHERE s.customer_id = m.customer_id AND s.status = 'ACTIVE'
                           AND (s.start_date IS NULL OR s.start_date <= $3)
                           AND s.scheme_name = m.scheme_name)) x) AS funds,
    (SELECT coalesce(json_agg(x ORDER BY x.position NULLS LAST, x.holding_ref), '[]'::json) FROM (
       SELECT o.holding_ref, o.position, o.holding_type, o.name, o.asset_class, o.invested_amount,
              o.current_value, o.sip_active, o.sip_amount, o.sip_debit_day, o.maturity_date, o.interest_rate,
              o.held_via, o.custodian, o.ticker, o.isin, o.units, o.avg_cost, o.purchased_on
       FROM bank.other_holdings_current o, win
       WHERE o.customer_id = win.customer_id) x) AS others,
    (SELECT coalesce(json_agg(x ORDER BY x.insurer, x.policy_number), '[]'::json) FROM (
       SELECT p.insurer, p.policy_number, p.plan_name, p.sum_assured, p.cover_amount, p.premium_amount,
              p.premium_frequency, p.fund_value, p.maturity_date, p.policy_start_date, p.sold_via,
              p.custodian
       FROM bank.insurance_policies_current p, win
       WHERE p.customer_id = win.customer_id AND p.status = 'IN_FORCE'
         AND (p.policy_start_date IS NULL OR p.policy_start_date <= $3)) x) AS policies`

const TRANSACTIONS_SQL = `
  WITH n AS (SELECT count(*) AS ledgers FROM bank.accounts
             WHERE customer_id = $1 AND product_kind = 'CASA')
  SELECT t.account_id, t.tran_id, t.tran_date, t.value_date, t.amount, t.tran_type, t.channel_code,
         t.channel_raw, t.narration, t.spend_category_bank, t.balance_after, t.is_salary_credit_bank,
         t.is_recurring_bank, t.mcc, t.counterparty_vpa, t.merchant_name_bank, t.is_self_transfer,
         CASE WHEN n.ledgers > 1 THEN a.account_number_masked END AS account_stamp
  FROM bank.transactions t
  JOIN bank.accounts a ON a.id = t.account_id, n
  WHERE t.customer_id = $1 AND t.tran_date >= $2 AND t.tran_date <= $3 AND t.status = 'POSTED'
  ORDER BY t.tran_date, t.seq, t.tran_id`

const CONSENT_SQL = `
  SELECT k.consent_reference, k.purpose_text, k.scopes, k.status,
         (k.valid_from AT TIME ZONE 'UTC')::date AS valid_from,
         (k.valid_to AT TIME ZONE 'UTC')::date AS valid_to
  FROM app.consents k
  JOIN app.customers c ON c.id = k.customer_id
  WHERE c.cif = $1 AND c.erased_at IS NULL
  ORDER BY (k.status = 'ACTIVE') DESC, k.valid_to DESC
  LIMIT 1`

/* ------------------------------------------------------------------ *
 * Mapping
 * ------------------------------------------------------------------ */

const EMPLOYMENT: ReadonlySet<string> = new Set(['Salaried', 'Self-employed', 'Business'])

function employment(code: string | null, raw: string | null): Customer['employmentType'] {
  for (const candidate of [raw, code]) {
    if (candidate !== null && EMPLOYMENT.has(candidate))
      return candidate as Customer['employmentType']
  }
  return 'Self-employed'
}

function toCustomer(row: CustomerRow): Customer {
  return {
    cif: row.cif,
    custId: row.cust_id,
    custName: row.cust_name ?? row.display_name,
    dateOfBirth: row.date_of_birth ?? '',
    gender: row.gender_raw ?? row.gender ?? 'Undisclosed',
    maritalStatus: row.marital_status_raw ?? row.marital_status ?? 'Undisclosed',
    dependents: row.dependents_count ?? 0,
    employmentType: employment(row.employment_type, row.employment_type_raw),
    declaredAnnualIncome: row.declared_annual_income ?? 0,
    city: row.city ?? '',
    stateCode: row.state_code ?? '',
    preferredLanguage: row.profile_language ?? row.preferred_language,
    // Conservative is the safe default: it can only ever refuse more, never less.
    riskProfile: row.risk_profile ?? 'Conservative',
    kycStatus: kycLabel(row.kyc_status, row.kyc_status_raw),
    customerSince: row.customer_since ?? '',
    taxRegime: row.tax_regime ?? 'new',
  }
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    txnId: row.tran_id,
    txnDate: row.tran_date,
    valueDate: row.value_date,
    txnAmount: row.amount,
    txnType: row.tran_type,
    txnMode: modeForChannel(row.channel_code, row.channel_raw),
    narration: row.narration,
    // The bank's own label where it sent one. Core's categoriser only falls back to it.
    spendCategory: (row.spend_category_bank ?? 'Transfers') as SpendCategory,
    balanceAfterTxn: row.balance_after,
    isSalaryCredit: row.is_salary_credit_bank ?? false,
    isRecurring: row.is_recurring_bank ?? false,
    // Absent is a legal value on every one of these: a mandate has no MCC, a person-to-person
    // payment has no VPA the bank recognises, and the merchant name arrives on a subset only.
    ...(row.mcc === null ? {} : { mccCode: row.mcc }),
    ...(row.merchant_name_bank === null ? {} : { merchantName: row.merchant_name_bank }),
    ...(row.counterparty_vpa === null ? {} : { counterpartyVpa: row.counterparty_vpa }),
    // A single-bank statement never names its account; an aggregated one names it on every line.
    ...(row.account_stamp === null ? {} : { accountNumberMasked: row.account_stamp }),
    ...(row.is_self_transfer ? { isSelfTransfer: true } : {}),
  }
}

/** Absent means IDBI, as it did on every row older than the columns. */
function institutionOf(row: Placement): Pick<Account, 'institution'> {
  if (
    row.institution_name === null ||
    row.institution_ifsc_prefix === null ||
    row.institution_is_home === null
  ) {
    return {}
  }
  return {
    institution: {
      name: row.institution_name,
      ifscPrefix: row.institution_ifsc_prefix,
      isHome: row.institution_is_home,
    },
  }
}

function depositAccount(row: DepositRow): Account {
  return {
    accountNumberMasked: row.account_number_masked,
    accountType: accountTypeForDeposit(row.deposit_type),
    currentBalance: row.current_value ?? row.principal_amount,
    accountOpeningDate: row.opening_date,
    ...(row.branch_ifsc === null ? {} : { branchIfsc: row.branch_ifsc }),
    ...(row.maturity_date === null ? {} : { maturityDate: row.maturity_date }),
    interestRate: row.interest_rate,
    ...institutionOf(row),
  }
}

function loanContract(row: LoanRow): LiabilityContract {
  return {
    loanType: loanTypeLabel(row.loan_type, row.loan_type_raw),
    emiAmount: row.emi_amount,
    rate: row.interest_rate,
    tenureRemainingAtAnchor: row.tenure_remaining_months ?? 0,
    ...(row.dpd > 0 ? { dpdStatus: row.dpd } : {}),
    ...(row.is_revolving ? { isRevolving: true } : {}),
  }
}

function sipContract(row: SipRow): SipContract {
  const outside = heldOutsideIdbi(row.held_via)
  return {
    scheme: row.scheme_name,
    amount: row.amount,
    day: row.instalment_day ?? 1,
    startsMonthsBeforeAnchor:
      row.start_date === null ? 0 : elapsedMonths(row.start_date, row.as_of_date),
    assetClass: row.asset_class,
    ...(outside === undefined ? {} : { heldOutsideIdbi: outside }),
  }
}

function mfHolding(row: MfRow): Holding {
  const outside = heldOutsideIdbi(row.held_via)
  return {
    holdingType: 'MUTUAL_FUND',
    name: row.scheme_name,
    assetClass: row.asset_class === 'Cash' ? 'Debt' : (row.asset_class as Holding['assetClass']),
    investedAmount: row.cost_value ?? 0,
    currentValue: row.current_value ?? 0,
    sipActive: false,
    ...(outside === undefined ? {} : { heldOutsideIdbi: outside }),
  }
}

function otherHolding(row: OtherHoldingRow): Holding {
  const outside = heldOutsideIdbi(row.held_via)
  return {
    holdingType: row.holding_type,
    name: row.name,
    assetClass: row.asset_class,
    investedAmount: row.invested_amount,
    currentValue: row.current_value,
    sipActive: row.sip_active,
    ...(row.sip_amount === null ? {} : { sipAmount: row.sip_amount }),
    ...(row.sip_debit_day === null ? {} : { sipDebitDay: row.sip_debit_day }),
    ...(row.maturity_date === null ? {} : { maturityDate: row.maturity_date }),
    ...(row.interest_rate === null ? {} : { interestRate: row.interest_rate }),
    ...(outside === undefined ? {} : { heldOutsideIdbi: outside }),
    ...(row.custodian === null ? {} : { custodian: row.custodian }),
    ...(row.ticker === null ? {} : { ticker: row.ticker }),
    ...(row.isin === null ? {} : { isin: row.isin }),
    ...(row.units === null ? {} : { units: row.units }),
    ...(row.avg_cost === null ? {} : { avgCost: row.avg_cost }),
    ...(row.purchased_on === null ? {} : { purchasedOn: row.purchased_on }),
  }
}

function policyHolding(row: PolicyRow): Holding {
  const monthly = row.premium_frequency === 'MONTHLY' && row.premium_amount !== null
  const annual = row.premium_frequency === 'ANNUAL' && row.premium_amount !== null
  const soldOutside =
    row.sold_via === 'OTHER' ? true : row.sold_via === 'IDBI_BANCASSURANCE' ? false : undefined
  return {
    holdingType: 'INSURANCE',
    name: row.plan_name,
    assetClass: 'Protection',
    // Cover in force is what the protection gap reads; a policy's "value" is what it pays out.
    // Rows seeded before cover_amount was written kept the cover in sum_assured.
    investedAmount: row.cover_amount ?? row.sum_assured ?? 0,
    currentValue: row.fund_value ?? 0,
    sipActive: monthly,
    ...(monthly ? { sipAmount: row.premium_amount as number } : {}),
    ...(row.maturity_date === null ? {} : { maturityDate: row.maturity_date }),
    // The policy's own sum assured, only where it was stated beside the cover.
    ...(row.cover_amount !== null && row.sum_assured !== null
      ? { sumAssured: row.sum_assured }
      : {}),
    ...(annual ? { annualPremium: row.premium_amount as number } : {}),
    ...(row.custodian === null ? {} : { custodian: row.custodian }),
    ...(soldOutside === undefined ? {} : { heldOutsideIdbi: soldOutside }),
    ...(row.policy_start_date === null ? {} : { purchasedOn: row.policy_start_date }),
  }
}

function toConsent(row: ConsentRow): Consent {
  const status =
    row.status === 'ACTIVE' ? 'ACTIVE' : row.status === 'EXPIRED' ? 'EXPIRED' : 'REVOKED'
  return {
    consentId: row.consent_reference,
    purpose: row.purpose_text,
    scopes: row.scopes.filter((s): s is ConsentScope => SCOPES.has(s)),
    status,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  }
}

function ageOn(dob: IsoDate, asOf: IsoDate): number {
  const b = ymd(dob)
  const a = ymd(asOf)
  let age = a.year - b.year
  if (a.month < b.month || (a.month === b.month && a.day < b.day)) age -= 1
  return age
}

/* ------------------------------------------------------------------ *
 * Shaping the blocks to a date, pure
 * ------------------------------------------------------------------ */

function accountsOf(b: Blocks, asOf: IsoDate): Account[] {
  // What the balance was before the first seeded line, so an account with no history in the
  // window reports its opening balance rather than zero.
  const openingBalance = new Map<string, number>()
  for (const o of b.openings) {
    if (o.balance_after === null) continue
    openingBalance.set(
      o.account_id,
      o.balance_after - (o.tran_type === 'CREDIT' ? o.amount : -o.amount),
    )
  }

  const out: Account[] = b.casa.map((row) => {
    const own = b.transactions.filter((t) => t.account_id === row.id).map(toTransaction)
    const opening = openingBalance.get(row.id)
    // When the customer last moved money themselves: interest the bank credited does not count,
    // or an account whose only movement in a year is four interest lines would read as in use.
    // An as-of fact, so it is computed here rather than stored. Never said of the primary.
    const byCustomer = own.filter((t) => t.spendCategory !== 'Income' || t.isSalaryCredit)
    const last = byCustomer[byCustomer.length - 1]
    return {
      accountNumberMasked: row.account_number_masked,
      accountType: accountTypeForCasa(row.account_type, row.account_type_raw),
      accountOpeningDate: row.opening_date ?? b.customer.customer_since ?? '',
      ...(row.branch_ifsc === null ? {} : { branchIfsc: row.branch_ifsc }),
      ...(row.interest_rate === null ? {} : { interestRate: row.interest_rate }),
      ...institutionOf(row),
      ...(row.is_primary || last === undefined ? {} : { lastCustomerActivity: last.txnDate }),
      ...accountFactsAsOf(own, asOf, opening === undefined ? {} : { openingBalance: opening }),
    }
  })
  for (const row of b.deposits) out.push(depositAccount(row))
  return out
}

function liabilitiesOf(b: Blocks, asOf: IsoDate): Liability[] {
  return (
    b.loans
      .map((row) => liabilityAsOf(loanContract(row), row.as_of_date, asOf))
      // A cleared loan leaves the list, which is what frees up the EMI.
      .filter((l): l is Liability => l !== null)
  )
}

/** Rows written before positions existed sort after every placed one, in the order read. */
const UNPLACED = Number.MAX_SAFE_INTEGER

function holdingsOf(
  b: Blocks,
  asOf: IsoDate,
  historyMonths: number,
): { holdings: Holding[]; policies: Holding[] } {
  // Fund folios and every other holding share one position, so they merge back into the order
  // they were given in. A deposit is not repeated here: it is already an account, and counting
  // it as a holding too puts it in every net-worth figure twice (contracts/routes/holdings.ts).
  const positioned = [
    ...b.funds.map((row) => ({ position: row.position, holding: mfHolding(row) })),
    ...b.others.map((row) => ({ position: row.position, holding: otherHolding(row) })),
  ].sort((x, y) => (x.position ?? UNPLACED) - (y.position ?? UNPLACED))
  return {
    holdings: [
      ...b.sips.map((row) => sipHoldingAsOf(sipContract(row), row.as_of_date, asOf, historyMonths)),
      ...positioned.map((p) => p.holding),
    ],
    policies: b.policies.map(policyHolding),
  }
}

/* ------------------------------------------------------------------ *
 * A small TTL cache
 * ------------------------------------------------------------------ */

class Memo<V> {
  private readonly entries = new Map<string, { at: number; value: V }>()
  private readonly ttlMs: number
  private readonly max: number

  constructor(ttlMs: number, max: number) {
    this.ttlMs = ttlMs
    this.max = max
  }

  get(key: string, now: number): V | undefined {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    if (now - hit.at >= this.ttlMs) {
      this.entries.delete(key)
      return undefined
    }
    return hit.value
  }

  set(key: string, value: V, now: number): void {
    if (this.ttlMs <= 0) return
    this.entries.delete(key)
    this.entries.set(key, { at: now, value })
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}

/* ------------------------------------------------------------------ *
 * The adapter
 * ------------------------------------------------------------------ */

export interface PostgresBankDataOptions {
  dataFreshnessDate: IsoDate
  /** How long a customer's rows are held in process. 0 reads the database every time. */
  cacheTtlMs?: number
  /** Wall clock for the cache. Never domain time. */
  now?: () => number
}

export class PostgresBankData implements BankDataPort {
  private readonly db: Db
  private dataFreshnessDate: IsoDate
  private readonly now: () => number
  private readonly blocks: Memo<Blocks>
  private readonly customers: Memo<CustomerRow>
  private readonly consents: Memo<Consent>

  constructor(db: Db, opts: PostgresBankDataOptions) {
    this.db = db
    this.dataFreshnessDate = opts.dataFreshnessDate
    this.now = opts.now ?? Date.now
    const ttl = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.blocks = new Memo(ttl, BLOCKS_CACHE_SIZE)
    this.customers = new Memo(ttl, BLOCKS_CACHE_SIZE)
    this.consents = new Memo(ttl, BLOCKS_CACHE_SIZE)
  }

  /** Reads the seeded horizon once so `describe()` can answer synchronously. */
  static async connect(
    db: Db,
    opts: Omit<PostgresBankDataOptions, 'dataFreshnessDate'> = {},
  ): Promise<PostgresBankData> {
    const adapter = new PostgresBankData(db, { ...opts, dataFreshnessDate: '1970-01-01' })
    await adapter.refreshFreshness()
    return adapter
  }

  /** Drop everything held in process; the next read goes to the database. */
  forget(): void {
    this.blocks.clear()
    this.customers.clear()
    this.consents.clear()
  }

  async listCustomers(): Promise<CustomerSummary[]> {
    // The picker's order is a column, so it never depends on what a cif or a name sorts to.
    const { rows } = await this.db.query<CustomerRow>(
      `${CUSTOMER_SQL} ORDER BY c.display_order NULLS LAST, c.created_at, c.cif`,
    )
    return rows.map((r) => {
      const anchor = r.ledger_anchor ?? this.dataFreshnessDate
      return {
        cif: r.cif,
        slug: r.persona_slug ?? r.cust_id,
        name: r.cust_name ?? r.display_name,
        age: r.date_of_birth ? ageOn(r.date_of_birth, anchor) : (r.age ?? 0),
        city: r.city ?? '',
        pitch: r.pitch ?? '',
        demonstrates: r.demonstrates ?? '',
      }
    })
  }

  async getCustomer(cif: string): Promise<Customer> {
    return toCustomer(await this.customerRow(cif))
  }

  async getAccounts(cif: string, asOf: IsoDate): Promise<Account[]> {
    const c = await this.customerRow(cif)
    return accountsOf(await this.loadBlocks(cif, asOf, historyMonths(c)), asOf)
  }

  async getTransactions(
    cif: string,
    range: { from: IsoDate; to: IsoDate },
  ): Promise<Transaction[]> {
    const c = await this.customerRow(cif)
    const { rows } = await this.db.query<TransactionRow>(TRANSACTIONS_SQL, [
      c.id,
      range.from,
      range.to,
    ])
    return rows.map(toTransaction)
  }

  async getLiabilities(cif: string, asOf: IsoDate): Promise<Liability[]> {
    const c = await this.customerRow(cif)
    return liabilitiesOf(await this.loadBlocks(cif, asOf, historyMonths(c)), asOf)
  }

  async getHoldings(
    cif: string,
    asOf: IsoDate,
  ): Promise<{ holdings: Holding[]; policies: Holding[] }> {
    const c = await this.customerRow(cif)
    const months = historyMonths(c)
    return holdingsOf(await this.loadBlocks(cif, asOf, months), asOf, months)
  }

  async getConsent(cif: string): Promise<Consent> {
    const now = this.now()
    const hit = this.consents.get(cif, now)
    if (hit) return hit
    const { rows } = await this.db.query<ConsentRow>(CONSENT_SQL, [cif])
    const row = rows[0]
    if (!row) throw new NotFound(`No consent artefact is on record for ${cif}.`)
    const consent = toConsent(row)
    this.consents.set(cif, consent, now)
    return consent
  }

  async loadCustomerFile(
    cif: string,
    asOf: IsoDate,
    windowMonths: number,
  ): Promise<LoadedCustomerFile> {
    const b = await this.loadBlocks(cif, asOf, windowMonths)
    const held = holdingsOf(b, asOf, windowMonths)
    const file: CustomerFile = {
      customer: toCustomer(b.customer),
      accounts: accountsOf(b, asOf),
      transactions: b.transactions.map(toTransaction),
      liabilities: liabilitiesOf(b, asOf),
      holdings: held.holdings,
      policies: held.policies,
    }
    return { file, provenance: PROVENANCE }
  }

  async ledgerHorizon(cif: string): Promise<LedgerHorizon> {
    const c = await this.customerRow(cif)
    if (c.ledger_history_from && c.ledger_horizon) {
      return { from: c.ledger_history_from, to: c.ledger_horizon }
    }
    const { rows } = await this.db.query<{ from: IsoDate | null; to: IsoDate | null }>(
      `SELECT min(tran_date) AS "from", max(tran_date) AS "to" FROM bank.transactions WHERE customer_id = $1`,
      [c.id],
    )
    const span = rows[0]
    if (!span?.from || !span.to) throw new NotFound(`No statement lines are seeded for ${cif}.`)
    return { from: span.from, to: span.to }
  }

  describe(): BankDataDescription {
    return { source: SOURCE, simulatedClock: true, dataFreshnessDate: this.dataFreshnessDate }
  }

  async health(): Promise<{ ok: boolean; latencyMs: number }> {
    const started = performance.now()
    try {
      await this.refreshFreshness()
      return { ok: true, latencyMs: Math.round(performance.now() - started) }
    } catch {
      return { ok: false, latencyMs: Math.round(performance.now() - started) }
    }
  }

  /* ---------------------------------------------------------------- */

  private async refreshFreshness(): Promise<void> {
    const { rows } = await this.db.query<{ horizon: IsoDate | null; last: IsoDate | null }>(
      `SELECT (SELECT max(ledger_horizon) FROM app.customers WHERE erased_at IS NULL) AS horizon,
              (SELECT max(tran_date) FROM bank.transactions) AS last`,
    )
    const fresh = rows[0]?.horizon ?? rows[0]?.last
    if (fresh) this.dataFreshnessDate = fresh
  }

  private async customerRow(cif: string): Promise<CustomerRow> {
    const now = this.now()
    const hit = this.customers.get(cif, now)
    if (hit) return hit
    const { rows } = await this.db.query<CustomerRow>(`${CUSTOMER_SQL} AND c.cif = $1`, [cif])
    const row = rows[0]
    if (!row) throw new NotFound(`No customer with cif ${cif}.`)
    this.customers.set(cif, row, now)
    return row
  }

  /** Every block for one customer at one date, from the cache or in one round trip. */
  private async loadBlocks(cif: string, asOf: IsoDate, windowMonths: number): Promise<Blocks> {
    const key = `${cif}|${asOf}|${windowMonths}`
    const now = this.now()
    const hit = this.blocks.get(key, now)
    if (hit) return hit

    const { rows } = await this.db.query<FileRow>(FILE_SQL, [cif, windowMonths, asOf])
    const row = rows[0]
    if (!row?.customer) throw new NotFound(`No customer with cif ${cif}.`)
    const blocks: Blocks = { ...row, customer: row.customer }
    this.blocks.set(key, blocks, now)
    this.customers.set(cif, row.customer, now)
    return blocks
  }
}

/** The seeded history length in months, which is also the generator's `months` argument. */
function historyMonths(c: CustomerRow): number {
  if (c.ledger_history_from && c.ledger_anchor) {
    return elapsedMonths(c.ledger_history_from, c.ledger_anchor) + 1
  }
  return 24
}

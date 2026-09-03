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
 */
import {
  accountFactsAsOf,
  addMonths,
  elapsedMonths,
  fromYmd,
  liabilityAsOf,
  sipHoldingAsOf,
  ymd,
} from '@dhan/core'
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
import { parallel } from '../../db/pool.ts'
import type { Db } from '../../db/pool.ts'
import type { BankDataDescription, BankDataPort, LoadedCustomerFile } from '../../ports/index.ts'
import {
  accountTypeForCasa,
  accountTypeForDeposit,
  heldOutsideIdbi,
  holdingTypeForDeposit,
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
  amount: number
  tran_type: 'CREDIT' | 'DEBIT'
  channel_code: string
  channel_raw: string | null
  narration: string
  spend_category_bank: string | null
  balance_after: number | null
  is_salary_credit_bank: boolean | null
  is_recurring_bank: boolean | null
}

interface CasaRow {
  id: string
  account_number_masked: string
  account_type: string
  account_type_raw: string | null
  opening_date: IsoDate | null
  interest_rate: number | null
}

interface DepositRow {
  account_number_masked: string
  deposit_type: DepositType
  description: string | null
  principal_amount: number
  current_value: number | null
  opening_date: IsoDate
  maturity_date: IsoDate | null
  interest_rate: number
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
}

interface PolicyRow {
  plan_name: string
  sum_assured: number | null
  cover_amount: number | null
  premium_amount: number | null
  premium_frequency: string | null
  fund_value: number | null
  maturity_date: IsoDate | null
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
  valid_from: Date
  valid_to: Date
}

/* ------------------------------------------------------------------ *
 * SQL
 * ------------------------------------------------------------------ */

const CUSTOMER_SQL = `
  SELECT c.id, c.cif, c.cust_id, c.display_name, c.preferred_language, c.tax_regime,
         c.persona_slug, c.pitch, c.demonstrates, c.ledger_anchor, c.ledger_history_from, c.ledger_horizon,
         p.cust_name, p.date_of_birth, p.age, p.gender, p.gender_raw, p.marital_status, p.marital_status_raw,
         p.dependents_count, p.employment_type, p.employment_type_raw, p.declared_annual_income,
         p.city, p.state_code, p.preferred_language AS profile_language, p.risk_profile,
         p.kyc_status, p.kyc_status_raw, p.customer_since
  FROM app.customers c
  LEFT JOIN bank.customer_profiles_current p ON p.customer_id = c.id
  WHERE c.erased_at IS NULL AND c.cif IS NOT NULL`

const TRANSACTIONS_SQL = `
  SELECT t.account_id, t.tran_id, t.tran_date, t.amount, t.tran_type, t.channel_code, t.channel_raw,
         t.narration, t.spend_category_bank, t.balance_after, t.is_salary_credit_bank, t.is_recurring_bank
  FROM bank.transactions t
  WHERE t.customer_id = $1 AND t.tran_date >= $2 AND t.tran_date <= $3 AND t.status = 'POSTED'
  ORDER BY t.tran_date, t.seq, t.tran_id`

const OPENING_SQL = `
  SELECT DISTINCT ON (t.account_id) t.account_id, t.tran_type, t.amount, t.balance_after
  FROM bank.transactions t
  WHERE t.customer_id = $1 AND t.status = 'POSTED'
  ORDER BY t.account_id, t.tran_date, t.seq, t.tran_id`

const CASA_SQL = `
  SELECT a.id, a.account_number_masked, s.account_type, s.account_type_raw, s.opening_date, s.interest_rate
  FROM bank.accounts a
  JOIN bank.account_snapshots_current s ON s.account_id = a.id
  WHERE a.customer_id = $1 AND a.product_kind = 'CASA' AND s.status <> 'CLOSED'
    AND (s.opening_date IS NULL OR s.opening_date <= $2)
  ORDER BY a.created_at, a.account_ref`

const DEPOSITS_SQL = `
  SELECT a.account_number_masked, td.deposit_type, td.description, td.principal_amount, td.current_value,
         td.opening_date, td.maturity_date, td.interest_rate
  FROM bank.accounts a
  JOIN bank.term_deposits_current td ON td.account_id = a.id
  WHERE a.customer_id = $1 AND a.product_kind IN ('TERM_DEPOSIT', 'RECURRING_DEPOSIT')
    AND td.status IN ('ACTIVE', 'MATURED', 'RENEWED') AND td.opening_date <= $2
  ORDER BY a.created_at, a.account_ref`

const LOANS_SQL = `
  SELECT ln.lender, ln.loan_type, ln.loan_type_raw, ln.emi_amount, ln.interest_rate,
         ln.tenure_remaining_months, ln.dpd, ln.is_revolving, (ln.as_of AT TIME ZONE 'UTC')::date AS as_of_date
  FROM bank.accounts a
  JOIN bank.loans_current ln ON ln.account_id = a.id
  WHERE a.customer_id = $1 AND ln.status = 'ACTIVE'
  ORDER BY a.created_at, a.account_ref`

const SIPS_SQL = `
  SELECT scheme_name, asset_class, amount, instalment_day, start_date, held_via,
         (as_of AT TIME ZONE 'UTC')::date AS as_of_date
  FROM bank.sip_registrations_current
  WHERE customer_id = $1 AND status = 'ACTIVE' AND (start_date IS NULL OR start_date <= $2)
  ORDER BY registration_ref`

const MF_SQL = `
  SELECT scheme_name, asset_class, cost_value, current_value, held_via
  FROM bank.mf_holdings_current
  WHERE customer_id = $1 AND NOT (scheme_name = ANY($2::text[]))
  ORDER BY folio_no, scheme_name`

const POLICIES_SQL = `
  SELECT plan_name, sum_assured, cover_amount, premium_amount, premium_frequency, fund_value, maturity_date
  FROM bank.insurance_policies_current
  WHERE customer_id = $1 AND status = 'IN_FORCE' AND (policy_start_date IS NULL OR policy_start_date <= $2)
  ORDER BY insurer, policy_number`

const CONSENT_SQL = `
  SELECT consent_reference, purpose_text, scopes, status, valid_from, valid_to
  FROM app.consents
  WHERE customer_id = $1
  ORDER BY (status = 'ACTIVE') DESC, valid_to DESC
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
    txnAmount: row.amount,
    txnType: row.tran_type,
    txnMode: modeForChannel(row.channel_code, row.channel_raw),
    narration: row.narration,
    // The bank's own label where it sent one. Core's categoriser only falls back to it.
    spendCategory: (row.spend_category_bank ?? 'Transfers') as SpendCategory,
    balanceAfterTxn: row.balance_after,
    isSalaryCredit: row.is_salary_credit_bank ?? false,
    isRecurring: row.is_recurring_bank ?? false,
  }
}

function depositAccount(row: DepositRow): Account {
  return {
    accountNumberMasked: row.account_number_masked,
    accountType: accountTypeForDeposit(row.deposit_type),
    currentBalance: row.current_value ?? row.principal_amount,
    accountOpeningDate: row.opening_date,
    ...(row.maturity_date === null ? {} : { maturityDate: row.maturity_date }),
    interestRate: row.interest_rate,
  }
}

function depositHolding(row: DepositRow): Holding {
  return {
    holdingType: holdingTypeForDeposit(row.deposit_type),
    name: row.description ?? `IDBI ${row.deposit_type === 'RD' ? 'Recurring' : 'Fixed'} Deposit`,
    assetClass: 'Debt',
    investedAmount: row.principal_amount,
    currentValue: row.current_value ?? row.principal_amount,
    sipActive: false,
    ...(row.maturity_date === null ? {} : { maturityDate: row.maturity_date }),
    interestRate: row.interest_rate,
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

function policyHolding(row: PolicyRow): Holding {
  const monthly = row.premium_frequency === 'MONTHLY' && row.premium_amount !== null
  return {
    holdingType: 'INSURANCE',
    name: row.plan_name,
    assetClass: 'Protection',
    // Cover in force is what the protection gap reads; a policy's "value" is what it pays out.
    investedAmount: row.sum_assured ?? row.cover_amount ?? 0,
    currentValue: row.fund_value ?? 0,
    sipActive: monthly,
    ...(monthly ? { sipAmount: row.premium_amount as number } : {}),
    ...(row.maturity_date === null ? {} : { maturityDate: row.maturity_date }),
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
    validFrom: row.valid_from.toISOString().slice(0, 10),
    validTo: row.valid_to.toISOString().slice(0, 10),
  }
}

function ageOn(dob: IsoDate, asOf: IsoDate): number {
  const b = ymd(dob)
  const a = ymd(asOf)
  let age = a.year - b.year
  if (a.month < b.month || (a.month === b.month && a.day < b.day)) age -= 1
  return age
}

/** The first day of the month `months - 1` months before the anchor: where the seeded ledger begins. */
function windowStart(anchor: IsoDate, months: number): IsoDate {
  const start = ymd(addMonths(anchor, -(Math.max(1, months) - 1)))
  return fromYmd(start.year, start.month, 1)
}

/* ------------------------------------------------------------------ *
 * The adapter
 * ------------------------------------------------------------------ */

export class PostgresBankData implements BankDataPort {
  private readonly db: Db
  private dataFreshnessDate: IsoDate

  constructor(db: Db, opts: { dataFreshnessDate: IsoDate }) {
    this.db = db
    this.dataFreshnessDate = opts.dataFreshnessDate
  }

  /** Reads the seeded horizon once so `describe()` can answer synchronously. */
  static async connect(db: Db): Promise<PostgresBankData> {
    const adapter = new PostgresBankData(db, { dataFreshnessDate: '1970-01-01' })
    await adapter.refreshFreshness()
    return adapter
  }

  async listCustomers(): Promise<CustomerSummary[]> {
    const { rows } = await this.db.query<CustomerRow>(
      `${CUSTOMER_SQL} ORDER BY c.created_at, c.cif`,
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
    const months = historyMonths(c)
    const txns = await this.transactionRows(c.id, windowStart(anchorOf(c), months), asOf)
    return this.accounts(c, asOf, txns)
  }

  async getTransactions(
    cif: string,
    range: { from: IsoDate; to: IsoDate },
  ): Promise<Transaction[]> {
    const c = await this.customerRow(cif)
    return (await this.transactionRows(c.id, range.from, range.to)).map(toTransaction)
  }

  async getLiabilities(cif: string, asOf: IsoDate): Promise<Liability[]> {
    return this.liabilities((await this.customerRow(cif)).id, asOf)
  }

  async getHoldings(
    cif: string,
    asOf: IsoDate,
  ): Promise<{ holdings: Holding[]; policies: Holding[] }> {
    const c = await this.customerRow(cif)
    return this.holdings(c.id, asOf, historyMonths(c))
  }

  async getConsent(cif: string): Promise<Consent> {
    const c = await this.customerRow(cif)
    const { rows } = await this.db.query<ConsentRow>(CONSENT_SQL, [c.id])
    const row = rows[0]
    if (!row) throw new NotFound(`No consent artefact is on record for ${cif}.`)
    return toConsent(row)
  }

  async loadCustomerFile(
    cif: string,
    asOf: IsoDate,
    windowMonths: number,
  ): Promise<LoadedCustomerFile> {
    const c = await this.customerRow(cif)
    const txns = await this.transactionRows(c.id, windowStart(anchorOf(c), windowMonths), asOf)
    const [accounts, liabilities, held] = await parallel(this.db, [
      () => this.accounts(c, asOf, txns),
      () => this.liabilities(c.id, asOf),
      () => this.holdings(c.id, asOf, windowMonths),
    ])
    const file: CustomerFile = {
      customer: toCustomer(c),
      accounts,
      transactions: txns.map(toTransaction),
      liabilities,
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
    const { rows } = await this.db.query<CustomerRow>(`${CUSTOMER_SQL} AND c.cif = $1`, [cif])
    const row = rows[0]
    if (!row) throw new NotFound(`No customer with cif ${cif}.`)
    return row
  }

  private async transactionRows(
    customerId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<TransactionRow[]> {
    const { rows } = await this.db.query<TransactionRow>(TRANSACTIONS_SQL, [customerId, from, to])
    return rows
  }

  private async accounts(
    c: CustomerRow,
    asOf: IsoDate,
    txns: TransactionRow[],
  ): Promise<Account[]> {
    const [casa, deposits, openings] = await parallel(this.db, [
      () => this.db.query<CasaRow>(CASA_SQL, [c.id, asOf]),
      () => this.db.query<DepositRow>(DEPOSITS_SQL, [c.id, asOf]),
      () => this.db.query<OpeningRow>(OPENING_SQL, [c.id]),
    ])

    // What the balance was before the first seeded line, so an account with no history in
    // the window reports its opening balance rather than zero.
    const openingBalance = new Map<string, number>()
    for (const o of openings.rows) {
      if (o.balance_after === null) continue
      openingBalance.set(
        o.account_id,
        o.balance_after - (o.tran_type === 'CREDIT' ? o.amount : -o.amount),
      )
    }

    const out: Account[] = casa.rows.map((row) => {
      const own = txns.filter((t) => t.account_id === row.id).map(toTransaction)
      const opening = openingBalance.get(row.id)
      return {
        accountNumberMasked: row.account_number_masked,
        accountType: accountTypeForCasa(row.account_type, row.account_type_raw),
        accountOpeningDate: row.opening_date ?? c.customer_since ?? '',
        ...accountFactsAsOf(own, asOf, opening === undefined ? {} : { openingBalance: opening }),
      }
    })
    for (const row of deposits.rows) out.push(depositAccount(row))
    return out
  }

  private async liabilities(customerId: string, asOf: IsoDate): Promise<Liability[]> {
    const { rows } = await this.db.query<LoanRow>(LOANS_SQL, [customerId])
    return (
      rows
        .map((row) => liabilityAsOf(loanContract(row), row.as_of_date, asOf))
        // A cleared loan leaves the list, which is what frees up the EMI.
        .filter((l): l is Liability => l !== null)
    )
  }

  private async holdings(
    customerId: string,
    asOf: IsoDate,
    historyMonths: number,
  ): Promise<{ holdings: Holding[]; policies: Holding[] }> {
    const sips = await this.db.query<SipRow>(SIPS_SQL, [customerId, asOf])
    const sipNames = sips.rows.map((s) => s.scheme_name)
    const [deposits, funds, policies] = await parallel(this.db, [
      () => this.db.query<DepositRow>(DEPOSITS_SQL, [customerId, asOf]),
      () => this.db.query<MfRow>(MF_SQL, [customerId, sipNames]),
      () => this.db.query<PolicyRow>(POLICIES_SQL, [customerId, asOf]),
    ])
    return {
      holdings: [
        ...sips.rows.map((row) =>
          sipHoldingAsOf(sipContract(row), row.as_of_date, asOf, historyMonths),
        ),
        ...funds.rows.map(mfHolding),
        ...deposits.rows.map(depositHolding),
      ],
      policies: policies.rows.map(policyHolding),
    }
  }
}

function anchorOf(c: CustomerRow): IsoDate {
  return c.ledger_anchor ?? c.ledger_horizon ?? '1970-01-01'
}

/** The seeded history length in months, which is also the generator's `months` argument. */
function historyMonths(c: CustomerRow): number {
  if (c.ledger_history_from && c.ledger_anchor) {
    return elapsedMonths(c.ledger_history_from, c.ledger_anchor) + 1
  }
  return 24
}

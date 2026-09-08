/**
 * The code tables between IDBI's vocabulary and core's enums.
 *
 * Both directions live here so the offline sandbox (core → wire) and the mapping (wire → core)
 * cannot disagree about what "Moderate" means. Lookups are on a normalised key — upper case,
 * separators collapsed — so `Food and Dining`, `FOOD_AND_DINING` and `food & dining` all land
 * on the same row. A value not in the table goes to the map's fallback and the raw string is
 * kept in the mapping report, which is the E.3 rule: a code we did not anticipate never fails
 * ingestion, it becomes a row somebody adds to the table on replay.
 *
 * A map with a `null` fallback is strict: the field decides something that must not be
 * guessed (the direction of a transaction; the riskometer band the gate reads).
 */
import type {
  Account,
  Customer,
  Holding,
  Product,
  SpendCategory,
  TxnMode,
  TxnType,
} from '@dhan/core'
import type { Consent } from '@dhan/contracts'

export interface CodeMap<T extends string> {
  readonly name: string
  /** Where an unknown value lands, or null when guessing is not allowed. */
  readonly fallback: T | null
  /** Normalised wire value → core value. The first entry per core value is the label the sandbox emits. */
  readonly entries: Readonly<Record<string, T>>
}

export function normaliseCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s\-_/&.]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function table<T extends string>(
  name: string,
  fallback: T | null,
  rows: readonly (readonly [T, readonly string[]])[],
): CodeMap<T> {
  const entries: Record<string, T> = {}
  for (const [value, aliases] of rows) {
    for (const alias of aliases) entries[normaliseCode(alias)] = value
  }
  return { name, fallback, entries }
}

/** The wire label the sandbox writes for a core value: the first alias registered for it. */
export function wireLabel<T extends string>(map: CodeMap<T>, value: T): string {
  const label = LABELS.get(map)?.get(value)
  if (label === undefined) throw new Error(`${map.name}: no wire label registered for ${value}`)
  return label
}

const LABELS = new WeakMap<CodeMap<string>, Map<string, string>>()

function labelled<T extends string>(
  name: string,
  fallback: T | null,
  rows: readonly (readonly [T, readonly string[]])[],
): CodeMap<T> {
  const map = table(name, fallback, rows)
  LABELS.set(map, new Map(rows.map(([value, aliases]) => [value, aliases[0] ?? value] as const)))
  return map
}

/* ------------------------------------------------------------------ */

export const TXN_TYPE = labelled<TxnType>('txn_type', null, [
  ['CREDIT', ['CREDIT', 'CR', 'C']],
  ['DEBIT', ['DEBIT', 'DR', 'D']],
])

/** The spec's list — "UPI, NEFT, IMPS, card, ATM, standing instruction, cash" — plus Finacle's channel codes. */
export const TXN_MODE = labelled<TxnMode>('txn_mode', 'NEFT', [
  ['UPI', ['UPI']],
  ['CARD', ['CARD', 'POS', 'ECOM', 'DEBIT CARD', 'CREDIT CARD', 'DC', 'CC']],
  // REMITTANCE is 739's word for a wire credit, and OTHERS is what it writes when the rail is
  // not stated. Both fell on the NEFT fallback silently before the captures named them.
  ['NEFT', ['NEFT', 'RTGS', 'ACH_CR', 'NACH_CR', 'ACH CREDIT', 'REMITTANCE', 'OTHERS']],
  ['IMPS', ['IMPS', 'TFR', 'FT', 'TRANSFER']],
  ['ACH-D', ['NACH', 'ACH-D', 'ACH_DR', 'ACH', 'NACH_DR', 'ECS', 'MANDATE', 'ACH DEBIT']],
  ['SI', ['STANDING INSTRUCTION', 'SI', 'STO']],
  ['CASH', ['ATM', 'CASH', 'CDM', 'CWDR', 'CASH WITHDRAWAL']],
  ['CHQ', ['CHEQUE', 'CHQ', 'CLG', 'CLEARING']],
])

/** Ours first, so a feed that echoes our labels round-trips; then the labels a bank is likely to use. */
export const SPEND_CATEGORY = labelled<SpendCategory>('spend_category', 'Transfers', [
  ['Income', ['Income', 'Salary', 'Credit', 'Payroll']],
  ['Rent & bills', ['Rent and Bills', 'Rent & bills', 'Rent', 'Bills', 'Utilities', 'Housing']],
  ['Groceries', ['Groceries', 'Grocery', 'Supermarket']],
  ['Food & dining', ['Food and Dining', 'Food & dining', 'Food', 'Dining', 'Restaurants']],
  ['Transport', ['Transport', 'Travel', 'Fuel', 'Commute', 'Cab']],
  ['Shopping', ['Shopping', 'Retail', 'E-commerce', 'Ecommerce']],
  ['Entertainment', ['Entertainment', 'Subscriptions', 'Leisure', 'OTT']],
  ['Health', ['Health', 'Medical', 'Pharmacy', 'Hospital', 'Healthcare']],
  ['Education', ['Education', 'School', 'Fees']],
  ['Investment', ['Investment', 'Investments', 'Mutual Fund', 'SIP']],
  ['Insurance', ['Insurance', 'Premium']],
  ['Loan EMI', ['Loan EMI', 'EMI', 'Loan', 'Repayment']],
  ['Cash', ['Cash', 'ATM', 'Withdrawal']],
  ['Transfers', ['Transfers', 'Transfer', 'P2P', 'Remittance']],
  ['Fees & charges', ['Fees and Charges', 'Fees & charges', 'Charges', 'Bank Charges', 'Fee']],
])

/** "Savings, current, salary. Salary accounts enable payday triggers" — a salary account is a savings account to the engine. */
export const ACCOUNT_TYPE = labelled<Account['accountType']>('account_type', 'Savings', [
  // `SBA` is what 394 and 595 call a savings account and `REGULAR` is 595's word for the
  // ordinary variant of whatever `fiType` already said; both used to land on the fallback,
  // which happened to be right and told us nothing. `DEPOSIT` is 595's fiType for the
  // current-and-savings family, so it can only mean savings once CURRENT has had its turn.
  [
    'Savings',
    [
      'Savings',
      'SB',
      'Saving',
      'Salary',
      'Basic',
      'BSBDA',
      'SAVINGS BANK',
      'SBA',
      'REGULAR',
      'DEPOSIT',
    ],
  ],
  ['Current', ['Current', 'CA', 'Cash Credit', 'CC', 'OD']],
  ['FD', ['FD', 'Fixed Deposit', 'Term Deposit', 'TD', 'Tax Saver', 'TERM_DEPOSIT']],
  ['RD', ['RD', 'Recurring Deposit', 'SSP', 'Systematic Savings Plan']],
  ['PPF', ['PPF', 'Public Provident Fund']],
  ['NPS', ['NPS', 'National Pension System']],
])

/** Core has three; the spec lists four. Retired lands on Self-employed and is flagged, as the Postgres adapter does. */
export const EMPLOYMENT_TYPE = labelled<Customer['employmentType']>(
  'employment_type',
  'Self-employed',
  [
    ['Salaried', ['Salaried', 'Service', 'Employee', 'Salary']],
    ['Self-employed', ['Self-employed', 'Self Employed', 'Professional', 'Freelance']],
    ['Business', ['Business', 'Trader', 'Proprietor', 'Businessman', 'Self-employed Business']],
  ],
)

/** The bank's five-band SEBI label onto our three. Unknown lands on Conservative: it can only refuse more, never less. */
export const RISK_PROFILE = labelled<Customer['riskProfile']>('risk_profile', 'Conservative', [
  ['Conservative', ['Conservative', 'Moderately Conservative', 'Low', 'Cautious']],
  ['Balanced', ['Moderate', 'Balanced', 'Medium']],
  ['Growth', ['Aggressive', 'Growth', 'Moderately Aggressive', 'High']],
])

/** The spec's eight onto core's six. EQUITY and GOLD are valued like funds; the asset class keeps the distinction. */
export const HOLDING_TYPE = labelled<Holding['holdingType']>('holding_type', 'MUTUAL_FUND', [
  ['MUTUAL_FUND', ['MUTUAL_FUND', 'MF', 'Mutual Fund', 'EQUITY', 'GOLD', 'ETF']],
  ['FD', ['FD', 'Fixed Deposit', 'Term Deposit']],
  ['RD', ['RD', 'Recurring Deposit']],
  ['INSURANCE', ['INSURANCE', 'Policy', 'Life Insurance', 'ULIP']],
  ['NPS', ['NPS']],
  ['PPF', ['PPF']],
])

export const ASSET_CLASS = labelled<Holding['assetClass']>('asset_class', 'Debt', [
  ['Equity', ['Equity', 'Stocks']],
  ['Debt', ['Debt', 'Cash', 'Liquid', 'Fixed Income', 'Deposit']],
  ['Hybrid', ['Hybrid', 'Balanced']],
  ['Gold', ['Gold', 'Commodity']],
  ['Protection', ['Protection', 'Insurance', 'Cover']],
])

/** Strict: a product whose category cannot be placed is dropped from the shelf, never guessed onto it. */
export const PRODUCT_CATEGORY = labelled<Product['category']>('product_category', null, [
  ['Sweep-in FD', ['Sweep-in FD', 'Sweep-in', 'Sweep In Deposit', 'Flexi Deposit']],
  ['Fixed Deposit', ['Fixed Deposit', 'FD', 'Term Deposit']],
  ['Recurring Deposit', ['Recurring Deposit', 'RD', 'Systematic Savings Plan', 'SSP']],
  ['Liquid', ['Liquid', 'Liquid Fund', 'Overnight']],
  ['Debt', ['Debt', 'Debt Fund', 'Short Duration', 'Short Duration Fund']],
  ['Index Fund', ['Index Fund', 'Index', 'Nifty 50 Index']],
  ['Equity', ['Equity', 'Equity Fund', 'Flexi Cap', 'Large Cap', 'Mid Cap']],
  ['ELSS', ['ELSS', 'Tax Saver', 'Tax Saving']],
  ['Term Insurance', ['Term Insurance', 'Term', 'Term Assurance']],
  ['Health Insurance', ['Health Insurance', 'Health', 'Mediclaim']],
  ['Government Insurance', ['Government Insurance', 'PMJJBY', 'PMSBY', 'GOI Insurance']],
  ['NPS', ['NPS', 'National Pension System']],
  ['PPF', ['PPF', 'Public Provident Fund']],
  ['ULIP', ['ULIP', 'Unit Linked']],
  ['Endowment', ['Endowment', 'Money Back', 'Whole Life', 'Traditional']],
])

/** SEBI's six bands. Strict: the gate reads this. */
export const RISKOMETER = labelled<Product['riskometer']>('riskometer', null, [
  ['Low', ['Low']],
  ['Low to Moderate', ['Low to Moderate', 'Low-Moderate', 'Moderately Low']],
  ['Moderate', ['Moderate']],
  ['Moderately High', ['Moderately High']],
  ['High', ['High']],
  ['Very High', ['Very High']],
])

/** Unknown lands on REVOKED: an unrecognised consent state means no advice, not a guess. */
export const CONSENT_STATUS = labelled<Consent['status']>('consent_status', 'REVOKED', [
  ['ACTIVE', ['ACTIVE', 'VALID', 'GRANTED', 'LIVE']],
  ['EXPIRED', ['EXPIRED', 'LAPSED']],
  ['REVOKED', ['REVOKED', 'WITHDRAWN', 'PAUSED', 'REJECTED']],
])

export interface CodeLookup<T extends string> {
  value: T | null
  matched: boolean
}

/** The core value for a wire code, or the fallback (null under a strict map) with `matched: false`. */
export function lookupCode<T extends string>(map: CodeMap<T>, raw: string): CodeLookup<T> {
  const hit = map.entries[normaliseCode(raw)]
  if (hit !== undefined) return { value: hit, matched: true }
  return { value: map.fallback, matched: false }
}

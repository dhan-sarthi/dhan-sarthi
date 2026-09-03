/**
 * The code tables between core's vocabulary and the bank schema's normalised codes.
 *
 * Both directions live in one file so the seed's projector (CustomerFile → bank.*) and the
 * bank-data adapter (bank.* → CustomerFile) cannot disagree about what 'ACH-D' becomes. Every
 * normalised column has a `_raw` sibling carrying the original string, so a value not in these
 * tables lands as OTHER plus the raw text and ingestion never fails.
 */
import type { Account, Holding, Liability, TxnMode } from '@dhan/core'

/* ------------------------------------------------------------------ *
 * Channels (Transaction.txnMode ↔ ref.channel_codes)
 * ------------------------------------------------------------------ */

const MODE_TO_CHANNEL: Record<TxnMode, string> = {
  UPI: 'UPI',
  CARD: 'POS',
  NEFT: 'NEFT',
  IMPS: 'IMPS',
  'ACH-D': 'ACH_DR',
  SI: 'SI',
  CASH: 'ATM',
  CHQ: 'CHQ',
}

const CHANNEL_TO_MODE: Record<string, TxnMode> = {
  UPI: 'UPI',
  POS: 'CARD',
  ECOM: 'CARD',
  NEFT: 'NEFT',
  RTGS: 'NEFT',
  ACH_CR: 'NEFT',
  IMPS: 'IMPS',
  TFR: 'IMPS',
  ACH_DR: 'ACH-D',
  SI: 'SI',
  ATM: 'CASH',
  CDM: 'CASH',
  CASH: 'CASH',
  CHQ: 'CHQ',
}

const TXN_MODES: ReadonlySet<string> = new Set<TxnMode>([
  'UPI',
  'CARD',
  'NEFT',
  'IMPS',
  'ACH-D',
  'SI',
  'CASH',
  'CHQ',
])

export const channelForMode = (mode: TxnMode): string => MODE_TO_CHANNEL[mode] ?? 'OTHER'

/** The raw code wins where it is one of ours; otherwise the normalised channel is mapped back. */
export function modeForChannel(channel: string, raw: string | null): TxnMode {
  if (raw !== null && TXN_MODES.has(raw)) return raw as TxnMode
  return CHANNEL_TO_MODE[channel] ?? 'NEFT'
}

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export type CasaType = 'SAVINGS' | 'CURRENT'

export function casaType(accountType: Account['accountType']): CasaType {
  return accountType === 'Current' ? 'CURRENT' : 'SAVINGS'
}

/** Snapshot account_type → core. Salary and basic accounts are savings accounts to the engine. */
export function accountTypeForCasa(
  accountType: string,
  raw: string | null,
): Account['accountType'] {
  if (raw === 'Savings' || raw === 'Current') return raw
  return accountType === 'CURRENT' || accountType === 'CASH_CREDIT' ? 'Current' : 'Savings'
}

export type DepositType = 'FD' | 'RD' | 'TAX_SAVER' | 'SWEEP_IN' | 'SSP' | 'OTHER'

export function depositType(accountType: Account['accountType']): DepositType {
  return accountType === 'RD' ? 'RD' : 'FD'
}

export function accountTypeForDeposit(deposit: DepositType): Account['accountType'] {
  return deposit === 'RD' || deposit === 'SSP' ? 'RD' : 'FD'
}

export function holdingTypeForDeposit(deposit: DepositType): Holding['holdingType'] {
  return deposit === 'RD' || deposit === 'SSP' ? 'RD' : 'FD'
}

/* ------------------------------------------------------------------ *
 * Loans
 * ------------------------------------------------------------------ */

const LOAN_TYPES: readonly [RegExp, string][] = [
  [/credit\s*card|revolving/i, 'CREDIT_CARD'],
  [/education|student/i, 'EDUCATION'],
  [/home|housing|mortgage/i, 'HOME'],
  [/two.?wheeler|scooter|bike/i, 'TWO_WHEELER'],
  [/auto|car|vehicle/i, 'AUTO'],
  [/gold/i, 'GOLD'],
  [/property|lap\b/i, 'LOAN_AGAINST_PROPERTY'],
  [/shop/i, 'SHOP'],
  [/business|msme/i, 'BUSINESS'],
  [/personal/i, 'PERSONAL'],
  [/overdraft|\bod\b/i, 'OVERDRAFT'],
  [/consumer|durable/i, 'CONSUMER_DURABLE'],
  [/agri|kisan|crop/i, 'AGRI'],
]

/** The bank's normalised loan type for the free-text `Liability.loanType`. */
export function loanTypeCode(loanType: string, isRevolving: boolean | undefined): string {
  if (isRevolving) return 'CREDIT_CARD'
  for (const [pattern, code] of LOAN_TYPES) if (pattern.test(loanType)) return code
  return 'OTHER'
}

export const loanProductKind = (loanType: string): 'LOAN' | 'CREDIT_CARD' =>
  loanType === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'LOAN'

/** A readable label for a loan the bank supplied without a raw name. */
export function loanTypeLabel(code: string, raw: string | null): Liability['loanType'] {
  if (raw) return raw
  return code
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/* ------------------------------------------------------------------ *
 * Customer master
 * ------------------------------------------------------------------ */

const KYC: Record<string, string> = {
  verified: 'VERIFIED',
  pending: 'PENDING',
  'rekyc due': 'REKYC_DUE',
  expired: 'EXPIRED',
  rejected: 'REJECTED',
}

export function kycCode(status: string): string | null {
  return KYC[status.trim().toLowerCase()] ?? null
}

/** The customer-facing status: the raw label when the bank gave one, else title-cased. */
export function kycLabel(code: string | null, raw: string | null): string {
  if (raw) return raw
  if (!code) return 'Unknown'
  return code.charAt(0) + code.slice(1).toLowerCase().replace('_', ' ')
}

const GENDERS: ReadonlySet<string> = new Set(['Male', 'Female', 'Other', 'Undisclosed'])
const MARITAL: ReadonlySet<string> = new Set([
  'Single',
  'Married',
  'Widowed',
  'Divorced',
  'Undisclosed',
])
const EMPLOYMENT: ReadonlySet<string> = new Set([
  'Salaried',
  'Self-employed',
  'Business',
  'Retired',
  'Student',
  'Homemaker',
  'Other',
])

export const genderCode = (g: string): string | null => (GENDERS.has(g) ? g : null)
export const maritalCode = (m: string): string | null => (MARITAL.has(m) ? m : null)
export const employmentCode = (e: string): string | null => (EMPLOYMENT.has(e) ? e : null)

/* ------------------------------------------------------------------ *
 * Holdings
 * ------------------------------------------------------------------ */

export type HeldVia = 'IDBI' | 'OTHER' | 'UNKNOWN'

export function heldVia(heldOutsideIdbi: boolean | undefined): HeldVia {
  if (heldOutsideIdbi === undefined) return 'UNKNOWN'
  return heldOutsideIdbi ? 'OTHER' : 'IDBI'
}

/** Undefined where the bank does not know, so the field is absent rather than a guess. */
export function heldOutsideIdbi(via: HeldVia | string): boolean | undefined {
  if (via === 'OTHER') return true
  if (via === 'IDBI') return false
  return undefined
}

/* ------------------------------------------------------------------ *
 * Insurance
 * ------------------------------------------------------------------ */

const POLICY_TYPES: readonly [RegExp, string][] = [
  [/ulip|market plus/i, 'ULIP'],
  [/endow|jeevan anand/i, 'ENDOWMENT'],
  [/money.?back/i, 'MONEY_BACK'],
  [/whole.?life/i, 'WHOLE_LIFE'],
  [/health|mediclaim|bupa|floater/i, 'HEALTH'],
  [/accident|pmsby/i, 'PERSONAL_ACCIDENT'],
  [/term|pmjjby|life/i, 'TERM'],
]

export function policyTypeCode(name: string): string {
  for (const [pattern, code] of POLICY_TYPES) if (pattern.test(name)) return code
  return 'OTHER'
}

export function coverTypeForPolicy(policyType: string): 'life' | 'health' | 'accident' | 'general' {
  if (policyType === 'HEALTH') return 'health'
  if (policyType === 'PERSONAL_ACCIDENT') return 'accident'
  if (
    ['TERM', 'ENDOWMENT', 'MONEY_BACK', 'WHOLE_LIFE', 'ULIP', 'ANNUITY', 'PENSION'].includes(
      policyType,
    )
  )
    return 'life'
  return 'general'
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

export type ProductType = 'DEPOSIT' | 'MUTUAL_FUND' | 'INSURANCE' | 'GOVT_SCHEME' | 'NPS'

export function productType(category: string): ProductType {
  switch (category) {
    case 'Sweep-in FD':
    case 'Fixed Deposit':
    case 'Recurring Deposit':
      return 'DEPOSIT'
    case 'Liquid':
    case 'Debt':
    case 'Index Fund':
    case 'Equity':
    case 'ELSS':
      return 'MUTUAL_FUND'
    case 'Term Insurance':
    case 'Health Insurance':
    case 'Government Insurance':
    case 'ULIP':
    case 'Endowment':
      return 'INSURANCE'
    case 'NPS':
      return 'NPS'
    default:
      return 'GOVT_SCHEME'
  }
}

/** The wire's provenance vocabulary for a `common.source` value. */
export function shelfSource(source: string): 'fixture' | 'idbi' {
  return source === 'idbi_api' ? 'idbi' : 'fixture'
}

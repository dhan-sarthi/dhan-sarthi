/**
 * Domain types, written in the shape IDBI's APIs return rather than the shape our UI wants.
 *
 * That direction matters. If these mirrored the screens, every field IDBI names differently
 * would become a translation layer we discover we need in week two of the sandbox. Mirroring
 * the bank instead means `BANK_SOURCE=idbi` is a new adapter and nothing above it moves.
 *
 * Field names follow the API catalogue: 393 statement, 394 accounts, 402 loan overdues,
 * 456 customer master.
 */

export type TxnType = 'CREDIT' | 'DEBIT'

/** How the money moved. Useful signal on its own — SI and ACH-D imply a standing mandate. */
export type TxnMode = 'UPI' | 'CARD' | 'NEFT' | 'IMPS' | 'ACH-D' | 'SI' | 'CASH' | 'CHQ'

/**
 * Spend categories. Deliberately coarse: a category a customer would recognise on a
 * statement, not an accounting taxonomy. `Discretionary` is not one of these — whether a
 * category is discretionary is a judgement `@dhan/core` makes, not a property of the txn.
 */
export type SpendCategory =
  | 'Income'
  | 'Rent & bills'
  | 'Groceries'
  | 'Food & dining'
  | 'Transport'
  | 'Shopping'
  | 'Entertainment'
  | 'Health'
  | 'Education'
  | 'Investment'
  | 'Insurance'
  | 'Loan EMI'
  | 'Cash'
  | 'Transfers'
  | 'Fees & charges'

/** One line on a bank statement. API 393. */
export interface Transaction {
  txnId: string
  /** ISO date, YYYY-MM-DD. Bank statements have no time of day worth trusting. */
  txnDate: string
  /** Always positive. Direction lives in txnType, as it does on a real statement. */
  txnAmount: number
  txnType: TxnType
  txnMode: TxnMode
  /** The raw narration string, in the bank's own format. What enrichment has to decode. */
  narration: string
  spendCategory: SpendCategory
  balanceAfterTxn: number | null
  isSalaryCredit: boolean
  /**
   * Set by the *generator* because it knows the truth. Production must not trust this —
   * `@dhan/core`'s recurring detection has to infer it from periodicity, or we would be
   * demonstrating a capability the real feed cannot provide.
   */
  isRecurring: boolean
}

export type AccountType = 'Savings' | 'Current' | 'FD' | 'RD' | 'PPF' | 'NPS'

/** API 394. */
export interface Account {
  accountNumberMasked: string
  accountType: AccountType
  currentBalance: number
  accountOpeningDate: string
  avgMonthlyBalance3m?: number
  avgMonthlyBalance12m?: number
  /** The floor. Money that was never needed in twelve months is money doing nothing. */
  minBalance12m?: number
  maturityDate?: string
  interestRate?: number
}

export type RiskProfile = 'Conservative' | 'Balanced' | 'Growth'

/** API 456. */
export interface Customer {
  cif: string
  custId: string
  custName: string
  dateOfBirth: string
  gender: string
  maritalStatus: string
  dependents: number
  employmentType: 'Salaried' | 'Self-employed' | 'Business'
  declaredAnnualIncome: number
  city: string
  stateCode: string
  preferredLanguage: string
  riskProfile: RiskProfile
  kycStatus: string
  customerSince: string
  /**
   * The new regime has been the default since FY 2023-24, so for most customers 80C is worth
   * nothing and an ELSS fund is an equity fund carrying a three-year lock-in for no benefit.
   * Suitability has to read this before tax-saving anything is ever suggested.
   */
  taxRegime: 'old' | 'new'
}

/** API 402 / 442. */
export interface Liability {
  loanType: string
  outstandingPrincipal: number
  emiAmount: number
  loanInterestRate: number
  tenureRemainingMonths: number
  /** Days past due. Non-zero blocks every investment recommendation. */
  dpdStatus: number
  /** Present for revolving credit. A card at 42% outranks any investment we could suggest. */
  isRevolving?: boolean
}

export interface Holding {
  holdingType: 'MUTUAL_FUND' | 'FD' | 'RD' | 'INSURANCE' | 'NPS' | 'PPF'
  name: string
  assetClass: 'Equity' | 'Debt' | 'Hybrid' | 'Protection' | 'Gold'
  investedAmount: number
  currentValue: number
  sipActive: boolean
  sipAmount?: number
  sipDebitDay?: number
  maturityDate?: string
  interestRate?: number
  /** True where the customer bought it elsewhere. We do not churn what someone else sold well. */
  heldOutsideIdbi?: boolean
}

/** SEBI's six-band riskometer, plus Low for protection products that carry no market risk. */
export type Riskometer =
  | 'Low'
  | 'Low to Moderate'
  | 'Moderate'
  | 'Moderately High'
  | 'High'
  | 'Very High'

export type ProductCategory =
  | 'Sweep-in FD'
  | 'Fixed Deposit'
  | 'Recurring Deposit'
  | 'Liquid'
  | 'Debt'
  | 'Index Fund'
  | 'Equity'
  | 'ELSS'
  | 'Term Insurance'
  | 'Health Insurance'
  | 'Government Insurance'
  | 'NPS'
  | 'PPF'
  | 'ULIP'
  | 'Endowment'

/**
 * A product the bank can actually put a customer into.
 *
 * The fields here are exactly what the suitability gate reads. If a rule needs a fact, the
 * fact belongs on the product — never as a special case keyed on the product's name.
 */
export interface Product {
  productId: string
  name: string
  category: ProductCategory
  riskometer: Riskometer
  /** Minimum monthly ticket, or the premium for a protection product. */
  minInvestment: number
  lockInYears: number
  transactable: boolean
  /** Who manufactures it. IDBI distributes funds and insurance; it does not make them. */
  manufacturer: string
  expenseRatio?: number
  insuranceProduct?: boolean
  /** The ULIP/endowment flag. What BUNDLED_PROTECTION keys off. */
  bundlesProtectionAndInvestment?: boolean
  /** Sum assured, for protection products. */
  coverAmount?: number
  /**
   * What the policy actually covers. Needed because "cheaper protection" is only a substitute
   * within a type: accident cover is not a stand-in for life cover, however much less it costs.
   */
  coverType?: 'life' | 'health' | 'accident'
  /** Indicative return, for deposit products where the rate is contractual rather than a guess. */
  indicativeReturn?: number
  note?: string
}

/** Everything known about one customer. The input to every derivation in `@dhan/core`. */
export interface CustomerFile {
  customer: Customer
  accounts: Account[]
  transactions: Transaction[]
  liabilities: Liability[]
  holdings: Holding[]
  /** Protection already in force. Absent cover is the setup for the whole protection story. */
  policies: Holding[]
}

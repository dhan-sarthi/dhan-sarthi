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

/**
 * How the money moved. Useful signal on its own — SI and ACH-D imply a standing mandate.
 *
 * `UNKNOWN` is here because IDBI's own statement API does not send a mode. 393 carries
 * `txnCat`, and `txnCat` is the three letters `TCI` on every row of every window we have
 * captured, so there is nothing to read. The alternative was to let the code map's fallback
 * fire and stamp `NEFT` on lines that might be anything, which is a fabrication the rest of
 * this codebase does not permit itself. A consented Account Aggregator pull does carry a real
 * mode on every row, so a transaction from that feed is never `UNKNOWN`.
 */
export type TxnMode = 'UPI' | 'CARD' | 'NEFT' | 'IMPS' | 'ACH-D' | 'SI' | 'CASH' | 'CHQ' | 'UNKNOWN'

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
  /**
   * When the money counted, which is not always when the line was posted.
   *
   * Same-day on UPI, IMPS and RTGS; the next working day on a cheque; back-valued to the end
   * of the period on interest and charges. Every Indian statement prints both columns, and a
   * reconciliation that ignores the second one is wrong in exactly the cases that matter.
   */
  valueDate: string
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
  /**
   * ISO 18245 merchant category code, where the rail carries one.
   *
   * Card lines and UPI payments to merchants have it; person-to-person payments, mandates and
   * the bank's own charges do not — which is why absent has to be a legal value everywhere
   * rather than a default of `0000`.
   */
  mccCode?: string
  /**
   * The merchant as the *bank* named it, where it sent a name at all.
   *
   * A second opinion and never the answer: enrichment derives its own category and
   * `disagreements()` reports the gap. Deliberately present on only a subset of lines, so the
   * categoriser is exercised on bare narrations too.
   */
  merchantName?: string
  /** The payee's virtual payment address on a UPI line — `swiggy.rzp@icici`. */
  counterpartyVpa?: string
  /**
   * Which account carried this line.
   *
   * Absent means the customer's primary account, which is what every ledger written before
   * a customer could have four of them meant. A statement is per-account at the bank and
   * only becomes one stream when something aggregates it, so anything that reads
   * `balanceAfterTxn` as a running total has to group by this first — four interleaved
   * ledgers have four running balances, not one.
   */
  accountNumberMasked?: string
  /**
   * Both legs of a movement between two accounts the same customer owns.
   *
   * Money leaving one of a customer's accounts for another has not been spent, earned or
   * saved — it has moved. Counting it is the single largest error an aggregated view can
   * make: a customer who sweeps ₹1 lakh a month into a household account looks, to anything
   * summing debits, like a customer spending ₹1 lakh a month more than they earn.
   *
   * A single bank genuinely cannot know this, which is why it is optional and why nothing
   * depends on it being present. An aggregator can: it holds both sides, and matching a
   * debit to the credit that lands the same day for the same amount on another account of
   * the same customer is what earns the flag.
   */
  isSelfTransfer?: boolean
}

export type AccountType = 'Savings' | 'Current' | 'FD' | 'RD' | 'PPF' | 'NPS'

/**
 * The bank an account is held at.
 *
 * IDBI can see its own accounts on 394 and 365. Everything else arrives only through an
 * Account Aggregator consent, which is why `isHome` is a property of the data rather than a
 * string comparison at each call site: the screens have to say where a figure came from, and
 * "we can see this" is a different claim from "you told us this".
 */
export interface Institution {
  /** As the customer would say it — `HDFC Bank`. */
  name: string
  /** The four letters that open every IFSC it issues — `IBKL`, `HDFC`, `KKBK`, `ICIC`. */
  ifscPrefix: string
  /** True for IDBI, and for nothing else. */
  isHome: boolean
}

/** API 394. */
export interface Account {
  accountNumberMasked: string
  accountType: AccountType
  currentBalance: number
  accountOpeningDate: string
  /**
   * The home branch's IFSC, which is on the header of every statement a customer downloads.
   *
   * IDBI's prefix is `IBKL`. The generator used to stamp `IDIB` on the salary line, which is
   * Indian Bank's — the kind of detail a banker spots before they read a single figure.
   */
  branchIfsc?: string
  avgMonthlyBalance3m?: number
  avgMonthlyBalance12m?: number
  /** The floor. Money that was never needed in twelve months is money doing nothing. */
  minBalance12m?: number
  maturityDate?: string
  interestRate?: number
  /**
   * What the customer may actually spend today, and the hold that explains the gap.
   *
   * IDBI's account enquiry sends seven balance types and the arithmetic between two of them is
   * exact on every account captured: `EFFAVL` is `AVAIL` less `LIEN`, to the paisa. That makes
   * `EFFAVL` the spendable floor rather than a figure to derive, which is what we had been
   * doing by hand — and it is the number a "can I afford this" answer has to be built on,
   * because `currentBalance` includes money a lien has already promised to someone else. 393
   * calls the same quantity `userDefinedBalance`. Absent on a feed that sends one balance.
   */
  effectiveAvailableBalance?: number
  lienAmount?: number
  /**
   * Which bank holds it. Absent means IDBI, which is what every account meant before a
   * customer could hold one anywhere else.
   */
  institution?: Institution
  /**
   * The last transaction the *customer* initiated, as opposed to interest the bank credited
   * or a charge it levied.
   *
   * Dormant and quiet are different states and only this field separates them. An account
   * with a balance and no customer activity for fourteen months is the finding; an account
   * with the same balance that the customer used last week is just an account.
   */
  lastCustomerActivity?: string
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
  /** Present for revolving credit. A card at 34.8% outranks any investment we could suggest. */
  isRevolving?: boolean
}

export interface Holding {
  holdingType: 'MUTUAL_FUND' | 'FD' | 'RD' | 'INSURANCE' | 'NPS' | 'PPF' | 'EQUITY' | 'EPF'
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
  /**
   * Who actually holds it — `Zerodha`, `Groww`, `IDBI`, `EPFO`.
   *
   * Not decoration: a consolidated portfolio screen has to say which platform a line came
   * from, because that is the first thing a customer checks it against. It is also the
   * honest form of `heldOutsideIdbi`, which can only say "somewhere else".
   */
  custodian?: string
  /**
   * The exchange symbol, for direct equity. `INFY`, `HDFCBANK`.
   *
   * Present only on `EQUITY`. A mutual fund has no ticker, and giving it one would let a
   * screen render a fund as if the customer could watch it move intraday.
   */
  ticker?: string
  /** ISIN, for unambiguous matching and the overlap calculation. */
  isin?: string
  /** Units held. Fractional on funds, whole on equity. */
  units?: number
  /** Average cost per unit. `units * avgCost` must equal `investedAmount`. */
  avgCost?: number
  /**
   * When it was bought. A holding bought at the top of a cycle and never reviewed is a
   * finding; the same holding bought last month is not.
   */
  purchasedOn?: string
  /**
   * Sum assured, for a policy. Separate from `currentValue` because a ULIP has both and
   * conflating them is exactly the confusion the product exists to undo — ₹3.2 lakh of fund
   * value is not ₹3.2 lakh of cover.
   */
  sumAssured?: number
  /** Annual premium, for a policy. Counted in committed monthly cash flow at a twelfth. */
  annualPremium?: number
}

/** SEBI's six-band riskometer, plus Low for protection products that carry no market risk. */
export type Riskometer =
  'Low' | 'Low to Moderate' | 'Moderate' | 'Moderately High' | 'High' | 'Very High'

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

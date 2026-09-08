/**
 * IDBI's response shapes, written from the captured responses and never from the specs.
 *
 * Twenty-eight of IDBI's twenty-nine OpenAPI exports declare `responses: {}` — they say what
 * to send and never what comes back — so every schema below was read off a real body in
 * `idbi-capture-*`. Where the spec and the sandbox disagree the sandbox wins, because the
 * sandbox is what we have to parse.
 *
 * Two conventions. Shape is checked here and values are parsed in `scalars.ts`: a schema
 * accepts `"56780.25"` as a string and it is `toPaise` that turns it into money, so a field
 * whose format surprises us fails in one place with the raw value attached. And every object
 * is `passthrough()`, so a key we did not anticipate travels through to the mapping report as
 * an unmapped path instead of failing the ingestion — the whole point of capturing first.
 *
 * The amount object is `{amountValue, currencyCode}` almost everywhere, but 402 and 433 send
 * bare decimal strings for the same quantities, so both spellings are admitted.
 */
import { z } from 'zod'
import type { ServiceCode } from './operations.ts'

/* ------------------------------------------------------------------ *
 * Shared leaves
 * ------------------------------------------------------------------ */

/** A decimal that may arrive quoted or bare. `scalars.toPaise` is what reads it. */
export const Decimalish = z.union([z.string(), z.number()])

/** `{"amountValue":"56780.25","currencyCode":"INR"}`. `currencyCode` is `""` on a zero in 442. */
export const Amount = z
  .object({ amountValue: Decimalish, currencyCode: z.string().optional() })
  .passthrough()
export type WireAmount = z.output<typeof Amount>

/** A rate, which Finacle wraps in its own object: `{"value":"8.75"}`. */
export const RateValue = z.object({ value: Decimalish }).passthrough()

export const PostAddr = z
  .object({
    addr1: z.string().optional(),
    addr2: z.string().optional(),
    addr3: z.string().optional(),
    city: z.string().optional(),
    stateProv: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    addrType: z.string().optional(),
  })
  .passthrough()

export const BankInfo = z
  .object({
    bankId: z.string().optional(),
    name: z.string().optional(),
    branchId: z.string().optional(),
    branchName: z.string().optional(),
    postAddr: PostAddr.optional(),
  })
  .passthrough()

export const AcctType = z
  .object({ schmCode: z.string().optional(), schmType: z.string().optional() })
  .passthrough()

export const PersonName = z
  .object({
    titlePrefix: z.string().optional(),
    firstName: z.string().optional(),
    middleName: z.string().optional(),
    lastName: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough()

/** Finacle's account identifier, which nests the branch and the scheme. Reused by 362/391/404. */
export const AccountRef = z
  .object({
    acctId: z.string(),
    acctCurr: z.string().optional(),
    acctType: AcctType.optional(),
    bankInfo: BankInfo.optional(),
  })
  .passthrough()

/* ------------------------------------------------------------------ *
 * 365 — account enquiry
 * ------------------------------------------------------------------ */

/**
 * The seven balance types, and why only one of them may be trusted as the spendable figure.
 *
 * `EFFAVL` looked like `AVAIL` minus `LIEN` exactly: 55780.25 less 5000.00 is 50780.25, and it
 * held on all three accounts the first capture covered. Sweeping all six accounts the sandbox
 * holds broke it. On the current account 660100100007, `AVAIL` is 248000.00 and `LIEN` is
 * 2000.00, and `EFFAVL` is 245000.00 rather than 246000.00 — a further ₹1,000 withheld, which
 * is what a current account's minimum balance looks like.
 *
 * So `EFFAVL` is the spendable floor and it is *not* derivable. Computing it from the other
 * two would have overstated this customer's usable money by a thousand rupees, which is the
 * kind of error an advice engine turns into a recommendation. 393 calls the same quantity
 * `userDefinedBalance`.
 */
export const BALANCE_TYPES = [
  'LEDGER',
  'AVAIL',
  'EFFAVL',
  'LIEN',
  'FLOAT',
  'DRWPWR',
  'ACCBAL',
] as const
export type BalanceType = (typeof BALANCE_TYPES)[number]

export const AccountBalanceEntry = z.object({ balType: z.string(), balAmt: Amount }).passthrough()

export const AccountEnquiryResponse = z
  .object({
    acctId: z.string(),
    acctCurr: z.string().optional(),
    acctType: AcctType.optional(),
    /** Finacle's customer id. Not the CIF — 442 prints the two side by side. */
    custId: z.string().optional(),
    personName: PersonName.optional(),
    acctOpenDt: z.string().optional(),
    bankAcctStatusCode: z.string().optional(),
    bankInfo: BankInfo.optional(),
    acctBal: z.array(AccountBalanceEntry).default([]),
    custStat: z
      .object({
        refCode: z.string().optional(),
        refRecType: z.string().optional(),
        refDesc: z.string().optional(),
      })
      .passthrough()
      .optional(),
    acctInqCustomData: z
      .object({ acctName: z.string().optional(), status: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()
export type WireAccountEnquiry = z.output<typeof AccountEnquiryResponse>

/* ------------------------------------------------------------------ *
 * 394 — the accounts a CIF holds
 * ------------------------------------------------------------------ */

export const CustomerAccountInfo = z
  .object({
    acctNumber: z.string(),
    acctType: z.string().optional(),
    acctCurrCode: z.string().optional(),
    acctBalance: Amount.optional(),
  })
  .passthrough()

export const CustomerAccountsResponse = z
  .object({
    cifId: z.string().optional(),
    acctTypeRequested: z.string().optional(),
    numOfAccounts: Decimalish.optional(),
    customerAccountInfo: z.array(CustomerAccountInfo).default([]),
  })
  .passthrough()
export type WireCustomerAccounts = z.output<typeof CustomerAccountsResponse>

/* ------------------------------------------------------------------ *
 * 393 — the full statement
 * ------------------------------------------------------------------ */

/**
 * The statement header's balances.
 *
 * Never reconcile these against the rows. In the captured payload the last row's running
 * balance is 344,483.14 while the ledger balance in the same body is 56,780.25 — off by about
 * ₹288,000 — so a balance comes from a balance field and summing transactions is wrong even
 * when the arithmetic is right.
 */
export const StatementBalances = z
  .object({
    acid: z.string().optional(),
    branchId: z.string().optional(),
    currencyCode: z.string().optional(),
    ledgerBalance: Amount.optional(),
    availableBalance: Amount.optional(),
    /** 365's EFFAVL under another name: the spendable floor. */
    userDefinedBalance: Amount.optional(),
    floatingBalance: Amount.optional(),
    fFDBalance: Amount.optional(),
  })
  .passthrough()

export const TransactionSummary = z
  .object({
    txnDate: z.string().optional(),
    txnDesc: z.string().optional(),
    /** `D` or `C`. 595 spells the same thing `DEBIT`/`CREDIT`. */
    txnType: z.string(),
    txnAmt: Amount,
    instrumentId: z.string().optional(),
  })
  .passthrough()

export const StatementRow = z
  .object({
    txnId: z.string(),
    txnSrlNo: Decimalish.optional(),
    /** Posting stamp, `T10:00:00.000` against a midnight `txnDate`: the only within-day order. */
    pstdDate: z.string().optional(),
    valueDate: z.string().optional(),
    /** `TCI` on every captured row, so it carries no categorising signal here. */
    txnCat: z.string().optional(),
    txnBalance: Amount.optional(),
    transactionSummary: TransactionSummary,
  })
  .passthrough()
export type WireStatementRow = z.output<typeof StatementRow>

export const FullStatementResult = z
  .object({
    accountBalances: StatementBalances.optional(),
    /** `"Y"` or `"N"`. Always `"N"` in this sandbox, which is why the pager distrusts it. */
    hasMoreData: z.string().optional(),
    transactionDetails: z.array(StatementRow).default([]),
  })
  .passthrough()
export type WireFullStatement = z.output<typeof FullStatementResult>

/* ------------------------------------------------------------------ *
 * 362 — liens
 * ------------------------------------------------------------------ */

export const LienDetails = z
  .object({
    lienId: z.string().optional(),
    reasonCode: z.string().optional(),
    remarks: z.string().optional(),
    isDeleted: z.string().optional(),
    newLienAmt: Amount.optional(),
    oldLienAmt: Amount.optional(),
    lienDate: z
      .object({ startDate: z.string().optional(), endDate: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()

/** The lien hangs off `bankInfo`, which is where Finacle puts it rather than beside the account. */
export const LienEnquiryResult = z
  .object({
    acctId: z.string().optional(),
    acctCurr: z.string().optional(),
    acctType: AcctType.optional(),
    moduleType: z.string().optional(),
    bankInfo: BankInfo.extend({ lienDetails: LienDetails.optional() }).passthrough().optional(),
  })
  .passthrough()
export type WireLienEnquiry = z.output<typeof LienEnquiryResult>

/* ------------------------------------------------------------------ *
 * 402 / 404 — overdues
 * ------------------------------------------------------------------ */

/** Bare decimal strings here, not amount objects. And a missing date is the string `NULL`. */
export const OverdueDetail = z
  .object({
    accountId: z.string(),
    customerId: z.string().optional(),
    dpd: Decimalish.optional(),
    npaStatus: z.string().optional(),
    npaDate: z.string().optional(),
    overdueDate: z.string().optional(),
    outstandingBal: Decimalish.optional(),
    totalOverdueAmt: Decimalish.optional(),
  })
  .passthrough()

export const LoanOverdueDetailsResponse = z
  .object({ overdueDetails: z.array(OverdueDetail).default([]) })
  .passthrough()
export type WireLoanOverdues = z.output<typeof LoanOverdueDetailsResponse>

export const LoanOverdueRecord = z
  .object({
    acctId: AccountRef.optional(),
    pTotalDmd: Amount.optional(),
    pTotalColl: Amount.optional(),
    pTotalOvdu: Amount.optional(),
    totalIntDmd: Amount.optional(),
    totalIntColl: Amount.optional(),
    totalIntOvdu: Amount.optional(),
  })
  .passthrough()

export const LoanOverduePositionResponse = z
  .object({
    loanOvduRec: z.array(LoanOverdueRecord).default([]),
    recCtrlOut: z
      .object({ isLastSet: z.string().optional(), setNum: Decimalish.optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()
export type WireOverduePosition = z.output<typeof LoanOverduePositionResponse>

/* ------------------------------------------------------------------ *
 * 391 — loan account details
 * ------------------------------------------------------------------ */

export const LoanAccountDetailsResult = z
  .object({
    loanAcctId: AccountRef.optional(),
    custId: z
      .object({ custId: z.string().optional(), personName: PersonName.optional() })
      .passthrough()
      .optional(),
    acctOpenDt: z.string().optional(),
    disbAmt: Amount.optional(),
    amtAlreadyDisb: Amount.optional(),
    amtAvailForDisb: Amount.optional(),
    netIntRate: RateValue.optional(),
    modeOfOper: z.string().optional(),
    loanAcctGenInfo: z
      .object({ acctName: z.string().optional(), drIntMethodInd: z.string().optional() })
      .passthrough()
      .optional(),
    loanGenDetails: z
      .object({
        loanAmt: Amount.optional(),
        loanPeriodMonths: Decimalish.optional(),
        loanPeriodDays: Decimalish.optional(),
        rePmtMethod: z.string().optional(),
        pmtPlan: z
          .object({
            negotiatedRate: RateValue.optional(),
            defApplIntRate: RateValue.optional(),
            eqInstallDetails: z
              .object({ eqInstallType: z.string().optional(), repayCode: z.string().optional() })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    ACHDetails: z
      .object({ paySysId: z.string().optional(), respAcctId: AccountRef.optional() })
      .passthrough()
      .optional(),
  })
  .passthrough()
export type WireLoanAccountDetails = z.output<typeof LoanAccountDetailsResult>

/* ------------------------------------------------------------------ *
 * 441 / 442 — limits and exposure
 * ------------------------------------------------------------------ */

export const LimitHistoryEntry = z
  .object({
    applicableDate: z.string().optional(),
    expiryDate: z.string().optional(),
    drwngPower: Amount.optional(),
    drwngPowerPcnt: RateValue.optional(),
    sanctLimit: Amount.optional(),
  })
  .passthrough()

export const AccountLimitsResponse = z
  .object({
    accountLimitDetails: z
      .object({
        acctDrwngPowerLimitHistMsgInq: z
          .object({ olimitLL: z.array(LimitHistoryEntry).default([]) })
          .passthrough()
          .optional(),
        acctSanctLimitHistMsg: z
          .object({ olimitLL: z.array(LimitHistoryEntry).default([]) })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
export type WireAccountLimits = z.output<typeof AccountLimitsResponse>

/**
 * 442, which is the Rosetta stone for identity.
 *
 * `customerSummary` is the only place in the catalogue that prints `custCifId` and
 * `customerID` together — 98655854 and 68453002 for the same PRIYAPATIL — which is what
 * establishes that the CIF keying 394 and 442 is a different number from the Finacle customer
 * id that 365 returns and 391, 402 and 404 key on.
 */
export const CustomerLimitsResponse = z
  .object({
    customerSummary: z
      .object({
        custCifId: z.string().optional(),
        customerID: z.string().optional(),
        customerName: z.string().optional(),
        custRating: z.string().optional(),
        accountManager: z.string().optional(),
      })
      .passthrough()
      .optional(),
    customerLimits: z
      .array(
        z
          .object({
            currency: z.string().optional(),
            sanctionDate: z.string().optional(),
            expiryDate: z.string().optional(),
          })
          .passthrough(),
      )
      .default([]),
    exposureSummary: z
      .object({
        fundedLimit: z
          .object({ amount: Decimalish.optional(), currency: z.string().optional() })
          .passthrough()
          .optional(),
        nonFundedLimit: z
          .object({ amount: Decimalish.optional(), currency: z.string().optional() })
          .passthrough()
          .optional(),
        totalLimit: z
          .object({ amount: Decimalish.optional(), currency: z.string().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    emptyLimitRecords: Decimalish.optional(),
  })
  .passthrough()
export type WireCustomerLimits = z.output<typeof CustomerLimitsResponse>

/* ------------------------------------------------------------------ *
 * 473 / 538 — schedule and payoff
 * ------------------------------------------------------------------ */

/** `flowStartDate` is a genuine JSON `null` here — absence has a fourth spelling. */
export const RepaymentFlow = z
  .object({
    Freq: z.string().optional(),
    flowDesc: z.string().optional(),
    flowAmt: Amount.optional(),
    flowStartDate: z.string().nullable().optional(),
    noOfInstalments: Decimalish.optional(),
    Key: z.object({ serial_num: Decimalish.optional() }).passthrough().optional(),
  })
  .passthrough()

export const AmortEntry = z
  .object({
    Key: z.object({ serial_num: Decimalish.optional() }).passthrough().optional(),
    amortStruct: z
      .object({
        flowDate: z.string().optional(),
        flowDesc: z.string().optional(),
        flowAmt: Amount.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const RepaymentScheduleResponse = z
  .object({
    loanModellingSchOutputVO: z
      .object({
        lamodRepaymentLL: z.array(RepaymentFlow).default([]),
        oamortLL: z.array(AmortEntry).default([]),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
export type WireRepaymentSchedule = z.output<typeof RepaymentScheduleResponse>

export const HpPayoffResponse = z
  .object({
    executeFinacleScriptCustomData: z
      .object({
        accountLiab: Decimalish.optional(),
        netPayofamt: Decimalish.optional(),
        pendingPrincipal: Decimalish.optional(),
        interestRate: Decimalish.optional(),
        interestSinceLastApplication: Decimalish.optional(),
        pendingNormalInterest: Decimalish.optional(),
        pendingOverdueInterest: Decimalish.optional(),
        pendingPenalInterest: Decimalish.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
export type WireHpPayoff = z.output<typeof HpPayoffResponse>

/* ------------------------------------------------------------------ *
 * 590 – 739 — the Account Aggregator flow
 * ------------------------------------------------------------------ */

/** 590's payload. `consent_handle` is one of only two snake_case keys in the whole catalogue. */
export const ConsentRequestData = z
  .object({ consent_handle: z.string(), status: z.string().optional() })
  .passthrough()
export type WireConsentRequest = z.output<typeof ConsentRequestData>

export const LinkedAccount = z
  .object({
    linkReferenceNumber: z.string(),
    maskedAccountNumber: z.string().optional(),
    fipId: z.string().optional(),
    fipName: z.string().optional(),
    fiType: z.string().optional(),
    accountType: z.string().optional(),
  })
  .passthrough()

export const ConsentListEntry = z
  .object({
    consentID: z.string().optional(),
    consent_handle: z.string().optional(),
    consentHandle: z.string().optional(),
    status: z.string().optional(),
    aaId: z.string().optional(),
    vua: z.string().optional(),
    productID: z.string().optional(),
    accountID: z.string().optional(),
    /** `2026-06-22T17:30:45Z` — the one zoned stamp in the catalogue. */
    consentCreationData: z.string().optional(),
    accounts: z.array(LinkedAccount).default([]),
  })
  .passthrough()
export type WireConsentListEntry = z.output<typeof ConsentListEntry>

export const WebRedirection = z.object({ webRedirectionUrl: z.string() }).passthrough()

/** 593's decrypted callback. `status` here is `"S"`, a payload fact and not the envelope's. */
export const DecryptedCallback = z
  .object({
    status: z.string().optional(),
    errorcode: z.string().optional(),
    sessionid: z.string().optional(),
    srcref: z.string().optional(),
    txnid: z.string().optional(),
    userid: z.string().optional(),
    redirect: z.string().optional(),
    pan: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  })
  .passthrough()
export type WireDecryptedCallback = z.output<typeof DecryptedCallback>

/**
 * The consented statement — 595 and 739 — which is the only feed with a payment mode on every
 * row and therefore the only one our categoriser can actually read. `narration` is real prose
 * in 595's first fixture ("Salary Credit"), a recognisable rail format in the `01` variants
 * ("UPI/CR/21980/PAYEE0/ABCD"), and a placeholder in 739 ("F1 FinPro 1").
 */
export const AaTransaction = z
  .object({
    txnId: z.string().optional(),
    type: z.string().optional(),
    mode: z.string().optional(),
    amount: Decimalish.optional(),
    balance: Decimalish.optional(),
    currentBalance: Decimalish.optional(),
    narration: z.string().optional(),
    reference: z.string().optional(),
    transactionDateTime: z.string().optional(),
    transactionTimeStamp: z.string().optional(),
    valueDate: z.string().optional(),
  })
  .passthrough()
export type WireAaTransaction = z.output<typeof AaTransaction>

export const AaSummary = z
  .object({
    accountType: z.string().optional(),
    accountSubType: z.string().optional(),
    status: z.string().optional(),
    currency: z.string().optional(),
    currentBalance: Decimalish.optional(),
    balanceDateTime: z.string().optional(),
    openingDate: z.string().optional(),
    branch: z.string().optional(),
    ifsc: z.string().optional(),
    ifscCode: z.string().optional(),
    micrCode: z.string().optional(),
    facility: z.string().optional(),
    currentODLimit: Decimalish.optional(),
    drawingLimit: Decimalish.optional(),
  })
  .passthrough()

export const AaHolder = z
  .object({
    name: z.string().optional(),
    dob: z.string().optional(),
    mobile: z.string().optional(),
    email: z.string().optional(),
    pan: z.string().optional(),
    address: z.string().optional(),
    nominee: z.string().optional(),
    ckycCompliance: z.string().optional(),
    landline: z.string().optional(),
  })
  .passthrough()

export const AaAccount = z
  .object({
    linkReferenceNumber: z.string().optional(),
    maskedAccountNumber: z.string().optional(),
    bank: z.string().optional(),
    fiType: z.string().optional(),
    Summary: AaSummary.optional(),
    Profile: z
      .object({
        Holders: z
          .object({ type: z.string().optional(), Holder: z.array(AaHolder).default([]) })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    Transactions: z
      .object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        Transaction: z.array(AaTransaction).default([]),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
export type WireAaAccount = z.output<typeof AaAccount>

/* ------------------------------------------------------------------ *
 * 428 / 497 / 498 / 508 — writes and staff
 * ------------------------------------------------------------------ */

/** 428 answers `{result:{errors,message}}`; a duplicate is "Lead already created", not an error. */
export const CreateLeadResult = z
  .object({ message: z.string().optional(), leadId: z.string().optional() })
  .passthrough()
export type WireCreateLead = z.output<typeof CreateLeadResult>

export const NotificationAck = z.object({ message: z.string().optional() }).passthrough()

export const HrmsEmployee = z
  .object({
    ein: z.string().optional(),
    fullNameTitle: z.string().optional(),
    email: z.string().optional(),
    gender: z.string().optional(),
    grade: z.string().optional(),
    position: z.string().optional(),
    location: z.string().optional(),
    region: z.string().optional(),
    vertical: z.string().optional(),
    organization: z.string().optional(),
    empClass: z.string().optional(),
    sol: z.string().optional(),
    posId: z.string().optional(),
    supEin: z.string().optional(),
    supFullNameTitle: z.string().optional(),
    supEmail: z.string().optional(),
  })
  .passthrough()

export const HrmsResponse = z
  .object({
    getHRMSEmployeeDetails: HrmsEmployee.optional(),
    failureStage: z.string().nullable().optional(),
  })
  .passthrough()
export type WireHrms = z.output<typeof HrmsResponse>

/* ------------------------------------------------------------------ *
 * 433 — the whole per-customer record
 * ------------------------------------------------------------------ */

/**
 * Nominally the rate card; in this sandbox, 106 keys covering every domain at once.
 *
 * Only the fields we read are named. It matters for two reasons beyond the rates: it carries
 * `cibilResponse` and `ckycInfo` in full, so the bureau shapes can be mapped without spending
 * a real credit pull on 408 or a registry search on 415; and it is the one call that shows
 * what a fixture customer actually holds, which is how the other twenty-three were checked.
 */
export const InterestRateInfo = z
  .object({
    baseRate: Decimalish.optional(),
    effectiveRate: Decimalish.optional(),
    penalRate: Decimalish.optional(),
    slabs: z
      .array(
        z
          .object({
            from: Decimalish.optional(),
            to: Decimalish.optional(),
            normalPct: Decimalish.optional(),
            penalPct: Decimalish.optional(),
            maxDays: Decimalish.optional(),
            maxMonths: Decimalish.optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough()

export const CustomerRecordResponse = z
  .object({
    acctId: z.string().optional(),
    custCifId: z.string().optional(),
    customerId: z.string().optional(),
    custName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    custSex: z.string().optional(),
    dateOfBirth: z.string().optional(),
    custMobileNo: z.string().optional(),
    emailId: z.string().optional(),
    panCardNo: z.string().optional(),
    accountType: z.string().optional(),
    acctOpenDt: z.string().optional(),
    branchId: z.string().optional(),
    branchName: z.string().optional(),
    primarySolId: z.string().optional(),
    minorFlag: z.string().optional(),
    nriFlag: z.string().optional(),
    customerType: z.string().optional(),
    comuAddr1: z.string().optional(),
    comuAddr2: z.string().optional(),
    comuCity: z.string().optional(),
    comuState: z.string().optional(),
    comuPincode: z.string().optional(),
    /** The seven balance types again, here as a flat map rather than 365's array. */
    balances: z.record(z.string(), Decimalish).optional(),
    rateInfo: InterestRateInfo.optional(),
    loanInfo: z
      .object({
        loanAmt: Decimalish.optional(),
        disbAmt: Decimalish.optional(),
        amtAlreadyDisb: Decimalish.optional(),
        amtAvailForDisb: Decimalish.optional(),
        emiAmount: Decimalish.optional(),
        netIntRate: Decimalish.optional(),
        loanPeriodMonths: Decimalish.optional(),
        rePmtMethod: z.string().optional(),
      })
      .passthrough()
      .optional(),
    lien: z
      .object({
        lienId: z.string().optional(),
        newLienAmt: Decimalish.optional(),
        oldLienAmt: Decimalish.optional(),
        reasonCode: z.string().optional(),
        remarks: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
      .passthrough()
      .optional(),
    consentInfo: ConsentListEntry.optional(),
    ckycInfo: z.record(z.string(), z.unknown()).optional(),
    cibilResponse: z.record(z.string(), z.unknown()).optional(),
    leads: z.array(z.record(z.string(), z.unknown())).default([]),
    loanOverdueDetails: z.array(OverdueDetail).default([]),
  })
  .passthrough()
export type WireCustomerRecord = z.output<typeof CustomerRecordResponse>

/* ------------------------------------------------------------------ *
 * 408 / 415 — the bureau pair
 * ------------------------------------------------------------------ */

/**
 * Neither was called: 408 spends a real CIBIL enquiry and 415 a real registry search, and both
 * need credentials we were not given. Their bodies are known anyway, because 433 carries
 * `cibilResponse` and `ckycInfo` in full, so these are shaped from that capture and marked as
 * unconfirmed against the operations themselves.
 */
export const CibilScoreResponse = z
  .object({
    fetchCibilScoreResponse: z
      .object({
        body: z
          .object({ dcResponse: z.record(z.string(), z.unknown()).optional() })
          .passthrough()
          .optional(),
        header: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const CkycSearchResponse = z
  .object({
    queryId: z.string().optional(),
    recordIdentifier: z.string().optional(),
    ckycNo: z.string().optional(),
    idDetails: z.array(z.record(z.string(), z.unknown())).default([]),
  })
  .passthrough()

/* ------------------------------------------------------------------ *
 * The table
 * ------------------------------------------------------------------ */

/**
 * The schema each operation's *unwrapped payload* satisfies.
 *
 * The FinPro family answers `data`, and for 591, 592, 595 and 739 that is an array while for
 * 590 and 593 it is an object — which is why the payload schema and not the envelope decides
 * the arity.
 */
export const RESPONSE_SCHEMAS: Readonly<Record<ServiceCode, z.ZodTypeAny>> = {
  '362': LienEnquiryResult,
  '365': AccountEnquiryResponse,
  '391': LoanAccountDetailsResult,
  '393': FullStatementResult,
  '394': CustomerAccountsResponse,
  '402': LoanOverdueDetailsResponse,
  '404': LoanOverduePositionResponse,
  '408': CibilScoreResponse,
  '415': CkycSearchResponse,
  '428': CreateLeadResult,
  '433': CustomerRecordResponse,
  '441': AccountLimitsResponse,
  '442': CustomerLimitsResponse,
  '473': RepaymentScheduleResponse,
  '497': NotificationAck,
  '498': NotificationAck,
  '508': HrmsResponse,
  '538': HpPayoffResponse,
  '590': ConsentRequestData,
  '591': z.array(ConsentListEntry),
  '592': z.array(WebRedirection),
  '593': DecryptedCallback,
  '595': z.array(AaAccount),
  '739': z.array(AaAccount),
}

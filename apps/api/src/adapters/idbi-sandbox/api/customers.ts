/**
 * Who IDBI's sandbox actually holds, and which operations answer for each of them.
 *
 * The catalogue has no directory endpoint — a bank names its customer to us — so this is the
 * app's own record of the keys, and it is written down rather than discovered because every
 * operation wants a different one: 394 and 442 key on the CIF, 365 and 393 on an account
 * number and a branch, 402 and 404 on the Finacle customer id, and the Account Aggregator
 * calls on a mobile number. The pairs came from 442, which is the one operation that prints
 * `custCifId` and `customerID` side by side.
 *
 * The coverage flags are not documentation, they are load-bearing. This sandbox is a
 * request-matching stub and a request it holds no fixture for answers 400 with
 * `{"message":"Data not found","sentKey":"acid#660100100006"}` — which is how each line below
 * was established, by asking. Two consequences the app has to live with: Neha's four accounts
 * have no own-bank statement at all, so her transactions can only come from a consented
 * Account Aggregator pull; and Arjun exists only in 365, with no account list and no overdue
 * record, so he is a single-account customer by fact rather than by choice.
 *
 * `enquiryVariant` matters for the same reason. 365 has two fixture sets and they hold
 * different accounts: the base path answers for 003, 004 and 008, and `…test01` answers for
 * 006, 007, 008 and 009. Only 008 is in both.
 */

import type { HoldingDraft } from '../../../ports/holdings.port.ts'
/**
 * What the app knows about a customer before IDBI is asked.
 *
 * Every operation wants a different identifier, so all of them are held together: 394 and 442
 * key on the CIF, 365 on an account number, 402 and 404 on the Finacle customer id, 393 on an
 * account plus its branch, and the Account Aggregator calls on a mobile number.
 */
export interface IdbiCustomerKey {
  cif: string
  custId: string
  branchId: string
  /** The account 365, 362 and 393 are asked about first. */
  primaryAcctId: string
  /** The `MOBILE` party value the Account Aggregator calls key on. */
  mobile?: string | undefined
}

/** Which of the reads the sandbox will actually answer for a customer. */
export interface IdbiCoverage {
  /** 394: the account list. False means the only known account is the primary one. */
  accountList: boolean
  /** 393: an own-bank statement for the primary account. */
  ownStatement: boolean
  /** 402: the overdue and outstanding record. */
  overdues: boolean
  /** 591/595: a consent and a consented statement. */
  accountAggregator: boolean
  /** 433: the whole per-customer record, which is where an EMI amount lives. */
  customerRecord: boolean
}

/**
 * A consented pull the sandbox will actually answer.
 *
 * 591 and 595 do not agree with each other. 591 reports one consent per customer — Priya's is
 * `CONSENT-0001` and Neha's is `CONSENT123456001` — while 595's fixtures are keyed on
 * `CONSENT-0003-SAV` and its siblings, one per account. Passing 591's answer to 595 therefore
 * earns `sentKey: consentId#CONSENT123456001` for the customer whose four accounts 595 holds
 * statements for. The pairs below are the ones that answer, established by asking, and the
 * consent 591 reports is still tried first so that a sandbox IDBI later makes consistent
 * needs no change here.
 */
export interface AaPull {
  consentId: string
  linkRefNumber: string
  /** The `…test01` fixture set, where that is the one holding it. */
  variant?: string | undefined
  /** True to go through 739 rather than 595. */
  viaFinPro?: boolean | undefined
}

export interface IdbiSandboxCustomer extends IdbiCustomerKey {
  name: string
  slug: string
  city: string
  /** One line on the picker card. */
  pitch: string
  /** What opening this customer demonstrates about the integration. */
  story: string
  coverage: IdbiCoverage
  /**
   * The date of birth the *bank* reports, recorded so the picker can show an age without a
   * round trip. `getCustomer` still reads it from 433 or the consented pull rather than from
   * here — this is a cache of a bank fact, not a substitute for one, and a customer the bank
   * reports no date for does not get one invented.
   */
  reportedDateOfBirth?: string | undefined
  /**
   * Whether the picker offers this customer.
   *
   * Arjun is in the registry and not in the picker. The bank holds his account enquiry and
   * nothing else — no account list, no statement, no overdue record, no consent and no date of
   * birth — so there is no file to advise on and no honest way to make one. Keeping him
   * registered means a direct lookup still resolves and the coverage stays written down;
   * keeping him out of the picker means nobody opens a customer the app cannot serve.
   */
  inPicker: boolean
  /**
   * The `…test01` variant to try 365 on first for this customer's accounts, where the base
   * fixture set does not hold them.
   */
  enquiryVariant?: string | undefined
  /** The consented pulls the sandbox holds for this customer, in the order to try them. */
  aaPulls: readonly AaPull[]
}

export const IDBI_SANDBOX_CUSTOMERS: readonly IdbiSandboxCustomer[] = [
  {
    cif: '98655854',
    custId: '68453002',
    branchId: '105',
    primaryAcctId: '660100100003',
    mobile: '9988776655',
    name: 'Priya Patil',
    slug: 'priya-patil',
    city: 'Pune',
    pitch: 'Three loans against a savings account with a lien on it.',
    story:
      'The only customer the sandbox answers everything for: an own-bank statement, a lien, three loans and a live Account Aggregator consent.',
    reportedDateOfBirth: '1995-06-20',
    inPicker: true,
    aaPulls: [
      { consentId: 'CONSENT-0001', linkRefNumber: '19818fc6-d5ee-429b-9d14-4dfd5d92fc8e' },
      {
        consentId: 'CONSENT-0001',
        linkRefNumber: '76ae28bd-eebf-4a49-8701-68a14346d996',
        viaFinPro: true,
      },
    ],
    coverage: {
      accountList: true,
      ownStatement: true,
      overdues: true,
      accountAggregator: true,
      customerRecord: true,
    },
  },
  {
    cif: '88234567',
    custId: '88823456',
    branchId: '107',
    primaryAcctId: '660100100006',
    mobile: '9765400022',
    name: 'Neha Singh',
    slug: 'neha-singh',
    // The branch 365 reports for her accounts. Kept in step with what `getCustomer` derives,
    // so the picker card and the profile screen cannot disagree about where she lives.
    city: 'Delhi',
    pitch: 'Four accounts, and a statement only a consent can reach.',
    story:
      'Four accounts of four different types, and no own-bank statement for any of them, so her transactions come from a consented pull or not at all.',
    reportedDateOfBirth: '1992-03-14',
    inPicker: true,
    // One consent per account, which is how 595's `01` fixture set is keyed. The masked numbers
    // in the responses line up with her four accounts: 0006, 0007, 0008 and 0009.
    aaPulls: [
      {
        consentId: 'CONSENT-0003-SAV',
        linkRefNumber: 'lr-003-sav-0001-11aa22bb33cc',
        variant: 'getAccountStatementtest01',
      },
      {
        consentId: 'CONSENT-0003-CUR',
        linkRefNumber: 'lr-003-cur-0002-44dd55ee66ff',
        variant: 'getAccountStatementtest01',
      },
      {
        consentId: 'CONSENT-0003-FD',
        linkRefNumber: 'lr-003-fd-0003-77gg88hh99ii',
        variant: 'getAccountStatementtest01',
      },
      {
        consentId: 'CONSENT-0003-SAL',
        linkRefNumber: 'lr-003-sal-0004-00jj11kk22ll',
        variant: 'getAccountStatementtest01',
      },
    ],
    coverage: {
      accountList: true,
      ownStatement: false,
      overdues: true,
      accountAggregator: true,
      customerRecord: false,
    },
    enquiryVariant: 'performAccountEnquirytest01',
  },
  {
    // No 442 fixture, so there is no CIF to read; 394 refuses every candidate we tried. The
    // Finacle id 365 returns is used as the key so the customer can still be opened, and the
    // coverage flags stop the app asking questions this sandbox will only refuse.
    cif: '77712345',
    custId: '77712345',
    branchId: '106',
    primaryAcctId: '660100100004',
    name: 'Arjun Mehta',
    slug: 'arjun-mehta',
    city: 'Mumbai',
    pitch: 'One account enquiry, and nothing else in the sandbox.',
    story:
      'One savings account and nothing else: the sandbox holds his account enquiry and no list, statement, overdue record, consent or date of birth. Registered so the coverage is written down; kept out of the picker because there is no file to advise on.',
    inPicker: false,
    coverage: {
      accountList: false,
      ownStatement: false,
      overdues: false,
      accountAggregator: false,
      customerRecord: false,
    },
    aaPulls: [],
  },
]

const BY_CIF = new Map(IDBI_SANDBOX_CUSTOMERS.map((c) => [c.cif, c]))

export function sandboxCustomer(cif: string): IdbiSandboxCustomer | null {
  return BY_CIF.get(cif) ?? null
}

/** The customers the picker offers: the ones the bank holds enough about to advise. */
export function pickableCustomers(): readonly IdbiSandboxCustomer[] {
  return IDBI_SANDBOX_CUSTOMERS.filter((c) => c.inPicker)
}

/**
 * The declared facts no IDBI operation carries.
 *
 * Income, employment, dependents, marital status, language, risk profile and tax regime are
 * things a customer tells their adviser, and the catalogue has nothing resembling any of them.
 * These are the seeds the app's own profile store starts each sandbox customer at, so the
 * product is usable on first run; every one of them is editable through `/api/v1/profile` and
 * the UI shows them as declared rather than as bank facts.
 */
export interface DeclaredSeed {
  cif: string
  maritalStatus: string
  dependents: number
  employmentType: 'Salaried' | 'Self-employed' | 'Business'
  declaredAnnualIncome: number
  preferredLanguage: string
  riskProfile: 'Conservative' | 'Balanced' | 'Growth'
  taxRegime: 'old' | 'new'
}

export const DECLARED_SEEDS: readonly DeclaredSeed[] = [
  {
    cif: '98655854',
    maritalStatus: 'Married',
    dependents: 1,
    employmentType: 'Salaried',
    // 433 puts her three loans at about ₹46.7 lakh outstanding against a ₹16,800 EMI, so an
    // income in this range is what makes her EMI-to-income ratio land where the engine expects.
    declaredAnnualIncome: 1_800_000,
    preferredLanguage: 'en',
    riskProfile: 'Balanced',
    taxRegime: 'new',
  },
  {
    cif: '88234567',
    maritalStatus: 'Single',
    dependents: 0,
    employmentType: 'Salaried',
    declaredAnnualIncome: 1_200_000,
    preferredLanguage: 'en',
    riskProfile: 'Growth',
    taxRegime: 'new',
  },
  {
    // Registered but not pickable. The declared half is seeded so that if IDBI later seeds his
    // statement the customer works immediately; the date of birth is deliberately absent,
    // because the bank reports none and inventing one would put a made-up age into a
    // suitability decision.
    cif: '77712345',
    maritalStatus: 'Married',
    dependents: 2,
    employmentType: 'Business',
    declaredAnnualIncome: 900_000,
    preferredLanguage: 'en',
    riskProfile: 'Conservative',
    taxRegime: 'old',
  },
]

/**
 * What the sandbox's customers already own.
 *
 * IDBI has no holdings endpoint, so this is the app's own record and the UI says so. The
 * shapes are chosen to give the suitability gate something real to refuse: Priya already
 * holds an equity fund with a live SIP and a term policy, so "start an equity SIP" has to
 * argue with an existing one, and Neha holds only a PPF, so her protection gap is genuine
 * rather than manufactured.
 *
 * Nothing here duplicates an account. A term deposit held at IDBI arrives on 394 and 365 as an
 * account and is already in the accounts block; recording it again would count it twice in
 * every net-worth figure.
 */
export interface HoldingsSeed {
  cif: string
  holdings: readonly HoldingDraft[]
  policies: readonly HoldingDraft[]
}

export const HOLDINGS_SEEDS: readonly HoldingsSeed[] = [
  {
    cif: '98655854',
    holdings: [
      {
        holdingType: 'MUTUAL_FUND',
        name: 'Nifty 50 Index Fund - Direct Growth',
        assetClass: 'Equity',
        investedAmount: 180_000,
        currentValue: 214_500,
        sipActive: true,
        sipAmount: 5_000,
        sipDebitDay: 5,
      },
      {
        holdingType: 'PPF',
        name: 'Public Provident Fund',
        assetClass: 'Debt',
        investedAmount: 450_000,
        currentValue: 512_000,
        sipActive: false,
        interestRate: 7.1,
        maturityDate: '2031-03-31',
      },
    ],
    policies: [
      {
        holdingType: 'INSURANCE',
        // `investedAmount` carries the cover and `currentValue` stays zero: the personas use
        // the same convention, because a term policy is protection rather than capital and a
        // net-worth figure that counted the sum assured would be wrong by a crore.
        name: 'Term Life, 1 crore to age 60',
        assetClass: 'Protection',
        investedAmount: 10_000_000,
        currentValue: 0,
        sipActive: false,
      },
    ],
  },
  {
    cif: '88234567',
    holdings: [
      {
        holdingType: 'PPF',
        name: 'Public Provident Fund',
        assetClass: 'Debt',
        investedAmount: 150_000,
        currentValue: 163_000,
        sipActive: false,
        interestRate: 7.1,
        maturityDate: '2034-03-31',
      },
    ],
    // No cover at all, which is the point: four accounts and ₹9.6 lakh across them, and
    // nothing protecting the income that filled them.
    policies: [],
  },
]

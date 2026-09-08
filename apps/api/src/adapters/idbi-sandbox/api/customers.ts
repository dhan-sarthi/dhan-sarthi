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

export interface IdbiSandboxCustomer extends IdbiCustomerKey {
  name: string
  /** What the picker shows about why this customer is worth opening. */
  story: string
  coverage: IdbiCoverage
  /**
   * The `…test01` variant to try 365 on first for this customer's accounts, where the base
   * fixture set does not hold them.
   */
  enquiryVariant?: string | undefined
}

export const IDBI_SANDBOX_CUSTOMERS: readonly IdbiSandboxCustomer[] = [
  {
    cif: '98655854',
    custId: '68453002',
    branchId: '105',
    primaryAcctId: '660100100003',
    mobile: '9988776655',
    name: 'Priya Patil',
    story:
      'The only customer the sandbox answers everything for: an own-bank statement, a lien, three loans and a live Account Aggregator consent.',
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
    story:
      'Four accounts of four different types, and no own-bank statement for any of them — so her transactions come from a consented pull or not at all.',
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
    story:
      'One savings account and nothing else: the sandbox holds his account enquiry and no list, statement or overdue record.',
    coverage: {
      accountList: false,
      ownStatement: false,
      overdues: false,
      accountAggregator: false,
      customerRecord: false,
    },
  },
]

const BY_CIF = new Map(IDBI_SANDBOX_CUSTOMERS.map((c) => [c.cif, c]))

export function sandboxCustomer(cif: string): IdbiSandboxCustomer | null {
  return BY_CIF.get(cif) ?? null
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

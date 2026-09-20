/**
 * IDBI's twenty-four APIs, as registered rather than guessed.
 *
 * The registry this replaces described `GET /api/v1/wealth-advisory/<block>` with the
 * parameters on a query string. No such endpoint exists. Every one of IDBI's operations is a
 * `POST` to `/Development/<op>test` with a JSON body, which is what the bank's own OpenAPI
 * exports say and what thirty-nine captured calls confirm. The five `…test01` paths are second
 * fixtures of an operation rather than operations of their own, which is why twenty-nine paths
 * are twenty-four APIs.
 *
 * `family` is the wrapper the operation answers with, and it is declared here because the
 * captures showed it varies per operation — the one shared unwrapping step we used to have
 * could not have been right for all of them. `tier` is what a call costs the bank: a `read`
 * may be made freely, a `write` creates a lead, injects a consent event or sends an OTP, and
 * `bureau` performs a real credit or KYC pull and needs credentials of its own. The capture
 * script gates the last two behind flags for the same reason.
 *
 * `paging` is the shape of "there is more", and there are two of them. 393 answers
 * `hasMoreData` with a row cursor taken from the last row received; 595 answers a
 * `pageDetails` block with a page number. Nothing pages by `page`/`page_size`/`total_pages`,
 * which is the third thing the old client believed.
 */

import type { EnvelopeFamily } from './envelope.ts'

/** IDBI's own service numbers, as the Atlas portal lists them. */
export type ServiceCode =
  | '362'
  | '365'
  | '391'
  | '393'
  | '394'
  | '402'
  | '404'
  | '408'
  | '415'
  | '428'
  | '433'
  | '441'
  | '442'
  | '473'
  | '497'
  | '498'
  | '508'
  | '538'
  | '590'
  | '591'
  | '592'
  | '593'
  | '595'
  | '739'

/** What a call costs the bank. */
export type OperationTier = 'read' | 'write' | 'bureau'

/** How an operation says there is more data. */
export type PagingStyle = 'none' | 'row-cursor' | 'page-details'

export interface IdbiOperation {
  code: ServiceCode
  /** The path segment, which is also the unique key: `/Development/<op>`. */
  op: string
  name: string
  family: EnvelopeFamily
  tier: OperationTier
  paging: PagingStyle
  /** Second and later fixtures of the same operation, IDBI's `…test01` paths. */
  variants: readonly string[]
  /** Why we call it, in one line. */
  purpose: string
  /** What a call does to the bank, where that is more than reading. */
  sideEffect?: string
}

export const OPERATIONS: readonly IdbiOperation[] = [
  {
    code: '362',
    op: 'accountLienEnquirytest',
    name: 'Account lien enquiry',
    family: 'result',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose: 'The lien on an account, which is the gap between AVAIL and EFFAVL.',
  },
  {
    code: '365',
    op: 'performAccountEnquirytest',
    name: 'Account enquiry',
    family: 'bare',
    tier: 'read',
    paging: 'none',
    variants: ['performAccountEnquirytest01'],
    purpose: 'One account: scheme, vintage, branch, holder and all seven balance types.',
  },
  {
    code: '391',
    op: 'getLoanAccountDetailstest',
    name: 'Loan account details',
    family: 'result',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose: 'A loan account in full: sanction, disbursal, rate, EMI and the repayment mandate.',
  },
  {
    code: '393',
    op: 'getFullAccountStatementWithPaginationtest',
    name: 'Full account statement',
    family: 'result',
    tier: 'read',
    paging: 'row-cursor',
    variants: [],
    purpose: 'The statement for a window, with the account balances that go on its header.',
  },
  {
    code: '394',
    op: 'getCustomerAccountsByCustIdtest',
    name: 'Customer accounts',
    family: 'bare',
    tier: 'read',
    paging: 'none',
    variants: ['getCustomerAccountsByCustIdtest01'],
    purpose: 'Every account a CIF holds, with type and balance. The entry point to a customer.',
  },
  {
    code: '402',
    op: 'getLoanOverdueDetailstest',
    name: 'Loan overdue details',
    family: 'bare',
    tier: 'read',
    paging: 'none',
    variants: ['getLoanOverdueDetailstest01'],
    purpose: 'Outstanding, days past due and NPA status per loan account.',
  },
  {
    code: '404',
    op: 'getLoanOverduePositionEnquirytest',
    name: 'Loan overdue position',
    family: 'bare',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose: 'The overdue position split into principal, interest and charges demanded.',
  },
  {
    code: '408',
    op: 'fetchCibilScoretest',
    name: 'CIBIL score',
    family: 'bare',
    tier: 'bureau',
    paging: 'none',
    variants: [],
    purpose: 'A credit bureau pull. 433 returns the same body shape without spending a pull.',
    sideEffect: 'A real CIBIL enquiry against the applicant, and it needs bureau credentials.',
  },
  {
    code: '415',
    op: 'searchCkycDetailstest',
    name: 'CKYC search',
    family: 'bare',
    tier: 'bureau',
    paging: 'none',
    variants: [],
    purpose: 'The central KYC record for a PAN. 433 carries the same block.',
    sideEffect: 'A real CKYC registry search, and it needs an API token.',
  },
  {
    code: '428',
    op: 'createLeadtest',
    name: 'Create lead',
    family: 'result',
    tier: 'write',
    paging: 'none',
    variants: [],
    purpose: 'Hands a product interest to the bank as a lead its staff will work.',
    sideEffect: 'Creates a lead. A repeat of one that exists answers "Lead already created".',
  },
  {
    code: '433',
    op: 'fetchLoanInterestRatestest',
    name: 'Loan interest rates',
    family: 'bare',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose:
      'Nominally the rate card. In this sandbox it returns the whole per-customer record: 106 keys across every domain, the CIBIL and CKYC blocks included — so it doubles as the one call that shows what the fixture holds.',
  },
  {
    code: '441',
    op: 'fetchLoanAccountLimitstest',
    name: 'Loan account limits',
    family: 'bare',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose: 'The drawing-power history of a loan account, newest first.',
  },
  {
    code: '442',
    op: 'fetchCustomerLimitDetailstest',
    name: 'Customer limit details',
    family: 'bare',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose:
      'Sanctioned limits and total exposure. Also the only call that prints `custCifId` and `customerID` side by side, which is what settles which identifier keys which API.',
  },
  {
    code: '473',
    op: 'generateLoanRepaymentScheduletest',
    name: 'Loan repayment schedule',
    family: 'bare',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose: 'An amortisation schedule for a modelled loan: the basis of an affordability answer.',
  },
  {
    code: '497',
    op: 'pushConsentNotificationtest',
    name: 'Push consent notification',
    family: 'bare',
    tier: 'write',
    paging: 'none',
    variants: [],
    purpose:
      'The consent webhook. IDBI calls this shape on us, so our own route mirrors it; calling theirs injects a synthetic event.',
    sideEffect: 'Injects a consent event into the sandbox.',
  },
  {
    code: '498',
    op: 'pushDataNotificationtest',
    name: 'Push data notification',
    family: 'bare',
    tier: 'write',
    paging: 'none',
    variants: [],
    purpose: 'The data-ready webhook, the signal that a consented pull can now be made.',
    sideEffect: 'Injects a data event into the sandbox.',
  },
  {
    code: '508',
    op: 'fetchHRMSEmployeeDetailstest',
    name: 'HRMS employee details',
    family: 'bare',
    tier: 'write',
    paging: 'none',
    variants: [],
    purpose:
      "Bank staff and their reporting line. Not customer data; it keys an adviser's identity.",
    sideEffect: 'May send an OTP to the employee when otpRequired is Y.',
  },
  {
    code: '538',
    op: 'InquireHPAyofftest',
    name: 'Hire-purchase payoff enquiry',
    family: 'bare',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose: 'What it costs to close a loan today: principal, accrued interest and penalties.',
  },
  {
    code: '590',
    op: 'requestConsentFromFinProtest',
    name: 'Request consent (AA)',
    family: 'finpro',
    tier: 'write',
    paging: 'none',
    variants: [],
    purpose: 'Step one of the Account Aggregator flow: asks for a consent handle.',
    sideEffect: 'Raises a consent request, which may notify the customer.',
  },
  {
    code: '591',
    op: 'getConsentListFromFinProtest',
    name: 'Consent list (AA)',
    family: 'finpro',
    tier: 'read',
    paging: 'none',
    variants: ['getConsentListFromFinProtest01'],
    purpose: 'The consents a customer has granted, and the accounts each one covers.',
  },
  {
    code: '592',
    op: 'getWebRedirectionEncryptedURLtest',
    name: 'Consent redirection URL (AA)',
    family: 'finpro',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose: 'Step two: the encrypted OneMoney URL the customer approves the consent at.',
  },
  {
    code: '593',
    op: 'generateDecryptedResponseFromFinProtest',
    name: 'Decrypt consent callback (AA)',
    family: 'finpro',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose: 'Step four: turns the `ecres` the redirect comes back with into a readable result.',
  },
  {
    code: '595',
    op: 'getAccountStatementtest',
    name: 'Consented account statement (AA)',
    family: 'finpro',
    tier: 'read',
    paging: 'page-details',
    variants: ['getAccountStatementtest01'],
    purpose:
      'The consented pull: profile, summary and transactions per linked account. The only source with a payment mode on every row, and so the only statement our categoriser can read.',
  },
  {
    code: '739',
    op: 'getAccountStatementFromFinProtest',
    name: 'Consented account statement, FinPro (AA)',
    family: 'finpro',
    tier: 'read',
    paging: 'none',
    variants: [],
    purpose: 'The same pull through FinPro. Same shape as 595; narrations are placeholders.',
  },
]

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

const BY_CODE = new Map<ServiceCode, IdbiOperation>(OPERATIONS.map((o) => [o.code, o]))
const BY_OP = new Map<string, IdbiOperation>()
for (const o of OPERATIONS) {
  BY_OP.set(o.op, o)
  for (const v of o.variants) BY_OP.set(v, o)
}

export function operation(code: ServiceCode): IdbiOperation {
  const found = BY_CODE.get(code)
  if (!found) throw new Error(`no IDBI operation registered for service ${code}`)
  return found
}

/** The operation a `/Development/<op>` path segment names, variants included. */
export function operationByPath(op: string): IdbiOperation | null {
  return BY_OP.get(op) ?? null
}

/** Every path the catalogue answers on, which is twenty-nine for twenty-four operations. */
export function allPaths(): readonly string[] {
  return OPERATIONS.flatMap((o) => [o.op, ...o.variants])
}

export function requestPath(op: string): string {
  return `/Development/${op}`
}

/** The reads, which is what a capture or a warm-up may call without asking anyone. */
export function readOperations(): readonly IdbiOperation[] {
  return OPERATIONS.filter((o) => o.tier === 'read')
}

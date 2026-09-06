/**
 * Service identity established by the supplied catalogue. Documentation evidence does not
 * establish a callable transport: no URL, HTTP method, authentication or live payload was
 * supplied. Synthetic captures exercise the implemented parsers without claiming live access.
 * No response bodies or customer samples belong in this registry.
 */
export type CatalogueClassification =
  | 'customer-read'
  | 'dedupe-read'
  | 'calculation'
  | 'sales-write'
  | 'inbound-webhook'
  | 'aa-action'
  | 'aa-read'
  | 'bureau-read'
  | 'staff-read'
  | 'kyc-read'
  | 'closure-quote'

const SERVICES = [
  ['391', 'getLoanAccountDetails', 'customer-read', 'json'],
  ['404', 'getLoanOverduePositionEnquiry', 'customer-read', 'json'],
  ['433', 'fetchLoanInterestRates', 'calculation', 'json'],
  ['456', 'performCustomerMasterDedupeCheck', 'dedupe-read', 'json'],
  ['473', 'generateLoanRepaymentSchedule', 'calculation', 'json'],
  ['739', 'getAccountStatementFromFinPro', 'aa-read', 'json'],
  ['365', 'performAccountEnquiry', 'customer-read', 'json'],
  ['428', 'createLead', 'sales-write', 'json'],
  ['497', 'pushConsentNotification', 'inbound-webhook', 'json'],
  ['498', 'pushDataNotification', 'inbound-webhook', 'json'],
  ['590', 'requestConsentFromFinPro', 'aa-action', 'json'],
  ['591', 'getConsentListFromFinPro', 'aa-read', 'json'],
  ['592', 'getWebRedirectionEncryptedURL', 'aa-action', 'json'],
  ['593', 'generateDecryptedResponseFromFinPro', 'aa-action', 'json'],
  ['595', 'MoneyOne FIU - Get Account Statement', 'aa-read', 'json'],
  ['393', 'getFullAccountStatementWithPagination', 'customer-read', 'json'],
  ['394', 'getCustomerAccountsByCustId', 'customer-read', 'json'],
  ['441', 'fetchLoanAccountLimits', 'customer-read', 'json'],
  ['442', 'Fetch Customer Limit Details', 'customer-read', 'json'],
  ['362', 'accountLienEnquiry', 'customer-read', 'json'],
  ['402', 'getLoanOverdueDetails', 'customer-read', 'json'],
  ['408', 'fetch CIBIL Score', 'bureau-read', 'json'],
  ['508', 'Fetch HRMS Employee Details', 'staff-read', 'json'],
  ['415', 'searchCkycDetails', 'kyc-read', 'xml'],
  ['538', 'Inquire HPAyoff', 'closure-quote', 'json'],
] as const satisfies readonly (readonly [string, string, CatalogueClassification, 'json' | 'xml'])[]

export type CatalogueServiceCode = (typeof SERVICES)[number][0]

export interface CatalogueService {
  code: CatalogueServiceCode
  name: string
  classification: CatalogueClassification
  /** Example body encoding, not a transport or content-type guarantee. */
  requestEncoding: 'json' | 'xml'
  documentationVerified: true
  executionVerified: false
  status: 'planned'
  method: null
  url: null
}

export const CATALOGUE_SERVICES: readonly CatalogueService[] = SERVICES.map(
  ([code, name, classification, requestEncoding]) => ({
    code,
    name,
    classification,
    requestEncoding,
    documentationVerified: true,
    executionVerified: false,
    status: 'planned',
    method: null,
    url: null,
  }),
)

export function catalogueService(code: CatalogueServiceCode): CatalogueService {
  const service = CATALOGUE_SERVICES.find((entry) => entry.code === code)
  if (!service) throw new Error(`unregistered catalogue service ${code}`)
  return service
}

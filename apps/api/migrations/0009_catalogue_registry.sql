-- The supplied catalogue verifies service identity, not a working integration. Keep transport
-- and execution evidence separate; synthetic replay does not make an IDBI service live.
ALTER TABLE staging.endpoint_registry
  ADD COLUMN execution_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN staging.endpoint_registry.verified IS
  'Service identity and purpose checked against its source documentation; not proof of execution.';
COMMENT ON COLUMN staging.endpoint_registry.execution_verified IS
  'A real provider request and response have verified execution; synthetic replay is insufficient.';

INSERT INTO staging.endpoint_registry
  (source, endpoint_code, name, api_version, http_method, path_template, projector,
   status, verified, execution_verified, notes)
SELECT 'idbi_api'::common.source, service.code, service.name, 'unknown', NULL, NULL, NULL,
       'planned', true, false,
       'Identity checked against supplied catalogue. Classification: ' || service.classification ||
       '. URL, HTTP method, authentication, formats and live behaviour remain unverified.'
FROM (VALUES
  ('391', 'getLoanAccountDetails', 'customer-read'),
  ('404', 'getLoanOverduePositionEnquiry', 'customer-read'),
  ('433', 'fetchLoanInterestRates', 'calculation'),
  ('456', 'performCustomerMasterDedupeCheck', 'dedupe-read'),
  ('473', 'generateLoanRepaymentSchedule', 'calculation'),
  ('739', 'getAccountStatementFromFinPro', 'aa-read'),
  ('365', 'performAccountEnquiry', 'customer-read'),
  ('428', 'createLead', 'sales-write'),
  ('497', 'pushConsentNotification', 'inbound-webhook'),
  ('498', 'pushDataNotification', 'inbound-webhook'),
  ('590', 'requestConsentFromFinPro', 'aa-action'),
  ('591', 'getConsentListFromFinPro', 'aa-read'),
  ('592', 'getWebRedirectionEncryptedURL', 'aa-action'),
  ('593', 'generateDecryptedResponseFromFinPro', 'aa-action'),
  ('595', 'MoneyOne FIU - Get Account Statement', 'aa-read'),
  ('393', 'getFullAccountStatementWithPagination', 'customer-read'),
  ('394', 'getCustomerAccountsByCustId', 'customer-read'),
  ('441', 'fetchLoanAccountLimits', 'customer-read'),
  ('442', 'Fetch Customer Limit Details', 'customer-read'),
  ('362', 'accountLienEnquiry', 'customer-read'),
  ('402', 'getLoanOverdueDetails', 'customer-read'),
  ('408', 'fetch CIBIL Score', 'bureau-read'),
  ('508', 'Fetch HRMS Employee Details', 'staff-read'),
  ('415', 'searchCkycDetails', 'kyc-read'),
  ('538', 'Inquire HPAyoff', 'closure-quote')
) AS service(code, name, classification)
ON CONFLICT (source, endpoint_code, api_version) DO UPDATE SET
  name = EXCLUDED.name,
  http_method = EXCLUDED.http_method,
  path_template = EXCLUDED.path_template,
  projector = EXCLUDED.projector,
  status = EXCLUDED.status,
  verified = EXCLUDED.verified,
  execution_verified = EXCLUDED.execution_verified,
  notes = EXCLUDED.notes;

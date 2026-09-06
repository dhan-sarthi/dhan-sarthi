-- Descriptive metadata for the implemented parser -> synthetic packet projector -> seed SQL
-- path. No runtime interpreter executes this table. Required means our current application
-- projection requires the value; it does not assert a bank-mandated required field.
-- Identity, currency, consent and account linkage remain whole-packet checks in code.
INSERT INTO staging.field_mappings
  (endpoint_id, source_path, target_table, target_column, transform, required, notes)
SELECT endpoint.id, mapping.source_path, mapping.target_table, mapping.target_column,
       mapping.transform, mapping.required,
       'Descriptive application projection metadata; no runtime table interpreter. ' || mapping.notes
FROM (VALUES
  ('393', 'result.transactionDetails[].transactionSummary.txnAmt',
   'bank.transactions', 'amount', 'parseInrMoney', true,
   'Validated INR object -> exact safe paise -> numeric rupees; projectTransactions writes amount. Database additionally requires a positive posted amount.'),
  ('393', 'result.transactionDetails[].transactionSummary.txnType',
   'bank.transactions', 'tran_type', 'parseIdbiStatement.directionMap', true,
   'Configured direction map only; unknown codes stop projection. Synthetic CREDIT/DEBIT is not a confirmed live vocabulary.'),
  ('393', 'result.transactionDetails[].transactionSummary.txnDate',
   'bank.transactions', 'tran_date', 'parseIdbiStatement.dateDecoder', true,
   'Explicit decoder -> validated ISO calendar date. ISO is the synthetic convention; live format remains unverified.'),
  ('393', 'result.transactionDetails[].valueDate',
   'bank.transactions', 'value_date', 'parseIdbiStatement.dateDecoder', true,
   'Keep value date distinct from transaction and posting dates; no missing-date substitution.'),
  ('393', 'result.transactionDetails[].transactionSummary.txnDesc',
   'bank.transactions', 'narration', 'parseIdbiStatement.narration', true,
   'Preserve narration text. Mode, salary flags, merchant and spend classification are separate enrichment.'),
  ('393', 'result.transactionDetails[].txnBalance',
   'bank.transactions', 'balance_after', 'parseInrMoney', true,
   'Statement running balance only; not available cash and not a combined multi-account floor.'),
  ('362', 'result.bankInfo.lienDetails.newLienAmt',
   'bank.account_snapshots', 'lien_amount', 'projectCatalogueSeedPayload.activeLien', true,
   'Synthetic same-account lien with explicitly decoded non-deleted state and validity covering the observation anchor. Old and new are never added; not an unconditional live lien-total mapping.'),
  ('402', 'result.overdueDetails[].dpd',
   'bank.loan_snapshots', 'dpd', 'parseIdbiOverdues.dpd', true,
   'Lexical nonnegative integer with safe range, joined by customer and account. Parser retains missing as null; current seed projector rejects unknown DPD.'),
  ('402', 'result.overdueDetails[].npaStatus',
   'bank.loan_snapshots', 'is_npa', 'projectCatalogueSeedPayload.npaStatus', true,
   'Explicit synthetic N/Y guard; Y sets the risk flag. Unknown codes stop projection. N does not clear pre-existing fixture risk. Live NPA vocabulary is unconfirmed.')
) AS mapping(code, source_path, target_table, target_column, transform, required, notes)
JOIN staging.endpoint_registry endpoint
  ON endpoint.source = 'idbi_api'
 AND endpoint.endpoint_code = mapping.code
 AND endpoint.api_version = 'unknown'
ON CONFLICT (endpoint_id, source_path, target_table, target_column) DO UPDATE SET
  transform = EXCLUDED.transform,
  required = EXCLUDED.required,
  notes = EXCLUDED.notes;

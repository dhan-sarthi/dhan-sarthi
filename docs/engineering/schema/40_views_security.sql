-- =====================================================================================
-- Part 4: "current" views over the versioned mirrors, a 360 view, roles and row security
-- =====================================================================================

-- Latest row per entity. Every reader of bank data goes through these; nothing reads the
-- snapshot tables directly except the projector and the audit reviewer.
CREATE VIEW bank.customer_profiles_current AS
  SELECT DISTINCT ON (customer_id) * FROM bank.customer_profiles
  ORDER BY customer_id, as_of DESC, ingested_at DESC;

CREATE VIEW bank.account_snapshots_current AS
  SELECT DISTINCT ON (account_id) * FROM bank.account_snapshots
  ORDER BY account_id, as_of DESC, ingested_at DESC;

CREATE VIEW bank.term_deposits_current AS
  SELECT DISTINCT ON (account_id) * FROM bank.term_deposit_snapshots
  ORDER BY account_id, as_of DESC, ingested_at DESC;

CREATE VIEW bank.loans_current AS
  SELECT DISTINCT ON (account_id) * FROM bank.loan_snapshots
  ORDER BY account_id, as_of DESC, ingested_at DESC;

CREATE VIEW bank.cards_current AS
  SELECT DISTINCT ON (account_id) * FROM bank.card_snapshots
  ORDER BY account_id, as_of DESC, ingested_at DESC;

CREATE VIEW bank.mandates_current AS
  SELECT DISTINCT ON (customer_id, kind, mandate_ref) * FROM bank.mandates
  ORDER BY customer_id, kind, mandate_ref, as_of DESC, ingested_at DESC;

CREATE VIEW bank.mf_holdings_current AS
  SELECT DISTINCT ON (customer_id, folio_no, isin, scheme_code) * FROM bank.mf_holdings
  ORDER BY customer_id, folio_no, isin, scheme_code, as_of DESC, ingested_at DESC;

CREATE VIEW bank.sip_registrations_current AS
  SELECT DISTINCT ON (customer_id, registration_ref) * FROM bank.sip_registrations
  ORDER BY customer_id, registration_ref, as_of DESC, ingested_at DESC;

CREATE VIEW bank.insurance_policies_current AS
  SELECT DISTINCT ON (customer_id, insurer, policy_number) * FROM bank.insurance_policies
  ORDER BY customer_id, insurer, policy_number, as_of DESC, ingested_at DESC;

CREATE VIEW bank.behavioural_signals_current AS
  SELECT DISTINCT ON (customer_id) * FROM bank.behavioural_signals
  ORDER BY customer_id, as_of DESC, ingested_at DESC;

-- The Money tab in one query: accounts, deposits, loans, cards, per customer, latest run.
CREATE VIEW app.customer_360 AS
  SELECT c.id AS customer_id, c.cif, c.display_name,
         a.id AS account_id, a.product_kind, a.account_number_masked, a.scheme_code,
         s.account_type, s.status, s.current_balance, s.available_balance, s.lien_amount,
         s.avg_monthly_balance_3m, s.min_balance_12m, s.as_of AS balance_as_of,
         td.deposit_type, td.principal_amount, td.maturity_date, td.interest_rate AS deposit_rate,
         ln.loan_type, ln.outstanding_principal, ln.emi_amount, ln.interest_rate AS loan_rate,
         ln.tenure_remaining_months, ln.dpd,
         cd.credit_limit, cd.current_outstanding AS card_outstanding, cd.payment_due_date
  FROM app.customers c
  JOIN bank.accounts a ON a.customer_id = c.id
  LEFT JOIN bank.account_snapshots_current s  ON s.account_id  = a.id
  LEFT JOIN bank.term_deposits_current   td   ON td.account_id = a.id
  LEFT JOIN bank.loans_current           ln   ON ln.account_id = a.id
  LEFT JOIN bank.cards_current           cd   ON cd.account_id = a.id
  WHERE c.erased_at IS NULL;

-- Liabilities as the engine wants them (Liability[] in types.ts), latest run only.
CREATE VIEW app.liabilities_current AS
  SELECT ln.account_id, a.customer_id, ln.loan_type, ln.loan_type_raw, ln.outstanding_principal,
         ln.emi_amount, ln.interest_rate, ln.tenure_remaining_months, ln.dpd, ln.is_revolving, ln.lender
  FROM bank.loans_current ln JOIN bank.accounts a ON a.id = ln.account_id
  WHERE ln.status = 'ACTIVE';

-- ---------- roles and row-level security -------------------------------------------------------
-- Three roles: the API (reads bank.*, writes app.*), the ingester (writes staging.* and bank.*),
-- and an auditor (reads audit + verdicts only). The migration role owns everything, which is
-- what makes the append-only triggers binding: the API role cannot drop them.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dhan_api')     THEN CREATE ROLE dhan_api     NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dhan_ingest')  THEN CREATE ROLE dhan_ingest  NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dhan_auditor') THEN CREATE ROLE dhan_auditor NOLOGIN; END IF;
END $$;

GRANT USAGE ON SCHEMA common, ref, bank, app, staging TO dhan_api, dhan_ingest, dhan_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA ref  TO dhan_api, dhan_ingest, dhan_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA bank TO dhan_api;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA bank    TO dhan_ingest;   -- no DELETE: retention job runs as owner
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA staging TO dhan_ingest;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO dhan_api;
REVOKE UPDATE, DELETE ON app.audit_records, app.snapshots, app.verdicts, app.roadmaps, app.avatar_tool_calls FROM dhan_api;
GRANT SELECT ON app.audit_records, app.verdicts, app.snapshots, app.roadmaps, app.consents, app.consent_events TO dhan_auditor;
GRANT SELECT, INSERT ON staging.sync_runs, staging.raw_payloads, staging.projections TO dhan_api; -- the API may start a sync
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app, staging TO dhan_api, dhan_ingest;

-- Row-level security: the API sets `SET LOCAL app.customer_id = '<uuid>'` per request and can only
-- see that customer. Applied to the tables a request reads directly; the rest are reached through them.
ALTER TABLE bank.transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.memories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_records   ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_own_customer ON bank.transactions FOR SELECT TO dhan_api
  USING (customer_id = current_setting('app.customer_id', true)::uuid);
CREATE POLICY memories_own_customer ON app.memories TO dhan_api
  USING (customer_id = current_setting('app.customer_id', true)::uuid)
  WITH CHECK (customer_id = current_setting('app.customer_id', true)::uuid);
CREATE POLICY snapshots_own_customer ON app.snapshots TO dhan_api
  USING (customer_id = current_setting('app.customer_id', true)::uuid)
  WITH CHECK (customer_id = current_setting('app.customer_id', true)::uuid);
CREATE POLICY audit_own_customer ON app.audit_records FOR SELECT TO dhan_api
  USING (customer_id = current_setting('app.customer_id', true)::uuid);
CREATE POLICY audit_insert_any ON app.audit_records FOR INSERT TO dhan_api WITH CHECK (true);
CREATE POLICY audit_reviewer_all ON app.audit_records FOR SELECT TO dhan_auditor USING (true);
CREATE POLICY ingest_all_transactions ON bank.transactions TO dhan_ingest USING (true) WITH CHECK (true);

-- =====================================================================================
-- 0007  "Current" views over the versioned mirrors, grants for the runtime role, row security.
--
-- Adapted from docs/engineering/schema/40_views_security.sql. One runtime role (dhan_app) rather
-- than three, because the API is the only client; the ingester is `pnpm seed` running as the
-- owner. The REVOKEs below are what make the append-only story hold for the API even without
-- the triggers, and the triggers hold it for everyone else.
-- =====================================================================================

-- Latest row per entity. Every reader of bank data goes through these.
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

-- The Money tab in one query: accounts, deposits, loans, per customer, latest run.
CREATE VIEW app.customer_360 AS
  SELECT c.id AS customer_id, c.cif, c.display_name,
         a.id AS account_id, a.product_kind, a.account_number_masked, a.scheme_code,
         s.account_type, s.status, s.current_balance, s.available_balance, s.lien_amount,
         s.avg_monthly_balance_3m, s.min_balance_12m, s.as_of AS balance_as_of,
         td.deposit_type, td.principal_amount, td.maturity_date, td.interest_rate AS deposit_rate,
         ln.loan_type, ln.outstanding_principal, ln.emi_amount, ln.interest_rate AS loan_rate,
         ln.tenure_remaining_months, ln.dpd
  FROM app.customers c
  JOIN bank.accounts a ON a.customer_id = c.id
  LEFT JOIN bank.account_snapshots_current s  ON s.account_id  = a.id
  LEFT JOIN bank.term_deposits_current   td   ON td.account_id = a.id
  LEFT JOIN bank.loans_current           ln   ON ln.account_id = a.id
  WHERE c.erased_at IS NULL;

-- Liabilities as the engine wants them (Liability[] in types.ts), latest run only.
CREATE VIEW app.liabilities_current AS
  SELECT ln.account_id, a.customer_id, ln.loan_type, ln.loan_type_raw, ln.outstanding_principal,
         ln.emi_amount, ln.interest_rate, ln.tenure_remaining_months, ln.dpd, ln.is_revolving, ln.lender
  FROM bank.loans_current ln JOIN bank.accounts a ON a.id = ln.account_id
  WHERE ln.status = 'ACTIVE';

-- ---------- grants ---------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA common, ref, staging, bank, app TO dhan_app;

GRANT SELECT ON ALL TABLES IN SCHEMA ref TO dhan_app;
-- A snapshot may name an engine version the seed never saw (a new build); it registers it.
GRANT INSERT ON ref.engine_versions TO dhan_app;

GRANT SELECT ON ALL TABLES IN SCHEMA bank TO dhan_app;

GRANT SELECT ON ALL TABLES IN SCHEMA staging TO dhan_app;
GRANT INSERT ON staging.sync_runs, staging.raw_payloads, staging.projections TO dhan_app;  -- the API may start a sync

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO dhan_app;
-- Seeded identity is the ingester's, not the API's.
REVOKE INSERT, UPDATE, DELETE ON app.customers, app.consents FROM dhan_app;
REVOKE UPDATE, DELETE ON app.consent_events FROM dhan_app;
-- The record: INSERT only.
REVOKE UPDATE, DELETE ON app.audit_records, app.decisions, app.avatar_tool_calls, app.verdicts FROM dhan_app;
-- Derived rows: written once, removed only by erasure's cascade (which runs as the owner).
REVOKE UPDATE, DELETE ON app.snapshots, app.roadmap_versions FROM dhan_app;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA app, staging TO dhan_app;

-- Later migrations inherit the same posture unless they say otherwise.
ALTER DEFAULT PRIVILEGES IN SCHEMA ref     GRANT SELECT ON TABLES TO dhan_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA bank    GRANT SELECT ON TABLES TO dhan_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA staging GRANT SELECT ON TABLES TO dhan_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dhan_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app     GRANT USAGE ON SEQUENCES TO dhan_app;

-- ---------- row-level security --------------------------------------------------------------------
-- A request may scope itself with `SET LOCAL app.customer_id = '<uuid>'` (bank rows, snapshots) or
-- `SET LOCAL app.subject_id = '<uuid>'` (the record) and then sees only that customer or subject.
-- With no scope set the policies pass everything, so an adapter that never sets one still works;
-- the owner bypasses RLS regardless. The seam is here so the per-request scope is a one-line
-- change in the unit of work, not a migration.
ALTER TABLE bank.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_scope ON bank.transactions FOR SELECT TO dhan_app
  USING (nullif(current_setting('app.customer_id', true), '') IS NULL
         OR customer_id = nullif(current_setting('app.customer_id', true), '')::uuid);

CREATE POLICY snapshots_scope ON app.snapshots TO dhan_app
  USING (nullif(current_setting('app.customer_id', true), '') IS NULL
         OR customer_id = nullif(current_setting('app.customer_id', true), '')::uuid)
  WITH CHECK (nullif(current_setting('app.customer_id', true), '') IS NULL
         OR customer_id = nullif(current_setting('app.customer_id', true), '')::uuid);

CREATE POLICY audit_scope ON app.audit_records FOR SELECT TO dhan_app
  USING (nullif(current_setting('app.subject_id', true), '') IS NULL
         OR subject_id = nullif(current_setting('app.subject_id', true), '')::uuid);
CREATE POLICY audit_insert ON app.audit_records FOR INSERT TO dhan_app WITH CHECK (true);

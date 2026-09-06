-- Fixture terms are the only balances that may be advanced by the reviewer's clock.
-- Actual provider observations remain dated observations, never extrapolated contracts.
ALTER TABLE bank.account_snapshots
  ADD COLUMN fixture_liquidity_terms jsonb
    CHECK (fixture_liquidity_terms IS NULL OR jsonb_typeof(fixture_liquidity_terms) = 'object');

COMMENT ON COLUMN bank.account_snapshots.fixture_liquidity_terms IS
  'Synthetic lien and floating-funds assumptions for deterministic clock replay; never a live bank payload.';

ALTER TABLE bank.loan_snapshots ADD COLUMN is_npa boolean;
CREATE OR REPLACE VIEW bank.loans_current AS
SELECT DISTINCT ON (account_id) * FROM bank.loan_snapshots
ORDER BY account_id, as_of DESC, ingested_at DESC;

CREATE OR REPLACE VIEW bank.account_snapshots_current AS
SELECT DISTINCT ON (account_id) *
FROM bank.account_snapshots
ORDER BY account_id, as_of DESC, ingested_at DESC;

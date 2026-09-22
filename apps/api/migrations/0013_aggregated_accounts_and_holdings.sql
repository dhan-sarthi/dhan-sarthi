-- =====================================================================================
-- 0013  Additive only: accounts held at other banks, and holdings with no mirror of their own.
--       Nothing is dropped, and no existing row changes meaning.
--
-- The personas grew past what the bank mirrors could hold. Karan now keeps money at HDFC,
-- ICICI and Kotak as well as IDBI, reported through an Account Aggregator consent, and his
-- wealth includes EPF, NPS, PPF and shares held at Zerodha. The seed had nowhere to put any
-- of it, so the Postgres profile filed every statement line under his IDBI account, counted
-- the sweeps between his own accounts as spending, and lost twelve of his sixteen holdings.
-- The memory profile had all of it. These columns and the one table close that gap, so both
-- profiles load the same customer file again, which the port contract suite checks.
--
-- NULL is the compatibility story throughout. An account with no institution is IDBI's, which
-- is what every row written before this migration meant. A line that is not flagged as a
-- self-transfer is ordinary spending or income, as every line was before.
-- =====================================================================================

-- ---------- where an account is held, and where it sits in the customer file ----------------
ALTER TABLE bank.accounts
  ADD COLUMN institution_name        text,
  ADD COLUMN institution_ifsc_prefix text CHECK (institution_ifsc_prefix ~ '^[A-Z]{4}$'),
  ADD COLUMN institution_is_home     boolean,
  ADD COLUMN is_primary              boolean NOT NULL DEFAULT false,
  ADD COLUMN display_order           smallint CHECK (display_order >= 0),
  ADD CONSTRAINT accounts_institution_whole CHECK (
    (institution_name IS NULL) = (institution_ifsc_prefix IS NULL)
    AND (institution_name IS NULL) = (institution_is_home IS NULL)
  );

COMMENT ON COLUMN bank.accounts.institution_name IS
  'The bank holding the account, as the customer would say it (HDFC Bank). Null means IDBI, which is what every row older than the column meant.';
COMMENT ON COLUMN bank.accounts.institution_is_home IS
  'True for IDBI only. An account IDBI can see on its own APIs is a different claim from one reported through an Account Aggregator consent.';
COMMENT ON COLUMN bank.accounts.is_primary IS
  'The customer''s primary operative account: an unstamped statement line belongs to it, and it is never reported as dormant.';
COMMENT ON COLUMN bank.accounts.display_order IS
  'Position in the customer file''s accounts list, zero-based. Null sorts last, then by creation.';

-- ---------- money moving between the customer's own accounts ----------------------------------
ALTER TABLE bank.transactions
  ADD COLUMN is_self_transfer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN bank.transactions.is_self_transfer IS
  'One leg of a movement between two accounts the same customer holds. It was not spent, earned or saved. Only an aggregated view can know this, so false means "not known to be", never "known not to be".';

-- ---------- holdings: bundle order, and the custodian a policy names --------------------------
ALTER TABLE bank.mf_holdings
  ADD COLUMN position smallint CHECK (position >= 0);

COMMENT ON COLUMN bank.mf_holdings.position IS
  'Position among the customer''s holdings that are not SIPs, shared with bank.other_holdings, so the two tables read back in one order.';

ALTER TABLE bank.insurance_policies
  ADD COLUMN custodian text;

COMMENT ON COLUMN bank.insurance_policies.custodian IS
  'Who the source said holds the policy (HDFC Life), verbatim. Null where it named nobody; insurer is then derived and is not repeated here.';

-- A view's * is fixed when the view is made, so a new column is invisible until it is remade.
CREATE OR REPLACE VIEW bank.mf_holdings_current AS
  SELECT DISTINCT ON (customer_id, folio_no, isin, scheme_code) * FROM bank.mf_holdings
  ORDER BY customer_id, folio_no, isin, scheme_code, as_of DESC, ingested_at DESC;

CREATE OR REPLACE VIEW bank.insurance_policies_current AS
  SELECT DISTINCT ON (customer_id, insurer, policy_number) * FROM bank.insurance_policies
  ORDER BY customer_id, insurer, policy_number, as_of DESC, ingested_at DESC;

-- ---------- EPF, NPS, PPF, listed shares: the holdings with no mirror of their own -------------
CREATE TABLE bank.other_holdings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id     uuid NOT NULL REFERENCES staging.sync_runs(id),
  source          common.source NOT NULL,
  as_of           timestamptz NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  raw_payload_id  uuid REFERENCES staging.raw_payloads(id),
  holding_ref     text NOT NULL,
  position        smallint CHECK (position >= 0),
  holding_type    text NOT NULL CHECK (holding_type IN ('MUTUAL_FUND','FD','RD','INSURANCE','NPS','PPF','EQUITY','EPF')),
  name            text NOT NULL,
  asset_class     text NOT NULL CHECK (asset_class IN ('Equity','Debt','Hybrid','Protection','Gold')),
  invested_amount common.inr NOT NULL,
  current_value   common.inr NOT NULL,
  sip_active      boolean NOT NULL DEFAULT false,
  sip_amount      common.inr CHECK (sip_amount >= 0),
  sip_debit_day   smallint CHECK (sip_debit_day BETWEEN 1 AND 31),
  maturity_date   date,
  interest_rate   common.pct,
  held_via        text NOT NULL DEFAULT 'UNKNOWN' CHECK (held_via IN ('IDBI','OTHER','UNKNOWN')),
  custodian       text,
  ticker          text,
  isin            common.isin,
  units           common.units CHECK (units >= 0),
  avg_cost        common.nav CHECK (avg_cost >= 0),
  purchased_on    date,
  UNIQUE (customer_id, holding_ref, sync_run_id),
  CHECK (ticker IS NULL OR holding_type = 'EQUITY')
);
CREATE INDEX other_holdings_customer ON bank.other_holdings (customer_id, as_of DESC);
COMMENT ON TABLE bank.other_holdings IS
  'Holdings per run that no dedicated mirror covers: EPF (EPFO passbook), NPS (CRA statement), PPF, listed equity (depository CAS), as an Account Aggregator or the customer reports them.';

CREATE VIEW bank.other_holdings_current AS
  SELECT DISTINCT ON (customer_id, holding_ref) * FROM bank.other_holdings
  ORDER BY customer_id, holding_ref, as_of DESC, ingested_at DESC;

-- 0007's default privileges cover a new bank table only when the role that set them creates it,
-- so the grant is explicit and does not depend on which role runs this file.
GRANT SELECT ON bank.other_holdings, bank.other_holdings_current TO dhan_app;

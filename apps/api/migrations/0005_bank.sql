-- =====================================================================================
-- 0005  Bank-sourced mirrors needed by derive(). Immutable per sync run; the "current" views
--       in 0007 pick the latest run.
--
-- From docs/engineering/schema/20_bank.sql, verbatim except: bank.transactions gains `seq`
-- (the statement's intra-day order, so balance_after is reproducible) and
-- bank.sip_registrations gains `asset_class` (SipContract.assetClass). Tables the demo does
-- not read yet (cards, liens, NPS, equities, government schemes, MF transactions, behavioural
-- signals, AA artefacts) are listed in migrations/README.md for a later migration.
--
-- Conventions on every table here:
--   sync_run_id / source / as_of / ingested_at / raw_payload_id  — provenance, always present
--   <code>      normalised value we reason over (CHECKed)
--   <code>_raw  the bank's own code, verbatim, so nothing is lost when a value we did not
--               anticipate arrives: it lands as 'OTHER' + the raw string, and ingestion never fails.
--   UNIQUE (<entity>, sync_run_id)  — one row per entity per run; re-running a run upserts.
-- =====================================================================================

-- ---------- customer master (IDBI API 456 / Finacle CIF / AA Profile.Holders) ------------
CREATE TABLE bank.customer_profiles (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id            uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id            uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                 common.source NOT NULL,
  as_of                  timestamptz NOT NULL,
  ingested_at            timestamptz NOT NULL DEFAULT now(),
  raw_payload_id         uuid REFERENCES staging.raw_payloads(id),
  cif                    text NOT NULL,
  cust_name              text,
  date_of_birth          date,
  age                    smallint CHECK (age BETWEEN 0 AND 120),
  gender                 text CHECK (gender IN ('Male','Female','Other','Undisclosed')),
  gender_raw             text,
  marital_status         text CHECK (marital_status IN ('Single','Married','Widowed','Divorced','Undisclosed')),
  marital_status_raw     text,
  dependents_count       smallint CHECK (dependents_count >= 0),
  employment_type        text CHECK (employment_type IN ('Salaried','Self-employed','Business','Retired','Student','Homemaker','Other')),
  employment_type_raw    text,
  occupation_code        text,
  declared_annual_income common.inr CHECK (declared_annual_income >= 0),
  income_band            text,
  constitution           text NOT NULL DEFAULT 'INDIVIDUAL',
  resident_status        text CHECK (resident_status IN ('RESIDENT','NRI','PIO','OCI')),
  pan_present            boolean,
  ckyc_compliance        boolean,
  kyc_status             text CHECK (kyc_status IN ('VERIFIED','PENDING','REKYC_DUE','EXPIRED','REJECTED')),
  kyc_status_raw         text,
  kyc_last_updated_on    date,
  kyc_next_due_on        date,
  aml_risk_category      text CHECK (aml_risk_category IN ('LOW','MEDIUM','HIGH')),
  risk_profile           text CHECK (risk_profile IN ('Conservative','Balanced','Growth')),
  risk_profile_raw       text,
  risk_profile_date      date,
  customer_since         date,
  home_branch_sol_id     text,
  home_branch_ifsc       common.ifsc,
  city                   text,
  state_code             char(2) REFERENCES ref.state_codes(state_code),
  pincode                char(6) CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  preferred_language     common.lang_tag,
  mobile_masked          text,
  email_masked           text,
  segment                text,
  is_staff               boolean,
  nominee_registered     boolean,
  UNIQUE (customer_id, sync_run_id),
  CHECK (date_of_birth IS NULL OR date_of_birth < as_of::date),
  CHECK (date_of_birth IS NOT NULL OR age IS NOT NULL)
);
CREATE INDEX customer_profiles_latest ON bank.customer_profiles (customer_id, as_of DESC);
COMMENT ON TABLE bank.customer_profiles IS 'Versioned mirror of the CIF / customer master (API 456, AA Profile). One row per sync run.';

-- ---------- account identity + versioned attributes ---------------------------------------
CREATE TABLE bank.accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  account_ref           text NOT NULL,
  account_number_masked common.masked_acct NOT NULL,
  product_kind          text NOT NULL CHECK (product_kind IN ('CASA','TERM_DEPOSIT','RECURRING_DEPOSIT','LOAN','CREDIT_CARD','OVERDRAFT','PPF','NPS','OTHER')),
  scheme_type           text CHECK (scheme_type IN ('SBA','CAA','TDA','ODA','CCA','LAA','OTHER')),
  scheme_type_raw       text,
  scheme_code           text,
  source                common.source NOT NULL,
  first_seen_run_id     uuid REFERENCES staging.sync_runs(id),
  last_seen_run_id      uuid REFERENCES staging.sync_runs(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  row_version           integer NOT NULL DEFAULT 1,
  UNIQUE (customer_id, account_ref)
);
CREATE TRIGGER accounts_touch BEFORE UPDATE ON bank.accounts
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();
COMMENT ON TABLE bank.accounts IS 'Stable identity for every bank product the customer holds (CASA, deposits, loans, cards). Attributes live in *_snapshots.';

CREATE TABLE bank.account_snapshots (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             uuid NOT NULL REFERENCES bank.accounts(id) ON DELETE CASCADE,
  sync_run_id            uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                 common.source NOT NULL,
  as_of                  timestamptz NOT NULL,
  ingested_at            timestamptz NOT NULL DEFAULT now(),
  raw_payload_id         uuid REFERENCES staging.raw_payloads(id),
  account_type           text NOT NULL CHECK (account_type IN ('SAVINGS','CURRENT','SALARY','OVERDRAFT','CASH_CREDIT','NRE','NRO','BSBDA','OTHER')),
  account_type_raw       text,
  is_salary_account      boolean,
  mode_of_operation      text CHECK (mode_of_operation IN ('SINGLE','JOINTLY','EITHER_OR_SURVIVOR','ANYONE_OR_SURVIVOR','FORMER_OR_SURVIVOR','LATTER_OR_SURVIVOR','OTHER')),
  mode_of_operation_raw  text,
  status                 text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','DORMANT','INOPERATIVE','FROZEN','CLOSED','OTHER')),
  status_raw             text,
  freeze_code            text NOT NULL DEFAULT 'NONE' CHECK (freeze_code IN ('NONE','DEBIT','CREDIT','TOTAL')),
  freeze_reason_code     text,
  facility               text NOT NULL DEFAULT 'NONE' CHECK (facility IN ('NONE','OD','CC','SWEEP_IN')),
  branch_name            text,
  branch_ifsc            common.ifsc,
  branch_sol_id          text,
  micr_code              char(9) CHECK (micr_code ~ '^[0-9]{9}$'),
  currency               common.currency NOT NULL DEFAULT 'INR',
  opening_date           date,
  closing_date           date,
  current_balance        common.inr NOT NULL,
  clear_balance          common.inr,
  unclear_balance        common.inr,
  lien_amount            common.inr NOT NULL DEFAULT 0 CHECK (lien_amount >= 0),
  available_balance      common.inr,
  od_sanctioned_limit    common.inr,
  od_available_limit     common.inr,
  interest_rate          common.pct,
  balance_as_of          timestamptz,
  avg_monthly_balance_3m  common.inr,
  avg_monthly_balance_12m common.inr,
  min_balance_12m         common.inr,
  amb_required           common.inr,
  amb_month_to_date      common.inr,
  cheque_facility        boolean,
  nominee_registered     boolean,
  debit_card_linked      boolean,
  last_txn_date          date,
  UNIQUE (account_id, sync_run_id),
  CHECK (closing_date IS NULL OR opening_date IS NULL OR closing_date >= opening_date),
  CHECK (status <> 'CLOSED' OR current_balance = 0)
);
CREATE INDEX account_snapshots_latest ON bank.account_snapshots (account_id, as_of DESC);
COMMENT ON TABLE bank.account_snapshots IS 'Per-run CASA/OD attributes and balances (API 394, AA DEPOSIT Summary, Finacle GAM).';

-- ---------- statement lines (IDBI API 393 / Finacle DTD-HTD / AA Transactions) -------------
CREATE TABLE bank.transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              uuid NOT NULL REFERENCES bank.accounts(id) ON DELETE CASCADE,
  customer_id             uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  source                  common.source NOT NULL,
  first_seen_run_id       uuid NOT NULL REFERENCES staging.sync_runs(id),
  raw_payload_id          uuid REFERENCES staging.raw_payloads(id),
  ingested_at             timestamptz NOT NULL DEFAULT now(),
  -- identity -------------------------------------------------------------------------------
  tran_id                 text NOT NULL,
  part_tran_srl_num       smallint NOT NULL DEFAULT 1,
  dedupe_hash             text NOT NULL CHECK (dedupe_hash ~ '^[0-9a-f]{64}$'),
  -- The statement's own order within a day. Balances only reproduce in this order, and a
  -- bank statement never carries a time of day worth trusting.
  seq                     integer NOT NULL DEFAULT 0,
  -- when -----------------------------------------------------------------------------------
  tran_date               date NOT NULL,
  value_date              date NOT NULL,
  tran_timestamp          timestamptz,
  entry_date              date,
  -- what -----------------------------------------------------------------------------------
  tran_type               text NOT NULL CHECK (tran_type IN ('CREDIT','DEBIT')),
  amount                  common.inr NOT NULL CHECK (amount > 0),
  currency                common.currency NOT NULL DEFAULT 'INR',
  balance_after           common.inr,
  channel_code            text NOT NULL DEFAULT 'OTHER' REFERENCES ref.channel_codes(code),
  channel_raw             text,
  finacle_tran_type       char(1) CHECK (finacle_tran_type IN ('T','C','L')),
  finacle_tran_sub_type   text,
  status                  text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','PENDING','REVERSED','FAILED')),
  narration               text NOT NULL,
  remarks                 text,
  reference               text,
  instrument_number       text CHECK (instrument_number ~ '^[0-9]{6,}$'),
  utr                     text CHECK (utr ~ '^[A-Z0-9]{16}$' OR utr ~ '^[A-Z0-9]{22}$'),
  rrn                     text CHECK (rrn ~ '^[0-9]{12}$'),
  upi_txn_id              text CHECK (upi_txn_id ~ '^[A-Za-z0-9]{4,35}$'),
  counterparty_name       text,
  counterparty_vpa        text,
  counterparty_account_masked text,
  counterparty_ifsc       common.ifsc,
  merchant_name_bank      text,
  mcc                     char(4) CHECK (mcc ~ '^[0-9]{4}$'),
  card_last4              char(4) CHECK (card_last4 ~ '^[0-9]{4}$'),
  terminal_id             text,
  auth_code               text,
  spend_category_bank     text,
  is_salary_credit_bank   boolean,
  is_recurring_bank       boolean,
  is_reversal             boolean NOT NULL DEFAULT false,
  reverses_tran_id        text,
  UNIQUE (account_id, tran_id, part_tran_srl_num),
  UNIQUE (account_id, dedupe_hash),
  CHECK (value_date BETWEEN tran_date - 31 AND tran_date + 31),
  CHECK (NOT is_reversal OR reverses_tran_id IS NOT NULL),
  CHECK (mcc IS NULL OR channel_code IN ('POS','ECOM','ATM','UPI','OTHER'))
);
CREATE INDEX transactions_account_date  ON bank.transactions (account_id, tran_date, seq);
CREATE INDEX transactions_customer_date ON bank.transactions (customer_id, tran_date, seq);
CREATE INDEX transactions_channel       ON bank.transactions (customer_id, channel_code, tran_date DESC);
CREATE INDEX transactions_reversals     ON bank.transactions (account_id, reverses_tran_id) WHERE is_reversal;
DO $$ BEGIN IF common.has_ext('pg_trgm') THEN
  CREATE INDEX transactions_narration_trgm ON bank.transactions USING gin (narration gin_trgm_ops);
END IF; END $$;
COMMENT ON TABLE bank.transactions IS 'Statement lines. Append-only in practice; corrections arrive as reversals. Two idempotency keys: the bank''s tran_id and a content hash.';

-- ---------- term / recurring deposits (Finacle TAM, AA TERM_DEPOSIT & RECURRING_DEPOSIT) ---
CREATE TABLE bank.term_deposit_snapshots (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                     uuid NOT NULL REFERENCES bank.accounts(id) ON DELETE CASCADE,
  sync_run_id                    uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                         common.source NOT NULL,
  as_of                          timestamptz NOT NULL,
  ingested_at                    timestamptz NOT NULL DEFAULT now(),
  raw_payload_id                 uuid REFERENCES staging.raw_payloads(id),
  deposit_type                   text NOT NULL CHECK (deposit_type IN ('FD','RD','TAX_SAVER','SWEEP_IN','SSP','OTHER')),
  deposit_type_raw               text,
  scheme_code                    text,
  description                    text,
  branch_name                    text,
  branch_ifsc                    common.ifsc,
  principal_amount               common.inr NOT NULL CHECK (principal_amount >= 0),
  current_value                  common.inr,
  maturity_amount                common.inr,
  opening_date                   date NOT NULL,
  maturity_date                  date,
  tenure_days                    integer CHECK (tenure_days >= 0),
  tenure_months                  integer CHECK (tenure_months >= 0),
  tenure_years                   integer CHECK (tenure_years >= 0),
  interest_rate                  common.pct NOT NULL,
  interest_payout                text CHECK (interest_payout IN ('MONTHLY','QUARTERLY','HALF_YEARLY','ANNUAL','ON_MATURITY')),
  interest_payout_raw            text,
  interest_computation           text CHECK (interest_computation IN ('SIMPLE','COMPOUND')),
  compounding_frequency          text CHECK (compounding_frequency IN ('MONTHLY','QUARTERLY','HALF_YEARLY','ANNUAL','NONE')),
  interest_periodic_payout_amount common.inr,
  interest_on_maturity           common.inr,
  interest_paid_till_date        common.inr,
  auto_renewal                   text NOT NULL DEFAULT 'NONE' CHECK (auto_renewal IN ('NONE','PRINCIPAL_ONLY','PRINCIPAL_AND_INTEREST')),
  auto_renewal_raw               text,
  linked_operative_account_id    uuid REFERENCES bank.accounts(id),
  lien_amount                    common.inr NOT NULL DEFAULT 0 CHECK (lien_amount >= 0),
  tds_deducted_fytd              common.inr,
  form_15g_15h_submitted         boolean,
  premature_closure_penalty_pct  common.pct,
  status                         text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MATURED','CLOSED','PREMATURELY_CLOSED','RENEWED')),
  recurring_amount               common.inr CHECK (recurring_amount > 0),
  recurring_deposit_day          smallint CHECK (recurring_deposit_day BETWEEN 1 AND 31),
  instalments_paid               smallint CHECK (instalments_paid >= 0),
  instalments_missed             smallint CHECK (instalments_missed >= 0),
  next_instalment_date           date,
  default_fee_fytd               common.inr,
  UNIQUE (account_id, sync_run_id),
  CHECK (maturity_date IS NULL OR maturity_date > opening_date),
  CHECK (deposit_type NOT IN ('RD','SSP') OR (recurring_amount IS NOT NULL AND recurring_deposit_day IS NOT NULL))
);
CREATE INDEX term_deposit_snapshots_maturing ON bank.term_deposit_snapshots (maturity_date) WHERE status = 'ACTIVE';
COMMENT ON TABLE bank.term_deposit_snapshots IS 'FD / RD / tax-saver / sweep-in deposits per run. The maturity date is the reallocation trigger.';

-- ---------- loans (IDBI API 402 / 442, Finacle LAM-LDT-LRS, AA has no loan FI type) ---------
CREATE TABLE bank.loan_snapshots (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                uuid NOT NULL REFERENCES bank.accounts(id) ON DELETE CASCADE,
  sync_run_id               uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                    common.source NOT NULL,
  as_of                     timestamptz NOT NULL,
  ingested_at               timestamptz NOT NULL DEFAULT now(),
  raw_payload_id            uuid REFERENCES staging.raw_payloads(id),
  lender                    text NOT NULL DEFAULT 'IDBI Bank',
  loan_type                 text NOT NULL CHECK (loan_type IN ('HOME','AUTO','TWO_WHEELER','PERSONAL','EDUCATION','GOLD','LOAN_AGAINST_PROPERTY','BUSINESS','SHOP','AGRI','CONSUMER_DURABLE','CREDIT_CARD','OVERDRAFT','OTHER')),
  loan_type_raw             text,
  scheme_code               text,
  sanction_amount           common.inr CHECK (sanction_amount >= 0),
  sanction_date             date,
  disbursed_amount          common.inr CHECK (disbursed_amount >= 0),
  first_disbursement_date   date,
  outstanding_principal     common.inr NOT NULL CHECK (outstanding_principal >= 0),
  interest_accrued          common.inr,
  interest_rate             common.pct NOT NULL,
  rate_type                 text CHECK (rate_type IN ('FIXED','FLOATING','HYBRID')),
  benchmark                 text CHECK (benchmark IN ('REPO','MCLR','EBLR','T_BILL','BASE_RATE','NONE')),
  spread_bps                integer,
  next_reset_date           date,
  emi_amount                common.inr NOT NULL CHECK (emi_amount >= 0),
  emi_due_day               smallint CHECK (emi_due_day BETWEEN 1 AND 31),
  next_emi_date             date,
  emi_frequency             text NOT NULL DEFAULT 'MONTHLY' CHECK (emi_frequency IN ('MONTHLY','QUARTERLY','BULLET')),
  tenure_months             integer CHECK (tenure_months >= 0),
  tenure_remaining_months   integer CHECK (tenure_remaining_months >= 0),
  instalments_paid          integer CHECK (instalments_paid >= 0),
  instalments_total         integer CHECK (instalments_total >= 0),
  dpd                       integer NOT NULL DEFAULT 0 CHECK (dpd >= 0),
  overdue_principal         common.inr NOT NULL DEFAULT 0 CHECK (overdue_principal >= 0),
  overdue_interest          common.inr NOT NULL DEFAULT 0 CHECK (overdue_interest >= 0),
  overdue_charges           common.inr NOT NULL DEFAULT 0 CHECK (overdue_charges >= 0),
  total_overdue             common.inr GENERATED ALWAYS AS (overdue_principal + overdue_interest + overdue_charges) STORED,
  asset_classification      text CHECK (asset_classification IN ('STANDARD','SMA_0','SMA_1','SMA_2','NPA_SUBSTANDARD','NPA_DOUBTFUL','NPA_LOSS')),
  asset_classification_raw  text,
  moratorium_until          date,
  prepayment_allowed        boolean,
  prepayment_penalty_pct    common.pct,
  security_type             text CHECK (security_type IN ('UNSECURED','PROPERTY','VEHICLE','GOLD','DEPOSIT','SHARES','OTHER')),
  co_borrower_present       boolean,
  maturity_date             date,
  status                    text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED','WRITTEN_OFF','SETTLED')),
  is_revolving              boolean NOT NULL DEFAULT false,
  UNIQUE (account_id, sync_run_id),
  CHECK (dpd = 0 OR asset_classification IS NULL OR asset_classification <> 'STANDARD')
);
CREATE INDEX loan_snapshots_latest ON bank.loan_snapshots (account_id, as_of DESC);
CREATE INDEX loan_snapshots_ending ON bank.loan_snapshots (tenure_remaining_months) WHERE status = 'ACTIVE';
COMMENT ON TABLE bank.loan_snapshots IS 'Loan account state per run (API 402 overdues + 442 details). Sources for the prepay-vs-invest and EMI-ending logic.';

CREATE TABLE bank.loan_schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES bank.accounts(id) ON DELETE CASCADE,
  sync_run_id         uuid NOT NULL REFERENCES staging.sync_runs(id),
  instalment_no       integer NOT NULL CHECK (instalment_no >= 1),
  due_date            date NOT NULL,
  emi_amount          common.inr NOT NULL CHECK (emi_amount >= 0),
  principal_component common.inr CHECK (principal_component >= 0),
  interest_component  common.inr CHECK (interest_component >= 0),
  outstanding_after   common.inr CHECK (outstanding_after >= 0),
  paid_on             date,
  paid_amount         common.inr CHECK (paid_amount >= 0),
  status              text NOT NULL CHECK (status IN ('DUE','PAID','PARTIAL','OVERDUE','WAIVED')),
  UNIQUE (account_id, sync_run_id, instalment_no),
  CHECK (status <> 'PAID' OR paid_on IS NOT NULL)
);
COMMENT ON TABLE bank.loan_schedules IS 'Repayment schedule (Finacle LRS). Lets "your EMI ends in March" be read off the bank''s schedule, not inferred.';

-- ---------- standing instructions and mandates (Finacle SIM, NACH/e-NACH, UPI Autopay) ----
CREATE TABLE bank.mandates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  debit_account_id        uuid REFERENCES bank.accounts(id),
  sync_run_id             uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                  common.source NOT NULL,
  as_of                   timestamptz NOT NULL,
  ingested_at             timestamptz NOT NULL DEFAULT now(),
  kind                    text NOT NULL CHECK (kind IN ('SI','NACH','ENACH','UPI_AUTOPAY','ECS')),
  mandate_ref             text NOT NULL,
  umrn                    char(20) CHECK (umrn ~ '^[A-Z0-9]{20}$'),
  sponsor_bank_code       text,
  utility_code            text,
  creditor_name           text,
  purpose_category        text,
  debit_type              text CHECK (debit_type IN ('FIXED','MAXIMUM')),
  amount                  common.inr CHECK (amount > 0),
  max_amount              common.inr CHECK (max_amount > 0),
  frequency               text NOT NULL CHECK (frequency IN ('DAILY','WEEKLY','FORTNIGHTLY','MONTHLY','BIMONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','AS_PRESENTED')),
  debit_day               smallint CHECK (debit_day BETWEEN 1 AND 31),
  start_date              date,
  end_date                date,
  until_cancelled         boolean NOT NULL DEFAULT false,
  next_execution_date     date,
  last_execution_date     date,
  last_execution_status   text CHECK (last_execution_status IN ('SUCCESS','FAILED','RETURNED')),
  failure_count           integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  status                  text NOT NULL CHECK (status IN ('INITIATED','ACTIVE','PAUSED','CANCELLED','EXPIRED','REJECTED','FAILED')),
  auth_mode               text CHECK (auth_mode IN ('PHYSICAL','NETBANKING','DEBIT_CARD','AADHAAR','UPI')),
  linked_loan_account_id  uuid REFERENCES bank.accounts(id),
  linked_sip_registration text,
  UNIQUE (customer_id, kind, mandate_ref, sync_run_id),
  CHECK (kind NOT IN ('NACH','ENACH') OR umrn IS NOT NULL),
  CHECK (debit_type IS DISTINCT FROM 'MAXIMUM' OR max_amount IS NOT NULL),
  CHECK (until_cancelled OR end_date IS NOT NULL OR kind = 'SI'),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX mandates_customer_status ON bank.mandates (customer_id, status);
COMMENT ON TABLE bank.mandates IS 'Standing instructions and NACH / e-NACH / UPI Autopay mandates. The ground truth for "committed" outflows; the engine must still infer from transactions when this is absent.';

-- ---------- mutual funds (AA MUTUAL_FUNDS & SIP; RTA CAS; BSE StAR for orders) -------------
CREATE TABLE bank.mf_holdings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id       uuid NOT NULL REFERENCES staging.sync_runs(id),
  source            common.source NOT NULL,
  as_of             timestamptz NOT NULL,
  ingested_at       timestamptz NOT NULL DEFAULT now(),
  raw_payload_id    uuid REFERENCES staging.raw_payloads(id),
  folio_no          text NOT NULL,
  amc               text NOT NULL,
  amc_code          text,
  registrar         text,
  scheme_code       text,
  scheme_name       text NOT NULL,
  amfi_code         text,
  isin              common.isin,
  ucc               text,
  scheme_plan       text CHECK (scheme_plan IN ('DIRECT','REGULAR')),
  scheme_option     text CHECK (scheme_option IN ('GROWTH','IDCW_PAYOUT','IDCW_REINVEST')),
  scheme_type       text CHECK (scheme_type IN ('EQUITY','DEBT','HYBRID','SOLUTION_ORIENTED','OTHER')),
  scheme_category   text,
  asset_class       text NOT NULL CHECK (asset_class IN ('Equity','Debt','Hybrid','Gold','Cash')),
  holding_mode      text,
  units             common.units NOT NULL CHECK (units >= 0),
  lien_units        common.units CHECK (lien_units >= 0),
  lockin_units      common.units CHECK (lockin_units >= 0),
  nav               common.nav CHECK (nav >= 0),
  nav_date          date,
  avg_cost_nav      common.nav,
  cost_value        common.inr,
  current_value     common.inr,
  fatca_status      text,
  kyc_status        text,
  distributor_arn   text,
  held_via          text NOT NULL DEFAULT 'UNKNOWN' CHECK (held_via IN ('IDBI','OTHER','UNKNOWN')),
  UNIQUE NULLS NOT DISTINCT (customer_id, folio_no, isin, scheme_code, sync_run_id),
  CHECK (units = 0 OR nav IS NULL OR current_value IS NULL OR abs(current_value - units * nav) <= greatest(1, current_value * 0.01))
);
CREATE INDEX mf_holdings_customer ON bank.mf_holdings (customer_id, as_of DESC);
COMMENT ON TABLE bank.mf_holdings IS 'Mutual fund folios per run (AA MUTUAL_FUNDS / RTA CAS). IDBI''s numbered catalogue has no MF API: fixtures until AA or CAS is wired.';

CREATE TABLE bank.sip_registrations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id            uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id            uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                 common.source NOT NULL,
  as_of                  timestamptz NOT NULL,
  ingested_at            timestamptz NOT NULL DEFAULT now(),
  registration_ref       text NOT NULL,
  platform               text CHECK (platform IN ('BSE_STAR','MFU','NSE_NMF','AMC_DIRECT','RTA','OTHER')),
  folio_no               text,
  amc                    text,
  scheme_name            text NOT NULL,
  scheme_code            text,
  amfi_code              text,
  isin                   common.isin,
  -- The engine's view of the scheme (SipContract.assetClass); the AA feed carries it on the
  -- folio, not the registration, so it is denormalised here.
  asset_class            text NOT NULL DEFAULT 'Equity' CHECK (asset_class IN ('Equity','Debt','Hybrid','Protection','Gold')),
  amount                 common.inr NOT NULL CHECK (amount > 0),
  frequency              text NOT NULL CHECK (frequency IN ('DAILY','WEEKLY','FORTNIGHTLY','MONTHLY','QUARTERLY')),
  instalment_day         smallint CHECK (instalment_day BETWEEN 1 AND 31),
  start_date             date,
  end_date               date,
  until_cancelled        boolean NOT NULL DEFAULT false,
  instalments_completed  integer CHECK (instalments_completed >= 0),
  instalments_pending    integer CHECK (instalments_pending >= 0),
  last_instalment_date   date,
  next_instalment_date   date,
  step_up_pct            common.pct,
  mandate_id             uuid REFERENCES bank.mandates(id),
  umrn                   char(20),
  status                 text NOT NULL CHECK (status IN ('ACTIVE','PAUSED','CEASED','COMPLETED','REJECTED')),
  created_on             date,
  modified_on            date,
  ceased_on              date,
  held_via               text NOT NULL DEFAULT 'UNKNOWN' CHECK (held_via IN ('IDBI','OTHER','UNKNOWN')),
  UNIQUE (customer_id, registration_ref, sync_run_id),
  CHECK (status <> 'CEASED' OR ceased_on IS NOT NULL)
);
COMMENT ON TABLE bank.sip_registrations IS 'Live systematic plans (AA SIP). Decides start_sip vs increase_sip, and which days already carry a debit.';

-- ---------- insurance (AA INSURANCE_POLICIES / ULIP; LIC bancassurance feed if any) ----------
CREATE TABLE bank.insurance_policies (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id             uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id             uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                  common.source NOT NULL,
  as_of                   timestamptz NOT NULL,
  ingested_at             timestamptz NOT NULL DEFAULT now(),
  raw_payload_id          uuid REFERENCES staging.raw_payloads(id),
  policy_number           text NOT NULL,
  eia_number              text,
  insurer                 text NOT NULL,
  insurer_code            text,
  plan_name               text NOT NULL,
  plan_code               text,
  policy_description      text,
  policy_type             text NOT NULL CHECK (policy_type IN ('TERM','ENDOWMENT','MONEY_BACK','WHOLE_LIFE','ULIP','ANNUITY','PENSION','HEALTH','PERSONAL_ACCIDENT','MOTOR','HOME','TRAVEL','GROUP','OTHER')),
  policy_type_raw         text,
  cover_type              text NOT NULL CHECK (cover_type IN ('life','health','accident','general')),
  sum_assured             common.inr CHECK (sum_assured >= 0),
  cover_amount            common.inr CHECK (cover_amount >= 0),
  premium_amount          common.inr CHECK (premium_amount >= 0),
  premium_frequency       text CHECK (premium_frequency IN ('SINGLE','MONTHLY','QUARTERLY','HALF_YEARLY','ANNUAL')),
  premium_frequency_raw   text,
  premium_payment_years   integer CHECK (premium_payment_years >= 0),
  premium_payment_months  integer CHECK (premium_payment_months >= 0),
  policy_term_years       integer CHECK (policy_term_years >= 0),
  policy_term_months      integer CHECK (policy_term_months >= 0),
  policy_start_date       date,
  policy_expiry_date      date,
  maturity_date           date,
  next_premium_due_date   date,
  last_premium_paid_on    date,
  grace_period_days       smallint CHECK (grace_period_days >= 0),
  status                  text NOT NULL DEFAULT 'IN_FORCE' CHECK (status IN ('IN_FORCE','LAPSED','PAID_UP','SURRENDERED','MATURED','CLAIMED','FREE_LOOK_CANCELLED','OTHER')),
  status_raw              text,
  maturity_benefit        common.inr,
  surrender_value         common.inr,
  fund_value              common.inr,
  loan_against_policy     common.inr,
  bundles_protection_and_investment boolean GENERATED ALWAYS AS (policy_type IN ('ENDOWMENT','MONEY_BACK','WHOLE_LIFE','ULIP')) STORED,
  riders                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  covers                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  money_backs             jsonb NOT NULL DEFAULT '[]'::jsonb,
  fund_holdings           jsonb NOT NULL DEFAULT '[]'::jsonb,
  sold_via                text NOT NULL DEFAULT 'UNKNOWN' CHECK (sold_via IN ('IDBI_BANCASSURANCE','OTHER','UNKNOWN')),
  life_assured_is_customer boolean,
  UNIQUE (customer_id, insurer, policy_number, sync_run_id),
  CHECK (maturity_date IS NULL OR policy_start_date IS NULL OR maturity_date > policy_start_date),
  CHECK (premium_frequency IS DISTINCT FROM 'SINGLE' OR next_premium_due_date IS NULL)
);
CREATE INDEX insurance_policies_customer ON bank.insurance_policies (customer_id, as_of DESC);
COMMENT ON TABLE bank.insurance_policies IS 'Policies in force per run (AA INSURANCE_POLICIES / ULIP). Protection gap = 10x income - life cover in force here.';

-- ---------- nominees (Finacle ANT, AA Holder.nominee, policy nominees) ---------------------
CREATE TABLE bank.nominees (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id           uuid NOT NULL REFERENCES staging.sync_runs(id),
  account_id            uuid REFERENCES bank.accounts(id) ON DELETE CASCADE,
  policy_number         text,
  folio_no              text,
  nominee_name_masked   text,
  relationship          text NOT NULL DEFAULT 'OTHER' CHECK (relationship IN ('SPOUSE','SON','DAUGHTER','FATHER','MOTHER','BROTHER','SISTER','OTHER')),
  relationship_raw      text,
  share_pct             common.pct NOT NULL DEFAULT 100 CHECK (share_pct > 0 AND share_pct <= 100),
  nomination_type       text NOT NULL DEFAULT 'SIMULTANEOUS' CHECK (nomination_type IN ('SIMULTANEOUS','SUCCESSIVE')),
  nominee_rank          smallint NOT NULL DEFAULT 1 CHECK (nominee_rank BETWEEN 1 AND 4),
  is_minor              boolean NOT NULL DEFAULT false,
  guardian_name_masked  text,
  registered_on         date,
  nomination_ref        text,
  CHECK (num_nonnulls(account_id, policy_number, folio_no) = 1),
  CHECK (NOT is_minor OR guardian_name_masked IS NOT NULL)
);
CREATE INDEX nominees_account ON bank.nominees (account_id);
COMMENT ON TABLE bank.nominees IS 'Nomination on accounts, deposits, policies and folios. Absence is itself a protection insight.';

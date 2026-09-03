-- =====================================================================================
-- Part 2: bank-sourced mirrors. Immutable per sync run; "current" views pick the latest run.
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
  cif                    text NOT NULL,                        -- Finacle cif_id / cust_id
  cust_name              text,                                 -- PII: minimised in the demo, present in production
  date_of_birth          date,                                 -- group 01 date_of_birth; horizon and retirement year
  age                    smallint CHECK (age BETWEEN 0 AND 120), -- group 01 age, when DOB is withheld
  gender                 text CHECK (gender IN ('Male','Female','Other','Undisclosed')),
  gender_raw             text,                                 -- Finacle cust_sex (M/F/O)
  marital_status         text CHECK (marital_status IN ('Single','Married','Widowed','Divorced','Undisclosed')),
  marital_status_raw     text,
  dependents_count       smallint CHECK (dependents_count >= 0),
  employment_type        text CHECK (employment_type IN ('Salaried','Self-employed','Business','Retired','Student','Homemaker','Other')),
  employment_type_raw    text,                                 -- Finacle occupation code
  occupation_code        text,
  declared_annual_income common.inr CHECK (declared_annual_income >= 0),
  income_band            text,                                 -- e.g. '5-10L' when the bank shares a band, not a figure
  constitution           text NOT NULL DEFAULT 'INDIVIDUAL',   -- Finacle cust_const; retail = INDIVIDUAL
  resident_status        text CHECK (resident_status IN ('RESIDENT','NRI','PIO','OCI')),
  pan_present            boolean,                              -- never the PAN itself
  ckyc_compliance        boolean,                              -- AA Holder.ckycCompliance
  kyc_status             text CHECK (kyc_status IN ('VERIFIED','PENDING','REKYC_DUE','EXPIRED','REJECTED')), -- gates every investment action
  kyc_status_raw         text,
  kyc_last_updated_on    date,
  kyc_next_due_on        date,                                 -- RBI periodic updation: 2y high / 8y medium / 10y low risk
  aml_risk_category      text CHECK (aml_risk_category IN ('LOW','MEDIUM','HIGH')),
  risk_profile           text CHECK (risk_profile IN ('Conservative','Balanced','Growth')), -- normalised to the engine's three bands
  risk_profile_raw       text,                                 -- the bank's own label, e.g. 'Moderate'
  risk_profile_date      date,                                 -- stale => re-profile prompt
  customer_since         date,
  home_branch_sol_id     text,                                 -- Finacle sol_id
  home_branch_ifsc       common.ifsc,
  city                   text,
  state_code             char(2) REFERENCES ref.state_codes(state_code),
  pincode                char(6) CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  preferred_language     common.lang_tag,
  mobile_masked          text,
  email_masked           text,
  segment                text,                                 -- 'MASS','MASS_AFFLUENT','HNI','NRI','STAFF','PENSIONER'
  is_staff               boolean,
  nominee_registered     boolean,                              -- AA Holder.nominee REGISTERED/NOT-REGISTERED
  UNIQUE (customer_id, sync_run_id),
  CHECK (date_of_birth IS NULL OR date_of_birth < as_of::date),
  CHECK (date_of_birth IS NOT NULL OR age IS NOT NULL)
);
CREATE INDEX customer_profiles_latest ON bank.customer_profiles (customer_id, as_of DESC);
COMMENT ON TABLE bank.customer_profiles IS 'Versioned mirror of the CIF / customer master (API 456, AA Profile). One row per sync run.';

-- ---------- account identity + versioned attributes ---------------------------------------
-- Identity is stable across runs so transactions can reference it; attributes are per run.
CREATE TABLE bank.accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  account_ref           text NOT NULL,                         -- stable external ref: sha256(foracid) from IDBI, AA linkedAccRef, or fixture id. Never the clear number.
  account_number_masked common.masked_acct NOT NULL,           -- 'XXXXXX7412'
  product_kind          text NOT NULL CHECK (product_kind IN ('CASA','TERM_DEPOSIT','RECURRING_DEPOSIT','LOAN','CREDIT_CARD','OVERDRAFT','PPF','NPS','OTHER')),
  scheme_type           text CHECK (scheme_type IN ('SBA','CAA','TDA','ODA','CCA','LAA','OTHER')), -- Finacle scheme types
  scheme_type_raw       text,
  scheme_code           text,                                  -- bank-configured, e.g. 'SBGEN','SBSAL'
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
  account_type_raw       text,                                 -- AA Summary.type / Finacle schm_code
  is_salary_account      boolean,                              -- payday triggers
  mode_of_operation      text CHECK (mode_of_operation IN ('SINGLE','JOINTLY','EITHER_OR_SURVIVOR','ANYONE_OR_SURVIVOR','FORMER_OR_SURVIVOR','LATTER_OR_SURVIVOR','OTHER')),
  mode_of_operation_raw  text,                                 -- Finacle mode_of_oper_code
  status                 text NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','DORMANT','INOPERATIVE','FROZEN','CLOSED','OTHER')),
  status_raw             text,                                 -- AA StatusTypes / Finacle acct_cls_flg
  freeze_code            text NOT NULL DEFAULT 'NONE' CHECK (freeze_code IN ('NONE','DEBIT','CREDIT','TOTAL')), -- Finacle frez_code D/C/T
  freeze_reason_code     text,
  facility               text NOT NULL DEFAULT 'NONE' CHECK (facility IN ('NONE','OD','CC','SWEEP_IN')), -- AA Summary.facility
  branch_name            text,
  branch_ifsc            common.ifsc,
  branch_sol_id          text,
  micr_code              char(9) CHECK (micr_code ~ '^[0-9]{9}$'),
  currency               common.currency NOT NULL DEFAULT 'INR',
  opening_date           date,
  closing_date           date,
  current_balance        common.inr NOT NULL,                  -- AA currentBalance / Finacle clr_bal_amt
  clear_balance          common.inr,
  unclear_balance        common.inr,                           -- Finacle un_clr_bal_amt (cheques in clearing)
  lien_amount            common.inr NOT NULL DEFAULT 0 CHECK (lien_amount >= 0),
  available_balance      common.inr,                           -- clear - lien + usable limit; bank-computed when supplied
  od_sanctioned_limit    common.inr,                           -- AA drawingLimit
  od_available_limit     common.inr,                           -- AA currentODLimit
  interest_rate          common.pct,
  balance_as_of          timestamptz,                          -- AA balanceDateTime
  avg_monthly_balance_3m  common.inr,                          -- group 02; bank-supplied if present, else app derives
  avg_monthly_balance_12m common.inr,
  min_balance_12m         common.inr,
  amb_required           common.inr,                           -- the bank's minimum average balance for this scheme
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

CREATE TABLE bank.account_holders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES bank.accounts(id) ON DELETE CASCADE,
  sync_run_id   uuid NOT NULL REFERENCES staging.sync_runs(id),
  holder_rank   smallint NOT NULL CHECK (holder_rank >= 1),    -- 1 = primary
  holder_type   text NOT NULL CHECK (holder_type IN ('PRIMARY','JOINT','GUARDIAN','AUTHORISED_SIGNATORY')),
  customer_id   uuid REFERENCES app.customers(id),             -- set when the holder is also our customer
  holder_name_masked text,
  dob           date,
  ckyc_compliance boolean,
  UNIQUE (account_id, sync_run_id, holder_rank)
);

-- ---------- statement lines (IDBI API 393 / Finacle DTD-HTD / AA Transactions) -------------
CREATE TABLE bank.transactions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              uuid NOT NULL REFERENCES bank.accounts(id) ON DELETE CASCADE,
  customer_id             uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE, -- denormalised for RLS and hot filters
  source                  common.source NOT NULL,
  first_seen_run_id       uuid NOT NULL REFERENCES staging.sync_runs(id),
  raw_payload_id          uuid REFERENCES staging.raw_payloads(id),
  ingested_at             timestamptz NOT NULL DEFAULT now(),
  -- identity -------------------------------------------------------------------------------
  tran_id                 text NOT NULL,                       -- group 03 txn_id / AA txnId / Finacle tran_id
  part_tran_srl_num       smallint NOT NULL DEFAULT 1,         -- Finacle leg number; 1 unless the bank exposes legs
  dedupe_hash             text NOT NULL CHECK (dedupe_hash ~ '^[0-9a-f]{64}$'), -- sha256(account_ref|tran_date|value_date|type|amount|narration|balance_after|reference)
  -- when -----------------------------------------------------------------------------------
  tran_date               date NOT NULL,                       -- posting date (Finacle tran_date / pstd_date)
  value_date              date NOT NULL,                       -- AA valueDate; the date interest counts from
  tran_timestamp          timestamptz,                         -- AA transactionTimestamp when the source has a time of day
  entry_date              date,
  -- what -----------------------------------------------------------------------------------
  tran_type               text NOT NULL CHECK (tran_type IN ('CREDIT','DEBIT')),   -- Finacle part_tran_type C/D
  amount                  common.inr NOT NULL CHECK (amount > 0),                 -- always positive; direction is tran_type
  currency                common.currency NOT NULL DEFAULT 'INR',
  balance_after           common.inr,                          -- group 03 balance_after_txn / AA currentBalance per line
  channel_code            text NOT NULL DEFAULT 'OTHER' REFERENCES ref.channel_codes(code), -- group 03 txn_mode, normalised
  channel_raw             text,                                -- AA mode (CASH/ATM/CARD/UPI/FT/OTHERS) or the bank's code
  finacle_tran_type       char(1) CHECK (finacle_tran_type IN ('T','C','L')),      -- Transfer / Cash / Clearing
  finacle_tran_sub_type   text,                                -- CI, BI, NP, NR, EO, EI ...
  status                  text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','PENDING','REVERSED','FAILED')),
  narration               text NOT NULL,                       -- Finacle tran_particular; the raw line, never rewritten
  remarks                 text,                                -- Finacle tran_rmks
  reference               text,                                -- AA reference / Finacle ref_num; generic when the rail is unknown
  instrument_number       text CHECK (instrument_number ~ '^[0-9]{6,}$'), -- cheque number
  utr                     text CHECK (utr ~ '^[A-Z0-9]{16}$' OR utr ~ '^[A-Z0-9]{22}$'), -- NEFT 16 / RTGS 22
  rrn                     text CHECK (rrn ~ '^[0-9]{12}$'),    -- UPI / IMPS retrieval reference number
  upi_txn_id              text CHECK (upi_txn_id ~ '^[A-Za-z0-9]{4,35}$'), -- NPCI: 35 alphanumerics since Feb 2025; older ids were shorter
  counterparty_name       text,
  counterparty_vpa        text,                                -- group 03 counterparty_vpa (hashed/masked acceptable)
  counterparty_account_masked text,
  counterparty_ifsc       common.ifsc,
  merchant_name_bank      text,                                -- group 03 merchant_name, if the bank enriches
  mcc                     char(4) CHECK (mcc ~ '^[0-9]{4}$'),  -- group 03 mcc_code; card rails only
  card_last4              char(4) CHECK (card_last4 ~ '^[0-9]{4}$'),
  terminal_id             text,
  auth_code               text,
  spend_category_bank     text,                                -- group 03 spend_category, if any; ours lives in app.transaction_enrichments
  is_salary_credit_bank   boolean,                             -- group 03 is_salary_credit as *the bank* flags it
  is_recurring_bank       boolean,                             -- group 03 is_recurring as the bank flags it; the engine must still infer
  is_reversal             boolean NOT NULL DEFAULT false,
  reverses_tran_id        text,
  UNIQUE (account_id, tran_id, part_tran_srl_num),
  UNIQUE (account_id, dedupe_hash),
  CHECK (value_date BETWEEN tran_date - 31 AND tran_date + 31),
  CHECK (NOT is_reversal OR reverses_tran_id IS NOT NULL),
  CHECK (mcc IS NULL OR channel_code IN ('POS','ECOM','ATM','UPI','OTHER'))
);
CREATE INDEX transactions_account_date  ON bank.transactions (account_id, tran_date DESC, part_tran_srl_num);
CREATE INDEX transactions_customer_date ON bank.transactions (customer_id, tran_date DESC);
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
  deposit_type                   text NOT NULL CHECK (deposit_type IN ('FD','RD','TAX_SAVER','SWEEP_IN','SSP','OTHER')), -- SSP = IDBI Systematic Savings Plan (an RD)
  deposit_type_raw               text,                         -- AA accountType / Finacle schm_code
  scheme_code                    text,
  description                    text,                         -- AA Summary.description
  branch_name                    text,
  branch_ifsc                    common.ifsc,
  principal_amount               common.inr NOT NULL CHECK (principal_amount >= 0),   -- AA principalAmount
  current_value                  common.inr,                   -- AA currentValue (principal + accrued)
  maturity_amount                common.inr,                   -- AA maturityAmount
  opening_date                   date NOT NULL,                -- AA openingDate
  maturity_date                  date,                         -- AA maturityDate; group 04 maturity_date — a trigger in its own right
  tenure_days                    integer CHECK (tenure_days >= 0),
  tenure_months                  integer CHECK (tenure_months >= 0),
  tenure_years                   integer CHECK (tenure_years >= 0),
  interest_rate                  common.pct NOT NULL,          -- AA interestRate; group 04 interest_rate
  interest_payout                text CHECK (interest_payout IN ('MONTHLY','QUARTERLY','HALF_YEARLY','ANNUAL','ON_MATURITY')), -- AA interestPayout
  interest_payout_raw            text,
  interest_computation           text CHECK (interest_computation IN ('SIMPLE','COMPOUND')),         -- AA interestComputation
  compounding_frequency          text CHECK (compounding_frequency IN ('MONTHLY','QUARTERLY','HALF_YEARLY','ANNUAL','NONE')), -- AA compoundingFrequency
  interest_periodic_payout_amount common.inr,                  -- AA interestPeriodicPayoutAmount
  interest_on_maturity           common.inr,                   -- AA interestOnMaturity
  interest_paid_till_date        common.inr,
  auto_renewal                   text NOT NULL DEFAULT 'NONE' CHECK (auto_renewal IN ('NONE','PRINCIPAL_ONLY','PRINCIPAL_AND_INTEREST')),
  auto_renewal_raw               text,                         -- Finacle U (unlimited) / L (limited)
  linked_operative_account_id    uuid REFERENCES bank.accounts(id), -- where interest / maturity proceeds land
  lien_amount                    common.inr NOT NULL DEFAULT 0 CHECK (lien_amount >= 0),
  tds_deducted_fytd              common.inr,
  form_15g_15h_submitted         boolean,
  premature_closure_penalty_pct  common.pct,
  status                         text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MATURED','CLOSED','PREMATURELY_CLOSED','RENEWED')),
  -- RD-only ----------------------------------------------------------------------------------
  recurring_amount               common.inr CHECK (recurring_amount > 0),          -- AA recurringAmount
  recurring_deposit_day          smallint CHECK (recurring_deposit_day BETWEEN 1 AND 31), -- AA recurringDepositDay
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
  lender                    text NOT NULL DEFAULT 'IDBI Bank', -- other lenders arrive via bureau / AA / customer declaration
  loan_type                 text NOT NULL CHECK (loan_type IN ('HOME','AUTO','TWO_WHEELER','PERSONAL','EDUCATION','GOLD','LOAN_AGAINST_PROPERTY','BUSINESS','SHOP','AGRI','CONSUMER_DURABLE','CREDIT_CARD','OVERDRAFT','OTHER')),
  loan_type_raw             text,                              -- group 05 loan_type as the bank names it ('Home Loan')
  scheme_code               text,
  sanction_amount           common.inr CHECK (sanction_amount >= 0),   -- Finacle sanct_lim
  sanction_date             date,
  disbursed_amount          common.inr CHECK (disbursed_amount >= 0),
  first_disbursement_date   date,
  outstanding_principal     common.inr NOT NULL CHECK (outstanding_principal >= 0), -- group 05
  interest_accrued          common.inr,
  interest_rate             common.pct NOT NULL,               -- group 05 loan_interest_rate; the prepay-vs-invest comparison point
  rate_type                 text CHECK (rate_type IN ('FIXED','FLOATING','HYBRID')),
  benchmark                 text CHECK (benchmark IN ('REPO','MCLR','EBLR','T_BILL','BASE_RATE','NONE')),
  spread_bps                integer,
  next_reset_date           date,
  emi_amount                common.inr NOT NULL CHECK (emi_amount >= 0), -- group 05 emi_amount
  emi_due_day               smallint CHECK (emi_due_day BETWEEN 1 AND 31),
  next_emi_date             date,
  emi_frequency             text NOT NULL DEFAULT 'MONTHLY' CHECK (emi_frequency IN ('MONTHLY','QUARTERLY','BULLET')),
  tenure_months             integer CHECK (tenure_months >= 0),
  tenure_remaining_months   integer CHECK (tenure_remaining_months >= 0), -- group 05; the EMI-ending trigger reads this
  instalments_paid          integer CHECK (instalments_paid >= 0),
  instalments_total         integer CHECK (instalments_total >= 0),
  dpd                       integer NOT NULL DEFAULT 0 CHECK (dpd >= 0), -- group 05 dpd_status; > 0 blocks every investment action
  overdue_principal         common.inr NOT NULL DEFAULT 0 CHECK (overdue_principal >= 0),
  overdue_interest          common.inr NOT NULL DEFAULT 0 CHECK (overdue_interest >= 0),
  overdue_charges           common.inr NOT NULL DEFAULT 0 CHECK (overdue_charges >= 0),
  total_overdue             common.inr GENERATED ALWAYS AS (overdue_principal + overdue_interest + overdue_charges) STORED,
  asset_classification      text CHECK (asset_classification IN ('STANDARD','SMA_0','SMA_1','SMA_2','NPA_SUBSTANDARD','NPA_DOUBTFUL','NPA_LOSS')), -- RBI IRAC buckets
  asset_classification_raw  text,
  moratorium_until          date,
  prepayment_allowed        boolean,
  prepayment_penalty_pct    common.pct,
  security_type             text CHECK (security_type IN ('UNSECURED','PROPERTY','VEHICLE','GOLD','DEPOSIT','SHARES','OTHER')),
  co_borrower_present       boolean,
  maturity_date             date,
  status                    text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED','WRITTEN_OFF','SETTLED')),
  is_revolving              boolean NOT NULL DEFAULT false,    -- Liability.isRevolving: card debt modelled as a liability too
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

-- ---------- cards (separate CMS at most banks; AA has a credit-card "others" schema) --------
CREATE TABLE bank.card_snapshots (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                 uuid NOT NULL REFERENCES bank.accounts(id) ON DELETE CASCADE, -- product_kind = CREDIT_CARD, or the CASA for a debit card
  sync_run_id                uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                     common.source NOT NULL,
  as_of                      timestamptz NOT NULL,
  ingested_at                timestamptz NOT NULL DEFAULT now(),
  raw_payload_id             uuid REFERENCES staging.raw_payloads(id),
  card_type                  text NOT NULL CHECK (card_type IN ('CREDIT','DEBIT')),
  network                    text CHECK (network IN ('VISA','MASTERCARD','RUPAY','AMEX','DINERS','OTHER')),
  variant                    text,
  masked_card_number         text CHECK (masked_card_number ~ '^[0-9]{4,6}[X*]{6,8}[0-9]{4}$' OR masked_card_number ~ '^[X*]{12}[0-9]{4}$'),
  card_last4                 char(4) CHECK (card_last4 ~ '^[0-9]{4}$'),
  is_primary                 boolean NOT NULL DEFAULT true,
  issued_date                date,
  expiry_month               smallint CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year                smallint CHECK (expiry_year BETWEEN 2000 AND 2100),
  status                     text NOT NULL CHECK (status IN ('ACTIVE','BLOCKED','HOTLISTED','EXPIRED','CLOSED')),
  credit_limit               common.inr CHECK (credit_limit >= 0),          -- group 05 credit_card_limit
  cash_limit                 common.inr CHECK (cash_limit >= 0),
  available_credit           common.inr,
  current_outstanding        common.inr,                                    -- group 05 credit_card_outstanding
  last_statement_date        date,
  payment_due_date           date,
  total_due_amount           common.inr,
  min_due_amount             common.inr,
  previous_due_amount        common.inr,
  unbilled_amount            common.inr,
  finance_charges            common.inr,
  loyalty_points             integer CHECK (loyalty_points >= 0),
  revolving_rate_pm          common.pct,                                    -- monthly rate, e.g. 3.49 => ~42% a year
  annual_fee                 common.inr,
  UNIQUE (account_id, sync_run_id),
  CHECK (card_type <> 'CREDIT' OR credit_limit IS NOT NULL),
  CHECK (payment_due_date IS NULL OR last_statement_date IS NULL OR payment_due_date >= last_statement_date)
);
COMMENT ON TABLE bank.card_snapshots IS 'Card state per run. Credit cards also appear in loan_snapshots (is_revolving) so the debt rules see one liability list.';

-- ---------- liens (IDBI API 362 / Finacle ALM) --------------------------------------------
CREATE TABLE bank.liens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES bank.accounts(id) ON DELETE CASCADE,
  sync_run_id    uuid NOT NULL REFERENCES staging.sync_runs(id),
  source         common.source NOT NULL,
  as_of          timestamptz NOT NULL,
  ingested_at    timestamptz NOT NULL DEFAULT now(),
  lien_ref       text NOT NULL,
  lien_amount    common.inr NOT NULL CHECK (lien_amount > 0),
  lien_type      text NOT NULL DEFAULT 'OTHER' CHECK (lien_type IN ('LOAN_COLLATERAL','COURT_ORDER','IT_ATTACHMENT','MIN_BALANCE','CHEQUE_RETURN','SYSTEM','USER','OTHER')),
  reason_code    text,                                         -- Finacle lien reason code, verbatim
  reason_text    text,
  effective_from date,
  expires_on     date,                                         -- Finacle removes the lien automatically after this
  status         text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED','EXPIRED')),
  UNIQUE (account_id, sync_run_id, lien_ref),
  CHECK (expires_on IS NULL OR effective_from IS NULL OR expires_on >= effective_from)
);
COMMENT ON TABLE bank.liens IS 'Liens on CASA / deposits (API 362). A lien makes "idle" balance not idle; the buffer maths must subtract it.';

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
  mandate_ref             text NOT NULL,                       -- Finacle si_srl_num / NPCI mandate reference / UPI mandate id
  umrn                    char(20) CHECK (umrn ~ '^[A-Z0-9]{20}$'), -- NPCI Unique Mandate Reference Number
  sponsor_bank_code       text,                                -- 11-char IFSC/MICR of the sponsor bank
  utility_code            text,                                -- 18-char NPCI utility code of the creditor
  creditor_name           text,                                -- 'AXIS MUTUAL FUND', 'BAJAJ FINANCE LTD', 'NETFLIX'
  purpose_category        text,                                -- NPCI category code / SI purpose
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
  folio_no          text NOT NULL,                             -- AA folioNo
  amc               text NOT NULL,                             -- AA amc
  amc_code          text,
  registrar         text,                                      -- AA registrar: CAMS / KFINTECH
  scheme_code       text,                                      -- AA schemeCode (RTA / BSE code)
  scheme_name       text NOT NULL,                             -- group 04 scheme_or_product_name
  amfi_code         text,                                      -- AA amfiCode
  isin              common.isin,                               -- group 04 isin; overlap analysis
  ucc               text,                                      -- AA ucc (exchange client code)
  scheme_plan       text CHECK (scheme_plan IN ('DIRECT','REGULAR')),          -- AA schemePlan
  scheme_option     text CHECK (scheme_option IN ('GROWTH','IDCW_PAYOUT','IDCW_REINVEST')), -- AA schemeOption / dividendType
  scheme_type       text CHECK (scheme_type IN ('EQUITY','DEBT','HYBRID','SOLUTION_ORIENTED','OTHER')), -- SEBI categorisation (AA schemeTypes)
  scheme_category   text,                                      -- AA schemeCategory: 'Flexi Cap Fund', 'Liquid Fund' ...
  asset_class       text NOT NULL CHECK (asset_class IN ('Equity','Debt','Hybrid','Gold','Cash')), -- group 04 asset_class, the engine's view
  holding_mode      text,                                      -- AA mode (DEMAT / PHYSICAL / SOA)
  units             common.units NOT NULL CHECK (units >= 0),  -- AA units / closingUnits
  lien_units        common.units CHECK (lien_units >= 0),      -- AA lienUnits
  lockin_units      common.units CHECK (lockin_units >= 0),    -- AA lockingUnits (ELSS)
  nav               common.nav CHECK (nav >= 0),               -- AA nav
  nav_date          date,
  avg_cost_nav      common.nav,                                -- AA rate (average purchase rate)
  cost_value        common.inr,                                -- AA Summary.investmentValue; group 04 invested_amount
  current_value     common.inr,                                -- AA Summary.currentValue; group 04 current_value
  fatca_status      text,                                      -- AA FatcaStatus
  kyc_status        text,                                      -- CAS 'KYC OK'
  distributor_arn   text,                                      -- ARN on the folio: IDBI's ARN => held via IDBI
  held_via          text NOT NULL DEFAULT 'UNKNOWN' CHECK (held_via IN ('IDBI','OTHER','UNKNOWN')), -- Holding.heldOutsideIdbi
  UNIQUE NULLS NOT DISTINCT (customer_id, folio_no, isin, scheme_code, sync_run_id),
  CHECK (units = 0 OR nav IS NULL OR current_value IS NULL OR abs(current_value - units * nav) <= greatest(1, current_value * 0.01))
);
CREATE INDEX mf_holdings_customer ON bank.mf_holdings (customer_id, as_of DESC);
COMMENT ON TABLE bank.mf_holdings IS 'Mutual fund folios per run (AA MUTUAL_FUNDS / RTA CAS). IDBI''s numbered catalogue has no MF API: fixtures until AA or CAS is wired.';

CREATE TABLE bank.mf_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id     uuid NOT NULL REFERENCES staging.sync_runs(id),
  source          common.source NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  folio_no        text NOT NULL,
  amc             text,
  scheme_code     text,
  scheme_name     text,
  amfi_code       text,
  isin            common.isin,
  txn_id          text,                                        -- AA txnId
  txn_type        text NOT NULL CHECK (txn_type IN ('PURCHASE','PURCHASE_SIP','REDEMPTION','SWITCH_IN','SWITCH_OUT','IDCW_PAYOUT','IDCW_REINVEST','STT','STAMP_DUTY','TDS','REVERSAL','OTHER')),
  txn_type_raw    text,                                        -- AA type (BUY/SELL) or CAS description
  order_date      date,                                        -- AA orderDate
  execution_date  date NOT NULL,                               -- AA executionDate / CAS date
  nav             common.nav CHECK (nav >= 0),
  nav_date        date,
  units           common.units,
  amount          common.inr,
  stt             common.inr,
  stamp_duty      common.inr,
  lock_in_flag    boolean,
  lock_in_days    integer CHECK (lock_in_days >= 0),
  mode            text,
  narration       text,
  dedupe_hash     text NOT NULL CHECK (dedupe_hash ~ '^[0-9a-f]{64}$'),
  UNIQUE (customer_id, dedupe_hash)
);
CREATE INDEX mf_transactions_folio ON bank.mf_transactions (customer_id, folio_no, execution_date DESC);

CREATE TABLE bank.sip_registrations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id            uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id            uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                 common.source NOT NULL,
  as_of                  timestamptz NOT NULL,
  ingested_at            timestamptz NOT NULL DEFAULT now(),
  registration_ref       text NOT NULL,                        -- BSE RegId / RTA SIP registration number
  platform               text CHECK (platform IN ('BSE_STAR','MFU','NSE_NMF','AMC_DIRECT','RTA','OTHER')),
  folio_no               text,
  amc                    text,
  scheme_name            text NOT NULL,
  scheme_code            text,
  amfi_code              text,
  isin                   common.isin,
  amount                 common.inr NOT NULL CHECK (amount > 0),        -- AA Holding.amount; group 04 sip_amount
  frequency              text NOT NULL CHECK (frequency IN ('DAILY','WEEKLY','FORTNIGHTLY','MONTHLY','QUARTERLY')), -- AA frequency
  instalment_day         smallint CHECK (instalment_day BETWEEN 1 AND 31), -- AA instalmentDay; group 04 sip_debit_day
  start_date             date,                                 -- AA Investment.startDate
  end_date               date,                                 -- AA Investment.endDate
  until_cancelled        boolean NOT NULL DEFAULT false,
  instalments_completed  integer CHECK (instalments_completed >= 0),   -- AA completeInstalments
  instalments_pending    integer CHECK (instalments_pending >= 0),     -- AA pendingInstalments
  last_instalment_date   date,                                 -- AA lastInstalmentDate
  next_instalment_date   date,                                 -- AA nextInstalmentDate
  step_up_pct            common.pct,
  mandate_id             uuid REFERENCES bank.mandates(id),
  umrn                   char(20),
  status                 text NOT NULL CHECK (status IN ('ACTIVE','PAUSED','CEASED','COMPLETED','REJECTED')), -- group 04 sip_active = (status = 'ACTIVE')
  created_on             date,                                 -- AA creationDate
  modified_on            date,                                 -- AA modificationDate
  ceased_on              date,                                 -- AA ceasedDate
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
  policy_number           text NOT NULL,                       -- AA policyNumber
  eia_number              text,                                -- AA eiaNumber (e-Insurance Account)
  insurer                 text NOT NULL,                       -- group 04 insurer_name
  insurer_code            text,
  plan_name               text NOT NULL,                       -- AA policyName; group 04 scheme_or_product_name
  plan_code               text,
  policy_description      text,                                -- AA policyDescription
  policy_type             text NOT NULL CHECK (policy_type IN ('TERM','ENDOWMENT','MONEY_BACK','WHOLE_LIFE','ULIP','ANNUITY','PENSION','HEALTH','PERSONAL_ACCIDENT','MOTOR','HOME','TRAVEL','GROUP','OTHER')), -- group 04 policy_type
  policy_type_raw         text,                                -- AA policyType
  cover_type              text NOT NULL CHECK (cover_type IN ('life','health','accident','general')), -- AA coverType, normalised to the engine's coverType
  sum_assured             common.inr CHECK (sum_assured >= 0), -- AA sumAssured; group 04 sum_assured
  cover_amount            common.inr CHECK (cover_amount >= 0),-- AA coverAmount
  premium_amount          common.inr CHECK (premium_amount >= 0), -- AA premiumAmount; group 04 premium_amount
  premium_frequency       text CHECK (premium_frequency IN ('SINGLE','MONTHLY','QUARTERLY','HALF_YEARLY','ANNUAL')), -- AA premiumFrequency
  premium_frequency_raw   text,
  premium_payment_years   integer CHECK (premium_payment_years >= 0),  -- AA premiumPaymentYears
  premium_payment_months  integer CHECK (premium_payment_months >= 0), -- AA premiumPaymentMonths
  policy_term_years       integer CHECK (policy_term_years >= 0),      -- AA tenureYears
  policy_term_months      integer CHECK (policy_term_months >= 0),     -- AA tenureMonths
  policy_start_date       date,                                -- AA policyStartDate
  policy_expiry_date      date,                                -- AA policyExpiryDate
  maturity_date           date,                                -- AA maturityDate; group 04 maturity_date
  next_premium_due_date   date,                                -- AA nextPremiumDueDate
  last_premium_paid_on    date,
  grace_period_days       smallint CHECK (grace_period_days >= 0),
  status                  text NOT NULL DEFAULT 'IN_FORCE' CHECK (status IN ('IN_FORCE','LAPSED','PAID_UP','SURRENDERED','MATURED','CLAIMED','FREE_LOOK_CANCELLED','OTHER')),
  status_raw              text,
  maturity_benefit        common.inr,                          -- AA maturityBenefit
  surrender_value         common.inr,
  fund_value              common.inr,                          -- ULIP current fund value
  loan_against_policy     common.inr,
  bundles_protection_and_investment boolean GENERATED ALWAYS AS (policy_type IN ('ENDOWMENT','MONEY_BACK','WHOLE_LIFE','ULIP')) STORED, -- what BUNDLED_PROTECTION reads
  riders                  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- AA Riders[]: riderType, sumAssured, premiumAmount ...
  covers                  jsonb NOT NULL DEFAULT '[]'::jsonb,  -- AA Covers[]
  money_backs             jsonb NOT NULL DEFAULT '[]'::jsonb,  -- AA MoneyBacks[]
  fund_holdings           jsonb NOT NULL DEFAULT '[]'::jsonb,  -- AA ULIP Holding[]: name, type, units, cost, nav, allocationPercentage, currentValue
  sold_via                text NOT NULL DEFAULT 'UNKNOWN' CHECK (sold_via IN ('IDBI_BANCASSURANCE','OTHER','UNKNOWN')),
  life_assured_is_customer boolean,
  UNIQUE (customer_id, insurer, policy_number, sync_run_id),
  CHECK (maturity_date IS NULL OR policy_start_date IS NULL OR maturity_date > policy_start_date),
  CHECK (premium_frequency IS DISTINCT FROM 'SINGLE' OR next_premium_due_date IS NULL)
);
CREATE INDEX insurance_policies_customer ON bank.insurance_policies (customer_id, as_of DESC);
COMMENT ON TABLE bank.insurance_policies IS 'Policies in force per run (AA INSURANCE_POLICIES / ULIP). Protection gap = 10x income - life cover in force here.';

CREATE TABLE bank.insurance_transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id    uuid NOT NULL REFERENCES staging.sync_runs(id),
  source         common.source NOT NULL,
  ingested_at    timestamptz NOT NULL DEFAULT now(),
  insurer        text NOT NULL,
  policy_number  text NOT NULL,
  txn_id         text,
  txn_date       date NOT NULL,
  txn_type       text NOT NULL CHECK (txn_type IN ('PREMIUM','CHARGE_ADJUSTMENT','CREDIT_ADJUSTMENT','CLAIM','SURRENDER','LOAN','BONUS','OTHER')),
  amount         common.inr NOT NULL,
  narration      text,
  dedupe_hash    text NOT NULL CHECK (dedupe_hash ~ '^[0-9a-f]{64}$'),
  UNIQUE (customer_id, dedupe_hash)
);

-- ---------- NPS (AA NPS) --------------------------------------------------------------------
CREATE TABLE bank.nps_accounts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id              uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id              uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                   common.source NOT NULL,
  as_of                    timestamptz NOT NULL,
  ingested_at              timestamptz NOT NULL DEFAULT now(),
  pran                     char(12) NOT NULL CHECK (pran ~ '^[0-9]{12}$'),
  status                   text,                               -- AA Summary.status
  tier1_status             text,                               -- AA tier1Status
  tier2_status             text,                               -- AA tier2Status
  opening_date             date,
  current_value            common.inr,                         -- AA currentValue
  tier1_scheme_preference  text CHECK (tier1_scheme_preference IN ('AUTO','ACTIVE')), -- AA schemePreferenceType
  tier1_investment_cost    common.inr,
  tier1_investment_value   common.inr,
  tier2_scheme_preference  text CHECK (tier2_scheme_preference IN ('AUTO','ACTIVE')),
  tier2_investment_cost    common.inr,
  tier2_investment_value   common.inr,
  equity_asset_value       common.inr,                         -- AA equityAssetValue
  debt_asset_value         common.inr,                         -- AA debtAssetValue
  other_asset_value        common.inr,                         -- AA otherAssetValue
  pfm_name                 text,                               -- AA SchemeChoice.pfmName
  scheme_choices           jsonb NOT NULL DEFAULT '[]'::jsonb, -- AA SchemeChoice[]: schemeId, schemeName, allocationPercent
  holdings                 jsonb NOT NULL DEFAULT '[]'::jsonb, -- AA Tier1Holding / Tier2Holding rows
  last_contribution_date   date,
  UNIQUE (customer_id, pran, sync_run_id)
);

-- ---------- government small-savings schemes held via the bank (PPF, SSY, SCSS, APY) -------
CREATE TABLE bank.govt_scheme_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  account_id           uuid REFERENCES bank.accounts(id),      -- when the bank exposes it as an account
  sync_run_id          uuid NOT NULL REFERENCES staging.sync_runs(id),
  source               common.source NOT NULL,
  as_of                timestamptz NOT NULL,
  ingested_at          timestamptz NOT NULL DEFAULT now(),
  scheme               text NOT NULL CHECK (scheme IN ('PPF','SSY','SCSS','APY','KVP','NSC','OTHER')),
  account_ref          text NOT NULL,
  agency_bank_ifsc     common.ifsc,
  opening_date         date,
  maturity_date        date,                                   -- PPF: 15 years, extendable in 5-year blocks
  current_balance      common.inr,                             -- AA PPF Summary.currentBalance
  interest_rate        common.pct,
  fy_contribution      common.inr,
  fy_contribution_cap  common.inr,                             -- PPF ₹1.5 lakh
  extension_count      smallint CHECK (extension_count >= 0),
  status               text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','MATURED','EXTENDED','CLOSED','DISCONTINUED')),
  UNIQUE (customer_id, scheme, account_ref, sync_run_id)
);

-- ---------- equities / ETFs (AA EQUITIES, ETF) — thin, for the net-worth view only ----------
CREATE TABLE bank.equity_holdings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id       uuid NOT NULL REFERENCES staging.sync_runs(id),
  source            common.source NOT NULL,
  as_of             timestamptz NOT NULL,
  ingested_at       timestamptz NOT NULL DEFAULT now(),
  instrument_kind   text NOT NULL CHECK (instrument_kind IN ('EQUITY','ETF')),
  demat_id          text,                                      -- AA Holder.dematId
  dp_id             text,                                      -- AA ETF dpId
  isin              common.isin NOT NULL,
  issuer_name       text,                                      -- AA issuerName / schemeName
  description       text,
  units             common.units NOT NULL CHECK (units >= 0),
  avg_cost_rate     common.nav,                                -- AA rate
  last_traded_price common.nav,                                -- AA lastTradedPrice / nav
  current_value     common.inr,
  UNIQUE NULLS NOT DISTINCT (customer_id, demat_id, isin, sync_run_id)
);

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
  nomination_type       text NOT NULL DEFAULT 'SIMULTANEOUS' CHECK (nomination_type IN ('SIMULTANEOUS','SUCCESSIVE')), -- Banking Laws (Amendment) Act 2025: up to four nominees
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

-- ---------- pre-computed behavioural signals, if the bank supplies them (group 07) ----------
CREATE TABLE bank.behavioural_signals (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id               uuid NOT NULL REFERENCES staging.sync_runs(id),
  source                    common.source NOT NULL,
  as_of                     timestamptz NOT NULL,
  ingested_at               timestamptz NOT NULL DEFAULT now(),
  avg_monthly_surplus_3m    common.inr,
  salary_credit_amount      common.inr,
  salary_credit_day         smallint CHECK (salary_credit_day BETWEEN 1 AND 31),
  avg_monthly_inflow_3m     common.inr,
  avg_monthly_outflow_3m    common.inr,
  surplus_volatility_pct    common.pct,
  spend_by_category_12m     jsonb,                             -- {"Food":184000,"Rent":420000}
  discretionary_spend_pct   common.pct,
  recurring_debit_total     common.inr,
  emi_to_income_ratio_pct   common.pct,
  savings_rate_pct          common.pct,
  emergency_fund_months     numeric(6,2),
  inflow_stability_score    numeric(4,3) CHECK (inflow_stability_score BETWEEN 0 AND 1),
  balance_trend_6m_pct      common.pct,
  investment_to_networth_pct common.pct,
  first_investment_date     date,
  UNIQUE (customer_id, sync_run_id)
);
COMMENT ON TABLE bank.behavioural_signals IS 'Group 07 as supplied by the bank. The engine recomputes every one of these from bank.transactions; when both exist the audit record says which was used.';

-- ---------- AA consent artefact mirror (ReBIT ConsentDetail) -------------------------------
CREATE TABLE bank.aa_consent_artefacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id          uuid NOT NULL REFERENCES app.consents(id) ON DELETE CASCADE,
  aa_id               text NOT NULL,                           -- 'onemoney', 'finvu', 'setu-aa' ...
  consent_handle      text,                                    -- temporary handle returned by POST /Consent
  aa_consent_id       text UNIQUE,                             -- permanent consentId once approved
  fiu_id              text NOT NULL,                           -- our FIU id with the AA
  fip_ids             text[] NOT NULL DEFAULT '{}',            -- 'IDBI-FIP' plus any others linked
  vua                 text,                                    -- virtual user address: '98XXXXXX10@onemoney'
  consent_mode        text NOT NULL CHECK (consent_mode IN ('VIEW','STORE','QUERY','STREAM')),
  fetch_type          text NOT NULL CHECK (fetch_type IN ('ONETIME','PERIODIC')),
  consent_types       text[] NOT NULL CHECK (consent_types <@ ARRAY['PROFILE','SUMMARY','TRANSACTIONS']::text[]),
  fi_types            text[] NOT NULL CHECK (fi_types <@ ARRAY[
                        'DEPOSIT','TERM_DEPOSIT','RECURRING_DEPOSIT','SIP','CP','GOVT_SECURITIES','EQUITIES','BONDS','DEBENTURES',
                        'MUTUAL_FUNDS','ETF','IDR','CIS','AIF','INSURANCE_POLICIES','NPS','INVIT','REIT','OTHER',
                        'LIFE_INSURANCE','GENERAL_INSURANCE','GSTR1_3B']::text[]),
  purpose_code        text NOT NULL CHECK (purpose_code IN ('101','102','103','104','105')),
  purpose_text        text,
  purpose_category    text,
  fi_data_range_from  timestamptz NOT NULL,
  fi_data_range_to    timestamptz NOT NULL,
  data_life_unit      text NOT NULL CHECK (data_life_unit IN ('DAY','MONTH','YEAR','INF')),
  data_life_value     integer NOT NULL CHECK (data_life_value >= 0),
  frequency_unit      text CHECK (frequency_unit IN ('HOUR','DAY','MONTH','YEAR','INF')),
  frequency_value     integer CHECK (frequency_value >= 0),
  data_filters        jsonb NOT NULL DEFAULT '[]'::jsonb,      -- [{type: TRANSACTIONTYPE|TRANSACTIONAMOUNT, operator, value}]
  consent_start       timestamptz NOT NULL,
  consent_expiry      timestamptz NOT NULL,
  status              text NOT NULL CHECK (status IN ('PENDING','ACTIVE','PAUSED','REVOKED','EXPIRED','REJECTED','FAILED')),
  signed_consent      text,                                    -- the JWS as received; the legal artefact
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  row_version         integer NOT NULL DEFAULT 1,
  CHECK (consent_expiry > consent_start),
  CHECK (fi_data_range_to >= fi_data_range_from),
  CHECK (fetch_type = 'ONETIME' OR frequency_unit IS NOT NULL)
);
CREATE TRIGGER aa_consent_artefacts_touch BEFORE UPDATE ON bank.aa_consent_artefacts
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();
COMMENT ON TABLE bank.aa_consent_artefacts IS 'Mirror of the ReBIT ConsentDetail plus the AA''s identifiers. app.consents is our ledger; this is the artefact.';

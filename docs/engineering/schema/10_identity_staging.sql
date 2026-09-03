-- =====================================================================================
-- Part 1: customer identity, consent ledger, and the staging layer every payload lands in
-- =====================================================================================

-- ---------- app.customers: the one stable identity everything hangs off ---------------
-- The CIF is IDBI's key and the request parameter for every sandbox call; the uuid is ours so a
-- CIF re-issue, a masked CIF, or a fixtures customer without one never ripples through 50 tables.
CREATE TABLE app.customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cif               text UNIQUE,                                -- 'IDBI0009182731'; NULL only for a customer who has not linked a bank yet
  cust_id           text NOT NULL UNIQUE,                       -- app handle: 'demo-rohan' (types.ts custId)
  display_name      text NOT NULL,
  preferred_language common.lang_tag NOT NULL DEFAULT 'en-IN',
  tax_regime        text CHECK (tax_regime IN ('old','new')),   -- ours, not the bank's: asked or inferred; gates ELSS
  retirement_age    smallint NOT NULL DEFAULT 60 CHECK (retirement_age BETWEEN 45 AND 75),
  data_source       common.source NOT NULL DEFAULT 'fixtures',  -- where this customer's bank data comes from today
  onboarding_state  text NOT NULL DEFAULT 'new'
                    CHECK (onboarding_state IN ('new','consented','goal_set','diagnosed','active','paused','closed')),
  last_seen_at      timestamptz,                                -- drives DailyPlan.since
  erased_at         timestamptz,                                -- DPDP erasure: children cascade, row stays as a tombstone
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  row_version       integer NOT NULL DEFAULT 1
);
CREATE TRIGGER customers_touch BEFORE UPDATE ON app.customers
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

-- ---------- app.consents: not a boolean -------------------------------------------------
-- One row per consent artefact, bank-issued or AA. Every sync run, every snapshot and every
-- audit record points at one of these, which is what makes "we had consent" provable per row.
CREATE TABLE app.consents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  consent_reference  text NOT NULL UNIQUE,                      -- 'CONS_SYN_982731' / 'CONS_AA_982731'; echoed on every response
  kind               text NOT NULL CHECK (kind IN ('bank_issued','aa','synthetic')),
  purpose_code       text NOT NULL DEFAULT '101' CHECK (purpose_code IN ('101','102','103','104','105')), -- AA purpose codes; 101 = wealth management
  purpose_text       text NOT NULL DEFAULT 'Wealth advisory',
  scopes             text[] NOT NULL                             -- the sandbox data_blocks selector
                     CHECK (scopes <@ ARRAY['PROFILE','ACCOUNTS','TXN','HOLDINGS','LIABILITIES','SHELF','SIGNALS']::text[]
                            AND cardinality(scopes) > 0),
  fi_types           text[] NOT NULL DEFAULT '{}',              -- AA fiTypes requested, when kind = 'aa'
  data_period_from   date NOT NULL,
  data_period_to     date NOT NULL,
  fetch_type         text NOT NULL DEFAULT 'PERIODIC' CHECK (fetch_type IN ('ONETIME','PERIODIC')),
  frequency_unit     text CHECK (frequency_unit IN ('HOUR','DAY','MONTH','YEAR','INF')),
  frequency_value    integer CHECK (frequency_value > 0),
  data_life_unit     text CHECK (data_life_unit IN ('DAY','MONTH','YEAR','INF')),
  data_life_value    integer CHECK (data_life_value > 0),
  status             text NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','ACTIVE','PAUSED','REVOKED','EXPIRED','REJECTED')),
  granted_at         timestamptz,
  valid_from         timestamptz NOT NULL DEFAULT now(),
  valid_to           timestamptz NOT NULL,                      -- advice generation halts here, it does not degrade silently
  revoked_at         timestamptz,
  revocation_reason  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  row_version        integer NOT NULL DEFAULT 1,
  CHECK (valid_to > valid_from),
  CHECK (data_period_to >= data_period_from),
  CHECK (status <> 'REVOKED' OR revoked_at IS NOT NULL),
  CHECK (status <> 'ACTIVE'  OR granted_at IS NOT NULL),
  CHECK (fetch_type = 'ONETIME' OR frequency_unit IS NOT NULL)
);
CREATE INDEX consents_customer_status ON app.consents (customer_id, status);
CREATE TRIGGER consents_touch BEFORE UPDATE ON app.consents
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

-- Consent history is append-only; the current state lives on app.consents.
CREATE TABLE app.consent_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  consent_id  uuid NOT NULL REFERENCES app.consents(id) ON DELETE CASCADE,
  event       text NOT NULL CHECK (event IN ('requested','granted','paused','resumed','revoked','expired','rejected','used')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor       text NOT NULL CHECK (actor IN ('customer','system','bank','aa')),
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb                -- e.g. {"endpoint":"393","sync_run_id":"..."} on 'used'
);
CREATE INDEX consent_events_consent ON app.consent_events (consent_id, occurred_at);
CREATE TRIGGER consent_events_immutable BEFORE UPDATE OR DELETE ON app.consent_events
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();

-- ---------- staging: the only place an unknown shape is allowed to land ------------------
-- Endpoint registry: what we call, what it returns, which projector owns it. IDBI's numbered
-- catalogue (393/394/362/402/442/456), AA FI types and the fixtures generator all register here.
CREATE TABLE staging.endpoint_registry (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           common.source NOT NULL,
  endpoint_code    text NOT NULL,                               -- '393', 'FI/DEPOSIT', 'fixtures/customer-file'
  name             text NOT NULL,
  api_version      text NOT NULL DEFAULT 'unknown',
  http_method      text CHECK (http_method IN ('GET','POST')),
  path_template    text,                                        -- filled in when the sandbox spec arrives
  request_schema   jsonb,                                       -- JSON schema of the request we send
  response_sample  jsonb,                                       -- one redacted real response, kept for projector tests
  projector        text,                                        -- 'projectStatement393@2' — the code that maps payload -> bank.*
  status           text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','live','deprecated')),
  verified         boolean NOT NULL DEFAULT false,              -- false until we have seen a real response
  notes            text,
  UNIQUE (source, endpoint_code, api_version)
);

-- Declarative field mappings: payload path -> table.column with a named transform. A new IDBI
-- field is a new row here plus (maybe) a nullable column, never a rewrite.
CREATE TABLE staging.field_mappings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id    uuid NOT NULL REFERENCES staging.endpoint_registry(id) ON DELETE CASCADE,
  source_path    text NOT NULL,                                 -- JSONPath: '$.transactions[*].txn_date'
  target_table   text NOT NULL,                                 -- 'bank.transactions'
  target_column  text NOT NULL,                                 -- 'value_date'
  transform      text NOT NULL DEFAULT 'identity',              -- 'ddmmyy_to_date','paise_to_inr','upper','mask_account','code_map:txn_mode'
  required       boolean NOT NULL DEFAULT false,
  notes          text,
  UNIQUE (endpoint_id, source_path, target_table, target_column)
);

-- One sync run = one consented pull for one customer. Every bank.* row carries the run that
-- produced it; the run carries the consent and the freshness date the response declared.
CREATE TABLE staging.sync_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  consent_id          uuid NOT NULL REFERENCES app.consents(id),
  source              common.source NOT NULL,
  trigger             text NOT NULL CHECK (trigger IN ('manual','schedule','consent_granted','demo_clock','backfill')),
  data_blocks         text[] NOT NULL DEFAULT '{}',             -- what was asked for
  data_period_from    date,
  data_period_to      date,
  data_freshness_date date,                                     -- group 08: through which the feed is considered available
  as_of               timestamptz NOT NULL,                     -- business time the mirrored rows represent
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  status              text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','partial','failed')),
  response_status     text,                                     -- group 08 response_status
  error_code          text,                                     -- group 08 error_code, e.g. CONSENT_EXPIRED
  error_detail        text,
  engine_version      text REFERENCES ref.engine_versions(version),
  CHECK (finished_at IS NULL OR finished_at >= started_at),
  CHECK (status = 'running' OR finished_at IS NOT NULL)
);
CREATE INDEX sync_runs_customer ON staging.sync_runs (customer_id, as_of DESC);

-- No data is pulled without an active, unexpired consent for the same customer. Enforced in the
-- database so no code path, including a replay, can forget it.
CREATE OR REPLACE FUNCTION staging.sync_runs_require_consent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c app.consents%ROWTYPE;
BEGIN
  SELECT * INTO c FROM app.consents WHERE id = NEW.consent_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'sync_run: unknown consent %', NEW.consent_id; END IF;
  IF c.customer_id <> NEW.customer_id THEN RAISE EXCEPTION 'sync_run: consent % belongs to another customer', c.consent_reference; END IF;
  IF c.status <> 'ACTIVE' OR c.valid_to <= NEW.started_at THEN
    RAISE EXCEPTION 'sync_run: consent % is % (valid_to %)', c.consent_reference, c.status, c.valid_to
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_runs_require_consent BEFORE INSERT ON staging.sync_runs
  FOR EACH ROW EXECUTE FUNCTION staging.sync_runs_require_consent();

-- Raw payloads, verbatim and immutable. Keyed by content hash so a re-sync that returns the
-- same bytes is a no-op (ON CONFLICT DO NOTHING) and a replay is always possible.
CREATE TABLE staging.raw_payloads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id     uuid NOT NULL REFERENCES staging.sync_runs(id) ON DELETE CASCADE,
  endpoint_id     uuid REFERENCES staging.endpoint_registry(id),
  source          common.source NOT NULL,
  endpoint_code   text NOT NULL,
  customer_id     uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  request_params  jsonb NOT NULL DEFAULT '{}'::jsonb,           -- customer_id, consent_id, data_period_*, data_blocks (secrets stripped)
  http_status     smallint,
  response_status text,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  payload         jsonb NOT NULL,                               -- the body as received; XML (AA) is converted to JSON by the adapter, original kept in payload_text
  payload_text    text,                                         -- original bytes when not JSON (AA FI XML)
  payload_hash    text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  payload_bytes   integer NOT NULL CHECK (payload_bytes >= 0),
  contains_pii    boolean NOT NULL DEFAULT true,
  purge_after     timestamptz,                                  -- AA DataLife / DPDP retention; a job deletes, nothing else may
  UNIQUE (source, endpoint_code, payload_hash)
);
CREATE INDEX raw_payloads_run ON staging.raw_payloads (sync_run_id);
CREATE INDEX raw_payloads_customer_time ON staging.raw_payloads (customer_id, fetched_at DESC);
CREATE INDEX raw_payloads_payload_gin ON staging.raw_payloads USING gin (payload jsonb_path_ops);
-- Immutable except for the retention job, which runs as a role that owns the table.
CREATE TRIGGER raw_payloads_immutable BEFORE UPDATE ON staging.raw_payloads
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();

-- Projection bookkeeping: which projector version has been applied to which payload. Re-running
-- a *new* projector version over old payloads is how a schema change becomes a replay.
CREATE TABLE staging.projections (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raw_payload_id    uuid NOT NULL REFERENCES staging.raw_payloads(id) ON DELETE CASCADE,
  projector         text NOT NULL,                              -- 'projectStatement393'
  projector_version text NOT NULL,                              -- '2'
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','projected','failed','skipped')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  rows_upserted     integer CHECK (rows_upserted >= 0),
  unmapped_paths    text[] NOT NULL DEFAULT '{}',               -- payload keys the projector did not know: the to-do list for field_mappings
  error             text,
  UNIQUE (raw_payload_id, projector, projector_version)
);

-- ---------- seed: what we expect to call --------------------------------------------------
INSERT INTO ref.engine_versions (version, notes) VALUES ('2026.09.03-schema-v1', 'Schema proposal baseline');

INSERT INTO staging.endpoint_registry (source, endpoint_code, name, projector, status, verified, notes) VALUES
  ('idbi_api', '456', 'Customer master (CIF)',        'projectCustomerMaster456', 'planned', false, 'Numbered catalogue seen in team notes; not publicly corroborated'),
  ('idbi_api', '394', 'Accounts',                     'projectAccounts394',       'planned', false, 'Numbered catalogue seen in team notes; not publicly corroborated'),
  ('idbi_api', '393', 'Account statement',            'projectStatement393',      'planned', false, 'Numbered catalogue seen in team notes; not publicly corroborated'),
  ('idbi_api', '362', 'Liens',                        'projectLiens362',          'planned', false, 'Numbered catalogue seen in team notes; not publicly corroborated'),
  ('idbi_api', '402', 'Loan overdues',                'projectLoanOverdues402',   'planned', false, 'Numbered catalogue seen in team notes; not publicly corroborated'),
  ('idbi_api', '442', 'Loan account details (assumed)','projectLoans442',         'planned', false, 'Mentioned alongside 402 in the archived prototype; purpose assumed'),
  ('aa', 'FI/DEPOSIT',            'AA FI fetch: DEPOSIT',            'projectAaDeposit',       'planned', false, 'ReBIT deposit.xsd'),
  ('aa', 'FI/TERM_DEPOSIT',       'AA FI fetch: TERM_DEPOSIT',       'projectAaTermDeposit',   'planned', false, 'ReBIT term_deposit.xsd'),
  ('aa', 'FI/RECURRING_DEPOSIT',  'AA FI fetch: RECURRING_DEPOSIT',  'projectAaRecurringDeposit','planned', false, 'ReBIT recurring_deposit.xsd'),
  ('aa', 'FI/SIP',                'AA FI fetch: SIP',                'projectAaSip',           'planned', false, 'ReBIT sip.xsd'),
  ('aa', 'FI/MUTUAL_FUNDS',       'AA FI fetch: MUTUAL_FUNDS',       'projectAaMutualFunds',   'planned', false, 'ReBIT mutual_funds.xsd'),
  ('aa', 'FI/INSURANCE_POLICIES', 'AA FI fetch: INSURANCE_POLICIES', 'projectAaInsurance',     'planned', false, 'ReBIT insurance_policies.xsd'),
  ('aa', 'FI/NPS',                'AA FI fetch: NPS',                'projectAaNps',           'planned', false, 'ReBIT nps.xsd'),
  ('aa', 'FI/EQUITIES',           'AA FI fetch: EQUITIES',           'projectAaEquities',      'planned', false, 'ReBIT equities.xsd'),
  ('fixtures', 'fixtures/customer-file', 'Synthetic CustomerFile from @dhan/fixtures', 'projectFixturesCustomerFile', 'live', true, 'Writes through the same staging path so the pipeline is exercised daily');

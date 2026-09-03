-- =====================================================================================
-- 0003  Staging: the only place an unknown shape is allowed to land.
--
-- From docs/engineering/schema/10_identity_staging.sql. The identity tables these reference
-- (app.customers, app.consents) arrive in 0004, so the foreign keys from staging into app are
-- added there; the consent trigger is created here and only ever fires after 0004 has run.
-- =====================================================================================

-- Endpoint registry: what we call, what it returns, which projector owns it.
CREATE TABLE staging.endpoint_registry (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           common.source NOT NULL,
  endpoint_code    text NOT NULL,
  name             text NOT NULL,
  api_version      text NOT NULL DEFAULT 'unknown',
  http_method      text CHECK (http_method IN ('GET','POST')),
  path_template    text,
  request_schema   jsonb,
  response_sample  jsonb,
  projector        text,
  status           text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','live','deprecated')),
  verified         boolean NOT NULL DEFAULT false,
  notes            text,
  UNIQUE (source, endpoint_code, api_version)
);

-- Declarative field mappings: payload path -> table.column with a named transform.
CREATE TABLE staging.field_mappings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id    uuid NOT NULL REFERENCES staging.endpoint_registry(id) ON DELETE CASCADE,
  source_path    text NOT NULL,
  target_table   text NOT NULL,
  target_column  text NOT NULL,
  transform      text NOT NULL DEFAULT 'identity',
  required       boolean NOT NULL DEFAULT false,
  notes          text,
  UNIQUE (endpoint_id, source_path, target_table, target_column)
);

-- One sync run = one consented pull for one customer. Every bank.* row carries the run that
-- produced it; the run carries the consent and the freshness date the response declared.
CREATE TABLE staging.sync_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL,                                -- FK added in 0004
  consent_id          uuid NOT NULL,                                -- FK added in 0004
  source              common.source NOT NULL,
  trigger             text NOT NULL CHECK (trigger IN ('manual','schedule','consent_granted','demo_clock','backfill')),
  data_blocks         text[] NOT NULL DEFAULT '{}',
  data_period_from    date,
  data_period_to      date,
  data_freshness_date date,
  as_of               timestamptz NOT NULL,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  status              text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','partial','failed')),
  response_status     text,
  error_code          text,
  error_detail        text,
  engine_version      text REFERENCES ref.engine_versions(version),
  CHECK (finished_at IS NULL OR finished_at >= started_at),
  CHECK (status = 'running' OR finished_at IS NOT NULL)
);
CREATE INDEX sync_runs_customer ON staging.sync_runs (customer_id, as_of DESC);

-- No data is pulled without an active, unexpired consent for the same customer. Enforced in the
-- database so no code path, including a replay, can forget it.
CREATE OR REPLACE FUNCTION staging.sync_runs_require_consent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  c_id        uuid;
  c_customer  uuid;
  c_ref       text;
  c_status    text;
  c_valid_to  timestamptz;
BEGIN
  SELECT id, customer_id, consent_reference, status, valid_to
    INTO c_id, c_customer, c_ref, c_status, c_valid_to
    FROM app.consents WHERE id = NEW.consent_id;
  IF c_id IS NULL THEN RAISE EXCEPTION 'sync_run: unknown consent %', NEW.consent_id; END IF;
  IF c_customer <> NEW.customer_id THEN
    RAISE EXCEPTION 'sync_run: consent % belongs to another customer', c_ref;
  END IF;
  IF c_status <> 'ACTIVE' OR c_valid_to <= NEW.started_at THEN
    RAISE EXCEPTION 'sync_run: consent % is % (valid_to %)', c_ref, c_status, c_valid_to
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
  customer_id     uuid NOT NULL,                                -- FK added in 0004
  request_params  jsonb NOT NULL DEFAULT '{}'::jsonb,
  http_status     smallint,
  response_status text,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  payload         jsonb NOT NULL,
  payload_text    text,
  payload_hash    text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  payload_bytes   integer NOT NULL CHECK (payload_bytes >= 0),
  contains_pii    boolean NOT NULL DEFAULT true,
  purge_after     timestamptz,
  UNIQUE (source, endpoint_code, payload_hash)
);
CREATE INDEX raw_payloads_run ON staging.raw_payloads (sync_run_id);
CREATE INDEX raw_payloads_customer_time ON staging.raw_payloads (customer_id, fetched_at DESC);
CREATE TRIGGER raw_payloads_immutable BEFORE UPDATE ON staging.raw_payloads
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();

-- Projection bookkeeping: which projector version has been applied to which payload.
CREATE TABLE staging.projections (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raw_payload_id    uuid NOT NULL REFERENCES staging.raw_payloads(id) ON DELETE CASCADE,
  projector         text NOT NULL,
  projector_version text NOT NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','projected','failed','skipped')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  rows_upserted     integer CHECK (rows_upserted >= 0),
  unmapped_paths    text[] NOT NULL DEFAULT '{}',
  error             text,
  UNIQUE (raw_payload_id, projector, projector_version)
);

-- One row per `pnpm seed`: what was generated, from which anchor, with which content hash.
-- `pnpm seed --check` regenerates and compares; the Record tab shows it as provenance.
CREATE TABLE staging.seed_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generator_version text NOT NULL,
  anchor            date NOT NULL,
  history_from      date NOT NULL,
  horizon_to        date NOT NULL,
  personas          text[] NOT NULL,
  row_counts        jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256    text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  ran_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (horizon_to >= anchor AND anchor >= history_from)
);
CREATE INDEX seed_runs_latest ON staging.seed_runs (ran_at DESC);

-- What we expect to call. The fixtures endpoint is live from day one.
INSERT INTO staging.endpoint_registry (source, endpoint_code, name, projector, status, verified, notes) VALUES
  ('idbi_api', '456', 'Customer master (CIF)',         'projectCustomerMaster456', 'planned', false, 'Numbered catalogue seen in team notes; not publicly corroborated'),
  ('idbi_api', '394', 'Accounts',                      'projectAccounts394',       'planned', false, 'Numbered catalogue seen in team notes; not publicly corroborated'),
  ('idbi_api', '393', 'Account statement',             'projectStatement393',      'planned', false, 'Numbered catalogue seen in team notes; not publicly corroborated'),
  ('idbi_api', '362', 'Liens',                         'projectLiens362',          'planned', false, 'Numbered catalogue seen in team notes; not publicly corroborated'),
  ('idbi_api', '402', 'Loan overdues',                 'projectLoanOverdues402',   'planned', false, 'Numbered catalogue seen in team notes; not publicly corroborated'),
  ('idbi_api', '442', 'Loan account details (assumed)', 'projectLoans442',         'planned', false, 'Mentioned alongside 402 in the archived prototype; purpose assumed'),
  ('fixtures', 'fixtures/customer-file', 'Synthetic CustomerFile from @dhan/fixtures', 'projectFixturesCustomerFile', 'live', true, 'Writes through the same staging path so the pipeline is exercised daily');

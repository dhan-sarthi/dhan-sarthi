-- =====================================================================================
-- 0004  Identity: customers and consent (from 10_identity_staging.sql) plus the reviewer
--       isolation the architecture adds — subjects, sessions, idempotency keys.
--
-- app.subjects is the pseudonymisation seam. Audit rows reference subject_id and never a cif,
-- and they carry no foreign key to it, so DPDP erasure deletes the subject (cascading sessions,
-- snapshots, roadmap versions, idempotency keys) and touches no audit row.
-- =====================================================================================

-- ---------- app.customers: the one stable identity everything hangs off ---------------
-- The CIF is IDBI's key and the request parameter for every sandbox call; the uuid is ours so a
-- CIF re-issue, a masked CIF, or a fixtures customer without one never ripples through 50 tables.
CREATE TABLE app.customers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cif               text UNIQUE,
  cust_id           text NOT NULL UNIQUE,
  display_name      text NOT NULL,
  preferred_language common.lang_tag NOT NULL DEFAULT 'en-IN',
  tax_regime        text CHECK (tax_regime IN ('old','new')),   -- ours, not the bank's; gates ELSS
  retirement_age    smallint NOT NULL DEFAULT 60 CHECK (retirement_age BETWEEN 45 AND 75),
  data_source       common.source NOT NULL DEFAULT 'fixtures',
  onboarding_state  text NOT NULL DEFAULT 'new'
                    CHECK (onboarding_state IN ('new','consented','goal_set','diagnosed','active','paused','closed')),
  last_seen_at      timestamptz,
  erased_at         timestamptz,
  -- The picker and the seeded ledger's shape. Null under a real feed.
  persona_slug      text UNIQUE,
  pitch             text,
  demonstrates      text,
  ledger_anchor     date,
  ledger_history_from date,
  ledger_horizon    date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  row_version       integer NOT NULL DEFAULT 1,
  CHECK (ledger_anchor IS NULL OR (ledger_history_from <= ledger_anchor AND ledger_anchor <= ledger_horizon))
);
CREATE TRIGGER customers_touch BEFORE UPDATE ON app.customers
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

-- ---------- app.consents: not a boolean -------------------------------------------------
CREATE TABLE app.consents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  consent_reference  text NOT NULL UNIQUE,
  kind               text NOT NULL CHECK (kind IN ('bank_issued','aa','synthetic')),
  purpose_code       text NOT NULL DEFAULT '101' CHECK (purpose_code IN ('101','102','103','104','105')),
  purpose_text       text NOT NULL DEFAULT 'Wealth advisory',
  scopes             text[] NOT NULL
                     CHECK (scopes <@ ARRAY['PROFILE','ACCOUNTS','TXN','HOLDINGS','LIABILITIES','SHELF','SIGNALS']::text[]
                            AND cardinality(scopes) > 0),
  fi_types           text[] NOT NULL DEFAULT '{}',
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
  valid_to           timestamptz NOT NULL,
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
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX consent_events_consent ON app.consent_events (consent_id, occurred_at);
CREATE TRIGGER consent_events_immutable BEFORE UPDATE ON app.consent_events
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();

-- Staging referenced these before they existed (0003).
ALTER TABLE staging.sync_runs
  ADD CONSTRAINT sync_runs_customer_fk FOREIGN KEY (customer_id) REFERENCES app.customers(id) ON DELETE CASCADE,
  ADD CONSTRAINT sync_runs_consent_fk  FOREIGN KEY (consent_id)  REFERENCES app.consents(id);
ALTER TABLE staging.raw_payloads
  ADD CONSTRAINT raw_payloads_customer_fk FOREIGN KEY (customer_id) REFERENCES app.customers(id) ON DELETE CASCADE;

-- ---------- reviewer isolation ---------------------------------------------------------
-- A session is a row, not a browser. Fifteen reviewers get fifteen rows with fifteen clocks.
CREATE TABLE app.subjects (
  subject_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  cif         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subjects_customer ON app.subjects (customer_id);

CREATE TABLE app.sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      uuid NOT NULL REFERENCES app.subjects(subject_id) ON DELETE CASCADE,
  -- Only the token's sha256 is stored; the token itself is handed out once and never seen again.
  token_hash      char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  as_of           date NOT NULL,                     -- the simulated today; moved only by POST /session/clock
  last_seen       date NOT NULL,
  goal_target     common.inr CHECK (goal_target > 0),
  caps            jsonb NOT NULL DEFAULT '[]'::jsonb,
  scope_overrides text[] NOT NULL DEFAULT '{}'
                  CHECK (scope_overrides <@ ARRAY['PROFILE','ACCOUNTS','TXN','LIABILITIES','HOLDINGS']::text[]),
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),  -- bumped on every patch; a stale expected version is a 409
  client_hint     text,                              -- hashed user agent plus /24; never the IP
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_active_at  timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,              -- 30-day sliding
  revoked_at      timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_subject ON app.sessions (subject_id);
CREATE INDEX sessions_live ON app.sessions (expires_at) WHERE revoked_at IS NULL;

-- What was answered the first time, so a replay answers the same.
CREATE TABLE app.idempotency_keys (
  session_id   uuid NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  key          text NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status       smallint NOT NULL CHECK (status BETWEEN 100 AND 599),
  response     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, key)
);
CREATE INDEX idempotency_keys_age ON app.idempotency_keys (created_at);

-- =====================================================================================
-- 0006  Our own objects: snapshots, roadmap versions, verdicts, actions, the append-only
--       record (advice records, decisions, avatar tool calls), avatar sessions, leases and
--       the waitlist.
--
-- Adapted from docs/engineering/schema/30_app_engine.sql to the reviewer-session model:
-- every derived row carries subject_id and session_id; the append-only tables carry NO foreign
-- key into anything erasure deletes, so DPDP erasure removes the subject and leaves the record
-- intact and unlinkable. app.sim_clocks is dropped: the clock is app.sessions.as_of.
--
-- Hashes: the application computes snapshot_hash, input_hash and the record chain over its own
-- canonical JSON (apps/api/src/application/hash.ts) so a record can be verified without the
-- database. The database enforces what it can without knowing that form: append-only, and that
-- each record links to the previous one of its subject.
-- =====================================================================================

-- ---------- snapshots: derived truth per (subject, date, inputs, engine) --------------------
CREATE TABLE app.snapshots (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  subject_id                uuid NOT NULL REFERENCES app.subjects(subject_id) ON DELETE CASCADE,
  session_id                uuid NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  sync_run_id               uuid REFERENCES staging.sync_runs(id),        -- the bank data it was derived from
  consent_id                uuid REFERENCES app.consents(id),
  as_of                     date NOT NULL,                                -- Snapshot.asOf; the simulated clock
  engine_version            text NOT NULL REFERENCES ref.engine_versions(version),
  input_hash                text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),   -- sha256 of the canonical scoped file plus the shelf
  snapshot                  jsonb NOT NULL,                               -- the full Snapshot object, verbatim
  snapshot_hash             text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  -- headline numbers, denormalised by trigger for reporting; the jsonb stays canonical --------
  income_monthly            common.inr,
  income_stability          text CHECK (income_stability IN ('regular','variable')),
  pay_day                   smallint CHECK (pay_day BETWEEN 1 AND 31),
  next_pay_date             date,
  commitments_total         common.inr,
  discretionary_monthly     common.inr,
  surplus_monthly           common.inr,
  surplus_deployable        common.inr NOT NULL CHECK (surplus_deployable >= 0),
  balance_savings           common.inr,
  balance_deposits          common.inr,
  idle_floor                common.inr,
  idle_months               smallint CHECK (idle_months >= 0),
  buffer_months_covered     numeric(6,1),
  buffer_shortfall          common.inr,
  debt_total                common.inr,
  debt_highest_rate         common.pct,
  debt_has_high_interest    boolean,
  debt_missed_repayment     boolean,
  debt_emi_ending_months    smallint,
  protection_life_cover     common.inr,
  protection_gap            common.inr,
  quality_transactions      integer,
  quality_months            smallint,
  quality_categorised_share numeric(4,3) CHECK (quality_categorised_share BETWEEN 0 AND 1),
  quality_unexplained_share numeric(4,3) CHECK (quality_unexplained_share BETWEEN 0 AND 1),
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, as_of, input_hash, engine_version)
);
CREATE INDEX snapshots_customer_key ON app.snapshots (customer_id, as_of, input_hash, engine_version, created_at);
CREATE INDEX snapshots_session ON app.snapshots (session_id, created_at DESC);

-- Fills the headline columns from the jsonb, and the hash only when the writer left it out.
CREATE OR REPLACE FUNCTION app.snapshot_fill() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s jsonb := NEW.snapshot;
BEGIN
  IF NEW.snapshot_hash IS NULL THEN NEW.snapshot_hash := common.sha256_hex(s); END IF;
  NEW.income_monthly            := coalesce(NEW.income_monthly,            (s #>> '{income,monthly}')::numeric);
  NEW.income_stability          := coalesce(NEW.income_stability,          s #>> '{income,stability}');
  NEW.pay_day                   := coalesce(NEW.pay_day,                   (s #>> '{income,payDay}')::smallint);
  NEW.next_pay_date             := coalesce(NEW.next_pay_date,             (s #>> '{income,nextPayDate}')::date);
  NEW.commitments_total         := coalesce(NEW.commitments_total,         (s #>> '{commitments,total}')::numeric);
  NEW.discretionary_monthly     := coalesce(NEW.discretionary_monthly,     (s #>> '{discretionary,monthly}')::numeric);
  NEW.surplus_monthly           := coalesce(NEW.surplus_monthly,           (s #>> '{surplus,monthly}')::numeric);
  NEW.surplus_deployable        := coalesce(NEW.surplus_deployable,        (s #>> '{surplus,deployable}')::numeric);
  NEW.balance_savings           := coalesce(NEW.balance_savings,           (s #>> '{balances,savings}')::numeric);
  NEW.balance_deposits          := coalesce(NEW.balance_deposits,          (s #>> '{balances,deposits}')::numeric);
  NEW.idle_floor                := coalesce(NEW.idle_floor,                (s #>> '{balances,idleFloor}')::numeric);
  NEW.idle_months               := coalesce(NEW.idle_months,               (s #>> '{balances,idleMonths}')::smallint);
  NEW.buffer_months_covered     := coalesce(NEW.buffer_months_covered,     (s #>> '{buffer,monthsCovered}')::numeric);
  NEW.buffer_shortfall          := coalesce(NEW.buffer_shortfall,          (s #>> '{buffer,shortfall}')::numeric);
  NEW.debt_total                := coalesce(NEW.debt_total,                (s #>> '{debt,total}')::numeric);
  NEW.debt_highest_rate         := coalesce(NEW.debt_highest_rate,         (s #>> '{debt,highestRate}')::numeric);
  NEW.debt_has_high_interest    := coalesce(NEW.debt_has_high_interest,    (s #>> '{debt,hasHighInterest}')::boolean);
  NEW.debt_missed_repayment     := coalesce(NEW.debt_missed_repayment,     (s #>> '{debt,missedRepayment}')::boolean);
  NEW.debt_emi_ending_months    := coalesce(NEW.debt_emi_ending_months,    (s #>> '{debt,endingSoon,monthsLeft}')::smallint);
  NEW.protection_life_cover     := coalesce(NEW.protection_life_cover,     (s #>> '{protection,lifeCoverInForce}')::numeric);
  NEW.protection_gap            := coalesce(NEW.protection_gap,            (s #>> '{protection,gap}')::numeric);
  NEW.quality_transactions      := coalesce(NEW.quality_transactions,      (s #>> '{quality,transactions}')::integer);
  NEW.quality_months            := coalesce(NEW.quality_months,            (s #>> '{quality,monthsOfHistory}')::smallint);
  NEW.quality_categorised_share := coalesce(NEW.quality_categorised_share, (s #>> '{quality,categorisedShare}')::numeric);
  NEW.quality_unexplained_share := coalesce(NEW.quality_unexplained_share, (s #>> '{quality,unexplainedShare}')::numeric);
  RETURN NEW;
END $$;
CREATE TRIGGER snapshots_fill BEFORE INSERT ON app.snapshots
  FOR EACH ROW EXECUTE FUNCTION app.snapshot_fill();
-- Immutable content. DELETE is not guarded: erasure cascades through here, and dhan_app has no
-- DELETE privilege on it (0007), so only the owner's cascade can remove a row.
CREATE TRIGGER snapshots_immutable BEFORE UPDATE ON app.snapshots
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();
CREATE TRIGGER snapshots_no_truncate BEFORE TRUNCATE ON app.snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION common.forbid_mutation();
COMMENT ON TABLE app.snapshots IS 'Derived truth per (subject, as_of, inputs, engine). The first reviewer at a clock position pays derive(); everyone after reads JSON. The advice record cites its hash.';

-- ---------- roadmap versions: every version, every reason ------------------------------------
CREATE TABLE app.roadmap_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  version           integer NOT NULL CHECK (version >= 1),
  snapshot_id       uuid NOT NULL REFERENCES app.snapshots(id) ON DELETE CASCADE,
  goal              jsonb NOT NULL,
  roadmap           jsonb NOT NULL,
  reason_for_change text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, version)
);
CREATE TRIGGER roadmap_versions_immutable BEFORE UPDATE ON app.roadmap_versions
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();

-- ---------- verdicts and actions: reserved for the replay tooling -----------------------------
-- The gate's verdict is recorded on the advice record below; these two tables keep the shape
-- 30_app_engine.sql proposes so `pnpm replay` and a persisted actions ledger have somewhere to
-- land without a schema change. Nothing in this iteration writes them.
CREATE TABLE app.verdicts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id        uuid NOT NULL,
  session_id        uuid NOT NULL,
  snapshot_id       uuid NOT NULL,
  product_code      text NOT NULL,
  amount_monthly    common.inr NOT NULL DEFAULT 0 CHECK (amount_monthly >= 0),
  goal_kind         text,
  horizon_years     numeric(4,1) CHECK (horizon_years >= 0),
  verdict           text NOT NULL CHECK (verdict IN ('PASS','BLOCKED')),
  rules_version     text NOT NULL,
  rule_id           text,
  spoken            text,
  recorded          text NOT NULL,
  alternative       jsonb,
  passed            text[] NOT NULL DEFAULT '{}',
  requested_by      text NOT NULL CHECK (requested_by IN ('roadmap','daily_plan','avatar_tool','api','test')),
  runway_session_id text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK ((verdict = 'BLOCKED') = (rule_id IS NOT NULL))
);
CREATE INDEX verdicts_session ON app.verdicts (session_id, created_at DESC);
CREATE TRIGGER verdicts_immutable BEFORE UPDATE OR DELETE ON app.verdicts
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();

CREATE TABLE app.actions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES app.sessions(id) ON DELETE CASCADE,
  snapshot_id   uuid REFERENCES app.snapshots(id) ON DELETE CASCADE,
  plan_date     date NOT NULL,
  action_id     text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('open_sweep_in','start_ssp','move_to_liquid_fund','start_sip','increase_sip','pause_sip','buy_term_cover','enrol_pmjjby','buy_health_cover','pay_down_card','cancel_subscription','set_category_cap','talk_to_rm')),
  label         text NOT NULL,
  detail        text NOT NULL,
  amount        common.inr NOT NULL DEFAULT 0 CHECK (amount >= 0),
  product_code  text,
  evidence      jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict_id    uuid REFERENCES app.verdicts(id),
  projected     jsonb,
  is_primary    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, plan_date, action_id)
);

-- ---------- the record: one row per proposal, hash-chained per subject ------------------------
CREATE TABLE app.audit_records (
  ordinal                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- global insertion order
  id                     uuid NOT NULL UNIQUE,
  subject_id             uuid NOT NULL,                                     -- no FK: erasure never touches this table
  session_id             uuid NOT NULL,                                     -- no FK, same reason
  seq                    bigint NOT NULL CHECK (seq >= 1),                  -- position in the subject's chain
  snapshot_id            uuid NOT NULL,                                     -- cited by id and hash; no FK
  snapshot_hash          text CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  consent_id             text NOT NULL,                                     -- the consent reference echoed on every record
  source                 text NOT NULL CHECK (source IN ('screen','avatar_tool','text','api')),
  action_id              text,
  action_kind            text CHECK (action_kind IN ('open_sweep_in','start_ssp','move_to_liquid_fund','start_sip','increase_sip','pause_sip','buy_term_cover','enrol_pmjjby','buy_health_cover','pay_down_card','cancel_subscription','set_category_cap','talk_to_rm')),
  product_id             text,
  amount                 common.inr,
  verdict                text NOT NULL CHECK (verdict IN ('PASS','BLOCKED','UNKNOWN_PRODUCT')),
  rule_id                text,
  rules_passed           text[] NOT NULL DEFAULT '{}',
  spoken                 text,                                              -- the exact sentence the customer saw or heard
  recorded               text NOT NULL,
  alternative            jsonb,
  evidence               text[] NOT NULL DEFAULT '{}',
  engine_version         text NOT NULL,
  runway_session_id      text,
  verified_in_transcript boolean,
  at_sim                 date NOT NULL,                                     -- the simulated date the advice was given on
  prev_hash              char(64) NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  record_hash            char(64) NOT NULL UNIQUE CHECK (record_hash ~ '^[0-9a-f]{64}$'),
  created_at             timestamptz NOT NULL,                              -- set by the writer: it is part of the hashed row
  retain_until           timestamptz NOT NULL,                              -- five years (SEBI/IRDAI record-keeping)
  UNIQUE (subject_id, seq),
  CHECK ((verdict = 'BLOCKED') = (rule_id IS NOT NULL))
);
CREATE INDEX audit_records_session ON app.audit_records (session_id, seq);
CREATE INDEX audit_records_subject ON app.audit_records (subject_id, seq);
CREATE INDEX audit_records_avatar ON app.audit_records (runway_session_id, seq) WHERE runway_session_id IS NOT NULL;
CREATE INDEX audit_records_retention ON app.audit_records (retain_until);

-- The database cannot recompute the application's canonical hash, but it can refuse a record
-- that does not link to the previous one. Serialised per subject so two concurrent inserts
-- cannot both chain to the same predecessor.
CREATE OR REPLACE FUNCTION app.audit_chain_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE last_hash text; last_seq bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit:' || NEW.subject_id::text));
  SELECT record_hash, seq INTO last_hash, last_seq FROM app.audit_records
    WHERE subject_id = NEW.subject_id ORDER BY seq DESC LIMIT 1;
  IF coalesce(last_hash, repeat('0', 64)) <> NEW.prev_hash THEN
    RAISE EXCEPTION 'audit_records: prev_hash % does not link to the subject''s last record %', NEW.prev_hash, coalesce(last_hash, 'genesis')
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.seq <> coalesce(last_seq, 0) + 1 THEN
    RAISE EXCEPTION 'audit_records: seq % is not the next in the chain (%)', NEW.seq, coalesce(last_seq, 0) + 1
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.retain_until := NEW.created_at + interval '5 years';
  RETURN NEW;
END $$;
CREATE TRIGGER audit_records_chain BEFORE INSERT ON app.audit_records
  FOR EACH ROW EXECUTE FUNCTION app.audit_chain_link();
CREATE TRIGGER audit_records_immutable BEFORE UPDATE OR DELETE ON app.audit_records
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();
CREATE TRIGGER audit_records_no_truncate BEFORE TRUNCATE ON app.audit_records
  FOR EACH STATEMENT EXECUTE FUNCTION common.forbid_mutation();
COMMENT ON TABLE app.audit_records IS 'One row per proposal — including tool calls the customer never decided on. The exact sentence shown, the rule, the snapshot it was judged against, and the hash chain. UPDATE, DELETE and TRUNCATE are rejected by trigger.';

-- ---------- decisions: the customer's response ---------------------------------------------------
CREATE TABLE app.decisions (
  ordinal          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id               uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL,
  subject_id       uuid,
  advice_record_id uuid REFERENCES app.audit_records(id),
  action_id        text NOT NULL,
  action_kind      text NOT NULL CHECK (action_kind IN ('open_sweep_in','start_ssp','move_to_liquid_fund','start_sip','increase_sip','pause_sip','buy_term_cover','enrol_pmjjby','buy_health_cover','pay_down_card','cancel_subscription','set_category_cap','talk_to_rm')),
  kind             text NOT NULL CHECK (kind IN ('did_it','declined','deferred','pushed_back')),
  amount           common.inr NOT NULL,
  product_id       text,
  shown            text NOT NULL,                                        -- the button label the customer tapped, verbatim
  evidence         text[] NOT NULL DEFAULT '{}',
  note             text,
  at_sim           date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, action_id)                                         -- a double tap produces one row even without the header
);
CREATE INDEX decisions_session ON app.decisions (session_id, created_at);
CREATE TRIGGER decisions_immutable BEFORE UPDATE OR DELETE ON app.decisions
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();
CREATE TRIGGER decisions_no_truncate BEFORE TRUNCATE ON app.decisions
  FOR EACH STATEMENT EXECUTE FUNCTION common.forbid_mutation();

-- ---------- avatar sessions: one per billed Runway call --------------------------------------------
CREATE TABLE app.avatar_sessions (
  runway_session_id  text PRIMARY KEY,
  session_id         uuid NOT NULL,                                       -- no FK: billing history outlives erasure
  credential_label   text NOT NULL,
  task_id            text NOT NULL,
  opened_at          timestamptz NOT NULL,
  ready_at           timestamptz,
  rpc_connected_at   timestamptz,
  granted_at         timestamptz,
  ended_at           timestamptz,
  end_reason         text CHECK (end_reason IN ('client','reaped','failed_grant','release_all','deploy')),
  minutes_charged    numeric(8,2) CHECK (minutes_charged >= 0),
  transcript_status  text NOT NULL DEFAULT 'pending' CHECK (transcript_status IN ('pending','fetched','unavailable')),
  transcript         jsonb,
  reconciliation     jsonb,                                               -- {verified[], unverified[], gateCoverage{fired, expected, misses[]}}
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= opened_at),
  CHECK (ended_at IS NULL OR end_reason IS NOT NULL)
);
CREATE INDEX avatar_sessions_session ON app.avatar_sessions (session_id, opened_at DESC);
CREATE INDEX avatar_sessions_day ON app.avatar_sessions (opened_at);
COMMENT ON TABLE app.avatar_sessions IS 'One row per billed call. The daily budget is sum(minutes_charged) for the day, read from here, never from a counter in process memory.';

-- ---------- avatar tool calls: the proof the gate fired ------------------------------------------
CREATE TABLE app.avatar_tool_calls (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runway_session_id      text NOT NULL REFERENCES app.avatar_sessions(runway_session_id),
  tool                   text NOT NULL CHECK (tool IN ('check_suitability','query_spend','get_plan')),
  args                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  result                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  advice_record_id       uuid REFERENCES app.audit_records(id),
  latency_ms             integer NOT NULL CHECK (latency_ms >= 0),
  verified_in_transcript boolean,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX avatar_tool_calls_session ON app.avatar_tool_calls (runway_session_id, created_at);
CREATE TRIGGER avatar_tool_calls_immutable BEFORE UPDATE OR DELETE ON app.avatar_tool_calls
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();
CREATE TRIGGER avatar_tool_calls_no_truncate BEFORE TRUNCATE ON app.avatar_tool_calls
  FOR EACH STATEMENT EXECUTE FUNCTION common.forbid_mutation();

-- ---------- the single avatar slot ---------------------------------------------------------------
-- Acquire is `INSERT … ON CONFLICT (credential_label) DO NOTHING RETURNING`: atomic without an
-- application lock, safe across the two-task overlap of a rolling deploy.
CREATE TABLE app.avatar_leases (
  credential_label   text PRIMARY KEY,
  session_id         uuid NOT NULL,
  runway_session_id  text,
  task_id            text NOT NULL,
  claimed_at         timestamptz NOT NULL,
  expires_at         timestamptz NOT NULL,
  CHECK (expires_at > claimed_at)
);

CREATE TABLE app.avatar_waitlist (
  ticket          text PRIMARY KEY,
  session_id      uuid NOT NULL UNIQUE,
  enqueued_at     timestamptz NOT NULL,
  claimable_until timestamptz,
  granted_at      timestamptz,
  expired_at      timestamptz
);
CREATE INDEX avatar_waitlist_order ON app.avatar_waitlist (enqueued_at) WHERE granted_at IS NULL AND expired_at IS NULL;

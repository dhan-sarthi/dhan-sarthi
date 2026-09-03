-- =====================================================================================
-- Part 3: our own objects. Mirrors packages/core (Snapshot, Insight, Goal, Roadmap, Stage,
-- Verdict, DailyPlan, Action, Decision) and docs/product/autopilot.md (AuditRecord, memory).
-- Snapshots, verdicts, roadmaps and audit records are immutable: a change is a new row.
-- =====================================================================================

-- ---------- snapshots: one object, one source of truth, hashed by the database -------------
CREATE TABLE app.snapshots (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  sync_run_id               uuid NOT NULL REFERENCES staging.sync_runs(id),   -- the bank data it was derived from
  consent_id                uuid NOT NULL REFERENCES app.consents(id),
  as_of                     date NOT NULL,                                    -- Snapshot.asOf; the simulated clock in the demo
  engine_version            text NOT NULL REFERENCES ref.engine_versions(version),
  window_months             smallint NOT NULL DEFAULT 12 CHECK (window_months BETWEEN 3 AND 36),
  snapshot                  jsonb NOT NULL,                                   -- the full Snapshot object, verbatim
  snapshot_hash             text CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),    -- filled by trigger = common.sha256_hex(snapshot)
  -- headline numbers, denormalised for triggers and reporting; the jsonb stays canonical --------
  income_monthly            common.inr,
  income_stability          text CHECK (income_stability IN ('regular','variable')),
  pay_day                   smallint CHECK (pay_day BETWEEN 1 AND 31),
  next_pay_date             date,
  commitments_total         common.inr,
  discretionary_monthly     common.inr,
  surplus_monthly           common.inr,
  surplus_deployable        common.inr NOT NULL CHECK (surplus_deployable >= 0),  -- the number the gate checks amounts against
  balance_savings           common.inr,
  balance_deposits          common.inr,
  idle_floor                common.inr,                                       -- twelve-month low; the pitch rests on it
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
  UNIQUE (customer_id, as_of, engine_version, sync_run_id)
);
CREATE INDEX snapshots_customer_asof ON app.snapshots (customer_id, as_of DESC, created_at DESC);

CREATE OR REPLACE FUNCTION app.snapshot_fill_hash() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h text := common.sha256_hex(NEW.snapshot);
BEGIN
  IF NEW.snapshot_hash IS NULL THEN NEW.snapshot_hash := h;
  ELSIF NEW.snapshot_hash <> h THEN
    RAISE EXCEPTION 'snapshot_hash % does not match snapshot content (%)', NEW.snapshot_hash, h;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER snapshots_hash BEFORE INSERT ON app.snapshots
  FOR EACH ROW EXECUTE FUNCTION app.snapshot_fill_hash();
CREATE TRIGGER snapshots_immutable BEFORE UPDATE OR DELETE ON app.snapshots
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();
COMMENT ON TABLE app.snapshots IS 'Derived truth per (customer, as_of, engine, data). Screens and the avatar read this row; the audit trail cites its hash.';

-- ---------- our enrichment of the bank''s lines, kept off the bank rows ----------------------
CREATE TABLE app.transaction_enrichments (
  transaction_id    uuid NOT NULL REFERENCES bank.transactions(id) ON DELETE CASCADE,
  enricher_version  text NOT NULL,                                            -- categorize.ts version; re-enrichment adds rows
  merchant_id       uuid REFERENCES ref.merchants(id),
  merchant_name     text,                                                     -- Enriched.merchant
  spend_category    text NOT NULL REFERENCES ref.spend_categories(category),  -- Enriched.category
  method            text NOT NULL CHECK (method IN ('mandate','merchant','keyword','bank','fallback')),
  confidence        text NOT NULL CHECK (confidence IN ('high','medium','low')),
  series_key        text,                                                     -- recurring.ts seriesKey(narration)
  is_discretionary  boolean,
  is_one_off        boolean,
  parsed            jsonb NOT NULL DEFAULT '{}'::jsonb,                       -- what the narration pattern extracted
  enriched_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transaction_id, enricher_version)
);
CREATE INDEX transaction_enrichments_series ON app.transaction_enrichments (series_key) WHERE series_key IS NOT NULL;

-- Detected recurring series per snapshot (Series in recurring.ts). Evidence, not a mandate table.
CREATE TABLE app.recurring_series (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id       uuid NOT NULL REFERENCES app.snapshots(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  series_key        text NOT NULL,
  merchant          text,
  spend_category    text NOT NULL REFERENCES ref.spend_categories(category),
  kind              text NOT NULL CHECK (kind IN ('income','rent','emi','sip','insurance','subscription','bill','transfer','obligation','unknown')),
  channel_code      text NOT NULL REFERENCES ref.channel_codes(code),
  cadence           text NOT NULL CHECK (cadence IN ('weekly','fortnightly','monthly','quarterly','annual','irregular')),
  interval_days     numeric(6,1),
  day_of_month      smallint CHECK (day_of_month BETWEEN 1 AND 31),
  occurrences       integer NOT NULL CHECK (occurrences >= 1),
  first_seen        date NOT NULL,
  last_seen         date NOT NULL,
  amount            common.inr NOT NULL,
  monthly_cost      common.inr NOT NULL,
  annual_cost       common.inr NOT NULL,
  amount_variation  numeric(6,3),
  fixed             boolean NOT NULL,
  active            boolean NOT NULL,
  price_changes     jsonb NOT NULL DEFAULT '[]'::jsonb,                      -- [{on, from, to}]
  reason            text NOT NULL CHECK (reason IN ('mandate','fixed-monthly','utility','regular-obligation','income')),
  txn_ids           text[] NOT NULL DEFAULT '{}',
  mandate_id        uuid REFERENCES bank.mandates(id),                        -- when the inference matches a bank mandate
  UNIQUE (snapshot_id, series_key),
  CHECK (last_seen >= first_seen)
);

-- ---------- insights ------------------------------------------------------------------------
CREATE TABLE app.insights (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  snapshot_id       uuid NOT NULL REFERENCES app.snapshots(id),              -- the snapshot that last confirmed it
  kind              text NOT NULL CHECK (kind IN ('idle_cash','emi_ending','subscription_review','price_increase','category_drift','protection_gap','expensive_debt','missed_repayment','buffer_thin','habit_cost')),
  severity          text NOT NULL CHECK (severity IN ('urgent','important','opportunity')),
  fingerprint       text NOT NULL,                                            -- kind + subject: 'subscription_review:CULTFIT'; survives re-derivation
  headline          text NOT NULL,
  detail            text NOT NULL,
  monthly_value     common.inr NOT NULL DEFAULT 0,
  evidence          jsonb NOT NULL DEFAULT '[]'::jsonb,                      -- the transactions or facts behind it
  suggests          text CHECK (suggests IN ('open_sweep_in','start_ssp','move_to_liquid_fund','start_sip','increase_sip','pause_sip','buy_term_cover','enrol_pmjjby','buy_health_cover','pay_down_card','cancel_subscription','set_category_cap','talk_to_rm')),
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acted','dismissed','expired')),
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  dismissed_at      timestamptz,
  dismissed_reason  text,
  UNIQUE (customer_id, fingerprint),
  CHECK (status <> 'dismissed' OR dismissed_at IS NOT NULL)
);
CREATE INDEX insights_open ON app.insights (customer_id, severity) WHERE status = 'open';

-- ---------- goals ----------------------------------------------------------------------------
CREATE TABLE app.goals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('emergency_fund','debt_payoff','protection','wealth_target','retirement')),
  purpose        text,                                                        -- "house deposit", "Aanya's college"
  target_amount  common.inr NOT NULL CHECK (target_amount > 0),
  target_date    date NOT NULL,
  in_todays_money boolean NOT NULL DEFAULT true,                              -- funded at the real rate when true
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','abandoned','superseded')),
  created_on     date NOT NULL DEFAULT current_date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  row_version    integer NOT NULL DEFAULT 1,
  archived_at    timestamptz,
  CHECK (target_date > created_on)
);
CREATE INDEX goals_customer_active ON app.goals (customer_id) WHERE status = 'active';
CREATE TRIGGER goals_touch BEFORE UPDATE ON app.goals
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

-- ---------- avatar sessions (before verdicts/decisions, which reference them) ---------------
CREATE TABLE app.avatar_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  provider             text NOT NULL DEFAULT 'runway',
  provider_session_id  text UNIQUE,
  character_id         text,
  tier                 smallint NOT NULL CHECK (tier IN (0,1,2)),            -- 0 live avatar, 1 honest text fallback, 2 deterministic
  snapshot_id          uuid REFERENCES app.snapshots(id),                     -- what the brief was built from
  personality_hash     text CHECK (personality_hash ~ '^[0-9a-f]{64}$'),      -- server-side brief; provable, never client-editable
  start_script_hash    text CHECK (start_script_hash ~ '^[0-9a-f]{64}$'),
  tone_register        text CHECK (tone_register IN ('candid','encouraging','firm','pleased','steady','careful')),
  queued               boolean NOT NULL DEFAULT false,                        -- Runway `queued: true` behaviour
  started_at           timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz,
  end_reason           text CHECK (end_reason IN ('customer_ended','timeout','cap_reached','provider_error','queued_abandoned','server_teardown')),
  minutes_billed       numeric(8,2) CHECK (minutes_billed >= 0),
  cost_usd             numeric(10,4) CHECK (cost_usd >= 0),
  transcript           jsonb,                                                 -- fetched after the call
  client_ip_hash       text,                                                  -- per-IP limiter input, never the IP
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (ended_at IS NULL OR end_reason IS NOT NULL)
);
CREATE INDEX avatar_sessions_customer ON app.avatar_sessions (customer_id, started_at DESC);
CREATE INDEX avatar_sessions_open ON app.avatar_sessions (started_at) WHERE ended_at IS NULL;

-- ---------- verdicts: every suitability evaluation, immutable --------------------------------
CREATE TABLE app.verdicts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  snapshot_id       uuid NOT NULL REFERENCES app.snapshots(id),
  product_id        uuid NOT NULL REFERENCES ref.products(id),
  product_code      text NOT NULL,                                            -- ref.products.product_id at the time
  amount_monthly    common.inr NOT NULL DEFAULT 0 CHECK (amount_monthly >= 0),
  goal_kind         text,
  horizon_years     numeric(4,1) CHECK (horizon_years >= 0),
  verdict           text NOT NULL CHECK (verdict IN ('PASS','BLOCKED')),
  rules_version     text NOT NULL REFERENCES ref.engine_versions(version),
  rule_id           text,                                                     -- the rule that fired; NULL on PASS
  spoken            text,                                                     -- what the advisor says; written by the rule
  recorded          text NOT NULL,                                            -- what the reviewer reads
  alternative       jsonb,                                                    -- {productId, name, monthly}
  passed            text[] NOT NULL DEFAULT '{}',                             -- rules cleared before the failure
  requested_by      text NOT NULL CHECK (requested_by IN ('roadmap','daily_plan','avatar_tool','api','test')),
  avatar_session_id uuid REFERENCES app.avatar_sessions(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (rules_version, rule_id) REFERENCES ref.suitability_rules(rules_version, rule_id),
  CHECK ((verdict = 'BLOCKED') = (rule_id IS NOT NULL))
);
CREATE INDEX verdicts_customer ON app.verdicts (customer_id, created_at DESC);
CREATE INDEX verdicts_blocked ON app.verdicts (rule_id, created_at DESC) WHERE verdict = 'BLOCKED';
CREATE TRIGGER verdicts_immutable BEFORE UPDATE OR DELETE ON app.verdicts
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();
COMMENT ON TABLE app.verdicts IS 'Output of evaluate() in packages/core/src/suitability.ts. The model never writes here; it only reads.';

-- ---------- roadmaps: versioned, immutable, every version carries its reason ---------------
CREATE TABLE app.roadmaps (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id              uuid NOT NULL REFERENCES app.goals(id) ON DELETE CASCADE,
  customer_id          uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  version              integer NOT NULL CHECK (version >= 1),
  snapshot_id          uuid NOT NULL REFERENCES app.snapshots(id),
  engine_version       text NOT NULL REFERENCES ref.engine_versions(version),
  reason_for_change    text NOT NULL,                                         -- the audit trail and the "it learns" story, at once
  options              jsonb NOT NULL,                                        -- RoadmapOptions: bufferFloorMonths, growthRatePct, inflationPct, depositRatePct
  monthly_commitment   common.inr NOT NULL CHECK (monthly_commitment >= 0),
  total_months         integer NOT NULL CHECK (total_months >= 0),
  completes_on         date,
  feasible             boolean NOT NULL,
  shortfall_monthly    common.inr NOT NULL DEFAULT 0 CHECK (shortfall_monthly >= 0),
  current_stage_index  smallint NOT NULL DEFAULT 0,
  projection           jsonb,                                                 -- bands only, never a single number
  disclaimer           text NOT NULL,
  roadmap              jsonb NOT NULL,                                        -- the full Roadmap object
  roadmap_hash         text NOT NULL CHECK (roadmap_hash ~ '^[0-9a-f]{64}$'),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, version),
  CHECK (feasible OR shortfall_monthly > 0)
);
CREATE INDEX roadmaps_customer ON app.roadmaps (customer_id, created_at DESC);
CREATE TRIGGER roadmaps_immutable BEFORE UPDATE OR DELETE ON app.roadmaps
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();

CREATE TABLE app.roadmap_stages (
  roadmap_id         uuid NOT NULL REFERENCES app.roadmaps(id) ON DELETE CASCADE,
  stage_index        smallint NOT NULL CHECK (stage_index >= 0),
  kind               text NOT NULL CHECK (kind IN ('free_up','get_cover','clear_debt','build_buffer','grow')),
  label              text NOT NULL,
  why                text NOT NULL,                                           -- shown, not implied
  product_id         uuid REFERENCES ref.products(id),
  product_code       text,
  monthly            common.inr NOT NULL CHECK (monthly >= 0),
  target_amount      common.inr NOT NULL DEFAULT 0 CHECK (target_amount >= 0),
  months_to_complete integer NOT NULL CHECK (months_to_complete >= 0),
  starts_on          date NOT NULL,
  completes_on       date NOT NULL,
  cadence            text NOT NULL CHECK (cadence IN ('ongoing','sequential')),
  is_goal            boolean NOT NULL DEFAULT false,
  verdict_id         uuid REFERENCES app.verdicts(id),                        -- the route cannot contain unsuitable advice
  PRIMARY KEY (roadmap_id, stage_index),
  CHECK (completes_on >= starts_on),
  CHECK (product_id IS NULL OR verdict_id IS NOT NULL)
);

-- ---------- daily plans -----------------------------------------------------------------------
CREATE TABLE app.daily_plans (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id            uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  plan_date              date NOT NULL,                                       -- the simulated "today"
  snapshot_id            uuid NOT NULL REFERENCES app.snapshots(id),
  roadmap_id             uuid REFERENCES app.roadmaps(id),
  since_from             date NOT NULL,                                       -- last_seen_at, as a date
  since_spent            common.inr NOT NULL DEFAULT 0,
  since_txn_count        integer NOT NULL DEFAULT 0,
  cap_breached           boolean NOT NULL DEFAULT false,
  on_route               boolean NOT NULL,
  route_note             text NOT NULL,                                       -- one sentence, never a scold
  safe_to_spend          jsonb NOT NULL,                                      -- {pot, perDay, daysToSalary, nextSalaryDate, reserved[]}
  safe_to_spend_per_day  common.inr NOT NULL,
  tone_register          text CHECK (tone_register IN ('candid','encouraging','firm','pleased','steady','careful')),
  primary_action_id      uuid,                                                -- FK added after app.actions exists
  engine_version         text NOT NULL REFERENCES ref.engine_versions(version),
  generated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, plan_date, snapshot_id)
);
CREATE INDEX daily_plans_customer_date ON app.daily_plans (customer_id, plan_date DESC);

-- ---------- trigger events: the nine deterministic interventions -------------------------------
CREATE TABLE app.trigger_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('salary_credited','safe_to_spend_crossed_zero','category_cap_exceeded','subscription_unused_90d','emi_ending_60d','fd_maturing_30d','idle_floor_3m','protection_gap','dpd_positive')),
  detected_on      date NOT NULL,                                             -- simulated date
  snapshot_id      uuid REFERENCES app.snapshots(id),
  subject_ref      text NOT NULL DEFAULT '-',                                 -- txn id / account id / series key that fired it
  evidence         jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_id        uuid,                                                      -- FK added after app.actions exists
  delivered_at     timestamptz,
  delivery_channel text CHECK (delivery_channel IN ('push','in_app','avatar','none')),
  UNIQUE (customer_id, kind, subject_ref, detected_on)
);

-- ---------- actions: from a fixed vocabulary, never free text from a model -------------------
CREATE TABLE app.actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  snapshot_id       uuid NOT NULL REFERENCES app.snapshots(id),
  daily_plan_id     uuid REFERENCES app.daily_plans(id),
  trigger_event_id  uuid REFERENCES app.trigger_events(id),
  kind              text NOT NULL CHECK (kind IN ('open_sweep_in','start_ssp','move_to_liquid_fund','start_sip','increase_sip','pause_sip','buy_term_cover','enrol_pmjjby','buy_health_cover','pay_down_card','cancel_subscription','set_category_cap','talk_to_rm')),
  label             text NOT NULL,                                            -- the button
  detail            text NOT NULL,                                            -- one line of what happens
  amount            common.inr NOT NULL DEFAULT 0 CHECK (amount >= 0),
  product_id        uuid REFERENCES ref.products(id),
  product_code      text,
  params            jsonb NOT NULL DEFAULT '{}'::jsonb,                       -- kind-specific: {category, monthlyLimit} / {seriesKey} / {sipRegistrationRef}
  evidence          jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict_id        uuid REFERENCES app.verdicts(id),
  projected         jsonb,                                                    -- {years, ratePct, becomes}
  is_primary        boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','shown','accepted','executing','executed','failed','declined','deferred','expired')),
  proposed_at       timestamptz NOT NULL DEFAULT now(),
  shown_at          timestamptz,
  expires_at        timestamptz,
  -- a product action must carry both the product and the gate''s verdict; behavioural ones carry neither
  CHECK (
    (kind IN ('open_sweep_in','start_ssp','move_to_liquid_fund','start_sip','increase_sip','pause_sip','buy_term_cover','enrol_pmjjby','buy_health_cover')
       AND product_id IS NOT NULL AND verdict_id IS NOT NULL)
    OR
    (kind IN ('pay_down_card','cancel_subscription','set_category_cap','talk_to_rm') AND product_id IS NULL)
  )
);
CREATE INDEX actions_customer_status ON app.actions (customer_id, status, proposed_at DESC);
CREATE UNIQUE INDEX actions_one_primary_per_plan ON app.actions (daily_plan_id) WHERE is_primary;  -- exactly one primary action

ALTER TABLE app.daily_plans    ADD CONSTRAINT daily_plans_primary_action_fk FOREIGN KEY (primary_action_id) REFERENCES app.actions(id);
ALTER TABLE app.trigger_events ADD CONSTRAINT trigger_events_action_fk      FOREIGN KEY (action_id)         REFERENCES app.actions(id);

-- ---------- decisions: the customer''s response --------------------------------------------------
CREATE TABLE app.decisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id         uuid NOT NULL REFERENCES app.actions(id),
  customer_id       uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('did_it','declined','deferred','pushed_back')),
  note              text,                                                     -- their words; what memory should remember
  deferred_until    date,
  channel           text NOT NULL CHECK (channel IN ('tap','voice','text')),
  avatar_session_id uuid REFERENCES app.avatar_sessions(id),
  decided_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'pushed_back' OR note IS NOT NULL),
  CHECK (kind <> 'deferred' OR deferred_until IS NOT NULL)
);
CREATE INDEX decisions_customer ON app.decisions (customer_id, decided_at DESC);
CREATE INDEX decisions_action ON app.decisions (action_id, decided_at DESC);

-- ---------- executions: what happened on the rails after one-tap consent --------------------
CREATE TABLE app.executions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id       uuid NOT NULL REFERENCES app.actions(id),
  customer_id     uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  consent_id      uuid REFERENCES app.consents(id),                           -- the one-tap consent captured for this execution
  rail            text NOT NULL CHECK (rail IN ('SWEEP_IN_SETUP','RD_OPEN','MF_PURCHASE','SIP_REGISTER','SIP_MODIFY','SIP_PAUSE','MANDATE_REGISTER','INSURANCE_PROPOSAL','PMJJBY_ENROL','CARD_PAYMENT','CATEGORY_CAP','SUBSCRIPTION_CANCEL_GUIDE','RM_CALLBACK')),
  mode            text NOT NULL DEFAULT 'simulated' CHECK (mode IN ('simulated','sandbox','production')), -- no order API exists yet: simulated until it does
  request         jsonb NOT NULL DEFAULT '{}'::jsonb,
  response        jsonb,
  bank_reference  text,                                                       -- order id / UMRN / proposal number
  status          text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','completed','failed','cancelled')),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  failure_code    text,
  failure_detail  text,
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (status <> 'failed' OR failure_code IS NOT NULL)
);
CREATE INDEX executions_action ON app.executions (action_id);

-- ---------- category caps: the daily loop''s only real lever --------------------------------------
CREATE TABLE app.category_caps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,
  category      text NOT NULL REFERENCES ref.spend_categories(category),
  monthly_limit common.inr NOT NULL CHECK (monthly_limit > 0),
  action_id     uuid REFERENCES app.actions(id),
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  active        boolean NOT NULL DEFAULT true,
  ended_at      timestamptz,
  CHECK (active OR ended_at IS NOT NULL)
);
CREATE UNIQUE INDEX category_caps_one_active ON app.category_caps (customer_id, category) WHERE active;

-- ---------- the time machine -----------------------------------------------------------------------
CREATE TABLE app.sim_clocks (
  customer_id    uuid PRIMARY KEY REFERENCES app.customers(id) ON DELETE CASCADE,
  anchor_date    date NOT NULL,                                               -- the persona''s fixed anchor; never moves
  sim_today      date NOT NULL,                                               -- the only thing the control moves
  advanced_count integer NOT NULL DEFAULT 0 CHECK (advanced_count >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (sim_today >= anchor_date - 730)
);

-- ---------- avatar tool calls: the proof the gate fired -----------------------------------------
CREATE TABLE app.avatar_tool_calls (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  uuid NOT NULL REFERENCES app.avatar_sessions(id) ON DELETE CASCADE,
  called_at   timestamptz NOT NULL DEFAULT now(),
  tool        text NOT NULL CHECK (tool IN ('get_snapshot','get_daily_plan','get_roadmap','check_suitability','propose_action','client_event','recall_memory')),
  args        jsonb NOT NULL DEFAULT '{}'::jsonb,
  result      jsonb,
  verdict_id  uuid REFERENCES app.verdicts(id),                               -- set when tool = check_suitability
  action_id   uuid REFERENCES app.actions(id),                                -- set when tool = propose_action
  latency_ms  integer CHECK (latency_ms >= 0),
  CHECK (tool <> 'check_suitability' OR verdict_id IS NOT NULL)
);
CREATE INDEX avatar_tool_calls_session ON app.avatar_tool_calls (session_id, called_at);
CREATE TRIGGER avatar_tool_calls_immutable BEFORE UPDATE OR DELETE ON app.avatar_tool_calls
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();

-- ---------- semantic memory: decisions, not trivia -------------------------------------------------
CREATE TABLE app.memories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES app.customers(id) ON DELETE CASCADE,  -- revoking consent deletes these
  text                text NOT NULL,                                          -- redacted summary; never raw transcript
  topics              text[] NOT NULL DEFAULT '{}',
  emotional_tone      text,
  commitment          jsonb,                                                  -- {"what":"SIP","amount":10000,"by":"2026-10-01"}
  source_session_id   uuid REFERENCES app.avatar_sessions(id),
  source_decision_id  uuid REFERENCES app.decisions(id),
  safeguard           jsonb NOT NULL DEFAULT '{}'::jsonb,                     -- what isSafeToStore() concluded and why
  embedding           vector(1536),                                           -- text-embedding-3-small; Titan v2 is 1024 => new column + re-embed
  embedding_model     text NOT NULL DEFAULT 'text-embedding-3-small',
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz,                                            -- AA DataLife / consent valid_to
  CHECK (cardinality(topics) <= 4)
);
CREATE INDEX memories_customer_time ON app.memories (customer_id, created_at DESC);
CREATE INDEX memories_embedding_hnsw ON app.memories USING hnsw (embedding vector_cosine_ops);
COMMENT ON TABLE app.memories IS 'Semantic memory. Ranking (cosine x recency + topic boost) stays in code; pgvector does the nearest-neighbour search.';

-- ---------- the audit trail: append-only, hash-chained per customer, five-year retention ------------
CREATE TABLE app.audit_records (
  seq                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id                  uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT, -- never cascades: erasure tombstones the customer, records stay
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  sim_date            date,                                                   -- the simulated date, when the demo clock is in play
  event_type          text NOT NULL CHECK (event_type IN ('PROPOSAL','VERDICT','DECISION','EXECUTION','ROADMAP_RECALC','CONSENT_CHANGE','DATA_ACCESS','AVATAR_TOOL_CALL','MEMORY_WRITE','MEMORY_FORGET','ERASURE')),
  snapshot_id         uuid REFERENCES app.snapshots(id),
  snapshot_hash       text CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  roadmap_id          uuid REFERENCES app.roadmaps(id),
  roadmap_version     integer,
  action_id           uuid REFERENCES app.actions(id),
  action_kind         text,
  verdict_id          uuid REFERENCES app.verdicts(id),
  rules_version       text,
  rule_id             text,                                                   -- the rule that fired
  verdict             text CHECK (verdict IN ('PASS','BLOCKED')),
  product_code        text,
  amount              common.inr,
  sentence_shown      text,                                                   -- the exact sentence the customer saw or heard
  decision_kind       text CHECK (decision_kind IN ('did_it','declined','deferred','pushed_back')),
  consent_id          uuid REFERENCES app.consents(id),
  consent_reference   text,
  data_freshness_date date,
  actor               text NOT NULL CHECK (actor IN ('system','customer','model','operator')),
  model_id            text,                                                   -- which model phrased it, for the model registry
  engine_version      text,
  channel             text NOT NULL CHECK (channel IN ('app','avatar','api','batch')),
  request_id          text,
  avatar_session_id   uuid REFERENCES app.avatar_sessions(id),
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash           text NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  record_hash         text NOT NULL UNIQUE CHECK (record_hash ~ '^[0-9a-f]{64}$'),
  retain_until        timestamptz NOT NULL,
  CHECK (event_type <> 'PROPOSAL' OR sentence_shown IS NOT NULL),
  CHECK (event_type <> 'VERDICT'  OR (verdict_id IS NOT NULL AND verdict IS NOT NULL)),
  CHECK (event_type <> 'DECISION' OR decision_kind IS NOT NULL)
);
CREATE INDEX audit_records_customer_time ON app.audit_records (customer_id, occurred_at DESC);
CREATE INDEX audit_records_event ON app.audit_records (event_type, occurred_at DESC);
CREATE INDEX audit_records_retention ON app.audit_records (retain_until);

CREATE OR REPLACE FUNCTION app.audit_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prev text;
BEGIN
  -- serialise per customer so two concurrent inserts cannot chain to the same predecessor
  PERFORM pg_advisory_xact_lock(hashtext(NEW.customer_id::text));
  SELECT record_hash INTO prev FROM app.audit_records
    WHERE customer_id = NEW.customer_id ORDER BY seq DESC LIMIT 1;
  NEW.prev_hash   := coalesce(prev, repeat('0', 64));
  NEW.retain_until := NEW.occurred_at + interval '5 years';
  NEW.record_hash := encode(sha256(convert_to(
      NEW.prev_hash || '|' || NEW.customer_id::text || '|' || NEW.event_type || '|' || NEW.occurred_at::text
      || '|' || coalesce(NEW.snapshot_hash, '') || '|' || coalesce(NEW.rule_id, '') || '|' || coalesce(NEW.verdict, '')
      || '|' || coalesce(NEW.sentence_shown, '') || '|' || coalesce(NEW.decision_kind, '')
      || '|' || coalesce(NEW.consent_reference, '') || '|' || NEW.payload::text, 'UTF8')), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER audit_records_chain BEFORE INSERT ON app.audit_records
  FOR EACH ROW EXECUTE FUNCTION app.audit_chain();
CREATE TRIGGER audit_records_immutable BEFORE UPDATE OR DELETE ON app.audit_records
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();
CREATE TRIGGER audit_records_no_truncate BEFORE TRUNCATE ON app.audit_records
  FOR EACH STATEMENT EXECUTE FUNCTION common.forbid_mutation();
COMMENT ON TABLE app.audit_records IS 'One row per proposal / verdict / decision / execution / consent change. Hash-chained per customer; UPDATE, DELETE and TRUNCATE are rejected by trigger; retained five years.';

-- Verifies a customer''s chain end to end. Returns the first broken seq, or NULL when intact.
CREATE OR REPLACE FUNCTION app.audit_chain_verify(p_customer uuid) RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE r record; expected text := repeat('0', 64); h text;
BEGIN
  FOR r IN SELECT * FROM app.audit_records WHERE customer_id = p_customer ORDER BY seq LOOP
    IF r.prev_hash <> expected THEN RETURN r.seq; END IF;
    h := encode(sha256(convert_to(
      r.prev_hash || '|' || r.customer_id::text || '|' || r.event_type || '|' || r.occurred_at::text
      || '|' || coalesce(r.snapshot_hash, '') || '|' || coalesce(r.rule_id, '') || '|' || coalesce(r.verdict, '')
      || '|' || coalesce(r.sentence_shown, '') || '|' || coalesce(r.decision_kind, '')
      || '|' || coalesce(r.consent_reference, '') || '|' || r.payload::text, 'UTF8')), 'hex');
    IF h <> r.record_hash THEN RETURN r.seq; END IF;
    expected := r.record_hash;
  END LOOP;
  RETURN NULL;
END $$;

-- ---------- seed: the nine suitability rules, in ladder order --------------------------------------
INSERT INTO ref.suitability_rules (rules_version, rule_id, ordinal, title, description, params) VALUES
  ('2026.09.03-schema-v1', 'HIGH_INTEREST_DEBT',      1, 'High-interest debt first',        'No investment is recommended while high-interest debt is outstanding.', '{"highInterestThreshold":24}'),
  ('2026.09.03-schema-v1', 'MISSED_REPAYMENT',        2, 'Missed repayment on record',      'Any days-past-due blocks investment; the customer is routed to assistance.', '{}'),
  ('2026.09.03-schema-v1', 'EMERGENCY_BUFFER',        3, 'Emergency buffer before lock-in', 'Locked-in or volatile products wait until the buffer floor is met.', '{"bufferFloorMonths":3}'),
  ('2026.09.03-schema-v1', 'RISK_CEILING',            4, 'Riskometer above profile',        'A product above the customer''s risk profile ceiling is not offered.', '{"Conservative":"Moderate","Balanced":"Very High","Growth":"Very High"}'),
  ('2026.09.03-schema-v1', 'VOLATILITY_VS_HORIZON',   5, 'Volatile product, short horizon', 'Equity-linked products need a horizon of several years.', '{"minYears":3}'),
  ('2026.09.03-schema-v1', 'AFFORDABILITY',           6, 'Amount above deployable surplus', 'The monthly amount may not exceed the deployable surplus.', '{}'),
  ('2026.09.03-schema-v1', 'HORIZON_VS_LOCKIN',       7, 'Lock-in beyond the goal date',    'A lock-in longer than the goal horizon disqualifies the product.', '{}'),
  ('2026.09.03-schema-v1', 'TAX_BENEFIT_UNAVAILABLE', 8, 'Tax benefit unavailable',         'ELSS is only suitable on the old tax regime.', '{}'),
  ('2026.09.03-schema-v1', 'BUNDLED_PROTECTION',      9, 'Bundled protection and investment','ULIP / endowment refused in favour of term cover plus a fund.', '{}');

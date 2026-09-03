-- Smoke test: one customer through the whole path, idempotency, hash chain, immutability.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO app.customers (id, cif, cust_id, display_name, tax_regime, data_source)
VALUES ('11111111-1111-1111-1111-111111111111', 'IDBI0009182731', 'demo-rohan', 'Rohan Mehta', 'new', 'fixtures');

INSERT INTO app.consents (id, customer_id, consent_reference, kind, scopes, data_period_from, data_period_to,
                          frequency_unit, frequency_value, status, granted_at, valid_to)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'CONS_SYN_982731', 'synthetic',
        ARRAY['PROFILE','ACCOUNTS','TXN','HOLDINGS','LIABILITIES'], '2025-08-01', '2026-07-31',
        'DAY', 1, 'ACTIVE', now(), now() + interval '1 year');

INSERT INTO staging.sync_runs (id, customer_id, consent_id, source, trigger, data_blocks, data_freshness_date, as_of, finished_at, status, engine_version)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
        'fixtures', 'manual', ARRAY['PROFILE','TXN'], '2026-08-20', '2026-08-20 18:30+05:30', now(), 'succeeded', '2026.09.03-schema-v1');

-- a sync run against a revoked consent must be refused by the trigger
INSERT INTO app.consents (id, customer_id, consent_reference, kind, scopes, data_period_from, data_period_to, fetch_type, status, granted_at, valid_to, revoked_at)
VALUES ('22222222-2222-2222-2222-222222222229', '11111111-1111-1111-1111-111111111111', 'CONS_SYN_REVOKED', 'synthetic',
        ARRAY['TXN'], '2025-08-01', '2026-07-31', 'ONETIME', 'REVOKED', now() - interval '2 days', now() + interval '1 year', now() - interval '1 day');
DO $$ BEGIN
  INSERT INTO staging.sync_runs (customer_id, consent_id, source, trigger, as_of)
  VALUES ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222229', 'fixtures', 'manual', now());
  RAISE EXCEPTION 'sync run on a revoked consent was accepted';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: sync run on revoked consent refused'; END $$;

-- raw payload: same bytes twice => one row
INSERT INTO staging.raw_payloads (sync_run_id, source, endpoint_code, customer_id, fetched_at, payload, payload_hash, payload_bytes)
VALUES ('33333333-3333-3333-3333-333333333333', 'fixtures', 'fixtures/customer-file', '11111111-1111-1111-1111-111111111111', now(),
        '{"accounts":[{"accountNumberMasked":"XXXXXX7412"}]}', common.sha256_hex('{"accounts":[{"accountNumberMasked":"XXXXXX7412"}]}'::jsonb), 52)
ON CONFLICT (source, endpoint_code, payload_hash) DO NOTHING;
INSERT INTO staging.raw_payloads (sync_run_id, source, endpoint_code, customer_id, fetched_at, payload, payload_hash, payload_bytes)
VALUES ('33333333-3333-3333-3333-333333333333', 'fixtures', 'fixtures/customer-file', '11111111-1111-1111-1111-111111111111', now(),
        '{"accounts":[{"accountNumberMasked":"XXXXXX7412"}]}', common.sha256_hex('{"accounts":[{"accountNumberMasked":"XXXXXX7412"}]}'::jsonb), 52)
ON CONFLICT (source, endpoint_code, payload_hash) DO NOTHING;
SELECT count(*) AS raw_payload_rows_expect_1 FROM staging.raw_payloads;

INSERT INTO bank.customer_profiles (customer_id, sync_run_id, source, as_of, cif, date_of_birth, gender, marital_status, dependents_count,
  employment_type, declared_annual_income, kyc_status, risk_profile, risk_profile_raw, customer_since, city, state_code, preferred_language)
VALUES ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'fixtures', '2026-08-20 18:30+05:30', 'IDBI0009182731',
  '1997-03-14', 'Male', 'Married', 2, 'Salaried', 1020000.00, 'VERIFIED', 'Balanced', 'Moderate', '2016-11-08', 'Indore', '23', 'en-IN');

INSERT INTO bank.accounts (id, customer_id, account_ref, account_number_masked, product_kind, scheme_type, scheme_code, source, first_seen_run_id, last_seen_run_id)
VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'fx:rohan:sb', 'XXXXXX7412', 'CASA', 'SBA', 'SBSAL', 'fixtures',
        '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333');

INSERT INTO bank.account_snapshots (account_id, sync_run_id, source, as_of, account_type, is_salary_account, mode_of_operation, status,
  branch_ifsc, opening_date, current_balance, lien_amount, avg_monthly_balance_3m, avg_monthly_balance_12m, min_balance_12m)
VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'fixtures', '2026-08-20 18:30+05:30', 'SALARY', true, 'SINGLE', 'ACTIVE',
  'IBKL0000001', '2016-11-08', 258773.00, 0, 156200.00, 142800.00, 122841.00);

-- two statement lines, then the same salary line again => upsert, still two rows
INSERT INTO bank.transactions (account_id, customer_id, source, first_seen_run_id, tran_id, dedupe_hash, tran_date, value_date, tran_type, amount,
  balance_after, channel_code, narration, utr, is_salary_credit_bank)
VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'fixtures', '33333333-3333-3333-3333-333333333333',
  'S82918001', common.sha256_hex('{"k":"sal-2026-08-01"}'::jsonb), '2026-08-01', '2026-08-01', 'CREDIT', 85000.00, 258773.00, 'NEFT',
  'NEFT-CR-HDFC0000123-ACME TECHNOLOGIES PVT LTD-SALARY', 'HDFCN52130000123', true)
ON CONFLICT (account_id, tran_id, part_tran_srl_num) DO UPDATE SET balance_after = EXCLUDED.balance_after;
INSERT INTO bank.transactions (account_id, customer_id, source, first_seen_run_id, tran_id, dedupe_hash, tran_date, value_date, tran_type, amount,
  balance_after, channel_code, narration, rrn, counterparty_vpa)
VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'fixtures', '33333333-3333-3333-3333-333333333333',
  'S82918002', common.sha256_hex('{"k":"swiggy-2026-08-03"}'::jsonb), '2026-08-03', '2026-08-03', 'DEBIT', 1180.00, 257593.00, 'UPI',
  'UPI/DR/621583472910/SWIGGY/ICIC/swiggy@icici/Food', '621583472910', 'swiggy@icici');
INSERT INTO bank.transactions (account_id, customer_id, source, first_seen_run_id, tran_id, dedupe_hash, tran_date, value_date, tran_type, amount,
  balance_after, channel_code, narration, utr, is_salary_credit_bank)
VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'fixtures', '33333333-3333-3333-3333-333333333333',
  'S82918001', common.sha256_hex('{"k":"sal-2026-08-01"}'::jsonb), '2026-08-01', '2026-08-01', 'CREDIT', 85000.00, 258773.00, 'NEFT',
  'NEFT-CR-HDFC0000123-ACME TECHNOLOGIES PVT LTD-SALARY', 'HDFCN52130000123', true)
ON CONFLICT (account_id, tran_id, part_tran_srl_num) DO UPDATE SET balance_after = EXCLUDED.balance_after;
SELECT count(*) AS txn_rows_expect_2 FROM bank.transactions;

-- a bad RRN must be rejected
DO $$ BEGIN
  INSERT INTO bank.transactions (account_id, customer_id, source, first_seen_run_id, tran_id, dedupe_hash, tran_date, value_date, tran_type, amount, channel_code, narration, rrn)
  VALUES ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'fixtures', '33333333-3333-3333-3333-333333333333',
    'S82918003', common.sha256_hex('{"k":"bad"}'::jsonb), '2026-08-03', '2026-08-03', 'DEBIT', 10.00, 'UPI', 'UPI/BAD', 'ABC');
  RAISE EXCEPTION 'bad RRN was accepted';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: bad RRN rejected'; END $$;

-- a product row, a snapshot (hash filled by trigger), a verdict, an action, a decision
INSERT INTO ref.products (id, product_id, name, product_type, category, riskometer, manufacturer, min_investment, lock_in_years, expense_ratio,
  insurance_product, bundles_protection_and_investment, cover_amount, cover_type, is_transactable, is_transactable_sandbox)
VALUES ('55555555-5555-5555-5555-555555555555', 'LIC_ULIP_401', 'LIC Market Plus ULIP', 'INSURANCE', 'ULIP', 'High', 'LIC of India', 2500, 5, 2.25,
  true, true, 300000, 'life', true, true);

INSERT INTO app.snapshots (id, customer_id, sync_run_id, consent_id, as_of, engine_version, snapshot, surplus_deployable, income_monthly, idle_floor)
VALUES ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222', '2026-09-01', '2026.09.03-schema-v1',
  '{"asOf":"2026-09-01","income":{"monthly":85000},"surplus":{"deployable":11481}}', 11481, 85000, 122841);
SELECT snapshot_hash = common.sha256_hex(snapshot) AS snapshot_hash_filled_expect_t FROM app.snapshots;

INSERT INTO app.verdicts (id, customer_id, snapshot_id, product_id, product_code, amount_monthly, verdict, rules_version, rule_id, spoken, recorded, passed, requested_by)
VALUES ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666',
  '55555555-5555-5555-5555-555555555555', 'LIC_ULIP_401', 2500, 'BLOCKED', '2026.09.03-schema-v1', 'BUNDLED_PROTECTION',
  'A ULIP bundles cover and investing; term cover plus an index fund does both jobs for less.',
  'BUNDLED_PROTECTION fired for LIC_ULIP_401 at 2500/month', ARRAY['HIGH_INTEREST_DEBT','MISSED_REPAYMENT','EMERGENCY_BUFFER','RISK_CEILING','VOLATILITY_VS_HORIZON','AFFORDABILITY','HORIZON_VS_LOCKIN','TAX_BENEFIT_UNAVAILABLE'], 'avatar_tool');

-- a PASS verdict with a rule_id must fail the CHECK
DO $$ BEGIN
  INSERT INTO app.verdicts (customer_id, snapshot_id, product_id, product_code, verdict, rules_version, rule_id, recorded, requested_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'LIC_ULIP_401', 'PASS', '2026.09.03-schema-v1', 'AFFORDABILITY', 'x', 'test');
  RAISE EXCEPTION 'inconsistent verdict accepted';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: PASS-with-rule rejected'; END $$;

INSERT INTO app.actions (id, customer_id, snapshot_id, kind, label, detail, amount, product_id, product_code, verdict_id, status)
VALUES ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'buy_term_cover',
  'Get ₹1 crore term cover for ₹880 a month', 'LIC term assurance, pure cover, no maturity value', 880, '55555555-5555-5555-5555-555555555555', 'LIC_TERM_201',
  '77777777-7777-7777-7777-777777777777', 'shown');

-- a product action without a verdict must fail
DO $$ BEGIN
  INSERT INTO app.actions (customer_id, snapshot_id, kind, label, detail, amount, product_id, product_code)
  VALUES ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'start_sip', 'x', 'x', 500, '55555555-5555-5555-5555-555555555555', 'X');
  RAISE EXCEPTION 'ungated product action accepted';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: ungated product action rejected'; END $$;

INSERT INTO app.decisions (action_id, customer_id, kind, note, channel)
VALUES ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'pushed_back', 'Can we do 5,000 instead of 10,000 this month?', 'voice');

-- audit chain: two records, verify, then prove immutability
INSERT INTO app.audit_records (customer_id, event_type, snapshot_id, snapshot_hash, verdict_id, rules_version, rule_id, verdict, product_code, amount,
  sentence_shown, consent_id, consent_reference, data_freshness_date, actor, engine_version, channel)
SELECT '11111111-1111-1111-1111-111111111111', 'VERDICT', s.id, s.snapshot_hash, '77777777-7777-7777-7777-777777777777', '2026.09.03-schema-v1', 'BUNDLED_PROTECTION',
  'BLOCKED', 'LIC_ULIP_401', 2500, 'A ULIP bundles cover and investing; term cover plus an index fund does both jobs for less.',
  '22222222-2222-2222-2222-222222222222', 'CONS_SYN_982731', '2026-08-20', 'system', '2026.09.03-schema-v1', 'avatar'
FROM app.snapshots s;
INSERT INTO app.audit_records (customer_id, event_type, action_id, action_kind, decision_kind, sentence_shown, consent_reference, actor, channel)
VALUES ('11111111-1111-1111-1111-111111111111', 'DECISION', '88888888-8888-8888-8888-888888888888', 'buy_term_cover', 'pushed_back',
  'Get ₹1 crore term cover for ₹880 a month', 'CONS_SYN_982731', 'customer', 'avatar');

SELECT seq, event_type, left(prev_hash, 8) AS prev8, left(record_hash, 8) AS hash8, retain_until::date FROM app.audit_records ORDER BY seq;
SELECT app.audit_chain_verify('11111111-1111-1111-1111-111111111111') AS chain_break_expect_null;

DO $$ BEGIN
  UPDATE app.audit_records SET sentence_shown = 'tampered' WHERE seq = 1;
  RAISE EXCEPTION 'audit update was allowed';
EXCEPTION WHEN integrity_constraint_violation THEN RAISE NOTICE 'ok: audit UPDATE rejected'; END $$;
DO $$ BEGIN
  DELETE FROM app.audit_records WHERE seq = 1;
  RAISE EXCEPTION 'audit delete was allowed';
EXCEPTION WHEN integrity_constraint_violation THEN RAISE NOTICE 'ok: audit DELETE rejected'; END $$;
DO $$ BEGIN
  UPDATE app.snapshots SET surplus_deployable = 0;
  RAISE EXCEPTION 'snapshot update was allowed';
EXCEPTION WHEN integrity_constraint_violation THEN RAISE NOTICE 'ok: snapshot UPDATE rejected'; END $$;

-- the current views pick the latest run
INSERT INTO staging.sync_runs (id, customer_id, consent_id, source, trigger, as_of, finished_at, status)
VALUES ('33333333-3333-3333-3333-333333333334', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'fixtures', 'schedule', '2026-08-21 18:30+05:30', now(), 'succeeded');
INSERT INTO bank.account_snapshots (account_id, sync_run_id, source, as_of, account_type, status, current_balance)
VALUES ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333334', 'fixtures', '2026-08-21 18:30+05:30', 'SALARY', 'ACTIVE', 257593.00);
SELECT current_balance AS current_view_balance_expect_257593 FROM bank.account_snapshots_current;
SELECT count(*) AS customer_360_rows_expect_1 FROM app.customer_360;

-- memory with an embedding, nearest-neighbour query works
INSERT INTO app.memories (customer_id, text, topics, embedding)
VALUES ('11111111-1111-1111-1111-111111111111', 'Said he would start a 10,000 SIP after the education loan ends in March.', ARRAY['sip','commitment'],
        ('[' || array_to_string(array_fill(0.01::float4, ARRAY[1536]), ',') || ']')::vector);
SELECT 1 - (embedding <=> ('[' || array_to_string(array_fill(0.01::float4, ARRAY[1536]), ',') || ']')::vector) AS cosine_expect_1 FROM app.memories;

SELECT table_schema, count(*) AS tables FROM information_schema.tables
WHERE table_schema IN ('ref','staging','bank','app') AND table_type = 'BASE TABLE' GROUP BY 1 ORDER BY 1;

ROLLBACK;

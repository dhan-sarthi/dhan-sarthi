-- =====================================================================================
-- Dhan Sarthi — wealth-advisory module for IDBI GO Mobile+
-- Part 0: extensions, schemas, shared domains, helper functions, reference tables
-- Target: PostgreSQL 17 (+ pgvector). Tested against embedded PostgreSQL 16 + pgvector.
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS vector;       -- app.memories.embedding (pgvector)
-- pg_trgm and btree_gist ship with every RDS / stock PostgreSQL build; they are guarded so the
-- schema still loads on a minimal build (the embedded server used to test this file lacks them).
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy narration / merchant search
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_trgm unavailable: trigram indexes skipped'; END $$;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS btree_gist; -- exclusion constraints over (uuid, range)
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'btree_gist unavailable: rate-card exclusion skipped'; END $$;

CREATE SCHEMA IF NOT EXISTS common;
CREATE OR REPLACE FUNCTION common.has_ext(name text) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = $1) $$;

-- Four namespaces, one rule each:
--   bank     mirrors of what IDBI / the Account Aggregator supplied. Never edited by hand.
--   ref      reference data we curate: product shelf, MCC, merchants, holidays, rules.
--   app      our own objects: goals, roadmaps, plans, actions, decisions, audit, memory.
--   staging  raw payloads and projection bookkeeping; the only place unknown shapes land.
CREATE SCHEMA IF NOT EXISTS common;
CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS bank;
CREATE SCHEMA IF NOT EXISTS app;

-- ---------- shared domains -----------------------------------------------------------
-- Every rupee column is common.inr = NUMERIC(18,2). Units and NAVs carry four decimals as
-- RTAs report them; rates carry four so 7.125% and MCLR + 235 bps both round-trip.
CREATE DOMAIN common.inr      AS numeric(18,2);
CREATE DOMAIN common.units    AS numeric(18,4);
CREATE DOMAIN common.nav      AS numeric(18,4);
CREATE DOMAIN common.pct      AS numeric(7,4);
CREATE DOMAIN common.currency AS char(3) DEFAULT 'INR' CHECK (VALUE ~ '^[A-Z]{3}$');
-- Where a row came from. 'fixtures' is the synthetic generator writing through the same
-- pipeline the sandbox will use, so day one of the sandbox is a new adapter, not a new path.
CREATE DOMAIN common.source   AS text CHECK (VALUE IN ('fixtures', 'idbi_api', 'aa', 'manual'));
-- BCP-47 tag as the customer-master carries it: en-IN, hi-IN, mr-IN ...
CREATE DOMAIN common.lang_tag AS text CHECK (VALUE ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$');
-- ISIN: 2 letters, 9 alphanumerics, 1 check digit (ISO 6166).
CREATE DOMAIN common.isin     AS char(12) CHECK (VALUE ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$');
-- IFSC: 4-letter bank code, literal 0, 6 alphanumerics (RBI). IDBI Bank's prefix is IBKL.
CREATE DOMAIN common.ifsc     AS char(11) CHECK (VALUE ~ '^[A-Z]{4}0[A-Z0-9]{6}$');
-- Masked account number as banks render it: X's then the last 4 digits.
CREATE DOMAIN common.masked_acct AS text CHECK (VALUE ~ '^[X*]{2,}[0-9]{4}$');

-- ---------- helper functions ---------------------------------------------------------
-- Optimistic concurrency + updated_at on every mutable row.
CREATE OR REPLACE FUNCTION common.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at  := now();
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END $$;

-- Append-only guard. Attached BEFORE UPDATE OR DELETE (row) and BEFORE TRUNCATE (statement)
-- to audit_records, snapshots, verdicts, roadmaps, raw_payloads and bank mirrors.
CREATE OR REPLACE FUNCTION common.forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is append-only: % rejected', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

-- Canonical JSON hashing for snapshots and audit records: jsonb normalises key order and
-- whitespace, so the same facts always hash the same way. Hex sha256, 64 chars.
CREATE OR REPLACE FUNCTION common.sha256_hex(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT encode(sha256(convert_to(p::text, 'UTF8')), 'hex')
$$;

-- ---------- reference: codes ---------------------------------------------------------
-- GST state codes; the sandbox spec adopts the GSTN convention for state_code.
CREATE TABLE ref.state_codes (
  state_code  char(2) PRIMARY KEY CHECK (state_code ~ '^[0-9]{2}$'),  -- '23' Madhya Pradesh
  name        text NOT NULL,
  is_metro_state boolean NOT NULL DEFAULT false                          -- cost-of-living proxy
);

-- Spend categories are the fifteen `SpendCategory` values in packages/core/src/types.ts.
-- Kept as a table so MCC and merchant rows can reference them.
CREATE TABLE ref.spend_categories (
  category      text PRIMARY KEY,                 -- 'Food & dining'
  never_discretionary boolean NOT NULL DEFAULT false, -- Investment, Insurance, Education, Loan EMI, Fees & charges, Income
  sort_order    smallint NOT NULL
);

-- ISO 18245 merchant category codes, restricted to those Indian retail spend actually hits.
CREATE TABLE ref.mcc_codes (
  mcc            char(4) PRIMARY KEY CHECK (mcc ~ '^[0-9]{4}$'),
  description    text NOT NULL,                                     -- as published by the networks
  spend_category text NOT NULL REFERENCES ref.spend_categories(category),
  discretionary_default boolean NOT NULL,                           -- starting point; engine may override
  source_url     text                                               -- where the description was checked
);

-- Payment rails / channels as they appear in Indian CBS exports and statement narrations.
CREATE TABLE ref.channel_codes (
  code        text PRIMARY KEY,      -- 'UPI','NEFT','IMPS','RTGS','ACH_DR','ACH_CR','SI','POS','ECOM','ATM','CDM','CHQ','TFR','INT','CHG','TDS','BBPS','CASH','REV','OTHER'
  description text NOT NULL,
  rail_owner  text,                  -- 'NPCI','RBI','Bank','Card network'
  same_day_value boolean NOT NULL DEFAULT true, -- false where value date can lag the posting date (cheques, some NEFT/ACH)
  implies_mandate boolean NOT NULL DEFAULT false -- ACH_DR / SI: a standing commitment, not a choice
);

-- Bank-specific narration grammar, data not code. `field_map` names capture groups:
-- {"1":"rrn","2":"counterparty_name","3":"counterparty_vpa"}. Priority: lower wins.
CREATE TABLE ref.narration_patterns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_code    text NOT NULL DEFAULT 'IBKL',     -- IFSC prefix of the issuing bank
  channel_code text NOT NULL REFERENCES ref.channel_codes(code),
  pattern      text NOT NULL,                     -- POSIX regex, anchored
  field_map    jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority     smallint NOT NULL DEFAULT 100,
  example      text,                              -- one real-looking line the pattern matches
  active       boolean NOT NULL DEFAULT true,
  notes        text,
  UNIQUE (bank_code, channel_code, pattern)
);

-- Canonical merchants for enrichment. Aliases are the uppercase fragments that appear in
-- narrations; VPA handles are the UPI ids seen on the counterparty side.
CREATE TABLE ref.merchants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  text NOT NULL UNIQUE,           -- 'Swiggy'
  aliases         text[] NOT NULL DEFAULT '{}',   -- {'SWIGGY','BUNDL TECHNOLOGIES'}
  vpa_handles     text[] NOT NULL DEFAULT '{}',   -- {'swiggy@icici','swiggyupi@axb'}
  mcc             char(4) REFERENCES ref.mcc_codes(mcc),
  spend_category  text NOT NULL REFERENCES ref.spend_categories(category),
  is_subscription boolean NOT NULL DEFAULT false, -- fixed amount, same day, cancellable
  is_utility      boolean NOT NULL DEFAULT false, -- recurring but variable
  is_lender       boolean NOT NULL DEFAULT false, -- EMI counterparties
  is_amc_or_rta   boolean NOT NULL DEFAULT false, -- SIP counterparties
  website         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  row_version     integer NOT NULL DEFAULT 1
);
CREATE INDEX merchants_aliases_gin ON ref.merchants USING gin (aliases);
DO $$ BEGIN IF common.has_ext('pg_trgm') THEN
  CREATE INDEX merchants_name_trgm ON ref.merchants USING gin (canonical_name gin_trgm_ops);
END IF; END $$;
CREATE TRIGGER merchants_touch BEFORE UPDATE ON ref.merchants
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

-- Bank holidays drive value-date realism (NEFT settles next working day when it lands on a
-- holiday; cheques clear T+1 working day). state_code NULL = national / RBI holiday.
CREATE TABLE ref.bank_holidays (
  holiday_date date NOT NULL,
  state_code   char(2) REFERENCES ref.state_codes(state_code),
  state_scope  text GENERATED ALWAYS AS (coalesce(state_code, 'ALL')) STORED,
  description  text NOT NULL,
  PRIMARY KEY (holiday_date, state_scope)
);

-- ---------- reference: product shelf -------------------------------------------------
-- What IDBI can actually put a customer into. Mirrors `Product` in packages/core/src/types.ts
-- plus the sandbox spec's group 06 fields. Source 'fixtures' until a shelf API exists.
CREATE TABLE ref.products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        text NOT NULL UNIQUE,         -- 'IDBI_SWEEP_001', 'MF_INDEX_103', 'LIC_ULIP_401'
  name              text NOT NULL,
  product_type      text NOT NULL CHECK (product_type IN ('DEPOSIT','MUTUAL_FUND','INSURANCE','GOVT_SCHEME','NPS')),
  category          text NOT NULL CHECK (category IN (
                      'Sweep-in FD','Fixed Deposit','Recurring Deposit','Liquid','Debt','Index Fund','Equity',
                      'ELSS','Term Insurance','Health Insurance','Government Insurance','NPS','PPF','ULIP','Endowment')),
  riskometer        text NOT NULL CHECK (riskometer IN ('Low','Low to Moderate','Moderate','Moderately High','High','Very High')),
  manufacturer      text NOT NULL,                -- 'IDBI Bank','LIC Mutual Fund','LIC of India','Government of India','PFRDA'
  isin              common.isin,                  -- MF / ETF only
  amfi_code         text,                         -- AMFI scheme code, MF only
  plan_type         text CHECK (plan_type IN ('Direct','Regular')),
  scheme_option     text CHECK (scheme_option IN ('Growth','IDCW Payout','IDCW Reinvestment')),
  min_investment    common.inr NOT NULL CHECK (min_investment >= 0),  -- min SIP ticket / premium / min deposit
  min_lumpsum       common.inr CHECK (min_lumpsum >= 0),
  lock_in_years     numeric(4,1) NOT NULL DEFAULT 0 CHECK (lock_in_years >= 0),
  exit_load         text,
  expense_ratio     common.pct CHECK (expense_ratio >= 0),
  indicative_return common.pct,                   -- contractual deposit rates only
  return_1y         common.pct, return_3y common.pct, return_5y common.pct,
  returns_as_of     date,
  insurance_product boolean NOT NULL DEFAULT false,
  bundles_protection_and_investment boolean NOT NULL DEFAULT false, -- the ULIP / endowment flag
  cover_amount      common.inr CHECK (cover_amount >= 0),
  cover_type        text CHECK (cover_type IN ('life','health','accident')),
  is_transactable   boolean NOT NULL DEFAULT false,
  is_transactable_sandbox boolean NOT NULL DEFAULT false,
  source            common.source NOT NULL DEFAULT 'fixtures',
  valid_from        date NOT NULL DEFAULT current_date,
  valid_to          date,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  row_version       integer NOT NULL DEFAULT 1,
  CHECK (cover_type IS NULL OR insurance_product),
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  CHECK ((return_1y IS NULL AND return_3y IS NULL AND return_5y IS NULL) OR returns_as_of IS NOT NULL)
);
CREATE TRIGGER products_touch BEFORE UPDATE ON ref.products
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();

-- Deposit rate cards by tenure bucket, effective-dated; no two rows may overlap for a product.
CREATE TABLE ref.deposit_rate_cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES ref.products(id),
  tenure_from_days integer NOT NULL CHECK (tenure_from_days >= 7),
  tenure_to_days   integer NOT NULL,
  rate_general     common.pct NOT NULL,
  rate_senior      common.pct,                    -- senior-citizen premium included
  min_amount       common.inr NOT NULL DEFAULT 0,
  max_amount       common.inr,                    -- bulk deposits (>= ₹3 crore) carry different cards
  effective_from   date NOT NULL,
  effective_to     date,
  source_url       text,
  CHECK (tenure_to_days >= tenure_from_days)
);
-- No two rate rows for one product may overlap in both tenure bucket and effective period.
DO $$ BEGIN IF common.has_ext('btree_gist') THEN
  ALTER TABLE ref.deposit_rate_cards ADD CONSTRAINT deposit_rate_cards_no_overlap
    EXCLUDE USING gist (
      product_id WITH =,
      int4range(tenure_from_days, tenure_to_days, '[]') WITH &&,
      daterange(effective_from, effective_to, '[)') WITH &&
    );
END IF; END $$;

-- ---------- reference: rules and engine versions --------------------------------------
-- The suitability rules live in packages/core; this table is the *text* a reviewer reads
-- against audit_records.rule_id, pinned by rules_version so old records stay explainable.
CREATE TABLE ref.engine_versions (
  version     text PRIMARY KEY,                   -- '2026.09.03-1' or the git sha
  released_at timestamptz NOT NULL DEFAULT now(),
  git_sha     text,
  notes       text
);

CREATE TABLE ref.suitability_rules (
  rules_version text NOT NULL REFERENCES ref.engine_versions(version),
  rule_id       text NOT NULL,                    -- 'HIGH_INTEREST_DEBT'
  ordinal       smallint NOT NULL,                -- evaluation order in the ladder
  title         text NOT NULL,
  description   text NOT NULL,                    -- the reviewer-facing sentence
  params        jsonb NOT NULL DEFAULT '{}'::jsonb, -- thresholds the rule reads, e.g. {"highInterestThreshold":24}
  PRIMARY KEY (rules_version, rule_id),
  UNIQUE (rules_version, ordinal)
);

-- ---------- seeds ----------------------------------------------------------------------
INSERT INTO ref.spend_categories (category, never_discretionary, sort_order) VALUES
  ('Income', true, 1), ('Rent & bills', false, 2), ('Groceries', false, 3), ('Food & dining', false, 4),
  ('Transport', false, 5), ('Shopping', false, 6), ('Entertainment', false, 7), ('Health', false, 8),
  ('Education', true, 9), ('Investment', true, 10), ('Insurance', true, 11), ('Loan EMI', true, 12),
  ('Cash', false, 13), ('Transfers', false, 14), ('Fees & charges', true, 15);

INSERT INTO ref.channel_codes (code, description, rail_owner, same_day_value, implies_mandate) VALUES
  ('UPI',   'Unified Payments Interface (P2P / P2M, incl. UPI Autopay)', 'NPCI', true,  false),
  ('NEFT',  'National Electronic Funds Transfer, half-hourly batches',    'RBI',  false, false),
  ('IMPS',  'Immediate Payment Service',                                   'NPCI', true,  false),
  ('RTGS',  'Real Time Gross Settlement (₹2 lakh and above)',              'RBI',  true,  false),
  ('ACH_DR','NACH debit under a mandate (EMI, SIP, insurance premium)',    'NPCI', false, true),
  ('ACH_CR','NACH credit (salary, dividend, pension)',                     'NPCI', false, false),
  ('SI',    'Bank standing instruction / internal auto-debit',             'Bank', true,  true),
  ('POS',   'Card present at a terminal',                                  'Card network', true, false),
  ('ECOM',  'Card not present (online)',                                   'Card network', true, false),
  ('ATM',   'ATM cash withdrawal',                                         'Bank', true,  false),
  ('CDM',   'Cash deposit machine / branch cash deposit',                  'Bank', true,  false),
  ('CHQ',   'Cheque (CTS clearing), inward or outward',                    'Bank', false, false),
  ('TFR',   'Intra-bank transfer between own or third-party accounts',     'Bank', true,  false),
  ('INT',   'Interest credit (savings, FD) or debit (loan)',               'Bank', true,  false),
  ('CHG',   'Bank charges incl. GST (AMB shortfall, SMS, card fee, ATM)',  'Bank', true,  false),
  ('TDS',   'Tax deducted at source on deposit interest',                  'Bank', true,  false),
  ('BBPS',  'Bharat Bill Payment System',                                  'NPCI', true,  false),
  ('CASH',  'Cash at branch counter',                                      'Bank', true,  false),
  ('REV',   'Reversal / refund of an earlier transaction',                 'Bank', true,  false),
  ('OTHER', 'Unclassified',                                                NULL,   true,  false);

-- ISO 18245 descriptions as published in Citi's public MCC list; the category mapping is ours.
INSERT INTO ref.mcc_codes (mcc, description, spend_category, discretionary_default, source_url) VALUES
  ('4111','Transportation - Suburban and Local Commuter Passenger, including Ferries','Transport',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4112','Passenger Railways','Transport',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4121','Taxicabs and Limousines','Transport',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4131','Bus Lines','Transport',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4511','Air Carriers, Airlines','Transport',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4722','Travel Agencies and Tour Operators','Shopping',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4784','Bridge and Road Fees, Tolls','Transport',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4814','Telecommunication Services','Rent & bills',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4816','Computer Network/Information Services','Rent & bills',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4829','Wire Transfer Money Orders','Transfers',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4899','Cable, Satellite, and Other Pay Television and Radio Services','Entertainment',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('4900','Utilities - Electric, Gas, Heating Oil, Sanitary, Water','Rent & bills',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5311','Department Stores','Shopping',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5331','Variety Stores','Groceries',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5399','Miscellaneous General Merchandise Stores','Groceries',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5411','Grocery Stores, Supermarkets','Groceries',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5541','Service Stations','Transport',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5542','Automated Fuel Dispensers','Transport',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5691','Men''s and Women''s Clothing Stores','Shopping',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5722','Household Appliance Stores','Shopping',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5732','Electronics Sales','Shopping',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5812','Eating Places and Restaurants','Food & dining',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5813','Bars, Cocktail Lounges, Discotheques, Nightclubs and Taverns','Food & dining',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5814','Fast Food Restaurants','Food & dining',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5816','Digital Goods: Games','Entertainment',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5912','Drug Stores and Pharmacies','Health',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5945','Game, Toy and Hobby Shops','Shopping',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('5999','Miscellaneous and Specialty Retail Stores','Shopping',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('6011','Member Financial Institution - Automated Cash Disbursements','Cash',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('6012','Member Financial Institution - Merchandise and Services','Loan EMI',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('6211','Securities - Brokers and Dealers','Investment',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('6300','Insurance Sales, Underwriting and Premiums','Insurance',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('6513','Real Estate Agents and Managers - Rentals','Rent & bills',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('6540','POI Funding Transactions','Transfers',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('7011','Lodging - Hotels, Motels, Resorts','Shopping',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('7230','Barber and Beauty Shops','Shopping',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('7832','Motion Picture Theaters','Entertainment',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('7997','Clubs - Country Clubs, Membership (Athletic, Recreation, Sports)','Health',true,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('8011','Doctors','Health',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('8062','Hospitals','Health',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('8099','Health Practitioners, Medical Services NEC','Health',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('8211','Schools, Elementary and Secondary','Education',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('8220','Colleges, Universities, Professional Schools and Junior Colleges','Education',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('9311','Tax Payments','Fees & charges',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf'),
  ('9399','Government Services NEC','Fees & charges',false,'https://www.citibank.com/tts/solutions/commercial-cards/assets/docs/govt/Merchant-Category-Codes.pdf');

INSERT INTO ref.state_codes (state_code, name, is_metro_state) VALUES
  ('07','Delhi', true), ('19','West Bengal', true), ('23','Madhya Pradesh', false), ('24','Gujarat', false),
  ('27','Maharashtra', true), ('29','Karnataka', true), ('32','Kerala', false), ('33','Tamil Nadu', true),
  ('36','Telangana', true), ('09','Uttar Pradesh', false), ('08','Rajasthan', false), ('06','Haryana', false);

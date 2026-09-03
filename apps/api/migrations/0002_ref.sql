-- =====================================================================================
-- 0002  Reference data: codes, the product shelf, engine versions and the rule book.
--
-- From docs/engineering/schema/00_common_ref.sql, minus what the demo does not read yet
-- (narration_patterns, merchants, bank_holidays, deposit_rate_cards — see migrations/README.md).
-- =====================================================================================

-- GST state codes; the sandbox spec adopts the GSTN convention for state_code.
CREATE TABLE ref.state_codes (
  state_code  char(2) PRIMARY KEY CHECK (state_code ~ '^[0-9]{2}$'),
  name        text NOT NULL,
  is_metro_state boolean NOT NULL DEFAULT false
);

-- The fifteen `SpendCategory` values in packages/core/src/types.ts, as a table so MCC rows
-- can reference them.
CREATE TABLE ref.spend_categories (
  category      text PRIMARY KEY,
  never_discretionary boolean NOT NULL DEFAULT false,
  sort_order    smallint NOT NULL
);

-- ISO 18245 merchant category codes, restricted to those Indian retail spend actually hits.
CREATE TABLE ref.mcc_codes (
  mcc            char(4) PRIMARY KEY CHECK (mcc ~ '^[0-9]{4}$'),
  description    text NOT NULL,
  spend_category text NOT NULL REFERENCES ref.spend_categories(category),
  discretionary_default boolean NOT NULL,
  source_url     text
);

-- Payment rails / channels as they appear in Indian CBS exports and statement narrations.
CREATE TABLE ref.channel_codes (
  code        text PRIMARY KEY,
  description text NOT NULL,
  rail_owner  text,
  same_day_value boolean NOT NULL DEFAULT true,
  implies_mandate boolean NOT NULL DEFAULT false
);

-- ---------- product shelf --------------------------------------------------------------
-- What IDBI can actually put a customer into. Mirrors `Product` in packages/core/src/types.ts
-- plus what the shelf port needs (aliases, verified). Source 'fixtures' until a shelf API exists.
CREATE TABLE ref.products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        text NOT NULL UNIQUE,
  name              text NOT NULL,
  product_type      text NOT NULL CHECK (product_type IN ('DEPOSIT','MUTUAL_FUND','INSURANCE','GOVT_SCHEME','NPS')),
  category          text NOT NULL CHECK (category IN (
                      'Sweep-in FD','Fixed Deposit','Recurring Deposit','Liquid','Debt','Index Fund','Equity',
                      'ELSS','Term Insurance','Health Insurance','Government Insurance','NPS','PPF','ULIP','Endowment')),
  riskometer        text NOT NULL CHECK (riskometer IN ('Low','Low to Moderate','Moderate','Moderately High','High','Very High')),
  manufacturer      text NOT NULL,
  isin              common.isin,
  amfi_code         text,
  plan_type         text CHECK (plan_type IN ('Direct','Regular')),
  scheme_option     text CHECK (scheme_option IN ('Growth','IDCW Payout','IDCW Reinvestment')),
  min_investment    common.inr NOT NULL CHECK (min_investment >= 0),
  min_lumpsum       common.inr CHECK (min_lumpsum >= 0),
  lock_in_years     numeric(4,1) NOT NULL DEFAULT 0 CHECK (lock_in_years >= 0),
  exit_load         text,
  expense_ratio     common.pct CHECK (expense_ratio >= 0),
  indicative_return common.pct,
  return_1y         common.pct, return_3y common.pct, return_5y common.pct,
  returns_as_of     date,
  insurance_product boolean NOT NULL DEFAULT false,
  bundles_protection_and_investment boolean NOT NULL DEFAULT false,
  cover_amount      common.inr CHECK (cover_amount >= 0),
  cover_type        text CHECK (cover_type IN ('life','health','accident')),
  is_transactable   boolean NOT NULL DEFAULT false,
  is_transactable_sandbox boolean NOT NULL DEFAULT false,
  -- Names a customer might use for it. What the avatar's product resolution matches on.
  aliases           text[] NOT NULL DEFAULT '{}',
  -- True once a banker has confirmed the rate and the name.
  verified          boolean NOT NULL DEFAULT false,
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
CREATE INDEX products_aliases_gin ON ref.products USING gin (aliases);

-- ---------- rules and engine versions --------------------------------------------------
-- The suitability rules live in packages/core; this table is the *text* a reviewer reads
-- against audit_records.rule_id, pinned by rules_version so old records stay explainable.
CREATE TABLE ref.engine_versions (
  version     text PRIMARY KEY,
  released_at timestamptz NOT NULL DEFAULT now(),
  git_sha     text,
  notes       text
);

CREATE TABLE ref.suitability_rules (
  rules_version text NOT NULL REFERENCES ref.engine_versions(version),
  rule_id       text NOT NULL,
  ordinal       smallint NOT NULL,
  title         text NOT NULL,
  description   text NOT NULL,
  params        jsonb NOT NULL DEFAULT '{}'::jsonb,
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

-- The schema baseline, and the rule book as packages/core/src/suitability.ts states it today.
-- `pnpm seed` re-registers the running engine version and upserts these from `ruleBook` so the
-- text a reviewer reads is the text the gate executed, not a copy that drifted.
INSERT INTO ref.engine_versions (version, notes) VALUES ('2026.09.03-schema-v1', 'Schema baseline');

INSERT INTO ref.suitability_rules (rules_version, rule_id, ordinal, title, description, params) VALUES
  ('2026.09.03-schema-v1', 'HIGH_INTEREST_DEBT',      1, 'High-interest debt first',
   'No investment is recommended while high-interest debt is outstanding.', '{"highInterestThreshold":24}'),
  ('2026.09.03-schema-v1', 'MISSED_REPAYMENT',        2, 'Missed repayment on record',
   'No investment is recommended where loan repayments have been missed.', '{}'),
  ('2026.09.03-schema-v1', 'EMERGENCY_BUFFER',        3, 'Emergency buffer before lock-in',
   'Products with a lock-in are not recommended below a three-month emergency buffer.', '{"bufferFloorMonths":3}'),
  ('2026.09.03-schema-v1', 'RISK_CEILING',            4, 'Riskometer above profile',
   'A product''s riskometer band may not exceed the customer''s recorded risk profile.', '{"Conservative":"Moderate","Balanced":"Very High","Growth":"Very High"}'),
  ('2026.09.03-schema-v1', 'VOLATILITY_VS_HORIZON',   5, 'Volatile product, short horizon',
   'A product whose value can fall is not recommended for a goal less than three years away.', '{"minYears":3}'),
  ('2026.09.03-schema-v1', 'AFFORDABILITY',           6, 'Amount above deployable surplus',
   'A recommended amount may not exceed what the customer can actually commit each month.', '{}'),
  ('2026.09.03-schema-v1', 'HORIZON_VS_LOCKIN',       7, 'Lock-in beyond the goal date',
   'A product''s lock-in may not exceed the horizon of the goal it is recommended for.', '{}'),
  ('2026.09.03-schema-v1', 'TAX_BENEFIT_UNAVAILABLE', 8, 'Tax benefit unavailable',
   'A product whose only advantage is a tax deduction is not recommended to a customer who cannot claim it.', '{}'),
  ('2026.09.03-schema-v1', 'BUNDLED_PROTECTION',      9, 'Bundled protection and investment',
   'A product bundling protection with investment is not recommended where an unbundled term policy plus a fund provides equivalent cover at materially lower cost.', '{}');

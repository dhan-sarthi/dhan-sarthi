-- Dhan Sarthi schema.
--
-- Three concerns, deliberately separate: who the customer is and what they consented to,
-- what the advisor remembers, and what was said and why. The third one is what a bank's
-- risk committee actually asks about, so it is a first-class table rather than a log file.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,          -- our id; maps to IDBI CIF
  cif           TEXT UNIQUE,
  name          TEXT NOT NULL,
  date_of_birth DATE,
  language      TEXT NOT NULL DEFAULT 'en-IN',
  risk_profile  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consent is not a boolean. It has a purpose, a scope, an expiry, and it can be revoked --
-- and revocation has to actually do something, which is why memories cascade off it.
CREATE TABLE IF NOT EXISTS consents (
  id           TEXT PRIMARY KEY,
  customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  purpose      TEXT NOT NULL,
  scopes       TEXT[] NOT NULL DEFAULT '{}',   -- transactions, holdings, liabilities, aa
  status       TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | EXPIRED | REVOKED
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS consents_customer_idx ON consents (customer_id, status);

-- text-embedding-3-small is 1536 dimensions. Titan v2 is 1024, so this column changes
-- when we move to Bedrock -- noted in providers/llm.js.
CREATE TABLE IF NOT EXISTS memories (
  id             TEXT PRIMARY KEY,
  customer_id    TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  text           TEXT NOT NULL,
  topics         TEXT[] NOT NULL DEFAULT '{}',
  emotional_tone TEXT,
  commitment     JSONB,
  embedding      VECTOR(1536),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memories_customer_idx ON memories (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_embedding_idx
  ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Every recommendation, the data behind it, and whether the suitability gate let it through.
-- Retained five years per the SEBI AI/ML framework.
CREATE TABLE IF NOT EXISTS advice_records (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  session_id    TEXT,
  recommendation TEXT NOT NULL,
  basis         JSONB NOT NULL,      -- the facts that produced it
  suitability   TEXT NOT NULL,       -- PASS | BLOCKED
  block_reason  TEXT,
  model         TEXT,                -- which model spoke, for the model registry
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advice_customer_idx ON advice_records (customer_id, created_at DESC);

-- =====================================================================================
-- 0001  Foundation: extensions, the four schemas, shared domains, trigger functions, roles.
--
-- A demo-critical subset of docs/engineering/schema/00_common_ref.sql. Everything here is
-- idempotent on its own terms (IF NOT EXISTS, guarded DO blocks) because the roles and the
-- pgvector extension may already exist on the shared Supabase project.
-- =====================================================================================

-- pgvector is pre-installed on Supabase and RDS; created here so a bare Postgres works too.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Guarded: a minimal build may lack them, and nothing demo-critical depends on either.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'pg_trgm unavailable: trigram indexes skipped'; END $$;
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS btree_gist;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'btree_gist unavailable: exclusion constraints skipped'; END $$;

-- Four namespaces, one rule each:
--   bank     mirrors of what IDBI / the Account Aggregator supplied. Never edited by hand.
--   ref      reference data we curate: product shelf, codes, rules, engine versions.
--   app      our own objects: subjects, sessions, snapshots, roadmaps, the audit trail.
--   staging  raw payloads and projection bookkeeping; the only place unknown shapes land.
CREATE SCHEMA IF NOT EXISTS common;
CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS bank;
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION common.has_ext(name text) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = $1) $$;

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
CREATE DOMAIN common.lang_tag AS text CHECK (VALUE ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2})?$');
CREATE DOMAIN common.isin     AS char(12) CHECK (VALUE ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$');
CREATE DOMAIN common.ifsc     AS char(11) CHECK (VALUE ~ '^[A-Z]{4}0[A-Z0-9]{6}$');
CREATE DOMAIN common.masked_acct AS text CHECK (VALUE ~ '^[X*]{2,}[0-9]{4}$');

-- ---------- helper functions ---------------------------------------------------------
CREATE OR REPLACE FUNCTION common.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at  := now();
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END $$;

-- Append-only guard. Attached BEFORE UPDATE OR DELETE (row) and BEFORE TRUNCATE (statement).
CREATE OR REPLACE FUNCTION common.forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%.% is append-only: % rejected', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END $$;

-- jsonb-canonical sha256, used only where the database itself fills a hash. The application
-- hashes its own canonical JSON (apps/api/src/application/hash.ts); the two are not the same
-- bytes and must not be compared to each other.
CREATE OR REPLACE FUNCTION common.sha256_hex(p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT encode(sha256(convert_to(p::text, 'UTF8')), 'hex')
$$;

-- ---------- roles ----------------------------------------------------------------------
-- dhan_migrate documents the owner; dhan_app is what the API runs as. On the shared Supabase
-- project there is one login, so both are NOLOGIN group roles: objects are owned by whoever
-- runs the migrations, and the runtime pool does `SET ROLE dhan_app` (apps/api/src/db/pool.ts).
-- That is what makes the REVOKEs in 0007 binding for the API without a second password.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dhan_migrate') THEN
    CREATE ROLE dhan_migrate NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dhan_app') THEN
    CREATE ROLE dhan_app NOLOGIN;
  END IF;
END $$;

-- The migrating login may assume either role. Tolerated when it already can, or when the role
-- was created by someone else and this login lacks ADMIN on it.
DO $$ BEGIN
  EXECUTE format('GRANT dhan_app TO %I WITH INHERIT FALSE, SET TRUE', current_user);
  EXECUTE format('GRANT dhan_migrate TO %I WITH INHERIT FALSE, SET TRUE', current_user);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not grant dhan_app/dhan_migrate to %: %', current_user, SQLERRM;
END $$;

GRANT USAGE ON SCHEMA common, ref, staging, bank, app TO dhan_app;

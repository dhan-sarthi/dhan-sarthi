-- =====================================================================================
-- 0015  The RM console: the desk's users and their sign-ins, whose book each customer sits in,
--       and what the RM did — notes and calls, handoff status changes, the access log.
--       Additive only. Nothing existing is dropped, and no existing row changes meaning.
--
-- Until this file the Postgres profile ran the desk from memory: a restart signed every RM out,
-- and every note, contacted handoff and access entry went with it. An access log that does not
-- survive the process proves nothing about anyone, so it lives here now, with the same two
-- guards the advice record has: the runtime role (dhan_app) holds no UPDATE or DELETE on it,
-- and a trigger refuses UPDATE, DELETE and TRUNCATE from everyone else.
--
-- The ports these tables serve are apps/api/src/ports/rm-desk.port.ts and rm-activity.port.ts;
-- the adapters are apps/api/src/adapters/postgres/rm-desk.postgres.ts and rm-activity.postgres.ts.
-- 0014 is taken by work on another branch; the migrator allows the gap.
-- =====================================================================================

-- ---------- the desk: who may sign in ----------------------------------------------------------
-- Seeded by `pnpm seed` from the fixtures' desk, never written by the API: like app.customers,
-- this is identity the ingester owns.
CREATE TABLE app.rm_users (
  rm_id          text PRIMARY KEY,                    -- carried on assignments and in the access log
  employee_no    text NOT NULL UNIQUE,                -- what the RM types to sign in; exact match only
  name           text NOT NULL,
  desk           text NOT NULL,
  city           text NOT NULL,
  -- The stored form application/rm/password.ts writes, and nothing else: a column that would
  -- take a plain password is one a careless seed could fill with one.
  password_hash  text NOT NULL
                 CHECK (password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  row_version    integer NOT NULL DEFAULT 1           -- common.set_updated_at bumps it
);
CREATE TRIGGER rm_users_touch BEFORE UPDATE ON app.rm_users
  FOR EACH ROW EXECUTE FUNCTION common.set_updated_at();
COMMENT ON TABLE app.rm_users IS
  'The relationship managers who may sign in to the console. Seeded; the API only reads it.';

-- ---------- sign-ins ----------------------------------------------------------------------------
-- Apart from app.sessions on purpose: a reviewer session opens one customer and an RM session
-- opens a book, so the two never share a table, a token prefix or a lookup.
CREATE TABLE app.rm_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rm_id           text NOT NULL REFERENCES app.rm_users(rm_id),
  -- Only the token's sha256 is stored; the bearer itself is handed out once.
  token_hash      char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz NOT NULL,
  last_active_at  timestamptz NOT NULL,
  expires_at      timestamptz NOT NULL,              -- sliding, moved by every authenticated request
  revoked_at      timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX rm_sessions_rm ON app.rm_sessions (rm_id, created_at);

-- The API may slide a sign-in's expiry and may revoke it, and that is all. A sign-out is final:
-- a bug that wrote revoked_at back to null would hand a bearer its book back, and a session that
-- changed owner or token would be a different sign-in wearing this one's history.
CREATE OR REPLACE FUNCTION app.rm_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rm_id <> OLD.rm_id OR NEW.token_hash <> OLD.token_hash OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'app.rm_sessions: only last_active_at, expires_at and revoked_at may change'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'app.rm_sessions: session % was revoked at % and stays revoked', OLD.id, OLD.revoked_at
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rm_sessions_guard BEFORE UPDATE ON app.rm_sessions
  FOR EACH ROW EXECUTE FUNCTION app.rm_session_guard();

-- ---------- the book: whose customer is whose ---------------------------------------------------
-- The cif is the key, so a customer sits in exactly one book. It follows app.customers: the
-- reseed's wipe deletes the fixtures customers and this cascades with them, and the same seed
-- run writes the assignments back once the customers exist again.
CREATE TABLE app.rm_book (
  cif          text PRIMARY KEY REFERENCES app.customers(cif) ON DELETE CASCADE ON UPDATE CASCADE,
  rm_id        text NOT NULL REFERENCES app.rm_users(rm_id),
  assigned_at  timestamptz NOT NULL DEFAULT now()
);
-- bookOf(rmId) is on every console request, in cif order.
CREATE INDEX rm_book_rm ON app.rm_book (rm_id, cif);
COMMENT ON TABLE app.rm_book IS
  'Each customer''s relationship manager. One row per customer; a customer with no row is in nobody''s book.';

-- ---------- what the RM did: append-only ------------------------------------------------------
-- `ordinal` is the order rows were written in, which is the order the ports promise ("oldest
-- first", "newest first"). A timestamp cannot carry it: two entries in the same millisecond, or
-- under a pinned test clock, tie. The cif is plain text with no key into app.customers, like the
-- record's subject_id: a reseed deletes and rewrites the customers, and what an RM wrote or
-- looked at must still be there afterwards.

CREATE TABLE app.rm_notes (
  ordinal     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id          uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  rm_id       text NOT NULL REFERENCES app.rm_users(rm_id),
  cif         text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('note','call')),
  body        text NOT NULL,
  at_sim      date NOT NULL,                         -- the RM clock's date, so it sits on the journey
  created_at  timestamptz NOT NULL                   -- when it was written
);
CREATE INDEX rm_notes_cif ON app.rm_notes (cif, ordinal);

-- A handoff's status is the last change written for it; `open` is the absence of any row.
CREATE TABLE app.rm_handoff_status (
  ordinal     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id          uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  -- The talk_to_rm decision the request is (app.decisions.id). No key, as on the record: the
  -- service has already found the decision before it writes here.
  handoff_id  uuid NOT NULL,
  cif         text NOT NULL,
  rm_id       text NOT NULL REFERENCES app.rm_users(rm_id),
  status      text NOT NULL CHECK (status IN ('contacted','resolved')),
  note        text,
  at_sim      date NOT NULL,
  created_at  timestamptz NOT NULL
);
CREATE INDEX rm_handoff_status_cif ON app.rm_handoff_status (cif, ordinal);

-- Every open, reveal, check, brief, question, note and contact. `at` is a real instant: the log
-- records when the RM looked, not the simulated date.
CREATE TABLE app.rm_access_log (
  ordinal   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  rm_id     text NOT NULL REFERENCES app.rm_users(rm_id),
  cif       text NOT NULL,
  action    text NOT NULL
            CHECK (action IN ('viewed','revealed','checked','briefed','asked','noted','contacted')),
  purpose   text NOT NULL,                           -- what the RM said they were doing, verbatim
  detail    text,
  at        timestamptz NOT NULL
);
-- listAccess(rmId, limit): one RM's entries, newest first.
CREATE INDEX rm_access_log_rm ON app.rm_access_log (rm_id, ordinal DESC);

CREATE TRIGGER rm_notes_immutable BEFORE UPDATE OR DELETE ON app.rm_notes
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();
CREATE TRIGGER rm_notes_no_truncate BEFORE TRUNCATE ON app.rm_notes
  FOR EACH STATEMENT EXECUTE FUNCTION common.forbid_mutation();
CREATE TRIGGER rm_handoff_status_immutable BEFORE UPDATE OR DELETE ON app.rm_handoff_status
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();
CREATE TRIGGER rm_handoff_status_no_truncate BEFORE TRUNCATE ON app.rm_handoff_status
  FOR EACH STATEMENT EXECUTE FUNCTION common.forbid_mutation();
CREATE TRIGGER rm_access_log_immutable BEFORE UPDATE OR DELETE ON app.rm_access_log
  FOR EACH ROW EXECUTE FUNCTION common.forbid_mutation();
CREATE TRIGGER rm_access_log_no_truncate BEFORE TRUNCATE ON app.rm_access_log
  FOR EACH STATEMENT EXECUTE FUNCTION common.forbid_mutation();
COMMENT ON TABLE app.rm_access_log IS
  'Every customer open, reveal, check, brief, question, note and contact an RM made, with the purpose given. UPDATE, DELETE and TRUNCATE are rejected by trigger.';

-- ---------- one simulated journey per customer ---------------------------------------------------
-- The activity simulator (apps/api/src/application/rm/simulator.ts) gives each book customer one
-- journey session, marked by its client_hint (JOURNEY_HINT there), and skips a customer whose
-- journey exists, which is what makes a restart add nothing. That check is a read followed by a
-- write, so two processes booting at once — a rolling deploy over a freshly seeded database —
-- could both find nothing and both lay a journey down, and the console would then show every
-- refusal and handoff twice. Serialised per customer here, the second one is refused instead.
-- A reviewer's hint is sixteen hex characters of a hash and never matches, so this costs a
-- reviewer's session nothing.
CREATE OR REPLACE FUNCTION app.one_journey_per_customer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE who text;
BEGIN
  SELECT cif INTO who FROM app.subjects WHERE subject_id = NEW.subject_id;
  PERFORM pg_advisory_xact_lock(hashtext('rm-journey:' || coalesce(who, '')));
  IF EXISTS (
    SELECT 1 FROM app.sessions s JOIN app.subjects sub ON sub.subject_id = s.subject_id
    WHERE sub.cif = who AND s.client_hint = NEW.client_hint
  ) THEN
    RAISE EXCEPTION 'app.sessions: % already has a journey session', who
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sessions_one_journey BEFORE INSERT ON app.sessions
  FOR EACH ROW WHEN (NEW.client_hint = 'rm-simulator:journey')
  EXECUTE FUNCTION app.one_journey_per_customer();

-- ---------- grants -------------------------------------------------------------------------------
-- Explicit, as in 0013: 0007's default privileges reach a new table only when the role that set
-- them creates it. Granted, then the rest revoked, so the posture holds whichever role runs this.
GRANT SELECT ON app.rm_users, app.rm_book TO dhan_app;
GRANT SELECT, INSERT, UPDATE ON app.rm_sessions TO dhan_app;
GRANT SELECT, INSERT ON app.rm_notes, app.rm_handoff_status, app.rm_access_log TO dhan_app;
-- The desk and the book are the seed's.
REVOKE INSERT, UPDATE, DELETE ON app.rm_users, app.rm_book FROM dhan_app;
-- A sign-in is revoked, never deleted: the row is the record that it happened.
REVOKE DELETE ON app.rm_sessions FROM dhan_app;
-- What the RM did: INSERT only.
REVOKE UPDATE, DELETE ON app.rm_notes, app.rm_handoff_status, app.rm_access_log FROM dhan_app;

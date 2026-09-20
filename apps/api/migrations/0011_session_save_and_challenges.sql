-- =====================================================================================
-- 0011  Additive only: the savings pot and the one running spend challenge.
--       Nothing is dropped or altered, and no existing row changes meaning.
--
-- Both belong beside caps, the goal override and the spend limit: they are decisions the
-- customer made inside the app, and nothing in a statement says what somebody meant to put
-- aside or what they promised themselves they would stop buying.
--
-- jsonb rather than two child tables, and this is the one arguable call here. A deposit looks
-- like a row and a table would give it a foreign key and a check constraint. But the pot is
-- read and written whole on every request — the accrual replays a date range and hands back the
-- deposits for it — so a table would buy referential integrity for a document that is never
-- queried a row at a time, and would cost a join on the hot session read that every other
-- request already waits for. The shape is versioned in code by `normaliseSaveState`, which has
-- to exist regardless for rows written before this migration ran.
--
-- The DEFAULT is the whole compatibility story for save_state. '{}' rather than the full empty
-- pot, deliberately: `normaliseSaveState` in packages/core is the one place that knows what an
-- empty pot is — which hacks exist, which are off, what ₹500 a week defaults to — and a second
-- copy of that object written into SQL would be free to disagree with it after the next change
-- there, silently, and only for sessions created before somebody noticed. An empty object
-- normalises to the same pot a brand new session gets, so every row written before this column
-- existed reads as a customer who has not started saving. Which is what they are.
--
-- challenge has no DEFAULT and is nullable because NULL already means what it needs to mean:
-- nothing running. One column, not a table, for the same reason as above and one more — the
-- invariant is "at most one", and a nullable column enforces that where a table would need a
-- partial unique index to say it.
-- =====================================================================================

ALTER TABLE app.sessions
  ADD COLUMN save_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN challenge  jsonb;

COMMENT ON COLUMN app.sessions.save_state IS
  'The savings pot as one document: which save hacks are on and how they are configured, every deposit they have made, and accruedTo, the last simulated date the hacks were paid up to. Defaults to ''{}'', which normaliseSaveState reads as an empty pot, so rows older than the column are customers who have not started saving.';

COMMENT ON COLUMN app.sessions.challenge IS
  'The one spend challenge that can be running at a time, or null for none. Holds only the terms — target kind and name, limit, days, start date — because progress is recomputed from the transactions on every read and must move when the simulated clock does.';

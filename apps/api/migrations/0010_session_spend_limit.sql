-- =====================================================================================
-- 0010  Additive only: the customer's own monthly spending ceiling.
--       Nothing is dropped or altered, and no existing row changes meaning.
--
-- app.sessions.caps already holds per-category limits. This is the limit on everything —
-- the number Cleo's budget screen asks a customer to choose, and the number safe-to-spend
-- is measured against once they have.
--
-- It is a decision about the future rather than an observation about the past, which is why
-- it lives on the session beside caps and the goal override rather than in bank.*: nothing in
-- a statement says what somebody meant to spend.
--
-- NULL is the whole compatibility story: it means "no limit set", and the envelope is then
-- whatever income leaves after everything owed — which is what every session written before
-- this column existed meant. No live reviewer's plan moves when this runs.
-- =====================================================================================

ALTER TABLE app.sessions
  ADD COLUMN spend_limit numeric(18, 2) CHECK (spend_limit IS NULL OR spend_limit > 0);

COMMENT ON COLUMN app.sessions.spend_limit IS
  'The customer''s own monthly ceiling on discretionary spending. Null means none, and the envelope falls back to income less everything owed. The engine never lets it exceed what the month can afford.';

-- =====================================================================================
-- 0016  The access log records refused attempts as well as what an RM was shown.
--       Additive only: the table, its rows and its append-only triggers are unchanged, and
--       only the CHECK on `action` widens by one value.
--
-- A request that names a customer outside the caller's book is answered 403 and written as an
-- access entry with action 'denied', for the RM who tried. A log of what an RM was allowed to
-- see says nothing about what they tried to see, and a refused attempt is the entry a
-- data-protection review asks for first.
--
-- 0015 declared the CHECK inline on the column, so Postgres named it
-- `rm_access_log_action_check`, which is the name dropped and re-added here.
-- =====================================================================================

ALTER TABLE app.rm_access_log DROP CONSTRAINT rm_access_log_action_check;
ALTER TABLE app.rm_access_log ADD CONSTRAINT rm_access_log_action_check
  CHECK (action IN ('viewed','revealed','checked','briefed','asked','noted','contacted','denied'));

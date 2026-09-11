-- =====================================================================================
-- 0009  Additive only: which money a reviewer's goal override is counted in.
--       Nothing is dropped or altered, and no existing row changes meaning.
--
-- app.sessions.goal_target holds the customer's own target in place of the suggested one.
-- The amount alone does not say which rupees it is in, and the engine has to know: a target
-- stated in today's money ten years out or more is funded at the real rate (nominal less
-- inflation), because the rupees it is written in will buy less by then. A customer who
-- inflates the figure themselves and types what the thing will actually cost was therefore
-- discounted a second time — a ₹25,00,000 deposit fifteen years out, adjusted to ₹55,81,191,
-- asked for ₹20,733 a month instead of ₹12,023.
--
-- NULL is the whole compatibility story: it reads as 'today', which is what every session
-- written before this column existed meant, so no live reviewer's plan moves when this runs.
-- =====================================================================================

ALTER TABLE app.sessions
  ADD COLUMN goal_basis text CHECK (goal_basis IN ('today', 'at_horizon'));

COMMENT ON COLUMN app.sessions.goal_basis IS
  'Which money goal_target is counted in: ''today'' (the customer recognises the figure now) or ''at_horizon'' (they inflated it themselves to the rupees of the year it lands). Null means today, so rows older than the column keep the plan they had.';

-- =====================================================================================
-- 0012  Additive only: the goal kind the customer chose.
--       Nothing is dropped or altered, and no existing row changes meaning.
--
-- Onboarding's last question is "What are you working towards?", answered with one of the
-- five goal kinds the roadmap ladder knows how to sequence. Until this column the answer was
-- read back on the next screen and thrown away: app.sessions held a target amount and the
-- money it was counted in, and nothing held which goal it was. The roadmap was built from the
-- engine's ladder alone, whatever the customer had said.
--
-- The kind is kept as the customer said it, even where the engine cannot plan it — a payoff
-- with nothing owed, cover with no gap. suggestGoal falls back to the ladder then; the choice
-- is still theirs to see and change, and a later statement may give it something to aim at.
--
-- NULL is the whole compatibility story: it means the customer never chose, and the ladder
-- picks — which is what every session written before this column existed meant. No live
-- reviewer's plan moves when this runs.
-- =====================================================================================

ALTER TABLE app.sessions
  ADD COLUMN goal_kind text CHECK (
    goal_kind IN ('emergency_fund', 'debt_payoff', 'protection', 'wealth_target', 'retirement')
  );

COMMENT ON COLUMN app.sessions.goal_kind IS
  'The goal kind the customer chose: emergency_fund, debt_payoff, protection, wealth_target or retirement. Null means never chosen, and the engine''s ladder picks — so rows older than the column keep the plan they had. Kept as said even where the engine falls back to the ladder for want of anything to aim at.';

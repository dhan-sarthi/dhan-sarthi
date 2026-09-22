# Slice 03 — Plan + the decision loop

Status: built, runs end to end against the live API. Rebuilt on Cleo's components on 21–22 Sep
2026; this note describes the Plan tab and today's action card as they now stand.

## What landed

**Plan** (`apps/mobile/app/(tabs)/plan.tsx`), two panes, Route and Numbers. Cleo has no screen
with this job, so it is built from the shapes Cleo uses for the nearest ones: the Save tab's goal
card for the destination, the Budget tab's "Next steps" checklist for the stages, and the
money-health score's glow for the one figure the Numbers pane exists to show.

| Pane | Holds |
|---|---|
| Route | The goal hero: its name and target, time to go and how far there, what goes in every month, the done-by and target dates, the target in today's money where it was typed in the rupees of the year it lands, and Change the target; a shortfall card when the route misses the customer's date; a missed repayment pinned under "Before anything else"; the stages in order on numbered plates, each opening to its figures, the gate's verdict on its product and where it leads; "Updated · …", the plan version's reason, linking to the record |
| Numbers | The goal's own arithmetic. A payoff: months to clear in a glow, what it costs, and what paying only the minimum would cost. A payoff whose payment is under the interest: why it grows, and what clears it in three years. A buffer: built so far, still to build, the first staged milestone, and Add money. A growth goal: the corpus at the chosen rate in a glow, three rate tiles, the corpus against the target, where it comes from, and the method sheet with the disclaimer |

Both panes can be asked for by link. `?pane=` picks one; `?stage=<kind>` opens that stage on the
route and scrolls it to the top; `?pane=projection&stage=clear_debt` asks for the payoff
arithmetic even where the goal has a projection. Home's Debt and Budget panes, today's action
card, the Credit pane, Protect, the notices and the goal editor all link in this way, and a pill
tap always wins over a link.

**The goal editor** (`app/edit-goal.tsx`, behind Change the target). Its Goal row opens a sheet of
the five goal kinds, the same five onboarding asks about; picking another sends
`PATCH /session/goal` with `{ kind }`, and the next `/view` re-cuts the plan with "Goal chosen by
the customer." A kind with nothing to aim at is listed with the reason and not offered (the
screen asks core's own `suggestGoal`), because the plan would keep its own goal while the toast
said "Now working towards …". The target is a stepper whose floor is what is already in the pot;
saving it sends the figure with the kind on screen beside it, and the plan is re-cut with "Target
changed by the customer." Neither the goal's name nor its date is typed: "On track for" is the
route's date for the figure on the stepper. Until 22 Sep the editor moved only the target; the
kind picker arrived with the goal kind on the session ([slice 01](01-onboarding.md)).

**The decision loop.** Today's action is the first card on Home's Overview
(`src/ui/ActionCard.tsx`), and what the customer says about it is written: `did_it`, `deferred`
or `declined`, through `POST /actions/:actionId/decision` with an idempotency key derived from the
action and the answer, so a double tap on a flaky connection is one decision. Three responses,
not one, because they are different facts, and an accept-only card would make the audit trail a
log of what we sold rather than of what was decided. Verified when this slice landed: the write
appends to the hash chain, and `GET /record/verify` returned `{ok: true, length: 7}`.

What a decision changes today (`apps/api/src/application/decision.service.ts`): it goes on the
record with the action as shown and its evidence; an action with a product has the gate re-run
and an advice record written; every decision cuts a new plan version whose reason says a
decision moved it; `did_it` on a spending-cap action sets the cap; and `did_it` on a product the
gate passes raises a lead in IDBI's queue, where the bank source can take one. Uday's brief and
the chat prompt list recent decisions when a model is in the path.

Since 22 Sep the card keeps Cleo's grammar, one pill and at most two links, and the answers take
turns rather than queueing:

- The pill is the way in, one per kind of action: the spending limits, the statement's charges,
  the plan's payoff, the bank's toll-free line for a call to the relationship manager, the
  holdings for pausing a SIP, the gate sheet on the product for a monthly amount into one, and
  Uday for a lump sum the sheet cannot size. A product the shelf does not carry gets no door, and
  then the receipt is the pill.
- The receipt says what the customer did — "I spoke to them", "I paid it", "I checked them",
  "I set the cap", otherwise "I did this" — and every one records `did_it`. Where the pill is a
  place to look, the receipt is a link beside "Not now". Where the door is the call itself, the
  receipt takes the pill only once the call has opened, and the call steps down to "Call again".
- "Not now" asks which kind of not-now it was: "Remind me later" (`deferred`) takes the pill and
  "Not for me" (`declined`) becomes the link.
- The new controls ignore presses for 450 ms after each turn, so the second tap of a double tap
  cannot record an answer nobody gave.

This replaced the slice's first card, which offered "Do it" beside "Not now" and "Not for me" as
three equal buttons; "Do it" on a card about a phone call asked the customer to do something the
app cannot. The confirmation reads "Done — it's on your record" ("Parked for now", "Noted") and
links to the record. Evidence lines are read through `evidenceLine` (`src/lib/evidence.ts`), so
`2026-08-01` reads "1 Aug"; the wire keeps the engine's strings.

**The refusal screen.** When the gate blocks an accepted action, the card becomes the refusal:
"I'm not going to do that", the customer-facing sentence, the named alternative (a door onto that
product's gate sheet where the shelf carries it), how many of the nine checks it did clear and the
rule it stopped at by number and name, and a link to the record that keeps it. This is the screen
nothing else in the category has.

## Decisions taken here

- **Roadmap and projection are separate panes.** A customer reading "what should I do"
  should not have a growth curve in their eye, and a growth curve must carry its rate and
  disclaimer. Splitting them is a compliance posture, not a layout preference.
- **Three rates, all on screen.** The corpus is shown at one of them with the rate beside it —
  the middle one until the customer picks another, and the pick holds across pane switches — and
  the other two are a tap away. One projected number reads as a promise; three read as a range,
  which is what it is. The corpus travels between rates rather than cutting, because here the
  motion is the information.
- **Passed verdicts are shown, not just blocked ones.** "All 9 rules passed" is a claim the bank
  is making and it belongs on screen beside the advice. Since 22 Sep the chip (`RulesChip`) reads
  the same here, on the gate sheet and on the record; a refusal names the rule it stopped at by
  its place in the nine and its name, never by its id.
- **Feasibility is stated, never softened.** A plan that does not reach is still the right
  plan; hiding the gap is what would make it dishonest. The shortfall card names the monthly gap
  and what closes it — the stage that frees money up, or a limit — and it also catches a goal the
  engine calls feasible that the route finishes after the customer's date.
- **The missed repayment is pinned above the route, not numbered in it** (22 Sep). The engine
  lays it after the payoff, while Home, the notices and Uday all say to clear it first. It has no
  amount and no date, so it is the condition on the route rather than a step in it, and its line
  says the gate refuses investments over it, never cover.
- **One horizon for one goal** (22 Sep). "To go" and "Done by" are the route's finish (`goalHorizon`
  and `finishOf` in `src/state/save.ts`), the same figures Grow's Save card prints; the customer's
  own date is its own line, labelled as the target.
- **Every stage leads somewhere** (22 Sep). The payoff opens Home's Debt pane and the missed
  repayment its Credit pane; cover opens Protect's gate on the stage's product; the buffer opens
  Grow's Save; growth opens Grow's Invest; freeing money up opens a limit. A stage Uday can answer
  about also gets "Ask Uday about this stage", asked by what the stage is for
  (`questionForStage` in `src/lib/ask.ts`).

## Bugs found and fixed (mobile)

- **Rate picker did nothing.** `onTouchEnd` on a plain `View` — no mouse input, no press
  state, no accessibility role. Now a `Pressable` like every other control; each rate is a radio
  tile drawn through `Tap`.
- **Switching pane kept the old scroll offset**, so the numbers opened halfway down and
  the rate picker looked missing. A pane change now starts at the top. Same fix on Home, and
  every paned tab does it.
- **"372 months"** → "31 years" (`src/lib/duration.ts`).
- **409 was reported as "try again".** One decision per action is the server's rule; a
  second one can never succeed, so the card says "You already answered this one."

## Bug found here, fixed in slice 04

**Accepting the app's own top recommendation always refused.** The decision route re-ran the
gate without `cadence`, so the one-off ₹2,00,000 sweep-in was judged as a ₹2,00,000 *monthly*
commitment and blocked by AFFORDABILITY. The engine already knew the difference — `evaluate`
takes a `cadence`, and the daily plan passed `'lump_sum'` when it generated the action — but the
cadence was lost between generation and the decision route. It was backend, shared with the web
app (frozen then, deleted on 20 Sep), and the demo's money shot, so it was queued as its own task
rather than folded into a UI slice. [Slice 04](04-grow.md) fixed it: the action carries its
cadence, and `decision.service.ts` passes it back into `evaluate`.

## Known gaps

- Nothing reads the answers back into the plan. `packages/core/src/actions.ts` calls a decision
  "the feedback that changes the next roadmap", but `buildDailyPlan` takes no decision history
  and nothing in core consumes one. So "Not for me" is recorded and the card says "I won't
  suggest this one again", yet nothing stops a later date's plan proposing the same action; and
  "Remind me later" comes back only because the same finding still holds, not on any schedule.
- The view does not say whether today's action already has a decision, and the card keeps its
  answer only while it is mounted. Answered earlier — in another session, or before a pane switch
  remounted Home's Overview — it draws as unanswered again, and a second answer gets the server's
  409 and "You already answered this one."

Closed since this slice landed: the bell and profile controls work (slice 05 and 22 Sep),
evidence lines read their dates as dates (22 Sep), and every stage opens to its detail and its
links (22 Sep).

## Next

[Slice 04](04-grow.md) — Grow: net worth, holdings and the shelf, the gate sheet every product on
it goes through, and the cadence fix.

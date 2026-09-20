# Slice 03 — Plan + the decision loop

Status: built, runs end to end against the live API.

## What landed

**Plan**, two panes. Cleo has no equivalent screen, so this is built in the language the
other tabs established rather than copied.

| Pane | Holds |
|---|---|
| The route | Goal hero, feasibility, the ordered stages with the *why* and the verdict on each |
| The numbers | Three selectable rates, corpus at the chosen rate, real vs nominal, contributed vs growth, disclaimer |

**The decision loop.** Today's action now writes: `did_it`, `deferred`, `declined` —
three responses, not one, because the engine treats them differently and an accept-only
card would make the audit trail a log of what we sold rather than of what was decided.
Verified the write appends to the hash chain and `GET /record/verify` returns
`{ok: true, length: 7}`.

**The refusal screen.** When the gate blocks an accepted action, the card becomes the
refusal: the rule that stopped it, the customer-facing sentence, the named alternative,
and how many of the nine checks it did clear. This is the screen nothing else in the
category has.

## Decisions taken here

- **Roadmap and projection are separate panes.** A customer reading "what should I do"
  should not have a growth curve in their eye, and a growth curve must carry its rate and
  disclaimer. Splitting them is a compliance posture, not a layout preference.
- **Three rates, none of them a default the customer did not pick.** One projected number
  reads as a promise; three read as a range, which is what it is.
- **Passed verdicts are shown, not just blocked ones.** "All 9 suitability rules passed"
  is a claim the bank is making and it belongs on screen beside the advice.
- **Feasibility is stated, never softened.** A plan that does not reach is still the right
  plan; hiding the gap is what would make it dishonest.

## Bugs found and fixed (mobile)

- **Rate picker did nothing.** `onTouchEnd` on a plain `View` — no mouse input, no press
  state, no accessibility role. Now a `Pressable` like every other control.
- **Switching pane kept the old scroll offset**, so "The numbers" opened halfway down and
  the rate picker looked missing. A pane change now starts at the top. Same fix on Spend.
- **"372 months"** → "31 years".
- **409 was reported as "try again".** One decision per action is the server's rule; a
  second one can never succeed, so the copy now says so.

## Bug found and NOT fixed — needs a decision

**Accepting the app's own top recommendation always refuses.** `decision.service.ts:58`
re-runs the gate without `cadence`, so the one-off ₹2,00,000 sweep-in is judged as a
₹2,00,000 *monthly* commitment and blocked by AFFORDABILITY.

The engine already documents this exact defect at `packages/core/src/suitability.ts:93`
and fixed it by adding `cadence`; `dailyplan.ts:391` passes `'lump_sum'` when it generates
the action. The cadence is simply lost between generation and the decision route.

This is backend, shared with the frozen web app, and it is the demo's money shot — so it
is queued as its own task rather than folded into a UI slice.

## Known gaps

- Bell and profile controls still inert.
- Evidence lines show raw ISO dates (`2026-09-11`) — server-generated copy.
- An action already decided in a previous session still renders as undecided until tapped.
- Stage rows do not link anywhere; tapping one should open the product later.

## Next

Slice 04 — **Grow**: net worth, holdings, deposits, and the buy flow that every one of the
nine rules stands in front of.

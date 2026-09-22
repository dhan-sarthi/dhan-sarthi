# Slice 05 — Protect, Uday, the record, and the clock

Status: built. When the slice landed the workspace was green — typecheck clean, 592 tests. This
note was brought up to date on 22 September 2026, after the app was rebuilt on Cleo's
components; what it says about current behaviour is read off the code. Paths beginning `app/` or
`src/` are in `apps/mobile`.

## Protect

Cleo's fifth tab is a cash advance. The inversion is the point: where a third-party app
puts *"borrow money when you are short"*, a bank-owned advisor puts *"make sure being short
never becomes a catastrophe"*. Same slot, opposite direction.

| Pane | Holds |
|---|---|
| Cover | The gap between cover needed and cover in force, one button to the policy that closes it, the working in full rupees, a "Get covered" checklist (life cover, health cover, the safety net), and why cover comes before investing |
| Safety net | Months the money you can reach would carry, against the target, and a "Take action" card: how to close a shortfall, or what the spare above the target should do |
| Get cover | Protection only. Government schemes first, under "Costs almost nothing", because the bank earns nothing on them; then term, health and accident cover by kind; then "What you won't find here", rule 9 of 9 |

Every pane ends in something to do (`app/(tabs)/protect.tsx`). The cover button opens the gate
on the policy the roadmap already chose for its cover stage, or the cheapest term plan where it
chose none, so this tab and Plan never recommend two different policies. `?product=` opens the
gate on a named product once the shelf has arrived, which is how Plan's cover stage links here.
The safety net is worked in the month the engine measures it in, bills and everyday spending
together, so its rows add up to the months above them. Past the target with expensive debt on
file, the spare goes to the payoff plan rather than to a shelf of refusals.

The zero-dependants branch is a real screen, not an empty state: *"Life cover replaces an income
others rely on. Nobody relies on yours, so you don't need it — and I won't sell you any."* It is
also the one fact on the tab the customer can correct in place. "Someone depends on me" opens a
sheet that writes the number to the declared profile (`PATCH /api/v1/profile`) and re-reads the
view before it closes. Where the file the advice is worked from still says nobody, the card says
so — *"You told me 1 person depends on you"* — rather than pretending the figures moved.

## Uday

The tab lands on Uday's face, filling the screen, not on a chat (`app/(tabs)/uday.tsx`). The
call is the screen and text is the thing you choose: "Chat in text" is always there, and "Start
a call" is there when a call can be had, with the day's minutes left under it. A call is offered,
never dialled for you, because one slot, a daily minute budget and a microphone prompt are three
things to tap into knowingly. On a call there is one button, "End the call", as on any video
call: the owner's call, 22 September 2026. Switching to text mid-call does not hang up. His
tab-bar plate is an outline until his tab is selected, as Cleo's assistant tab is
(`src/ui/TabBar.tsx:9-12`); an earlier build kept it filled on every tab.

Availability is read from `/avatar/availability` every time the tab comes into focus, not once,
and the line above the buttons tells three states apart: face to face is not switched on for
this account, it is on but not free now (a queue, or the day's minutes gone), or it is free. A
refusal from the call itself outranks all three, because the minutes counter is ours and the
credits are the provider's. The call itself is slice 07.

The text tier is the same engine without the face. `/ask` works the answer out in code first, in
`packages/core/src/query.ts` (`apps/api/src/application/conversation.service.ts`). With
`OPENAI_API_KEY` set, a question that names a shelf product is also run through the gate and its
verdict recorded, and only then is a language model asked to say the result in English, handed no
ledger and no discretion. Without a key, or when a completion fails, the answer is the engine's own
sentence, marked `phrasedBy: 'rules'`. When this slice was first written there was no model in this
path at all. Either way the text tier is not a degraded fallback that invents things when the avatar
is busy — it is the same answers, without the face.

Every reply carries the evidence it was computed from. The chat is no longer a closed set of
questions: there is a box to type in, and a question the engine cannot match is answered
honestly as one it is not sure of (`matched: false`). The pills above the box are replies to the
latest turn. A fresh chat offers the engine's openers (`/ask/suggestions`) on short labels; an
unmatched answer offers "Try one of these"; a matched one offers what can be answered next — the
same question over another period, a limit for that category, the payoff for a debt the plan is
paying. The server keeps no transcript, so the screen sends the last six turns with each
question.

Every "Ask Uday about this" in the app opens this tab on the chat with its question already
asked (`?ask=`, asked once, then cleared). The questions are worded in one place,
`src/lib/ask.ts`, so each trips the rule it means in core's router, and `ask.test.ts` runs every
one through that router. A subject no rule answers gets no question: the screen offers the place
that holds the answer instead, and "talk to a person" dials IDBI's toll-free line, 1800-209-4324
(`src/lib/idbi.ts`).

## The record

Nothing in Cleo corresponds to this and nothing needs to — a budgeting app owes its user no
account of its reasoning. A bank giving investment advice in India does: SEBI requires the
suitability assessment, the rationale and the record kept five years and produced on demand.

`app/record.tsx` opens from the profile, the gate sheet, Plan and Protect. Three panes, and
`?pane=` opens any of them:

- **Advice** — every verdict, the refusals included, newest first under the day it was given.
  The card at the top says whether the hash chain verifies right now: "Record intact" or "Record
  has been altered". Each entry carries the gate's own chip, the sentence the customer was told,
  the alternative where the rule named one, the auditor's line where it differs, and a question
  for Uday where he has one about that rule or product.
- **Rules** — the nine as data, in the order the gate runs them, with a way to check a product
  against them on Grow.
- **Consent** — the consent with its status, validity and reference; the blocks IDBI may read,
  each a way into its switch on Where my data comes from; where the ledger came from; and the
  clock.

Each pane owns the read it depends on and says so, with a retry, when that read fails.
Provenance is stated plainly — **"This is synthetic data"** — because a product whose argument
is "we show our reasoning" cannot be coy about where the numbers came from. It is a claim about
the rows, not fixed copy, so it is drawn only where the source reports a seed; a real bank feed
reports none.

## The clock

The best thing in the app. Everything on every screen is derived from a snapshot taken at a
date, and a demo that cannot move that date can only *assert* the numbers are computed.

Verified when it landed: advancing 30 days moved the world. Today's action changed from the
sweep-in to term cover because the deposit had matured; savings rose by the salary credit; the
deposit card stopped saying "Matures 11 Sept". Nothing was scripted — the snapshot was
re-derived.

It sits at the foot of the record's Consent pane (`src/ui/TimeMachine.tsx`), labelled
"Simulation", and draws nothing unless the session reports `capabilities.simulatedClock`: a
customer of a real bank must never wonder whether the date they are looking at is real. The
profile's "The clock" row, shown on the same condition, opens that pane. Three moves — +7 days,
+30 days, back to the start — each end in a toast naming the new date. A move carries the
session version, so two screens pressing +30 move the clock once and the loser is shown where
it now is; a move past the end of the ledger says so. The record refreshes the snapshot after a
move, because the tabs stay mounted and would otherwise keep the old date.

## Also landed

- **The bell means something** — `/noticed`, "What I noticed": every finding, grouped under
  "Worth doing now", "Worth a look" and "Worth knowing" in the engine's own ranking (`rank` in
  `packages/core/src/insights.ts`), under what they leave on the table each month. Each card says
  the thing to do and carries one pill to where it can be done, with the evidence one tap away;
  the finding about talking to a person carries IDBI's toll-free line. There are no push
  notifications in this build and inventing some would be dishonest; this is what a
  notification would have been about.
- **Onboarding delivers what it promises** — "Meet Uday" lands on Uday, not on balances. Since
  22 September 2026 it lands on his call screen, his face and "Start a call", with no question
  asked on the customer's behalf: the owner's call, because the face is the product
  (`app/(onboarding)/ready.tsx`).
- **A profile** — `/profile`, behind the person button in every tab header and on Uday's call
  screen: who you are, the record, where the data comes from, the statement, the budget and save
  settings, the clock where it is switched on, IDBI's links, and "Log out".

## Bugs found and fixed

- `actionKind` is null on advice records written by a direct gate check rather than by a plan
  action. The record screen crashed on it; it now names the product instead ("Asked about …",
  `src/lib/headline.ts`).
- The record showed product ids (`lic ulip 401`). It resolves names from the shelf.
- Consent validity read "1 Oct to 1 Mar" — the years were dropped by a formatter that hides
  the current year. Dates whose year carries meaning now use `fullDate`.
- **I repeated the `onTouchEnd`-on-a-View mistake** from slice 03 on the insight cards. Fixed,
  and swept the tree: no occurrences remain (checked again on 22 September 2026). Anything
  tappable is a `Pressable`, through `src/ui/Tap.tsx`.

## The live avatar

When this slice shipped, the Uday tab had the text tier and honest availability but no live
video, and it could not be verified from here:

- `@livekit/react-native` needs WebRTC native modules, so it needs a **custom dev build**.
  Expo Go cannot load it.
- Producing a dev build needs **Xcode**, which this Mac did not have
  (`xcode-select` pointed at command-line tools only).
- A real session also **bills Runway minutes**, so it could not be exercised blind.

The web target needed neither of the first two: Expo's web build renders through react-dom, so
the browser's own WebRTC carries the call. That is slice 07, and the call is live there, on
Runway first with Anam as the fallback (`docs/engineering/avatar-accounts.md`). The native path
is still open: `apps/mobile` has no `@livekit/react-native` dependency, no native stage and no
dev build. `spike/mobile-avatar/` had already answered the one design question — whether Uday's
face survives a crop.

## Next

- The live avatar on a native build; slice 07 has the steps.
- The gate checks suitability but still places no order — no cart, no OTP, no mandate.

Transaction detail, the other item here, landed on 22 September 2026: every statement line
opens a sheet with the raw narration and the fields the bank recorded
(`src/ui/TransactionSheet.tsx`).

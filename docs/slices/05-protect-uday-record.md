# Slice 05 — Protect, Uday, the record, and the clock

Status: built, all verified on screen. Workspace green — typecheck clean, 592 tests passing.

## Protect

Cleo's fifth tab is a cash advance. The inversion is the point: where a third-party app
puts *"borrow money when you are short"*, a bank-owned advisor puts *"make sure being short
never becomes a catastrophe"*. Same slot, opposite direction.

| Pane | Holds |
|---|---|
| Cover | The gap between cover needed and cover in force, and why this ranks above investing |
| Safety net | Months the balance would carry, against the target |
| What I can get | Protection only — government schemes first, because the bank earns nothing on them |

The zero-dependants branch is a real screen, not an empty state: *"Life cover exists to
replace an income somebody else needs. With no dependants on record, you do not need it —
and I am not going to sell you some anyway."*

## Uday

The conversation tier. The architectural fact worth keeping in mind: **there is no model in
this path.** `/ask` answers deterministically from the snapshot and the ledger. So the text
tier is not a degraded fallback that invents things when the avatar is busy — it is the same
answers, without the face.

Every reply carries the evidence it was computed from. Questions are offered as a closed set
rather than an open box, because the engine answers a known set exactly and refuses the rest
honestly; an open box would invite the second kind and make an honest boundary look like a
failure. Avatar availability is reported truthfully from `/avatar/availability`.

## The record

Nothing in Cleo corresponds to this and nothing needs to — a budgeting app owes its user no
account of its reasoning. A bank giving investment advice in India does: SEBI requires the
suitability assessment, the rationale and the record kept five years and produced on demand.

Three panes: every verdict including the refusals with the chain-verification state, the
nine rules as data, and the consent with its scopes and expiry. Provenance is stated plainly
— **"This is synthetic data"** — because a product whose argument is "we show our reasoning"
cannot be coy about where the numbers came from.

## The clock

The best thing in the app. Everything on every screen is derived from a snapshot taken at a
date, and a demo that cannot move that date can only *assert* the numbers are computed.

Verified: advancing 30 days moved the world. Today's action changed from the sweep-in to term
cover because the deposit had matured; savings rose by the salary credit; the deposit card
stopped saying "Matures 11 Sept". Nothing was scripted — the snapshot was re-derived.

Lives inside the record, labelled a simulation, and gated on `capabilities.simulatedClock`:
a customer of a real bank must never wonder whether the date they are looking at is real.

## Also landed

- **The bell means something** — `/noticed`, all eight findings ordered by what they cost,
  each with its evidence one tap away. There are no push notifications in this build and
  inventing some would be dishonest; this is what a notification would have been about.
- **Onboarding delivers what it promises** — "Meet Uday" now lands on Uday, not on balances.

## Bugs found and fixed

- `actionKind` is null on advice records written by a direct gate check rather than by a plan
  action. The record screen crashed on it; it now names the product instead.
- The record showed product ids (`lic ulip 401`). It resolves names from the shelf.
- Consent validity read "1 Oct to 1 Mar" — the years were dropped by a formatter that hides
  the current year. Dates whose year carries meaning now use `fullDate`.
- **I repeated the `onTouchEnd`-on-a-View mistake** from slice 03 on the insight cards. Fixed,
  and swept the tree: no occurrences remain. Anything tappable is a `Pressable`.

## Blocker — the live avatar

The Uday tab ships the text tier and reports availability honestly, but **the live video
avatar is not wired, and I cannot verify it from here.**

- `@livekit/react-native` needs WebRTC native modules, so it needs a **custom dev build**.
  Expo Go cannot load it, and the web target uses a different client entirely.
- Producing a dev build needs **Xcode**, which this Mac does not have
  (`xcode-select` points at command-line tools only).
- A real session also **bills Runway minutes**, so it cannot be exercised blind.

`spike/mobile-avatar/` already answered the one design question — whether Uday's face
survives a crop — so the groundwork exists. What is needed is the decision to spend on a dev
build plus Runway minutes, and an Xcode install.

## Next, once unblocked

- Wire the live avatar into the Uday tab behind the existing three-tier ladder.
- Transaction detail: raw narration and provenance behind a row on Spend.
- The gate checks suitability but still places no order — no cart, no OTP, no mandate.

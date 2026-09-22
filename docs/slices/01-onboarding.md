# Slice 01 — Onboarding

Status: built, runs end to end against the live API. Rebuilt on Cleo's components on 21–22 Sep
2026; this note describes the flow as it now stands.
Reference: Cleo AI "Onboarding" flow, 27 screens — https://mobbin.com/flows/c5a0e8c4-b426-4b55-ae88-1db0e7ab6f77

## Screens

The steps live in `apps/mobile/app/(onboarding)/`. The six from `mobile` to `goal` carry a progress
rail (`Screen`'s `step` and `steps`, 1 of 6 to 6 of 6); `reading` and `checklist` sit between
steps 3 and 4 without one.

| Route | Cleo source | What it does |
|---|---|---|
| `app/index.tsx` | splash | Wordmark in a rounded bubble on the brand field, three pulsing dots; holds 1.4 s, then opens Home (`/(tabs)/spend`) with a stored bearer, or `welcome` without one |
| `(onboarding)/welcome` | welcome carousel | Four full-bleed photographs, self-advancing, a story rail, and one button: Get started |
| `(onboarding)/mobile` | "Your country of residence" | Mobile number over the demo customer picker |
| `(onboarding)/otp` | "Enter your code" | Six boxes over one hidden input; the sixth digit submits and creates the session |
| `(onboarding)/consent` | "Link your checking account" | Three rows on what is read, a "Consent you can withdraw any time" chip, and a sheet listing the five blocks; grants all five scopes |
| `(onboarding)/reading` | — (ours) | Narrates a fresh `/view` in five lines; the last waits for the read to land |
| `(onboarding)/checklist` | "You're on a roll, babe" | Three `Checklist` cards, done / current / later, worked out from the draft |
| `(onboarding)/about` | "Your income details" | Monthly income, then dependants |
| `(onboarding)/risk` | "Select your style" | One behavioural question → risk profile |
| `(onboarding)/goal` | "What are you saving for?" | The five goal kinds; sends the profile and the goal |
| `(onboarding)/ready` | "…are you ready?" | Full-bleed photo, copy on a scrim, the goal read back, Meet Uday |

## API

No route was added for onboarding. Everything it calls is under `/api/v1`, through
`apps/mobile/src/api/client.ts`:

| Step | Call |
|---|---|
| `mobile` | `GET /customers` |
| `otp` | `POST /sessions`, which returns the bearer. Storing it arms the snapshot module (`src/state/snapshot.tsx`), whose first `GET /view` follows at once |
| `consent` | `POST /session/consent`, once per scope, the five settled together |
| `reading` | `GET /view` again, through the snapshot module's `refresh()`, so the tabs open on the read this screen narrates |
| `goal` | `PATCH /profile` (dependants, declared income, risk; skipped when there is nothing to send), then `PATCH /session/goal` with `{ kind }`, then `GET /view` again |

One route changed shape for it. Until 22 Sep the goal picked here was read back on the ready
screen and thrown away: `ProfilePatch` had no goal field and `PATCH /session/goal` took only an
amount. It now takes an optional `kind` beside `targetAmount`, stored on the session as `goalKind`
(`apps/api/migrations/0012_session_goal_kind.sql`), and `suggestGoal` in `packages/core` plans
around it. Around it, not straight to it: the ladder's first stages stay first, and a pick with
nothing to aim at (nothing costly owed, no gap in the cover, savings already past three months)
leaves the engine's own goal in place while the choice stays on the session. Edit goal
(`app/edit-goal.tsx`) can change the pick later; see [slice 03](03-plan.md).

The customer's answers stay on the phone until the last step. The steps write into a draft
(`src/state/onboarding.tsx`), and only `goal` sends the profile and the goal kind. The earlier
steps do write: the code step creates the session, the snapshot module's first read straight
after it stores the plan's first version on the server ("First plan, built from the statements on
file."), and the consent step sends the five grants. What a customer who backs out halfway never
leaves behind is an answer they did not finish giving: no risk profile, income or goal of theirs
reaches the server or the audit record.

## Decisions taken here

- **The carousel ends on the refusal.** Cleo's four slides all promise to give you
  something. Ours end on "And when to do nothing" — the only claim a bank-owned advisor
  can make that a third-party app cannot, and the one the suitability engine backs.
- **Slides advance themselves, and the story has an end.** A customer who does nothing still
  sees all four; a swipe takes the timer over. The rail fills rather than dots, so the screen
  reads as a story rather than a gallery. Since 22 Sep the timer stops on the fourth slide
  instead of wrapping to the first, and it runs only while someone could watch it move: not under
  another screen, not while a finger is on the photo, and never with Reduce Motion or, on a
  phone, a screen reader on. Those customers turn the page themselves; the carousel is one
  adjustable control.
- **One button on the carousel.** A Log in pill beside the rail pushed the same route as Get
  started, so it was removed: two controls that cannot lead anywhere different are one control.
- **Mobile number is the whole login.** The customer already banks with IDBI; there is no
  account to create. The demo picker sits under the field, and each customer has a stable number
  (their place in the API's list, counted on from 98200 10001), so the screen stays a login
  rather than a picker in a login's clothes. Tapping a customer fills the field, typing a
  customer's number picks them, and Send me a code is live only for a number a demo customer has.
- **A code that worked is spent.** The code step replaces itself with consent, so back from
  consent goes to the number; typing a code again used to sign the customer in twice. Opened
  with no customer in the draft (a refresh, a deep link), it redirects to `mobile` before
  drawing. A failure says whose it was: the code (400, 401, 403), too many sign-ins (429), or the
  connection.
- **Risk is one question, not a quiz.** "Your investment drops 20% in a month. What do you do?"
  Sell it, Sit tight or Buy more: Conservative, Balanced or Growth (`RISK_QUESTION` in
  `src/state/onboarding.tsx`). The engine uses it as a coarse ceiling: Conservative caps the shelf
  at the Moderate riskometer band, the other two at Very High (`PROFILE_CEILING` in
  `packages/core/src/suitability.ts`). Measuring it finely would be dressing. The answers are the
  contract's `RiskProfileSchema`, imported rather than restated: a hand-written fourth answer,
  `Moderate`, once failed every signup that chose it with a 400 at the goal step.
- **Two fields on `about`, not six.** Everything else comes from the statement. Declared income
  and dependants are the only two it cannot show. Since 22 Sep income comes first, asked by the
  month ("A month, before tax") and grouped the Indian way as it is typed, then stored as the
  yearly figure the profile keeps.
- **The ready screen reads the pick back and promises nothing more.** "You're after the long game
  — ask me where to start": the goal is stored, but the plan still puts what has to come first
  ahead of it, so "let's start there" would be a promise the route might not keep.
- **The flow ends at a face, not a dashboard.** Uday is the product's first person. Since
  22 Sep, at the owner's request, Meet Uday lands on his call screen — his face and Start a
  call — with no question put to the chat. It replaces rather than pushes, and clears the draft
  on the way out.
- **Every way out leads back here.** Log out on `/profile` drops the bearer and the draft empties
  itself, so the next sign-in starts blank. A link to any screen outside onboarding opened with no
  bearer goes to `welcome` (`BearerGate` in `app/_layout.tsx`), and a bearer the API no longer
  accepts is dropped on the next read, which does the same (`src/state/snapshot.tsx`).

## The photographs

Five generated photographs in `apps/mobile/assets/onboarding/`: four for the carousel, one for
`ready`. `tools/gen-onboarding-art.mjs` draws them, and every frame is its own subject plus one
shared style preamble, the script's `STYLE`: bright high-key daylight; deep greens, terracotta,
marigold and clean whites; a fast prime lens; faces in the upper third and a quiet lower half for
the copy's scrim. The script appends it to every frame, so a new frame gets it by being added to
`SHOTS`. Changing the preamble means redrawing the set, or it stops reading as one campaign. The
script costs money and overwrites artwork, so it runs only when somebody asks.

## Known gaps

- OTP accepts any six digits; there is no verification route and none is needed yet. The
  screen says so: "Didn't get it? In this demo any six digits work."
- The draft is held in memory (`OnboardingProvider`). A reload mid-flow keeps the bearer, which is
  in storage, but loses the answers given so far.
- No run on a device is recorded; the Mac still has only the command-line tools, not Xcode (see
  [slice 05](05-protect-uday-record.md)). The 21–22 Sep rebuild was checked on the Expo web
  target at 390×844 with `tools/shoot.mjs`, the size of the phone a desktop browser draws the app
  in (`src/ui/PhoneFrame.tsx`).

## Next

[Slice 02](02-spend.md) — Home, the first tab (route `/spend`): Cleo's Spend flow (Overview /
Budget / Debt) plus a Credit pane, with today's action as the top card.

# Slice 01 — Onboarding

Status: built, runs end to end against the live API.
Reference: Cleo AI "Onboarding" flow, 27 screens — https://mobbin.com/flows/c5a0e8c4-b426-4b55-ae88-1db0e7ab6f77

## Screens

| Route | Cleo source | What it does |
|---|---|---|
| `app/index.tsx` | splash | Wordmark in a rounded plate on the brand field, three pulsing dots |
| `(onboarding)/welcome` | welcome carousel | Four full-bleed photographs, self-advancing, story rail, Log in / Get started |
| `(onboarding)/mobile` | "Your country of residence" | Mobile number + the demo customer picker |
| `(onboarding)/otp` | "Enter your code" | Six boxes over one hidden input; creates the session |
| `(onboarding)/consent` | "Link your checking account" | Three benefit rows, DPDP chip; grants all five scopes |
| `(onboarding)/reading` | — (ours) | Narrates the real `/view` derivation |
| `(onboarding)/checklist` | "You're on a roll, babe" | done / next / locked |
| `(onboarding)/about` | "Your income details" | Dependants and declared income |
| `(onboarding)/risk` | "Select your style" | One behavioural question → risk ceiling |
| `(onboarding)/goal` | "What are you saving for?" | The five goal kinds; commits the profile |
| `(onboarding)/ready` | "…are you ready?" | Full-bleed photo, scrim band, hand-off to Uday |

## API

**No new routes.** Everything used already existed:
`GET /customers` · `POST /sessions` · `POST /session/consent` · `GET /view` · `PATCH /profile`

Nothing is written server-side until the last step. A customer who backs out halfway
has changed nothing — a half-finished signup must not appear in the audit record as
advice the bank gave.

## Decisions taken here

- **The carousel ends on the refusal.** Cleo's four slides all promise to give you
  something. Ours end on "And when to do nothing" — the only claim a bank-owned advisor
  can make that a third-party app cannot, and the one the suitability engine backs.
- **Slides advance themselves.** A customer who does nothing still sees all four; a
  swipe takes the timer over. The rail fills rather than dots, so the screen reads as a
  story with an end rather than a gallery.

- **Mobile number is the whole login.** The customer already banks with IDBI; there is
  no account to create. The demo picker sits under the field with a stable number per
  persona, so the screen stays a login rather than a picker in a login's clothes.
- **Risk is one question, not a quiz.** The engine uses it as a coarse ceiling
  (Conservative → Moderate). Measuring it finely would be dressing.
- **Two fields on `about`, not six.** Everything else comes from the statement.
  Dependants and declared income are the only two it cannot show.
- **The flow ends at a face, not a dashboard.** Uday is the product's first person.

## Known gaps

- `ready` → "Meet Uday" currently loops back to the start. It lands on Spend in slice 02.
- OTP accepts any six digits; there is no verification route and none is needed yet.
- Onboarding art is five generated images (`assets/onboarding/`). They share one fixed
  prompt preamble — deep green, cream, terracotta, gold; 35mm; affluent and upbeat — and
  any new frame must reuse it verbatim or the set stops reading as one campaign. The
  generator is disposable; the preamble is the asset.
- Not yet run on a device — the Mac has no full Xcode, so this was verified on the
  Expo web target at 375×812.

## Next

Slice 02 — **Spend**: the home tab. Cleo's Spend flow (Overview / Budget / Debt),
with "the one thing today" as the top card.

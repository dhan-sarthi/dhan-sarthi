# Asset index

50 PNGs. Every one is a **real screenshot of the running app**, captured 22 September 2026
from `apps/mobile` on the Expo web target at **390×844 @2x (780×1688 actual)** — iPhone
14/15 logical size, so they sit correctly in any standard phone frame.

Customer is **Karan Deshpande** unless the filename says otherwise. Karan carries the whole
rule set by himself; Rohan and Priya each make one rule fire on its own facts.

> ⚠️ These are captured from the **local** build, which is ahead of what is deployed.
> See [`../BLOCKERS.md`](../BLOCKERS.md) §3. Re-shoot after redeploying if you want the
> deck and the live link to match exactly.

---

## `refusals/` — the deck's centre of gravity

Use one of these on slide 2, slide 6 and slide 13. It is the same image three times on
purpose: it is the idea.

| File | What it shows | Where |
|---|---|---|
| **`01-HERO-refusal-rule1-karan.png`** | *"I'm not going to sell you that" · Not suitable · **rule 1 of 9*** · the nine listed with "Stopped here" on rule 1 | **Slide 6 hero.** The single best image in the set |
| **`02-HERO-refusal-rule9-rohan.png`** | **Rule 9 of 9** · *"IDBI sells this one and I am still telling you not to buy it"* · term cover at ₹985 named as the alternative · rules 1–8 ticked green | **Slide 2 and 13.** The stronger *argument* — no debt excuse, the bank refusing its own product on the merits |
| `03-refusal-in-chat.png` | The same refusal inside the Ask Uday conversation, with Uday's portrait and the evidence lines under it | Slide 10 |
| `04-before-the-check.png` | The ULIP product sheet *before* the check — "Nine rules run against your statement. Whatever they say goes in your record." | A before/after pair with 01 |
| `05-the-nine-rules.png` | Record → Rules. "They run in order on every product, every time. The first to fail stops it" | Slide 4 or 13 |

## `screens/` — 29 screens, the whole product

**Home** · `01-home-overview` (one action today, the account carousel, ₹3,18,774 IDBI
balance) · `02-home-budget` · `03-home-debt` · `04-home-credit` (the conduct score, with
*"This is not a credit score"* stated on the card)

**Plan** · `05-plan-route` (the goal, then the route in order) · `06-plan-numbers`
(projections as a band)

**Uday** · `07-uday-chat-refusal` ← *also the best single screen for "avatar-based"* ·
`08-uday-chat-open`

**Grow** · `09-grow-save` · `10-grow-challenges` · `11-grow-networth` (**₹34,65,599** —
owned less owed, with the split) · `12-grow-holdings` · `13-grow-invest-shelf`
(*"Everything IDBI can sell you. Tap one and I'll say whether it suits you — including
when it doesn't."*)

**Protect** · `14-protect-cover-gap` (**₹2.28Cr short**, ten-times-income rule of thumb
spelled out) · `15-protect-shelf`

**The record** · `16-record-advice-trail` ("Record intact · 2 entries · each sealed against
the one before") · `17-record-nine-rules` · `18-record-consent`

**Detail** · `19-statement` (enriched, real merchant marks — Swiggy, Blinkit, HPCL — and
the salary line) · `20-credit-detail` · **`21-noticed`** (*"₹11,233 a month on the table, across 7 things in your statement"* — **one of the best single numbers in the app**; strong slide-10 candidate) · `22-connections` · `23-profile` ·
`24-save-hacks` · `25-challenge`

**Other customers** · `26-home-priya` · `27-debt-priya` (the 34.8% card) ·
`28-networth-rohan` · `29-protect-rohan`

## `onboarding/` — 10 screens, the whole first run

`01-welcome` (*"Advice that has read your statement — no questionnaire. Two years of your
own spending, read properly."* Photographic hero, real art direction — **use this if the
deck needs a human face**) · `02-sign-in-picker` (the four demo customers) · `03-otp` ·
**`04-consent`** (*"Let me read your statement · Consent you can withdraw any time"* —
three blocks named plainly. **The DPDP slide's image**) · `05-reading-statement` ·
`06-checklist` (*"You're nearly there"* — two steps left) · `07-about-you` · `08-goal` · `09-risk-profile` · `10-ready`

## `tall/` — 390×2000, for cropping

Full-height captures where a slide needs more than one fold: `home-full`, `plan-full`,
`nine-rules-full` (**all nine rules in one image**), `product-shelf-full` (**the whole
IDBI + LIC + protection shelf in one image** — good for slide 4 or 8).

## `avatar/`

| File | Note |
|---|---|
| `uday-face-runway.png` | Uday's face, from the verified WebRTC video frame, 2 Sep 2026. Use as an inset or a circular portrait — **not** as a full slide |
| `uday-live-call-frame.png` | A live-call frame, 20 Sep 2026 |

There is deliberately **no screenshot of the in-app video call UI**: taking one bills
Runway credits, and they are being saved for the demo video. Grab a frame from the video
once it is shot.

---

## Using them

- **Frame every phone screenshot.** A 1px hairline rounded rect, radius ~28px. No glossy
  bezel, no shadow, no tilt
- **Never stretch.** They are 780×1688 — scale proportionally only
- **Caption every one.** An uncaptioned screenshot is decoration; a captioned one is
  evidence. `SLIDES.md` has a caption for every image it asks for
- **Crop rather than shrink** when a slide needs one card. The `tall/` set exists for this
- The app is cream-on-green, so screenshots sit on the cream slide ground with no halo.
  **Do not put them on white**

## Reproducing them

Both servers running (`pnpm dev:api`, `pnpm --filter @dhan/mobile start --web`), then
headless Chrome over CDP: mint a token at `POST /api/v1/sessions`, write it to
`localStorage['dhan.session.token']`, navigate per route, capture at 390×844 @2x. Web URLs
drop the route groups — `/spend`, `/plan`, `/record`, `/grow?pane=invest`. Wait ~3.5 s per
route for count-ups and staggered entrances to settle. Full recipe in the user's
`mobile-preview-workflow` memory.

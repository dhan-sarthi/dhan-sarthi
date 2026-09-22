# Hack2skill portal — Submission 1, field by field

Paste-ready. Character counts are exact and were measured, not estimated.

---

## 1. Challenges

```
Problem Statement 1: Digital Wealth Management
```

---

## 2. Working Prototype Deployed Link  *(max 1024)*

> ⚠️ **Not live yet — see BLOCKERS.md.** Nothing answers at
> `https://dhan-sarthi-api.fly.dev` today. This field needs a URL a judge can open on a
> phone with no setup. Fill it with the Expo web export URL once deployed, e.g.
> `https://app.dhansarthi.in` or the CloudFront/Vercel URL.

If a short instruction is allowed alongside the URL, append:

```
Open on a phone. Pick "Rohan Mehta" - no signup. Press +1 month on the clock and the plan re-cuts itself. Ask Uday about the LIC ULIP and he will refuse it, on the record.
```
*(170 characters)*

---

## 3. Final Prototype PPT/Deck converted into PDF  *(≤5 MB)*

Built from [`SLIDES.md`](SLIDES.md) + [`BRAND.md`](BRAND.md) + [`DIAGRAMS.md`](DIAGRAMS.md).

**Export checklist**
- [ ] Export to PDF, then check the size. The screenshots are 780×1688 @2x, so a
      14-slide deck with 25 of them will exceed 5 MB. Downsample images to 150 dpi on
      export, or run the PDF through a compressor
- [ ] Open the PDF on a phone. If any body text is unreadable at phone width, it is too small
- [ ] Check the ₹ glyph rendered on every slide — it is the first thing a bad font
      substitution breaks
- [ ] Slide 14's links must be live hyperlinks, not plain text

---

## 4. Github Repository Link (Public Access)  *(max 1024)*

```
https://github.com/dhan-sarthi/dhan-sarthi
```

> ⚠️ **This URL returns 404 to a logged-out visitor today** — the repository is private.
> The field says *Public Access*. See BLOCKERS.md. Verify with:
> `curl -s -o /dev/null -w "%{http_code}" https://github.com/dhan-sarthi/dhan-sarthi`
> — it must return `200`.

---

## 5. Demo Video Link (up to 3 minutes)  *(max 1024)*

```
[paste the unlisted YouTube URL]
```

Script and shot list: [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md).
Upload **unlisted, not private** — a private video is invisible to the jury. Check it
plays in a logged-out browser before pasting.

---

## 6. Brief description of your solution  *(max 1024)*

### ✅ Use this — 1,016 characters

```
Dhan Sarthi is an avatar-led wealth advisor built to sit inside IDBI GO Mobile+. It reads 24 months of a customer's transactions instead of asking a questionnaire, derives one snapshot, and each day gives exactly one action that keeps them on route to their goal.

Its differentiator is the refusal. Nine deterministic suitability rules sit between the advice and IDBI's shelf, so the app blocks a ULIP the bank itself sells and names term cover at Rs 985 instead. Every verdict is hash-chained into a five-year record. Uday, a photorealistic avatar, phrases the verdict but never decides it: on a billed live call the model called our tool and the rules answered in 665 ms.

Refined this phase: the web PoC became a native Expo app; the "future self" concept was cut for a daily Autopilot loop; and we integrated IDBI's own sandbox - 24 operations mapped from 42 captured responses, the six-call Account Aggregator flow, and two of the bank's customers read live. 635 tests pass, 51 routes, zero keys on the client.
```

### Backup — 998 characters, one block

Use if the field strips blank lines and the count shifts.

```
Dhan Sarthi is an avatar-led wealth advisor for IDBI GO Mobile+. It reads 24 months of transactions instead of asking a questionnaire, and gives the customer one action a day that keeps them on route to their goal. Its differentiator is the refusal: nine deterministic rules sit between the advice and IDBI's shelf, so the app blocks a ULIP the bank itself sells and names term cover at Rs 985 instead. Every verdict is hash-chained into a five-year record. Uday, a photorealistic avatar, phrases the verdict but never decides it. Refined this phase: the web PoC became a native Expo app; the "future self" concept was cut for a daily Autopilot loop; the avatar moved to Runway over LiveKit, proven on a billed call where the rules answered the model's tool call in 665 ms; and we integrated IDBI's own sandbox - 24 operations mapped from 42 captured responses, the six-call Account Aggregator flow, and two of the bank's own customers read live. 635 tests pass, 51 routes, zero keys on the client.
```

### Why it is written this way

The field asks for two things — *the solution* **and** *what was developed or refined in
this phase*. Most entries will answer only the first. Paragraph 3 answers the second
explicitly, and leads with the thing that is hardest to fake: **we integrated the bank's
own sandbox.**

Three deliberate choices:
- **"Rs" not "₹"** — portal text fields mangle the rupee glyph often enough that it is not
  worth the risk. Everywhere else (deck, video, app) uses ₹
- **Concrete numbers over adjectives.** 24 months · nine rules · 665 ms · 635 tests · 42
  captured responses. Every one is checkable in the repository
- **It names a thing we cut.** "The future self concept was cut" reads as judgement, not
  as loss. Teams that only add features look like teams that never decided anything

### Do not paste

- Anything about "leveraging AI" or "seamless, personalized experiences"
- Any figure not in this document
- A claim that the app is SEBI-registered, or that it gives investment advice. It is a
  prototype that implements the product-appropriateness check a distributor already performs

# Dhan Sarthi — Phase 2 deck copy

Every word that goes on a slide, in template order. **Text in `[brackets]` is an
instruction to the designer, never slide text.** Nothing here is a placeholder: every
figure is real and traceable to the repository. Do not invent numbers.

House style, inherited from the product: **say the thing, then the reason, in as few words
as possible.** No "which is why", no "leveraging", no "seamless". Lead with the number.

> **One line, if the deck only gets one:**
> A wealth advisor for the IDBI customer no relationship manager can afford to serve.
> It reads 24 months of transactions, says the one thing to do today, and **refuses to sell
> an IDBI product when that product is wrong for them.**

---

## Slide 1 — Team Details

```
Team name:          Atomic
Team leader name:   Krishna Faujdar
Problem Statement:  Problem Statement 1 — Digital Wealth Management
```

Members (small, under the three fields):
- **Krishna Faujdar** — AI & backend
- **Rajveer Bishnoi** — Product & design
- **Mohit Kumar** — Full-stack & architecture

`[Keep this slide plain. The template's three labelled fields, filled. No stock photos.]`

---

## Slide 2 — Brief about the idea

### Headline
**Dhan Sarthi — a wealth advisor that reads your statement, and refuses to mis-sell you.**

### Body (three beats, in this order)

**1. It reads, it doesn't ask.**
Twenty-four months of transactions become one Snapshot: income, commitments, what actually
gets spent, idle cash, debt, the protection gap. No risk questionnaire. Karan's four banks
and nine investments add up to **₹34,65,599** on one screen for the first time — and the
app finds **₹11,233 a month on the table, across 7 things in his own statement.**

**2. One thing to do today.**
Not a dashboard. Each day: what changed since you last looked, what is safe to spend, and
exactly **one** action from a closed vocabulary of thirteen. The deployment decisions —
start the SIP, buy the cover — fire on triggers: salary day, an EMI ending, an FD maturing.

**3. And it says no.**
Nine deterministic rules sit between the advice and IDBI's product shelf. The avatar phrases
the verdict; the rules decide it. When the shelf offers a ULIP that does not suit the
customer, the app says so — **about a product IDBI itself sells.**

### Pull quote `[set large, this is the idea in one sentence]`
> **"IDBI sells this one, and I am still telling you not to buy it."**
> — what the app tells Rohan Mehta when rule 9 refuses the LIC ULIP, and offers ₹1 crore of
> term cover at ₹985 a month instead.

### Footer strip
`Sarthi` means charioteer: the one who drives while you decide where to go.

`[Visual: assets/refusals/02-HERO-refusal-rule9-rohan.png in a phone frame, right third.]`

---

## Slide 3 — Opportunities

### 3a. How different is it from existing ideas?

| | Avatar | Reads real spending | Regulated advice | **Refuses a sale** |
|---|---|---|---|---|
| BoB "Aditi" (2024) | ✅ | ❌ | ❌ service bot | ❌ |
| HDFC SmartWealth | ❌ | ❌ | ✅ DIY | ❌ |
| SBI Financial Fitness (2026) | ❌ | ⚠️ score only | ⚠️ not advice | ❌ |
| INDmoney / Groww | ❌ | ⚠️ aggregation | ❌ execution | ❌ |
| **Dhan Sarthi** | ✅ **Uday, live** | ✅ **24 months** | ✅ **9-rule gate** | ✅ **built & tested** |

**No Indian bank app has the last column.** Every competitor's incentive is to complete the
sale. Ours is a deterministic gate that blocks it, in code, with a record.

### 3b. How will it solve the problem?

The brief names the gap as *"absence of comprehensive insight into customer investment
behaviour and spending habits."* Three things close it:

- **Behaviour, not a questionnaire.** Enrichment → recurring detection → one Snapshot.
  Categorisation coverage above **98%** against the bank's own labels.
- **Scale economics.** ≈**₹50–100 per advised customer per year** against ₹15,000+ for
  RM-led advice. Advising the "missing middle" becomes profitable, not charitable.
- **Compliance as the product, not the paperwork.** The suitability check, the explanation
  and the five-year record are one thing, produced automatically on every verdict.

### 3c. USP of the proposed solution

> **The refusal is the product.**
> Nine ordered, deterministic rules in a zero-I/O package, provable with `pnpm test` and no
> server running. The model calls them; it never replaces them. Every verdict — pass or
> block — is hash-chained into an append-only record designed for SEBI's five-year
> retention. A chatbot can be copied in a quarter. A bank that has already built the
> mechanism for refusing its own shelf cannot.

### The market, in four lines `[small, footer band]`
- India wealth AUM **US$1.1T (FY24) → ~US$2.3T by FY29** (Deloitte)
- Only **~3–5%** of Indians hold mutual funds; the ₹2.5–13L "missing middle" at ~5–6%
- SIP inflows at record **₹31–32k Cr/month**; the intent exists, the guidance does not
- **25+ Cr Account Aggregator users, 2.6 Bn linked accounts** (Sahamati, Dec 2025)
- **IDBI GO Mobile+ has no advisory, goal planning or wealth view today** — white space,
  and retail is ~61% of IDBI's book

---

## Slide 4 — List of features offered by the solution

`[Five groups. Keep the group titles; trim bullets to fit before you cut a group.]`

**📖 It reads the statement**
- 24 months of transactions → merchant and category by ordered dictionary, confidence
  recorded per line. **>98% coverage, zero disagreements** with the bank's own labels
- Commitments inferred from periodicity and amount variance — never from a flag production
  will not have. Price rises detected; subscriptions costed per year
- One **Snapshot**: income, commitments, discretionary drift, idle floor, buffer, debt,
  protection gap, deployable surplus. Every screen and the avatar read the same object

**🧭 Autopilot — the daily loop**
- Safe-to-spend as a pot and a per-day rate; what changed since you last looked
- Exactly **one** action a day, from a closed vocabulary of thirteen
- Roadmap: free up → get cover → clear debt → build buffer → grow. Protection first,
  deliberately. Versioned, with the reason each version changed
- Triggers move money decisions: salary credited · EMI ending · FD maturing · idle balance

**🛑 The suitability gate — nine rules**
- Ordered, deterministic, earliest failure wins. Pass or **BLOCKED** with the rule, the
  rules cleared, the sentence the customer hears, and a better product where one exists
- Pure protection is exempt from rules 1–3: a customer in debt with dependants needs cover
  more, not less. A ULIP is not protection, so every rule applies to it
- The whole rule book is in the app, in plain English, next to the products it will refuse

**🗣️ Uday — the avatar**
- Photorealistic, full-screen video call. Runway Characters owns voice, video and
  turn-taking over LiveKit WebRTC
- **He phrases; he never judges.** On a billed live call the model called
  `check_suitability` and our rules answered in **665 ms** — the customer heard our sentence
- Three-tier fallback: live avatar → honest "Uday is with another customer" with text →
  fully deterministic phrasing from the engine. A spinner is not a fallback

**🔒 The record**
- Append-only, hash-chained: the exact sentence shown, the rule, the Snapshot it was judged
  against. "Record intact · each sealed against the one before"
- Granular DPDP consent per data block, withdrawable in the app; the advice recomputes
  without it
- Every projection is a band — cautious / assumed / optimistic — with the rate visible and
  adjustable and a real-terms line at 5.5% inflation. Never one confident number

---

## Slide 5 — Process flow diagram

`[Draw the diagram in DIAGRAMS.md §1. The numbered steps below are the caption, set small
under it — they are the same eight steps the diagram shows.]`

1. **Consent** — DPDP notice, per block, withdrawable. Account Aggregator for accounts
   held elsewhere
2. **Ingest** — IDBI core banking + AA feeds; 24 months of statement
3. **Understand** — categorise, infer commitments, detect idle cash and life events
4. **Derive** — one **Snapshot**. Nothing downstream may read a transaction directly, which
   is what stops the avatar quoting a number the screen does not show
5. **Route** — goal → dated roadmap, protection before growth
6. **Propose** — the engine drafts one action from thirteen
7. **Gate** — nine rules run in order. PASS, or BLOCKED with the first failing rule and a
   better product `[highlight this step — it is the slide]`
8. **Record** — hash-chained row, five-year retention. Low confidence or distress escalates
   to a human RM

**Nothing moves money without a tap.** Propose → gate → one-tap consent → bank rails →
record.

---

## Slide 6 — Wireframes / Mock diagrams

`[Not wireframes — use the real app. It is built. Layout: five phones in a row, slight
overlap, the middle one raised. Left to right:]`

| Phone | Asset | Caption (one line each) |
|---|---|---|
| 1 | `assets/onboarding/04-consent.png` | Consent per block, withdrawable |
| 2 | `assets/screens/01-home-overview.png` | One action today, four banks on one screen |
| 3 | **`assets/refusals/01-HERO-refusal-rule1-karan.png`** | **"I'm not going to sell you that"** |
| 4 | `assets/screens/05-plan-route.png` | The route, in order, protection first |
| 5 | `assets/screens/17-record-nine-rules.png` | The nine rules, in the customer's app |

`[The middle phone is the deck's hero image. If one image survives a redesign, it is that one.]`

Strip caption: **Every screen is served by the API. No screen has a number typed into it.**

---

## Slide 7 — Architecture diagram

`[Draw DIAGRAMS.md §2. Caption below, four lines:]`

Three rules decide where code goes, and each one is enforced by a test, not by a convention:

- **Secrets and provider calls live only in `apps/api`** — zero keys ever reach the client.
  The browser is handed a short-lived LiveKit token, never a credential
- **Decisions live only in `packages/core`, which does no I/O** — the nine rules can be
  exercised and audited with `pnpm test` and nothing standing up
- **A route may not return a shape not declared in `packages/contracts`** — the registry
  generates the OpenAPI document, the validation and the client's types together, and a
  test walks it in both directions, so a route not in the registry cannot exist
- **Cross-cutting:** consent ledger, suitability service, explanation store, hash-chained
  audit vault — SEBI's AI/ML framework designed in, not bolted on

---

## Slide 8 — Technologies to be used

| Layer | Built with | Production path |
|---|---|---|
| **Client** | Expo 57 · React Native 19 · Expo Router · NativeWind 4 · Reanimated | Ships as a React Native module inside IDBI GO Mobile+ |
| **Design system** | One `tokens.json` → runtime values + Tailwind preset. Seven type roles. No hex in any component | Rebranded by editing one file |
| **API** | Fastify 5 · TypeScript · zod · **51 routes, all registry-declared**, OpenAPI generated from the registry | Containerised on the bank's cloud, all PII in-country |
| **Engine** | `@dhan/core` — pure, zero I/O: categorise · recurring · derive · suitability · projection · roadmap · insights · dailyplan | Unchanged. It is the auditable artefact |
| **Avatar** | **Runway Characters** (voice, video, turn-taking) over **LiveKit** WebRTC; credential pool, daily minute budget, reaper, teardown on every path | Bank-hosted or in-region provider; the port is one interface |
| **Data** | PostgreSQL · seeded generator · `BANK_SOURCE` swaps memory / postgres / **idbi-sandbox** with no code change | Point it at core banking |
| **Bank integration** | **IDBI sandbox: 24 operations across 29 paths**, mapped from **42 captured live bodies** · Account Aggregator (6 calls + 2 webhooks) · lead creation | Same adapter, production base URL |
| **Security** | Ephemeral tokens, no keys on device · consent ledger · immutable hash-chained audit · operator key on privileged routes | + bank IAM, HSM, SIEM |
| **Quality** | **635 tests passing** · contract tests both ways · dependency-cruiser architecture rules · seeded-data hash check | + browser E2E (named gap) |

---

## Slide 9 — Estimated implementation cost

| Phase | Scope | Duration | Indicative cost |
|---|---|---|---|
| **Prototype (done)** | Native app, 9-rule engine, live avatar, IDBI sandbox integration, 635 tests | — | ~₹0 · public tooling and free tiers |
| **Sandbox pilot** | IDBI sandbox hardened, AA production consent, 1,000-user closed beta, compliance review | 3–4 months | **₹40–60 L** |
| **Production v1** | GO Mobile+ integration, core-banking adapter, bank-hosted models, Hindi + 2 languages, SOC/DPDP sign-off | 6–9 months | **₹3–5 Cr** (year 1) |

**Unit economics.** ≈**₹50–100 per advised customer per year** (inference + infrastructure)
against **₹15,000+** for RM-led advice — roughly **150×** cheaper. Break-even at ~0.1% AUM
uplift on advised balances.

**What the bank gets for it:** fee income on MF distribution and LIC bancassurance from a
segment no RM can reach, and a documented suitability trail on every recommendation, which
it does not have today at any price.

---

## Slide 10 — Snapshots of the prototype

`[Grid of 6. Caption every one — an uncaptioned screenshot is decoration.]`

| # | Asset | Caption |
|---|---|---|
| 1 | `assets/screens/01-home-overview.png` | **Home.** One thing to do today, and four banks on one carousel |
| 2 | `assets/screens/05-plan-route.png` | **Plan.** The route in order — cover, then debt, then growth |
| 3 | `assets/refusals/03-refusal-in-chat.png` | **Ask Uday.** "Not yet. You are paying 34.8% on ₹1,86,240" |
| 4 | `assets/refusals/02-HERO-refusal-rule9-rohan.png` | **The refusal.** Rule 9 of 9, and the cheaper product named |
| 5 | `assets/screens/16-record-advice-trail.png` | **The record.** Record intact · each sealed against the one before |
| 6 | `assets/screens/11-grow-networth.png` | **Net worth.** ₹34,65,599 — owned less owed, from the ledger |

`[Optional seventh, if the grid allows — pick one:`
`  assets/screens/21-noticed.png — "₹11,233 a month on the table, across 7 things in your
  statement", with "Show the evidence" under each. The best number in the app.`
`  assets/screens/19-statement.png — the enriched statement with real merchant marks. It is
  what makes the data look like a bank's, not a demo's.]`

---

## Slide 11 — Prototype performance report / Benchmarking

### Verified on a billed live call `[lead with this — it is the hardest evidence in the deck]`

3 September 2026, session `3477379d…`, 122 seconds, provider's own record retained.

> Customer: *"My cousin says I should take the LIC Market Plus ULIP for ₹2,500 a month.
> Should I?"*

The model **did not answer from its own judgement.** It called `check_suitability`.
Our rules answered in **665 ms** — `BLOCKED · BUNDLED_PROTECTION` — and the customer heard
that sentence, near enough word for word, in Uday's voice, with term cover named as the
alternative.

### Engine guarantees, held by `pnpm test`

| Guarantee | How it is held |
|---|---|
| **635 tests passing** | core 188 · contracts 22 · fixtures 164 · api 211 · mobile 50 |
| Determinism | same seed → identical ledger on any machine |
| Every rupee once | income, commitments, discretionary and unexplained partition the ledger exactly |
| The refusal | the ULIP is BLOCKED by `BUNDLED_PROTECTION` and term cover is named — asserted, not demonstrated |
| Recognition | **>98%** categorisation coverage, zero disagreements with the bank's labels |
| Honest surplus | predicted surplus within 0.5×–1.8× of what the balance actually did |
| Time machine | days generated live are identical to the same days generated as history |
| Calibration | UPI debits/month, ticket distribution and share of payments under ₹500 inside bands cited to NPCI and the RBI Payment System Report |

### Latency

| Path | Measured |
|---|---|
| Suitability verdict, model tool call → spoken | **665 ms** |
| IDBI sandbox, live over the wire | ~2.4 s |
| Same call, captured-response replay | **17 ms** |
| Avatar: first video frame | ~5 s, covered by a designed waiting state, not a spinner |

### What we do **not** claim `[keep this block — the honesty is the credibility]`
- No provider guarantees the model calls the tool on *every* turn. We reconcile the
  provider's transcript against our own tool ledger after each call and **record the
  coverage rather than assume it**
- Barge-in: Runway documents it nowhere, so we do not claim it
- Hindi: the engine takes it as a data file; the build does not yet ship it
- There is no browser end-to-end suite today. It went with the deleted web app, and
  `TESTING-AND-DEPLOYMENT.md` records that as an open hole

---

## Slide 12 — Additional details / Future development

**Next (sandbox pilot)**
- **Hindi and two more languages** — the engine already takes phrasing as a data file
- **Cross-session memory** — "did you move that idle ₹92,000 we discussed?"
- **Browser end-to-end suite** — the named gap, closed
- **Live core-banking adapter** — the same port the sandbox adapter satisfies

**Then (production)**
- **Vocal distress detection** → soften the guidance and offer a human RM. A compliance
  feature as much as a kindness
- **LIC annuity glide path** — advice shifts from accumulation to guaranteed income with age
- **Family mode** — joint goals: a child's education, a parents' health corpus
- **WhatsApp and branch-kiosk channels** for B30 reach, on the same engine
- **"Your money year"** — a shareable annual recap. No Indian bank has one

**For the bank, not the customer**
- **RM console** — the same Snapshot and the same record, from the staff side, so a
  conversation starts where the app left off
- **Rule authoring for compliance** — the nine rules are data. A compliance officer should
  edit them without a deploy

---

## Slide 13 — Improvements done during the 2nd prototype phase

`[THE slide for this submission. The template added it; the jury will read it first.
Two columns: "Phase 1 (idea + web PoC)" → "Phase 2 (what is built now)".]`

### 1. The channel is now the real one
React + Vite web page → **native Expo / React Native app**, five tabs
(Home · Plan · Uday · Grow · Protect), built screen by screen against a best-in-class
consumer finance app and rebranded in IDBI green from a single `tokens.json`.
**It is the shape that ships inside GO Mobile+.** The web app was deleted outright on
20 September 2026 rather than left to rot.

### 2. We cut our own headline feature
Phase 1's spine was an **age-progressed "future self" avatar**. It is gone.
A face you meet once is a **moment**, not a product — the app had nothing to say on day two.
It is replaced by **Autopilot**: a daily loop (what changed, what is safe to spend, one
action) with deployment decisions on triggers. `[Say this out loud. Cutting your own best
slide is the most credible thing on it.]`

### 3. The refusal went from a claim to a tested mechanism
**Nine ordered deterministic rules** in a zero-I/O package, each writing both the sentence
the customer hears and the line the record keeps; **188 core tests** over them. Pure
protection exempted from rules 1–3 on purpose. The whole rule book is now **in the customer's
app**, beside the products it will refuse.

### 4. We integrated IDBI's actual sandbox `[the strongest line in the deck for a bank jury]`
**24 operations across 29 paths, mapped from 42 captured live response bodies** — not from
the specification, because 28 of IDBI's 29 OpenAPI exports declare `responses: {}`.
- **Two of the bank's own customers read live**: accounts, liens, loans, statements, consents
- The **six-call Account Aggregator flow**, including the webhook IDBI posts back, and the
  rule that a notification grants nothing until `591` confirms it
- **Lead creation (428)**, so an accepted recommendation becomes work for the bank's staff
- Their statements are thinner than anything we would have generated — one carries no
  description on any line — and **the screens say so rather than filling the gaps in**

### 5. The avatar became real infrastructure
OpenAI realtime in a browser tab → **Runway Characters over LiveKit**, with a credential
pool, a daily minute budget, a reaper and teardown on every path. **Proven on a billed
call:** the model called our tool, the rules answered in **665 ms**, the customer heard our
sentence. Plus a three-tier fallback ladder that ends in fully deterministic phrasing.

### 6. The data stopped being mock data
Four generated customers, **24 months each**, calibrated against NPCI narration grammar,
IDBI's own IFSC prefix, rate card and schedule of fees, and the published UPI ticket
distribution — **every constant cited**, and the one figure we cannot reproduce explained
rather than fudged.

### 7. Engineering the bank can audit
**635 tests** (from 0 at Phase 1) · **51 routes, every one registry-declared** with the
OpenAPI document generated from the same registry · contract tests walking the route table
in both directions · architecture rules enforced by dependency-cruiser · a seeded-data hash
check · 14 ADRs recording what each decision cost to reverse.

`[Footer: "And one thing we removed: apps/web, 278 tests and all. The total test count went
down and the product got better."]`

---

## Slide 14 — Links

```
GitHub Public Repository:   https://github.com/dhan-sarthi/dhan-sarthi
Demo Video (3 minutes):     [paste]
Final Product Link:         [paste the deployed app]
```

`[Add a QR code for the deployed app — a judge with a phone should reach it in one scan.]`

**Try it in two minutes, without an account:**
Open the link → pick **Rohan Mehta** → press **+1 month** on the simulated clock and watch
the plan re-cut itself → open **Record → The rules** → ask Uday about *"the LIC ULIP my
cousin recommends"* and he will refuse it, on the record.

> Every customer, transaction and balance in the demo is **synthetic**, generated from a
> seed. No IDBI customer data and no personal data. Dhan Sarthi is a prototype and is not a
> SEBI-registered investment adviser.

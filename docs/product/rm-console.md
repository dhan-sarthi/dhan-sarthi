# RM Desk — the relationship manager's console

Status: being built, 2 October 2026, on branch `rm-console`. This is the build spec; every builder
reads it before touching code. Reference screens and what to take from each:
[`docs/assets/rm-console/refs/README.md`](../assets/rm-console/refs/README.md).

## Why it exists

The hackathon's organisers asked for a web dashboard where an IDBI relationship manager logs in
and sees their book: every customer's journey, growth and analytics.

The product story it completes: Uday is "the relationship manager you were never profitable enough
to get" (decisions C1). One human RM can now carry **hundreds** of mass-market customers, because
Uday runs the daily loop and hands the RM only the moments that need a person. The console answers
three questions, in this order:

1. **Who do I call today, and why?** A ranked list, each row with its reason and its rupee figure.
2. **What is this customer's whole picture?** Money across every bank, their plan, their journey.
3. **Can I prove we never mis-sold?** Every Uday refusal, hash-chained and verifiable in one click.

## Decisions (owner, 2 Oct 2026)

- **Book: ~50 customers.** The 4 hero personas plus ~46 new synthetic persona specs, generated
  through the same fixtures pipeline so every rupee is arithmetic over a ledger. Labelled demo data.
- **Local branch only.** Nothing is pushed or deployed until the owner reviews.
- **AI copilot: yes.** A meeting-prep brief and "Ask about this customer", every figure cited.

Decisions taken by the builder (reversible, listed for the morning review):

- New app `apps/rm`: Vite + React 19.2.3 + TypeScript strict + Tailwind v4 + shadcn/ui primitives
  restyled to our tokens + Recharts + TanStack Table + TanStack Query + React Router.
- **Light theme only. System font stack** (decision on web fonts stands: ₹ always renders).
- RM clock is the data anchor, **1 Sep 2026**, shown in the top bar as the as-of date.
- The mobile persona picker keeps showing exactly the 4 heroes.

## Users and sign-in

Two demo RMs on IDBI's digital wealth desk (virtual RMs serve customers across cities, which is
how the book can span Pune, Indore, Kochi, Nagpur and more):

| RM | Employee no. | Desk | Book |
|---|---|---|---|
| Meera Joshi | `204117` | Digital Wealth Desk, Mumbai | the 4 heroes + ~34 book customers |
| Arjun Menon | `204388` | Digital Wealth Desk, Bengaluru | ~12 book customers |

- Sign in with employee number + password. The demo password is shown on the sign-in page under a
  "Demo access" disclosure with one-click fill for each RM. Passwords are stored as scrypt hashes.
- A second RM exists to prove **book scoping**: Arjun cannot open Meera's customers (403).
- Bearer token, same design as ADR-0008 (opaque, hashed at rest, sliding expiry), prefixed `rm_`
  so it can never be confused with a customer `ds_` token. New route auth kind: `'rm'`.

## The book

- `packages/fixtures`: `PERSONAS` stays the 4 heroes (the mobile picker reads it). A new
  `RM_BOOK` holds the ~46 new specs; `ALL_PERSONAS = [...PERSONAS, ...RM_BOOK]` is what seeding and
  the bank sources load. Book specs get `displayOrder: null`, and the customer list behind the
  mobile picker filters to `displayOrder !== null`, in both the memory and Postgres sources.
- The book must look like a real Indian RM book, not 46 copies of one customer: ages 23–64; a
  gender balance; salaried, self-employed and business owners; incomes from ₹28k to ₹6L a month;
  Conservative / Balanced / Growth; every insight kind represented (idle cash, FD maturing, EMI
  ending, protection gap, expensive card debt, thin buffer, missed repayment, subscription creep,
  spend drift); a healthy majority with SIPs on track; several multi-bank customers so wallet
  share means something; a handful of Priority-segment customers. More cities may be added to
  `CITIES` (Mumbai, Bengaluru, Hyderabad, Chennai, Lucknow, Jaipur …) with real billers.
- Every book persona passes the same realism tests as the heroes (the test loops run over
  `ALL_PERSONAS`).

## Definitions (one place: `packages/core/src/rm/`)

Pure functions, no I/O, unit-tested over literals. Every number on the console comes from these.

| Term | Definition |
|---|---|
| **Assets we can see** | `netWorth(snapshot).assets`: every account balance (any bank, via the ledger and Account Aggregator) + holdings. |
| **With IDBI** | balances of accounts whose institution is IDBI. **Wallet share** = With IDBI ÷ all balances. |
| **Relationship value** | Assets we can see. Book value = Σ over the book. |
| **Segment** | by Relationship value: **Mass** < ₹10L, **Affluent** ₹10L–₹50L, **Priority** ≥ ₹50L. |
| **Goal health** | **On track**: roadmap feasible, no monthly shortfall, no urgent insight. **At risk**: feasible but a shortfall or an urgent insight (missed repayment, expensive debt). **Off track**: roadmap not feasible. |
| **Signals** | the customer's insights minus `human_handoff`, re-voiced for the RM in the third person ("Card at 34.8% — ₹1.86L outstanding"). Severity keeps the engine's three levels. |
| **Call queue** | open handoffs first (oldest first), then one top signal per customer ranked by the engine's own ranking (severity → deadline ≤ 14 days → waterfall rank → monthly value). Each row: the customer, the signal, one sentence of why with its figure, a suggested opener. |
| **Relationship strength** | High / Medium / Low from: days since last activity (any decision, call, session), number of IDBI products held, wallet share. The reason is always shown ("Active 6 days ago · 3 IDBI products · 62% of balances with IDBI"). |
| **Attrition watch** | flagged only with reasons: IDBI balance down > 15% over 3 months, wallet share < 30%, no activity in 60 days, a SIP paused. |
| **Balance history** | month-end balance per account from the ledger (`accountFactsAsOf` per account), 12 months. Holdings and debt are flat before the anchor in the generator, so history charts plot **balances**, labelled as such; holdings are shown "as at 1 Sep 2026". Never chart a flat line as growth. |
| **Projection** | `project()` bands, Cautious 6 / Expected 10 / Optimistic 12, with the mandatory disclaimer. Never a single number. |
| **Mis-sales prevented** | count of advice records with verdict `BLOCKED`, by rule. |

## Activity behind the book

The 4 heroes get their journey from reviewer sessions and `HistoryService`, as today. Book
customers have no reviewer, so an **activity simulator** in `apps/api` gives each one a journey
through the real services, never by writing rows by hand:

- a dedicated, unusable-token session per book customer, then `HistoryService.seed` over 12 months
  (plan versions, decisions, advice records, all through `DecisionService`);
- a seeded handful of **product enquiries** per customer (e.g. asking about a ULIP, ELSS, an index
  fund) run through the same `evaluateProduct` path text chat uses, so refusals are real verdicts
  in a real hash chain;
- for a deterministic subset, a recent `talk_to_rm` decision so the inbox is not empty;
- deterministic by cif; idempotent (a customer that already has its journey is skipped); runs in
  the background after boot and can be awaited by tests.

Uday **calls** are never simulated: the console shows real avatar sessions only, with an honest
empty state. A reviewer who opens the mobile app as Karan and taps "Done" on *Talk to your
relationship manager* appears in Meera's inbox live; that is the demo moment.

## Pages

App shell: left sidebar (Today, Book, Insights, Advice record, Access log), top bar with Cmd-K
customer search, the as-of date, and the RM's name/desk. Desktop first (1280–1600 wide); usable
down to 1024.

1. **Sign in** — split screen. Left: the form (employee no., password, Sign in), "Demo access".
   Right: deep IDBI-green panel, one serif-free display line ("Every customer, every goal, one
   view."), a soft preview card. Reference: `B09-origin-login-split`.
2. **Today** — greeting with the as-of date. KPI strip: Book value (with month change in
   balances), Monthly SIP book, Goals on track (%), Open handoffs. Main column: **Call today**
   (ranked queue, ~10). Right column: **Asked for you** (handoffs with waiting time), **Uday
   refused** (latest refusals, link to the record), **Coming up** (FD maturities, EMIs ending,
   SIP dates in the next 30 days). References: `A01-copilotmoney`, `A02-xero`.
3. **Book** — segment tabs with counts (All · Priority · Affluent · Mass · At risk · Idle cash ·
   Asked for RM), search, sort. Dense table: customer (initials avatar, name, age · city), segment,
   relationship value with a 12-month balance sparkline, allocation bar, goal health, top signal,
   strength, last activity. Footer aggregates. Row click opens a right preview rail without
   leaving the list. References: `A04-attio`, `A05-semrush`, `A06-mercury`.
4. **Customer** — header (avatar, name, age · city · segment · risk profile, strength badge, CIF;
   actions: Log a call, Add note, Brief me). Highlights strip: Relationship value, Net worth,
   Monthly surplus, Goal, Last active. Tabs:
   - **Overview** — Uday's summary card (AI brief entry point), suggested next actions each with a
     "Why?" popover citing the insight/rule/evidence, signals, products held vs gaps.
   - **Journey** — grouped-by-month timeline: plan versions (before → after), decisions, Uday
     refusals, handoffs, calls, RM notes, ledger events (salary change, NACH return, FD matured,
     loan closed, large inflow/outflow). Reference: `B01-attio`.
   - **Money** — balances by account and bank (wallet share), holdings by type, debt with rates,
     insurance vs need, 12-month balance chart. References: `B05-copilotmoney`, `A09-monarch`.
   - **Goals & plan** — goal, roadmap stages, projection bands with disclaimer.
     Reference: `B06-origin`.
   - **Advice record** — every verdict (PASS / BLOCKED), rule, the sentence the customer heard,
     the recorded wording, hash; "Verify chain" runs the real verification.
   - Right rail: profile (date of birth masked; reveal needs a reason and is logged), KYC, consent
     status per scope, assigned RM. References: `B02-hubspot`, `B03-lightfield`, `B04-clay`.
5. **Insights** — book analytics as small multiples (Book value, balances in/out, SIP book, goals on
   track, activity, refusals), allocation (asset class / product / segment), goal-health
   distribution, signals by kind, refusals by rule. References: `A03-adaline`, `A08-ynab`.
6. **Advice record (book)** — "Mis-sales prevented": every refusal across the book, filter by
   rule, verify all chains. The judges' moment.
7. **Access log** — every customer open, reveal and suitability check this RM made, with purpose.
8. **Copilot** — a right slide-over, scoped to the open customer: "Brief me for a meeting" and a
   question box with suggested prompts. Answers carry footnote citations to their sources.
   Reference: `B08-rox`.

Every page has a loading skeleton, an empty state and an error state written in plain words. A
spinner alone is not a state.

## Copilot rules

- Facts are assembled on the server, deterministically, as numbered lines (`F1`, `F2` …) each with
  a source (snapshot, roadmap, insight, advice record, decision, ledger). The model writes from
  those lines only and marks each sentence with the fact ids it uses.
- The server keeps a sentence only if its ids exist and every figure in it appears in a cited
  fact; otherwise it falls back to the deterministic brief. `phrasedBy: 'rules' | 'model'` is on
  every response, and the UI labels AI text "AI-written from the record — check before advising".
- **The model never decides suitability.** A question naming a product runs `evaluate()` first and
  quotes its verdict verbatim; an RM's check is logged to the access log, not the customer's chain.
- Its own model instance and circuit breaker (longer timeout, ~900 output tokens), so the console
  can never open the breaker on the customer's `/ask`.
- With no key or a failed call, the deterministic brief is the answer. Never an error.

## Compliance the UI visibly respects

- Book scoping on every RM route (403 outside the book).
- Masked by default; reveal asks for a reason; every open, reveal and check is in the access log.
- Consent status shown per scope; a withdrawn scope greys its block and says why.
- AI text labelled; advice vs information kept apart; no commission or incentive figures anywhere.
- Refusals are never hidden or softened; the record shows the exact wording the customer heard.

## Copy

Short and direct, as in the app. Titles state the thing; subtitles lead with the number. Third
person for the RM ("Karan's card is at 34.8%"), never the customer's "you". No jargon the RM would
not say aloud: never *envelope*, *deployable surplus*, *DPD*, *indicative requirement*. Uday is "he".
Indian digit grouping: ₹4,82,448; short form ₹4.8L, ₹1.2Cr.

## Code layout and ownership

```
apps/rm                  the console (Vite SPA); talks only to /api/v1/*
packages/core/src/rm     pure RM analytics (definitions above)
packages/contracts       RM route rows + schemas (routes/rm*.ts), auth kind 'rm'
packages/fixtures        RM_BOOK personas, RM desk users and book assignment
apps/api                 RM auth, stores, book service, simulator, copilot, routes
```

Rules that bind every builder:

- `apps/rm` never imports `@dhan/fixtures` and never inlines a persona string; it may import
  `@dhan/contracts` and `@dhan/design` (and `@dhan/core` types/pure helpers only).
- Every route is declared in `packages/contracts/src/registry.ts` and has a row in
  `docs/architecture/DATA-AND-API.md`; route-count assertions move with it.
- No hex in a component: colours come from `packages/design/tokens.json` (new groups for web type
  and chart colours are added there first).
- Existing routes and screens do not change behaviour, except the picker filter above.
- Migration for new tables: `apps/api/migrations/0015_rm_console.sql` (0014 is taken by work in
  progress elsewhere).
- Prettier and ESLint clean; `pnpm typecheck` and `pnpm test` green.
- No mention of the assistant anywhere in the repo; builders do not commit.

## Running it locally

```bash
pnpm install && pnpm build
BANK_SOURCE=memory AVATAR_PROVIDER=none pnpm dev:api      # :3001
pnpm --filter @dhan/rm dev                                # :5173, proxies /api to :3001
```

## Not in this build

Branch-head roll-up across RMs; a customer-side "your RM viewed your file" screen in the mobile
app; deployment (a second bucket and a `/rm/*` CloudFront behaviour, documented when deploy is
approved); real IDBI staff SSO (operation 508 exists in the gateway and is not wired).

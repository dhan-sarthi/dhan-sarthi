# Dhan Sarthi — UX Specification

**Team Atomic · IDBI Innovate 2026 · Problem Statement 1**

Target device 390×844 CSS px. Every measurement here was taken from the running app against
Postgres, or computed from the shipped components; every line citation resolves against this
repository at the revision that introduced this file.

`DIRECTION.md` (in `apps/web`) governs visual style — surfaces, motion, what we take from
GO Mobile+ and what we refuse. This document governs structure: what belongs on each screen, in
what order, and where every control sits. Where they disagree, the departure is recorded in
§4.2 rather than papered over.

---

## 1. The Argument

The sharpest finding in the whole audit is a single number: **`Do it` begins at scroll-offset 660 in a 648px scroll region.** The product's entire thesis is "one action at a time", and on two of three personas the action's buttons are physically cut by the tab bar at rest. Priya clears the fold by 5px — by accident, not by design. A judge holding the phone for ninety seconds sees the action's title and half a sentence about a projection.

That is not a layout bug. It is the symptom of a structural one: **22–25% of the device is permanent chrome, and the top of every screen belongs to the reviewer rather than the customer.** Measured: Today spends 197px on chrome (Head 89 + gap 12 + data-source ribbon 26 + TabBar 70); Money and Record spend 231px (Head 89 + Segments 72 + TabBar 70). Inside what is left, the first coloured break on Today is a peach *simulated clock* strip — a reviewer's instrument sitting in the band where NN/g measured >42% of a page's viewing time, ahead of the customer's own number. `apps/web/DIRECTION.md` already forbids exactly this, in as many words.

The principle that replaces it is one sentence:

> **The top of every screen belongs to the customer's number and the one action. Every reviewer instrument lives in a 32px band at the bottom edge, on a ground that is neither of the bank's colours. The reason a recommendation was made always sits with the recommendation; only the rulebook and the chain live in a tab.**

That last clause is not a preference. FCA FG22/5 ¶8.47 explicitly rejects "an approach which extracts or signposts key information during testing only for it to be buried within a large package of information in practice." Record can hold the nine rules and the hash chain. It cannot hold the reason.

What the principle buys, measured:

| | today | after |
|---|---|---|
| Fixed chrome | 197px (Today) / 231px (Money, Record) / 159px (Plan) | **166px on all four scrolling tabs** |
| Scroll viewport (0 / 34px safe-area inset) | 647 / 613 | **678 / 644** |
| `Do it` bottom edge, worst persona | offset 660 in a 648px region (clipped) | **offset 585 in a 644px region (59px clear)** |
| Money's three segments (1029 + 2706 + 1857 = 5,592px, none reachable from another) | 3 surfaces, 1 control | **one scroll, ~869px at rest, 8 section controls** |
| Surfaces with zero interactive elements beyond chrome | 9 of 16 | **0** |
| Controls below 44×44 | 24 distinct | **0, with two stated exceptions** |
| Hero-shaped green wave surfaces | 7 (Money alone shows 4) | **5 — one per screen** |

And it buys the four claims a route through a stranger's thumb without a tour. That route is §3.

**What we are trading away, up front.** Today loses four of its seven insight rows to a pushed screen. The waterfall keeps its adjacency but loses its closing row. Money's three segments become eight collapsed sections, so a judge sees section *headers* at rest rather than content — and NN/g provides no accordion open-rate data at all, so "they will expand it" is an assumption we compensate for (every header carries its own live figure) rather than evidence. Record keeps a name no Indian money app uses. Each of these is argued at the point it occurs.

---

## 2. The Evidence

Only findings that changed a decision.

### The fold, the thumb, and target size

- **NN/g eye-tracking (n=120, >130,000 fixations): >42% of viewing time falls in the top 20% of a page, 57% above the fold.** Desktop-measured, so the exact percentages do not transfer to 390×844 — the direction is uncontested and NN/g applies it at every size. *Changed:* the clock, the data-source ribbon and the tier badge all move from the top of the scroll region to a 32px band at the bottom edge, on every tab.
- **Parhi, Karlson & Bederson (MobileHCI 2006, n=20): one-handed thumb error rates stop improving above 9.2mm; the two smallest targets tested (3.8, 5.8mm) produced significantly more errors.** At 6.04 px/mm on this display, 9.2mm = 56px. *Changed:* every committing control is 56px, not the 48px `.btn` ships today and not the 44px compliance floor.
- **Same study: centre-column comfort µ=5.7 against µ=3.7 at both left corners; corners need ~7.5mm even for a comfortable tap.** *Changed:* Ask's Close moves from 38×38 top-**left** to 48×48 top-**right**; every primary is full-width so the binding axis is vertical.
- **Hoober publicly retracted his own thumb-zone heat map ("Ignore those drawings… a bit of a lie because I over-assumed"), and his later meta-analysis of >120M touch events found people prefer and hit the *centre*.** *Changed:* we do not cite the green/yellow/red map anywhere in the repo, and we do not justify the bottom bar with edge-targeting Fitts (NN/g, citing Avrahami: touchscreen edges offer no advantage and are *slower* to hit). The bar wins on reach and persistence only.
- **NN/g with WhatUsersDo (n=179): hiding navigation costs 20% of content discoverability and makes mobile users 15% slower.** *Changed:* the tab bar never collapses on scroll; nothing pitch-critical sits behind a hidden affordance; and it is why every collapsed section header carries a finding rather than only a promise.
- **Baymard: horizontal tabs are the worst-performing sub-navigation pattern — participants "repeatedly overlooked core product page content" behind non-default tabs.** *Changed:* both segmented controls are deleted. **Correction to the record:** two sibling proposals argued the segments *clip* at 390px. They do not — `ui.tsx:112` is `h-10 min-w-0 flex-1 truncate` inside a fixed-width flex row, three equal 116.7px columns, no overflow container, no mask. We delete them on Baymard grounds and on target size (40px at device y 105–145, the hard zone), never on an overflow that does not exist. Do not shorten "Commitments" to fix a problem that is not there.

### What the product owes its own customer

- **FCA Occasional Paper 10 (Hunt, Kelly & Garavito 2015; 300m+ observations): periodic summaries change nothing; automatically-triggered alerts *plus the ability to act immediately* cut unarranged overdraft charges 24%. Alerts or app alone: 5–8%.** *Changed:* this is why the simulated clock is not a gimmick — it demonstrates firing on a trigger rather than a calendar — and why every clock advance must end on a visible diff.
- **FCA FG22/5 ¶8.45: customers must be able to identify "any actions required… and any consequences of inaction."** Every action card in the app currently fails the first clause. *Changed:* the action card is rebuilt in the RBI Key-Fact-Statement shape — what to do, why, what happens if you don't, and where to get more — the same four slots every time. The projection paragraph leaves the card face to make room; it is duplicated on Plan anyway.
- **Gollwitzer & Sheeran (2006, 94 tests, d = .65): spelling out when/where/how has a medium-to-large effect on goal attainment.** *Changed:* `Action.label` becomes an implementation intention. **But** the copy that was proposed — "Move ₹8,200 to your SIP on 5 October" — is fabricated: Rohan's `income.payDay` is 1 (so the day after salary is the 2nd, not the 5th) and `debt.endingSoon.monthsLeft` is 5, so the ₹8,200 is not freed until roughly February 2027. The date must be **derived from `payDay` and `endingSoon.monthsLeft` or omitted**. A wrong date is strictly worse than the vague label it replaces.
- **Cramer et al. (2008, N=60): explanation raises *acceptance* and leaves *trust* unmoved; a confidence rating moved neither.** *Changed:* no confidence score, certainty percentage or probability badge anywhere — on a verdict, a projection or an answer. The "Why?" link stays because it raises acceptance, not because it buys trust.
- **Karlan et al. (Management Science 2016): reminders naming both the goal and the money outperform; additional late reminders add nothing.** *Changed:* `Not now` writes `deferred` and the *next* action takes the card. A deferred action is never re-offered in the same session.
- **Personal-informatics rumination literature (Ubicomp 2021; CHI 2022, 123 apps): self-tracking tools induce anxious perseverative cognition.** *Changed:* no red hero variant anywhere. Priya's −₹3,90,632 net position keeps the green wave ground; severity is carried by words, a warn pill, and — the resolution below — the action card's own treatment.

### The refusal, and what a bank reviewer reads

- **ESMA35-43-3172 Annex V lists exactly one named poor practice under Matching: "Suitability policies and processes which permit exceptions or 'overrides' by sales staff ex-post, without adequate controls."** *Changed:* "the avatar cannot overrule the rules" is written into the repo as the elimination of a published poor practice, not as an engineering nicety. It belongs beside `packages/core/src/suitability.ts`'s header.
- **ESMA general guideline 1 ¶17 names four disclosures for automated advice; ¶18 explicitly endorses pop-ups, tooltips and FAQ as the delivery mechanism. EU AI Act Art. 50 requires disclosure "at the latest at the time of the first interaction."** *Changed:* one disclosure on first entry to Ask — and, after measurement (see §4.7), as a 40px bare row plus a sheet, not a 263px card that would push Uday's first sentence off screen.
- **CFPB Circular 2023-03: creditors selecting the closest generic reason are non-compliant where it does not reflect the actual reason; "there is no special exemption for artificial intelligence."** *Changed:* `Refused · BUNDLED_PROTECTION` becomes "Not suitable for you" with the rule id demoted to 10.5px mono at the row's right. The id survives — a reviewer reads a reason code as the regulated idiom — it just never leads.
- **ESMA ¶15: disclaimers limiting responsibility for the suitability assessment do not change what the service is.** *Changed:* no "this is not investment advice" boilerplate anywhere.
- **RBI Digital Lending Guidelines 2022: creditworthiness must be assessed "in an auditable way"; KFS in a standard format before contract.** *Changed:* Record is framed as "the auditable way, made queryable," and the action card borrows the KFS shape.

### IDBI GO Mobile+, from its own store assets and manual

- **Five bottom slots with a raised centre disc notched into a full-bleed green bar, identical on every screen and both platforms.** *Changed:* the tab bar's count, order and raised centre are untouched. Churning them would spend credibility for nothing.
- **The bank promoted Scan & Pay out of a depth-3 grid into the centre slot, and the slot's label is a verb phrase.** *Changed:* "Ask Uday" keeps the centre. **But** the first frame behind it must be unmistakably a face — the current `lucide Video` glyph reads closer to a viewfinder than a face does, and a thumb arriving at India's most-tapped position expects a QR scanner.
- **The shipped app prints a literal `undefined` inside a customer's postal address ("AKOLA NEAR PATI, undefined, MH, 444001"), ships four mutually inconsistent masking idioms, and prints a full unmasked 16-digit account number on its home screen.** *Changed:* one masking rule everywhere (`••••1234`, last four only, nothing where no masked value exists), and every value routes through a formatter with a defined empty case. This is the cheapest credibility available and it is what a fifteen-day code review greps for.
- **Their own store screenshots show the raised QR button covering a payee's name on Fund Transfer and a form field on Open FD.** *Changed:* every scroll region reserves bottom inset, and the instrument rail's content stays out of x 150–240 where the disc paints.
- **Section headers are legend chips with the section's own action as an orange outline caps pill on the same border line.** *Changed:* Record's `COPY`, and the general section-header construction.
- **Empty states name the payoff, not the absence ("It looks your favourite beneficiary list is empty." / "Add one to access them quickly!").** *Changed:* every empty state in this spec, most sharply Priya's Protection card, which today prints `₹0 / 0 dependents / indicative need ₹0`.

### Live data — the findings that killed proposed features

These came from running the API and measuring the DOM, and each one deleted or rewrote something:

- `roadmap.feasible` is initialised `true` and never recomputed when `alreadyPrerequisite` short-circuits. **Priya:** `feasible: true`, `shortfallMonthly: 0`, `completesOn: 2040-03-01` against a `targetDate` of `2029-09-01`. **Sunil:** `feasible: true`, `completesOn: 2027-12-01 ≤ targetDate 2028-09-01`, but his only buffer stage targets ₹1,84,146 against a goal of ₹3,68,292 — *exactly half*. → **The Plan hero must compare money AND dates, and must never print a rupee figure sourced from `shortfallMonthly` when it is 0.**
- `roadmap.currentStageIndex` is a hardcoded `0` (`roadmap.ts:495`); the API returns 0 for all three personas. → **"stage N of M" and the progress spine are computed browser-side from `asOf` vs `stage.completesOn`, or not shown.**
- `requiredMonthly` (real rate, 4.5%) and `band()` (nominal 10%, deflated) use different models. At 10%, `contribution + shortfallMonthly` = ₹26,555 reaches ₹1.33 crore, while `band()` needs ₹44,628 for the same ₹2.20 crore target. → **The Plan reconciliation figure is bisected over the same `band()` the projection card uses, and recomputed when the rate changes.**
- `AnswerSchema` (`domain.ts:619`) is `{text, evidence, resolved, matched}` — **no verdict field.** The primed climax pill routes through `backend.ask()`, so it returns a plain white bubble identical to the greeting, while the same refusal via the product `<select>` renders the badge, the rule and the alternative — and writes an advice record. → **The demo's climax path is fixed at the routing layer (§4.7); no layout change reaches it.**
- `'LIC savings plan'` is an alias of **`LIC_ENDOW_402`**, not `LIC_ULIP_401` (`seed-bundle.ts:227-240`). Hardcoding the ULIP id would make the text path disagree with the avatar's tool path in the same audit record. → **Product resolution mirrors `ProductShelfPort.resolve` against the `shelf` prop's `aliases`. No hardcoded fixture ids in the web layer, ever.**
- `Insight.suggests` is set on **all ten insight kinds**; `dailyplan.ts:241` already builds a complete Action with `id = ${insight.kind}:${insight.suggests}`. `grep -rn 'suggests' apps/web/src` returns **zero hits.** → **The biggest free win in the repo, and it is a lookup, not engine work** — with one word: `secondary: actions.slice(1, 4)` → `slice(1)`, because `decision.service.ts:132` searches only `[primary, ...secondary]` and a button on a sliced-off action 404s.
- `mutations.ts:27` is literally `export type DecisionKind = 'did_it' | 'declined'` while `DecisionKindSchema` has four and `registry.ts:155` asserts the route accepts all four. `Today.tsx:324` sends `'declined'` for "Not now." → **Two lines. A records-accuracy defect inside the artefact whose entire purpose is accuracy.**
- `decision.service.ts:53` writes an AdviceRecord only `if (product)`. Posted live: **Priya's and Sunil's primaries both return `"adviceRecord": null`** (`pay_down_card` and `talk_to_rm` name no product). → **The decision receipt needs a null branch, and it is not an edge case — it is two of three personas.**
- `quality.categorisedShare = 1` and `unexplainedShare = 0` for all three. → **"100% matched, 0% unexplained" reads to a sceptical reviewer as a generator grading itself.** Either the generator emits an unmatched tail or we say why it is 100%.
- `derive.ts:289` sets `stability: incomeVariation < 0.15 ? 'regular' : 'variable'` with no reference to `payDay`, and `derive.ts:285` computes `nextPayDay(asOf, payDayOfMonth ?? 1)` — **a null day silently becomes the 1st.** One +1m tap drops Sunil's variation 0.182 → 0.142, and `Today.tsx:143` and `query.ts:191` both branch on stability alone. **A shop owner is told "your salary lands on 2 November" — and on the live tier, Uday says it out loud.** → **Hard app-wide rule, §5.**
- `insights.ts:130` hardcodes "and there is no life cover in force" whenever gap > 0 and dependents > 0. **Sunil's `protection.lifeCoverInForce` is ₹2,00,000.** `roadmap.ts:308` does the same in stage 1's `why`. → **Two conditionals in the engine. A false claim about a customer's own policy on the landing screen is the worst thing a bank reviewer can find.**
- `insights.ts:106` computes `interest = debt.total × debt.highestRate / 100 / 12`. Priya carries a 34.8% card **and** a 16.5% Bajaj loan, so her headline "₹16,901 a month in interest alone" applies the card rate to the loan's principal. → **Engine fix, and Money must not print a computed interest figure until it lands.**

---

## 3. The Architecture

### The tab set — unchanged in count, order, labels and centre

`Today | Plan | Ask Uday | Money | Record`

Five is a hard ceiling from three independent authorities (Apple: "five or fewer" + "avoid overflow tabs"; Material 3: "three to five destinations"; NN/g: "more than 5 and you cannot keep an optimum touch-target size"). At 390px that is 78px per column; a sixth drops to 65px and truncates the 11px labels Apple explicitly asks you to keep. All eight GO Mobile+ store screenshots confirm the five-slot notched bar is the bank's most recognisable chrome.

**Correction to the record:** the centre disc is *already raised* — `TabBar.tsx:61` is `size-[60px] -translate-y-4 -mb-[22px] border-4 border-white bg-brand-deep shadow-lift ring-2 ring-accent`. The HIG defence is not "it is only tinted." It is that **Ask Uday is a labelled destination that sets tab state**, which is what satisfies Apple's "use a tab bar to support navigation, not to provide actions."

Three changes beneath the labels:

1. **A real active-tab indicator** — a 3px `--accent` bar flush to the top edge of the active column, plus the existing `font-bold`. Today `aria-current` is set correctly at `TabBar.tsx:56` and nothing visual follows it; at 390px you cannot tell which tab you are on.
2. **The centre disc carries `/uday.jpg`** (`object-cover object-[center_28%]`, the crop Ask already uses) inside the existing 60px disc, with `MessagesSquare` — never `Video` — as the image-error fallback. Plus a 12px `--tint-sage` presence dot with a 2.5px `--brand-deep` border when `tier === 'live'`, reusing the idiom already at `Ask.tsx:473`.
3. **Both segmented controls are deleted.** Money and Record become one scrolling column of collapsed sections each.

**"Record" keeps its name.** No Indian money app uses the word — the market idiom is History or Activity — and a customer in a three-minute session may never tap it. We take the compliance-legibility side of that trade because "record of advice" is the regulated phrase a bank tech team reads instantly, and we pay the customer cost with three deep links: the decision receipt after the first `Do it`, the verdict card's "Recorded · see the entry →" in Ask, and the 44×44 "Your data" chip in the head on every tab. **Reaching Record never depends on curiosity about the word.**

### The chrome, and the fold budget it guarantees

| Element | Height | Note |
|---|---|---|
| Compact head | **56px** | `{Screen} · {context}`, one 17px line + one 44×44 chip. Replaces the 89px `Head` |
| Scroll region | flex-1 | `padding: 0 16px 24px`; content width 358px |
| Instrument rail | **40px** | 8px separator + 32px band. Rendered only when `meta.simulatedClock` or `tier === 'offline'` |
| TabBar | **70px** / **104px** | `min-h-16` + `pb-[env(safe-area-inset-bottom)]`. 70 is a desktop emulator; **the target device is 104** |

**Chrome 166px (emulator) / 200px (device). Scroll viewport 678px / 644px.** Every budget in §4 is stated against **644px** — the device. Content-to-chrome moves from 2.17:1 (the ratio NN/g explicitly criticised) to 4.1:1.

The head keeps the screen name deliberately. Two proposals wanted the h1 deleted with a hard sequencing dependency on the tab indicator; carrying "Today · Rohan" on one 17px line removes the dependency entirely and still recovers 33px per tab. Ship the indicator anyway — it is right — but nothing now blocks on it.

### The reviewer apparatus

Everything a reviewer needs lives in exactly two places, and neither can out-shout the customer.

**One 32px rail at the bottom edge of every scrolling tab**, on `--tint-clay` with a hairline above — a ground that is deliberately neither of the bank's colours. It absorbs `Clock.tsx` (78px, currently the first coloured break on Today, landing *before* the green hero), `DataSourceRibbon.tsx` (26px), `TierBadge` and `OfflineBadge.tsx` (a 56px band currently pinned *above* the head on every screen). Net: **−90px from the top of Today's scroll region for +32px at the bottom**, and seven sub-44px controls leave the hard zone.

The framing is Stripe's: *"Simulations use test clocks to control time,"* and a test clock is only usable inside a sandbox — an environment you are in, not a widget on a page. That is also why the clock now exists on Plan, Money and Record, ending the oddity that only Today had a time machine while a clock advance re-cuts the roadmap Plan displays.

**Two states, not one.** `meta.simulatedClock` is hardcoded `true` in both adapters that actually run (`bank-data.memory.ts:180`, `bank-data.postgres.ts:734`), so a rail reading `SIMULATED` at rest would be a permanent "this is not real" caption on the customer's screen. Instead:

- **At rest:** `Seeded ledger · 1 Sep 2026 · Postgres · Text tier` — state, no verdict on its reality.
- **Off the session's anchor:** the ground warms and it reads `Simulated · +7 days · figures simulated`, the hero's date line takes a `Simulated · ` prefix, and any Record entry created under a moved clock carries a `Under a moved clock` pill.

That second state is COBS 4.6.6R(4)'s convention — label the simulated *figures*, not only the control — and it is the cheapest way to make a time machine read as an instrument to a bank judge. It requires the session's origin date, which is **not on the wire**: `ViewMeta` has no anchor and `SessionState.lastSeen` is the *previous* as-of. Persist `openedAsOf` alongside the session token in the storage `api/session.ts` already uses; a React ref resets on reload and the label would go silent while the figures stayed simulated, which is worse than no label. The correct long fix is `ViewMeta.asOfOrigin` — one server line from `session.service` `deps.anchor`.

**Move time** sits at the rail's right edge (x 262–374, clear of the disc at x 165–225) and **expands the rail upward into a 4-row panel** — +1 day / +1 week / +1 month / Reset as 56px full-width rows, with Reset separated by 16px from the three advances, plus the `ledgerHorizon` track showing how far the clock has travelled. The panel **stays open after a move and prints the diff receipt**: *"7 days on · 9 payments · safe to spend −₹2,140 · plan re-cut to version 2."* Today an advance recomputes everything (Sunil's pot ₹28,912 → ₹27,533, income ₹68,522 → ₹69,626, roadmap 1 → 2) and nothing anywhere says so. A no-op-looking advance is the exact moment a simulation reads as a broken gimmick.

**The rail is not rendered on Ask, and Ask has no Move time.** Ask is full-bleed and returns before the TabBar; a clock move mid-conversation invalidates the transcript. Ask carries a state-only 32px strip and nothing else.

**Everything else is in Record** — the rulebook as nine questions, the chain with `prevHash` rendered so the link is visible, the shelf gate, provenance, consent and erasure.

### First run

Pick, and nothing between it and Today. No form, no risk questionnaire, no KYC, no tour — NN/g found upfront tutorials skipped with no measurable task-performance gain, and one tap into a fully populated session is the strongest onboarding in the comparison set, where every Indian investing app gates all value behind minutes-to-days of KYC. Pick states that contrast in one line rather than hiding it.

**Pick must stop being a one-way door.** `App.tsx:57` renders Pick only when `useStoredSession()` is null, the session persists to `localStorage` under `dhan.session.v2`, and the only three `clearSession` call sites are unreachable from any normal screen. **The second judge to hold the phone lands inside the first judge's session on the first judge's persona and cannot reach Pick at all.** Three judges take three different routes; two of them currently get one persona. Fix: `App.tsx` renders Pick when a stored session exists **and** an explicit switch intent is present (`?pick=1`, or a "Switch customer" row at the foot of Record → Your data, marked as reviewer apparatus). This is a precondition for the demo, not a nicety.

### The journey a judge takes through the four claims

Unscripted, from any entry point, with every screen stating what it is in its first line.

| Claim | Where it proves itself | The moment |
|---|---|---|
| **1 — It reads the ledger and stays current** | Today's waterfall, adjacent to the hero, never behind a tap; the rail's `Move time` → the diff receipt | Four dotted-leader rows in the customer's own vocabulary, then a clock advance that visibly changes the number |
| **2 — One action at a time** | Today's card, both buttons at scroll-offset 529–585 in a 644px region, on all three personas, by construction | The judge's thumb is already on `Do it` without scrolling |
| **3 — The gate refuses products the bank sells** | Ask's lead pill (one tap from rest, on every persona); Record → The shelf, "Run it through the gate" on any of 15 products | Uday declines a product IDBI sells, names the rule, and offers the cheaper alternative — then the alternative passes |
| **4 — Every recommendation is chained and verifiable** | The decision receipt after the first `Do it` carries the judge into Record; `Verify the chain` re-derives it in front of them; `prev ← record` drawn as a chain | The judge presses a button and the panel's footer timestamp changes |

The receipt is the hinge. It means the audit trail comes to the judge rather than waiting for them to tap a tab named "Record."

---

## 4. The Screens

Notation: `offset` = scroll-offset inside `.scroll`; `device y` = offset + 56 (the head). Fold = offset 644 unless stated.

---

### 4.1 Pick — the way in

**Job.** Get a stranger, in one tap and with no explanation, into a session with a customer whose money will make the argument for the product — while establishing in five seconds that this is a bank's product, that nobody here is real, and that a session with its own ledger, clock and record is about to be created.

**The one thing.** Three people. `DIRECTION.md`'s per-screen table says so and it is binding: *"Pick | Three people | Everything else is a footnote."* No hero panel — the green wave is spent on the day's one number on Today.

**Blocks.**

| # | Block | Role | Height | Content |
|---|---|---|---|---|
| 1 | Mint slab | chrome | 114px | `Wave tone="light"`, white→`--header-mint`. Eyebrow **`Dhan Sarthi`**; h1 **"A private banker for every IDBI account"** (21px/700, two lines). Nothing else |
| 2 | Instruction | reference | 40px | *"Pick someone to advise. A tap opens their session — their ledger, their clock, their record."* |
| 3 | Offline notice | apparatus | 46px | Only when `listed.offline`. One line: *"Advisor service unreachable — simulating in this browser, nothing recorded."* |
| 4 | Failure block | apparatus | 184px | Only on error. See edge states |
| 5–7 | Three customer cards | **action** | **151px each** | Whole card is the button |
| 8 | Footnote | reference | 58px | *"Nothing here is a real customer. A real session starts after MPIN; this one starts now."* |

**Card anatomy.** 52px initials disc (decorative, `aria-hidden`) · name 18px/600 · `CustomerSummary.pitch` verbatim at 12.5px, `line-clamp-2` · hairline · **one plain-English promise line** at 12px `--ink-mid` · the rule id(s) at 10px mono `--ink-soft`.

The promise line comes from a presentation-layer map keyed on the first id parsed from `demonstrates`, **written so it does not repeat what `pitch` already says**:

| Persona | `pitch` (verbatim, `personas.ts`) | Promise line |
|---|---|---|
| Rohan | *"29, Indore. ₹85,000 a month, two dependents, no life cover."* | "No cover, and a ULIP waiting to be sold to him." |
| Priya | *"34, Kochi. ₹1.4 lakh a month — and a credit card at 34.8%."* | "Everything is blocked until it clears." |
| Sunil | *"47, Nagpur. Shop owner, income different every month, four dependents."* | "A missed instalment, and equity he cannot hold." |

Priya's does **not** say "a card at 34.8%" — her own pitch already does, twenty pixels above. Sunil's shows **both** ids (`MISSED_REPAYMENT · RISK_CEILING`), because the second half is what makes him structurally interesting. Where `demonstrates` is empty (`bank-data.postgres.ts:648` returns `?? ''`), **suppress the hairline and both lines** and render the card as identity-only at ~91px. Never a hairline separating two empty rows.

The rule id uses `--ink-soft` (#6b6f6f, 5.08:1), **never `--ink-faint`** — `tokens.css:27` documents it as failing AA and it is 3.11:1 on white.

**Wireframe.**

```
┌──────────────────────────────────────┐  0
│ Dhan Sarthi                          │
│ A private banker for every           │  mint slab + wave, 114
│ IDBI account                         │
├──────────────────────────────────────┤  114
│ Pick someone to advise. A tap opens  │  40
│ their session — ledger, clock, record│
│                                      │
│ ┌──────────────────────────────────┐ │  186
│ │ (RM)  Rohan Mehta                │ │
│ │       29, Indore. ₹85,000 a      │ │  151  ← whole card is the button
│ │       month, two dependents…     │ │
│ │  ────────────────────────────    │ │
│ │  No cover, and a ULIP waiting    │ │
│ │  BUNDLED_PROTECTION              │ │
│ └──────────────────────────────────┘ │  337
│ ┌──────────────────────────────────┐ │  349
│ │ (PN)  Priya Nair          …      │ │  151
│ └──────────────────────────────────┘ │  500
│ ┌──────────────────────────────────┐ │  512
│ │ (SK)  Sunil Kumar         …      │ │  151
│ └──────────────────────────────────┘ │  663
│                                      │
│ Nothing here is a real customer. A   │  58
│ real session starts after MPIN…      │
└──────────────────────────────────────┘  731
        ────── fold at 730 (no tab bar) ──────
```

Pick renders no TabBar (`App.tsx:57-63` returns `<Pick />` alone), so its scroll region is the full 844 − 114 = **730px**. All three people and the footnote finish at 731 — Sunil, currently clipped mid-sentence at 631 against a 611px fold, is whole.

**Controls.**

| Control | Position | Min target | Why |
|---|---|---|---|
| Customer card ×3 | inline, 358×151, device y 186/349/512 | **151px** | Card 1 is in the stretch band; acceptable on a one-time chooser (Hoober: 51% of touches have a second hand or finger available). The decorative `›` at x≈353 is **deleted** — a false second target beside a whole-card button |
| Try again | failure block, left, stacked | **56px** | It sits in the hard zone (y < 220) and that is deliberate: a failure is read before it is acted on. It gets the plateau height to compensate |
| Look around as a simulation | below Try again, 12px gap, quiet | 44px | Stacked, never side by side — available width inside the block is 330px, below any threshold at which they fit on one row |

**Empty and edge states.**

- **Loading, up to ~12.25s** (`client.ts` `TIMEOUT_MS = 6_000` plus one documented GET retry at 250ms). Slab and instruction render immediately; three **full-skeleton** 151px placeholders (disc, two name/pitch rules, hairline, one promise rule) with **no shimmer** — a static placeholder is not motion. `rise` is suppressed when cards replace placeholders: they are resolving, not arriving.
- **503 on `listCustomers`.** `ApiError.unreachable` returns true for every status ≥ 500, so today a deliberate refusal silently renders three synthetic customers on the one build whose premise is that the host app supplies identity. Special-case `status === 503 && route === 'listCustomers'` **before** the unreachable check. Copy states the observable fact and hedges the cause: *"This service is not listing any customers. That is expected under a host-identity adapter, where the host app names the customer."* No retry, no simulation offer, no cards. This branch also absorbs the empty-list case — the route converts `[]` to 503 before it leaves the API, so a 200 with `[]` cannot arrive.
- **429 on `createSession`.** Rate-limited to 20/hour/IP; a venue behind one NAT with a queue of judges will exhaust it, and 429 is not `unreachable`, so today it is a dead retry loop. Distinct copy, `Try again` retained, plus "Look around as a simulation" calling `loadOffline()` + `setSession({ token: null, cif })`, which needs no server session. No countdown — the reset window is not on the wire and a fake one is false urgency.
- **Error after a successful list.** The failure block renders **above** the cards and the instruction line and the footnote are both suppressed. Never between the cards.
- **Picking.** The pressed card stays **enabled** with `aria-busy="true"` and swaps `pitch` for "Opening your session…"; only its two siblings are disabled. The offline path returns before `setPicking` and needs no busy state.

**What we deliberately do not show.**

- **The hackathon.** No event name, no team name, no date. It is 233px — 27.6% of the entry viewport — of "IDBI INNOVATE 2026 · TEAM ATOMIC" before a word about the customers, and a bank assessing this as a GO Mobile+ module reads a submission differently from a product. Attribution belongs in the README and the deck.
- **The three-clause pitch sentence.** The best sentence in the app, and it is cut from this screen: at 15px over three lines it is 66px of argument sitting above the people it is arguing about. Its three claims are each carried by one persona's promise line, so the pitch is demonstrated three times rather than asserted once.
- **Any engine-computed figure.** Pick holds no snapshot; previewing one costs three round trips before the first tap and spends the count-up that makes Today's number read as derived.
- **`age` and `city` as separate fields.** Both are on `CustomerSummary` and unrendered anywhere. `pitch` already opens "29, Indore." — printing them again is the same fact twice on a 151px card. Named here so an audit of unused fields reads it as restraint.
- **Language.** `Snapshot.customer.language` is `hi-IN` for Sunil and the app is English-only. Deliberately absent here because no session exists yet, so no preference has been read. See Open Question 4.

---

### 4.2 Today — the thesis

**Job.** Tell someone returning on an ordinary weekday — one hand, thirty seconds, possibly on a bus — how much they can spend today, show the arithmetic in their own vocabulary, and give them the single most valuable thing to do about it with **both the accept and the decline reachable by thumb without a scroll**.

**The one thing.** `Safe to spend` — the figure on the deep-green wave panel at 34px, counting up because it is being derived in front of you. The only surface on this screen shaped like that, and the only figure above 22px.

**Blocks.**

| # | Block | Role | Height | Notes |
|---|---|---|---|---|
| 0 | Compact head | chrome | 56px fixed | `Today · {first name} · {weekday}, {dayMonth(asOf)}`; one 44×44 `ShieldCheck` chip → Record → Your data |
| 1 | Top gap | — | 12px | `mt-3` |
| 2 | **Attention row** | hero | 44 + 8px | **Conditional, and it will not fire for any of the three personas today** — see below |
| 3 | **HERO — Safe to spend** | hero | 168px + 12 | `HeroPanel`, the one wave surface |
| 4 | **The working — waterfall** | evidence | 148px + 12 | **Four** `Leader` rows at `py-[7px]` (34.6px each) |
| 5 | **TODAY'S ONE THING** | **action** | **233px to the button row's bottom** | KFS shape |
| 6 | What changed | evidence | ~76 + 12 | Conditional |
| 7 | Since you were away | ledger | ~270px | Always renders |
| 8 | What I noticed — **three** rows | evidence | ~450px | Each with a real 44px outline button |
| 9 | Data-quality footnote | reference | ~44px | |
| 10 | Instrument rail | apparatus | 40px fixed | |
| 11 | TabBar | chrome | 70/104px | |

**Severity: how it actually reaches the surface.** Two research findings genuinely conflict — the audit says severity never reaches the panel; the rumination literature says do not make the headline what is wrong. The proposed 44px amber attention row resolves it in principle and **fails in practice**: `severity: 'urgent'` exists on exactly two insight kinds (`insights.ts:92` `missed_repayment`, `:109` `expensive_debt`), and for both Priya and Sunil that urgent insight **is the one that produced the primary action**. Rendering it above the hero would print Priya's debt fact three times in the first 500px, which is the repeated-figure fault `DIRECTION.md` was written to remove.

**The rule, applied everywhere:**

- If an urgent insight exists **and did not produce the primary action** → the 44px attention row renders above the hero, with a chevron to the row it belongs to. (Reachable when the primary has been decided and a secondary takes the card.)
- If the urgent insight **is** the primary's source → **no row.** Instead the action card's legend chip reads `TODAY'S ONE THING · URGENT` and the card takes a 3px `--danger` left rule.

Severity reaches the surface at full weight, above the fold, once. Zero duplication, zero extra pixels, no red hero.

**The hero.** Figure via `useCountUp` + `Amount size="xl"`. Meta line: `{daysToSalary} days` + the **guarded** branch (§5). Sub-line `Left of {inr(envelope)} · about {inr(perDay)} a day`. `Bar` renders `used` = spent share and `pending` = elapsed-day share, both existing props; at the anchor date both are near zero and the bar reads as *the month has not started*, which is true. **The proposed day-of-period marker is dropped** — at `asOf 2026-09-01` with `daysToSalary = 30` it lands at 0% for all three personas and is invisible on the only date every judge sees.

**The waterfall.** Four rows, directly under the hero, never behind a tap. This app **derives** safe-to-spend rather than moving money into Pots the way Monzo and Starling do, so it owes the arithmetic, adjacent, in the customer's vocabulary — that is the price of admission for the derived-number approach.

- Row 1 `Comes in` — `snapshot.income.monthly`. For `income.stability === 'variable'`: **`Comes in, typically`**, and the hero's meta line gains ` · income swings ±{round(variation*100)}%`. `income.variation` (0.182 for Sunil) is on the wire and rendered nowhere.
- Rows 2–4 from `plan.safeToSpend.reserved`.
- **Priya's fourth row is rendered explicitly.** `dailyplan.ts:143-147` filters `reserved` to `amount > 0` and her `roadmap.monthlyCommitment` is 0, so "Your plan this month" silently vanishes and her ledger has three rows where Rohan's has four. Render `Your plan this month · nothing yet` with the reason **taken from the roadmap, not invented**: her stages are `[{index 1, monthly 0}, {index 2, monthly 6255, startsOn 2026-10-01}, ...]`, so money *is* committed — just not this month. Gate on `commitment === 0` and word it *"nothing yet — stage 2 starts in October."* The suitability narrative ("nothing is invested while a 34.8% balance stands") is the **roadmap's ordering rule** and belongs on Plan, where the ordering is visible.
- **The fifth row is deleted.** `Still yours ₹20,943` restated the hero's figure at `Leader` weight, 179px below where the hero printed it at 34px. No closing line replaces it — a 13px restatement is the same fault, smaller.

**The action card, in the KFS shape.** Four slots, every time:

1. **What to do** — `action.label` as an implementation intention, 18px/600, ≤2 lines. Derived, never fabricated: build it in `packages/core` from `income.payDay` and `debt.endingSoon.monthsLeft` — *"From February, move the ₹8,200 to your SIP on the 2nd — the day after your salary."* Where `payDay` is null, **omit the day clause entirely**.
2. **Why it is this** — `action.detail`, 14.5px, `line-clamp-2`, with core's strings shortened to ≤90 chars so nothing is actually clipped.
3. **What happens if you don't** — one sentence, ≤2 lines. FG22/5 ¶8.45 lists this **first** and every card in the app currently fails it. `ActionSchema` (`domain.ts:539`) has no `consequence` field; until it does, the web layer composes it per `ActionKind` **with no hardcoded rupee figures** — interpolate from the live insight (`insights.find(i => i.kind === 'expensive_debt')?.monthlyValue`) or ship no figure. The repo's one hard constraint is that every figure comes from the API.
4. **Do it / Not now**, then one quiet link.

**The projection paragraph leaves the card face** and moves into `Why?`. It is 72px for Rohan over three lines, it is duplicated on Plan, and it is what the consequence line costs. (The proposed "suppress the projection when the attention row renders" rule is deleted: neither `pay_down_card` nor `talk_to_rm` carries `projected`, so it saves nothing on the only two personas that could trigger it.)

`Why?` reveals: `action.evidence[]`, the projection line, and the full untruncated `detail`. **One level only.**

**Wireframe (Rohan, at rest, device fold 644).**

```
╔══════════════════════════════════════╗  head, fixed        device y 0
║ Today · Rohan · Monday 1 September ⛨ ║                              56
╠══════════════════════════════════════╣  offset 0
║                                      ║  12
║ ┌──────────────────────────────────┐ ║  12
║ │ ~~~ SAFE TO SPEND            ~~~ │ ║
║ │        ₹20,943                   │ ║  green wave hero, 168
║ │ 30 days until your salary, 1 Oct │ ║
║ │ Left of ₹22,070 · ~₹698 a day    │ ║
║ │ ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ ║
║ └──────────────────────────────────┘ ║  180
║ Comes in ................ ₹85,000    ║
║ Bills and commitments ... −₹51,997    ║  waterfall, 148
║ Your plan this month .... −₹10,933    ║
║ Already spent ........... −₹1,127     ║
║                                      ║  340
║ ┌─ TODAY'S ONE THING ──────────────┐ ║  352
║ │ From February, move the ₹8,200   │ ║
║ │ to your SIP on the 2nd — the day │ ║
║ │ after your salary.               │ ║
║ │ Your education loan ends in five │ ║  233 to the button row's bottom
║ │ months; that ₹8,200 is freed up. │ ║
║ │ If you don't: it goes into every-│ ║
║ │ day spending, as it did last time│ ║
║ │ ┌──────────┐  ┌───────────────┐  │ ║  offset 529
║ │ │  Do it   │  │   Not now     │  │ ║  56px each
║ │ └──────────┘  └───────────────┘  │ ║  offset 585  ← 59px clear
║ │ Why?                             │ ║
║ └──────────────────────────────────┘ ║
║ ─────────────── fold at 644 ──────── ║
║ WHAT CHANGED (conditional)           ║
║ SINCE 26 AUGUST · ₹1,984 · 4 rows    ║
║ WHAT I NOTICED · 3 rows, each with   ║
║   a 44px outline button              ║
║   Everything I noticed (4 more) →    ║
║ 713 lines across 11 months…          ║
╠══════════════════════════════════════╣
║ Seeded ledger · 1 Sep · Text  [Move] ║  rail 32 (+8 gap)   y 772
╠══════════════════════════════════════╣
║ Today  Plan  (Uday)  Money  Record   ║  TabBar 70/104
╚══════════════════════════════════════╝  844
```

**The fold arithmetic, stated so it can be tested.** 12 + 168 + 12 + 148 + 12 + 233 = **585**, against 644 (device) and 678 (emulator). Clearance **59px / 93px**, identical on all three personas because the block set is now identical: four ledger rows each, no attention row, no projection on the card face.

**This is asserted from measured component heights, not from a browser.** It must be converted into a test before it is trusted: `apps/web/e2e/fold.spec.ts` — at exactly 390×844, `scrollTop === 0`, for each of the three personas, assert `doIt.getBoundingClientRect().bottom <= scrollRegion.getBoundingClientRect().bottom`, with a second case injecting a 34px `env(safe-area-inset-bottom)`. There is no `e2e` directory in `apps/web` today, so budget the Playwright setup. **The guarantee is the test, not the paragraph.**

**Insight rows.** Exactly `plan.insights.slice(0, 3)`, severity-ordered (the engine already sorts urgent → important → opportunity then by `monthlyValue`, `insights.ts:293`), **with the insight that produced the action card filtered out** — "Add ₹8,200 a month to your SIP" currently appears twice, 653px apart.

Each row gains a **44px outline** button (never filled — there is exactly one solid orange pill per screen, and it is `Do it`), labelled from `Insight.suggests`, resolving to the live Action by `${insight.kind}:${insight.suggests}` in `[plan.primary, ...plan.secondary]`.

**The no-action branch is not an edge case.** Measured live: Priya's three visible rows include `buffer_thin`, whose `open_sweep_in` is gate-BLOCKED by `HIGH_INTEREST_DEBT`; Sunil has **two** blocked `open_sweep_in` actions, leaving 1 of 3 rows with a button. Widening `slice(1,4)` does not help — those actions were never created. Where no action resolves, the row renders `Show me the numbers` alone plus one line naming why: *"A deposit would help here, but not while the 34.8% balance stands."* That turns the weakest case into the product's best argument.

Key rows on `${i.kind}:${index}` — `insights.ts:210` can push several `price_increase` insights and `Today.tsx:240` keys on `i.kind` alone.

**The refusal line is cut from Today for the first build.** It was specified as *"I checked N things I could have suggested; N did not survive the rules"* with a web-layer fallback deriving the refused set from insights absent from `[primary, ...secondary]`. That fallback **fabricates a compliance claim**: `toAction()` returns null for at least four non-gate reasons, and measured live, **all seven of Rohan's insights produce passing actions** — so the fallback would say "3 did not survive the rules" about array slicing, and would vanish entirely once `slice(1,4)` is widened. Worse, `buy_term_cover` filters `!p.bundlesProtectionAndInvestment` *before* the gate, so even the correct implementation cannot surface the ULIP refusal from Today. **Claim 3 lives on Ask and Record.** `DailyPlan.refused` stays a build-order item (§7, not-safe-before-demo).

**Edge states.**

- **No action left** — a sage card naming the payoff: *"Nothing needs you today."* + `plan.routeNote` (`dailyplan.ts:168` already writes the empathetic branch) + one row `See where this is going →`.
- **`s.pot <= 0`** — still "Safe to spend", still ₹0, **not red, not a debt hero**. `plan.routeNote`'s tight branch renders as the panel footer.
- **Nothing since last seen** — the block still renders, as one line: *"Nothing has moved since 26 August."* An intermittent block is one whose absence reads as a bug.
- **Since-you-were-away count** — `since.transactions` is capped at 12 on the wire (`dailyplan.ts:190`) and Priya's is exactly 12, so the row reads **"See recent payments →"**, never a count.
- **Loading / error** — the existing `Gate` (`App.tsx:169`), kept, with two fixes: `Try again` 44 → 48px, and its copy reads `quality.monthsOfHistory` instead of the hardcoded "twenty-four months" (measured: 11).
- **Offline** — carried by the rail (`OFFLINE · simulated in this browser · nothing recorded` + `Try again`). `OfflineBadge.tsx` is deleted as a 56px band above the head — it would push the action card straight back under the fold — but **Ask and the Gate keep an offline treatment** (§4.7 and the Gate's rail variant), because "nothing you do here is recorded" is compliance-relevant.
- **Decision failed** — server sentence under `role="alert"` inside the card, buttons re-enabled, nothing optimistically marked. The existing `Idempotency-Key` means a retried slow tap records one decision.

**What we deliberately do not show.** A financial health score, ever — Jupiter, Fi and CRED all ship one, it is precisely what this product beats, and it is the most likely thing to get added. A red hero variant. Net worth (one tap away on Money, in the same green shape so the eye recognises what it was hunting). Seven insights — Snoop is the control group: same data, opposite editorial decision, and it needs a per-alert mute panel to survive itself. A confidence percentage. The nine rules. Any promotional banner or carousel (the absence is proved on Record, never argued here). A third pill. A sticky CTA. Any raw enum id. A spinner.

**A stated departure from DIRECTION.md.** DIRECTION specifies the decision moment as *"the card settles and the record chip ticks up."* We replace it with a pushed receipt (§4.3) and delete the chip that would tick — because the chip was a dead control and because the receipt is the only thing in the app that carries a judge into the chain. Recorded as a departure rather than papered over.

---

### 4.3 The decision receipt — a pushed surface inside the Today tab

Not a modal. **This app has no modal layer** (see §5) — the receipt replaces the Today scroll region and returns to it, so there is no focus trap, no scroll lock and no Android back hazard days from a demo.

**The one thing.** The human outcome, in the largest type on the page.

```
        ┌────────┐
        │   ✓    │   teal outlined check
        └────────┘
   Your SIP goes up ₹8,200 a
   month from 5 October.          ← 22px/700, the largest line
   ─────────────────────────────
   What          Increase your SIP
   How much      ₹8,200 a month
   From when     5 October 2026
   What it costs Nothing extra — the
                 EMI stops first
   ─────────────────────────────
   Record 1 · passed 9 rules ·      ← 12px mono, --ink-soft
   snapshot 67f032b3 · genesis
   ┌───────────────────────────┐
   │     See the record        │  outline, 56px
   └───────────────────────────┘
   ┌───────────────────────────┐
   │     Back to Today         │  solid, 56px, names its destination
   └───────────────────────────┘
```

This is IDBI's own success formula — check, reference, label/value ledger, share affordance, a primary that names where it returns — **with the bank's worst fault inverted**: on their real receipt the largest line on the page is `Reference ID : 14101358286604`. Here the outcome leads and the reference is a mono footnote.

**The null branch is mandatory, not defensive.** `decision.service.ts:53` writes an AdviceRecord only `if (product)`. Posted live against the running API: Rohan's `emi_ending:increase_sip` (productId `MF_INDEX_103`) returns seq 1, `prevHash` all-zeros, `rulesPassed` of 9. **Priya's `pay_down_card` and Sunil's `talk_to_rm` both return `"adviceRecord": null`.** When null, the footnote reads from the `DecisionRecord` instead:

> *Decision 1 · recorded 1 September · no product recommended, so no suitability verdict ran.*

That is a defensible sentence a compliance reviewer accepts. A missing line is not.

Also: **suppress the "How much" row when `amount` is 0** — Priya's `surplus.deployable` is 0 and the receipt would otherwise read ₹0 under "Put everything spare against the 34.8% balance."

Source the whole receipt from the `decideAction` **response**, which `mutations.ts:119` already awaits and discards (`{adviceRecord, decision, roadmapVersion}`) — not from the fire-and-forget `record.refresh()` at line 128, which races.

When the clock is off its anchor, the footnote gains `· recorded on simulated 8 September` from `DecisionRecord.atSim`.

---

### 4.4 Plan — the route, and the only place the plan can be changed

**Job.** Answer three questions in one screenful: where am I going, does this actually get me there, and what is the first thing on the way. Then let the person change the plan — today Plan has three interactive elements across 1570px and **not one of them touches the roadmap**.

**The one thing.** The destination figure on the green panel, with one status pill directly beneath it. Target and verdict are one fact, not two.

**Blocks.**

| # | Block | Role | Height |
|---|---|---|---|
| 0 | Compact head | chrome | 56px — `Plan · {roadmap.goal.purpose}`, truncating |
| 1 | **Destination panel** | hero | **190px** + 12 |
| 2 | **Route strip** | evidence | 72px + 12 |
| 3 | **Reconciliation strip** | evidence | **100px** + 12 — unconditional, never behind a disclosure |
| 4 | Eyebrow `The route · N stages` | chrome | 37px (`mt-3 mb-2`, from 51px) |
| 5 | **The actionable stage** | **action** | ~177px |
| 6 | Other stages, all collapsed | ledger | **128px each** |
| 7 | Stage expansion | reference | one level only |
| 8 | Projection band, collapsed | evidence | 56px |
| 9 | Why this version | reference | ~120px |

**The destination panel.** The 94px adviser essay (`Plan.tsx:103-109`) is **evicted** into stage 1's expansion — it inflated the hero to 314px, 45.8% of the viewport, pushing the customer's actual goal off screen.

Footer = one status pill + one clause. **`roadmap.feasible` cannot be trusted and neither can `shortfallMonthly`:**

```
reaches = completesOn <= goal.targetDate
       && reachedAmount >= goal.targetAmount
```

where `reachedAmount` is the last `isGoal` stage's `targetAmount` (or `mid.realCorpus` for a growth goal). Measured: Priya is `feasible: true`, `shortfallMonthly: 0`, `completesOn 2040-03-01` vs `targetDate 2029-09-01`; Sunil is `feasible: true`, `completesOn 2027-12-01 ≤ 2028-09-01`, but his route reaches ₹1,84,146 against a ₹3,68,292 goal. **A date-only test would print "On track · Reaches it 9 months early" over a plan that reaches half his goal** — a misleading financial promotion on the surface DIRECTION reserves for the destination.

**Never print a rupee figure sourced from `shortfallMonthly` when it is 0.** Behind + shortfall 0 → derive the clause from the goal kind: debt → `{inr(paymentToClear(principal, rate, 36) − debtStage.monthly)} a month more than the plan puts in` (₹20,042 for Priya); buffer → the amount gap (*"this route reaches ₹1,84,146 of ₹3,68,292"*). Add a unit test asserting no persona's hero footer contains `₹0`.

**The route strip.** Line 1: `finishes {monthYear(roadmap.completesOn)}`. **Print one duration, not two** — `totalMonths` (9) and `completesOn` (December 2027, i.e. 15 months) measure different journeys for Sunil, and putting them on one line contradicts itself by six months. Format past ~24 months in years, never "372 months."

Line 2, the **guarded** cost — never `inr(roadmap.monthlyCommitment)` unguarded. `roadmap.ts:512` sums only currently-running stages, which is why Priya's ₹5.83 lakh debt plan prints **"₹0 a month, starting now."** and is contradicted 496px later, and Sunil's prints ₹985 against a ₹5,162 route:

```
peak = Σ(ongoing stages).monthly + max(0, …sequential stages.monthly)
commitment > 0 && peak === commitment  → "₹10,933 a month"
commitment > 0 && peak >  commitment   → "₹985 a month now, rising to ₹5,162 when the buffer starts"
commitment === 0                       → "Nothing this month. ₹6,255 a month once stage 2 starts"
```

**Interpolate `STAGE_LABEL[stage.kind]`, never `stage.label`.** Four of the six live stage labels are full sentences; `stage.label` in that template yields *"…once ₹5,82,776 at 34.8% will not clear at ₹6,255 a month starts"*, printing ₹6,255 three times.

`currentStageIndex` is a hardcoded `0` for all three personas. Compute it browser-side: `stages.findIndex(s => asOf < s.completesOn)`. If that is out of scope, **delete "stage N of M" and the spine fill** — do not ship a progress indicator that cannot progress.

**The reconciliation strip** — unconditional, two lines, ~100px. This is the number the app computes twice and draws nowhere: today the hero target, the projection outcome (offset 875) and "Your target" inside the band (offset ~1180) sit 900px apart and are never reconciled.

> *At this pace you reach ₹53.1 lakh of ₹2.20 crore.* ▓▓▓░░░░░░░░
> *Closing it needs about ₹44,628 a month — illustration, not a promise.*

**That figure is bisected over the same `band()` the projection card uses**, not `contribution + shortfallMonthly`. The identity `9,948 + 16,607 = 26,555` is exact and *wrong for this purpose*: `requiredMonthly` runs at a 4.5% real rate assuming an inflation-indexed contribution, while `band()` compounds a flat nominal contribution at 10% and deflates the corpus by 5.5%. ₹26,555 reaches ₹1.33 crore in the band 400px below — **the strip built to fix a contradiction would print one.** Bisect on `m` such that `band(m, years, existing, [{ratePct: rate}], inflationPct).scenarios[0].realCorpus >= target` (~40 iterations, browser-side, no new mirror), and recompute when the rate changes.

Debt variant (Priya): danger left-rule, **no bar** — a bar implies progress there is none. Buffer variant (Sunil): `Snapshot.buffer.monthsCovered / targetMonths / shortfall`, which has zero references anywhere in `apps/web`.

`monthlyInterest`, `paymentToClear` and `monthsToClear` are in `packages/core/src/projection.ts` with zero hits in `packages/contracts`, and ADR-0001 + `apps/web/scripts/check-bundle.mjs` fail the build on a `@dhan/core` marker in the entry chunk. **Mirror them into `apps/web/src/lib/projection.ts`**, exactly as that file already mirrors `futureValue`/`band`, with the same parity header and a test asserting core/web agreement.

**Stages.** `useState(stage.index === 1)` at `Plan.tsx:233` → `useState(false)`. Measured: stage 1 is 324.8px expanded against 149.1px collapsed — 176px recovered, which is what buys stage 2 its place on the first screenful.

**Exactly one stage carries a button.** Resolution: **prefer the stage that resolves to `plan.primary`**; fall back to route order only when none does. Without that preference Priya's single control lands on stage 1 (`free_up` → `cancel_subscription`, ₹0) while her primary is `pay_down_card` — the ₹5.83 lakh that defines her — and Plan and Today would disagree about today's one thing.

Verdict is a **mark, not a pill**. `Plan.tsx:271` renders `<Pill tone="ok">Suitability passed</Pill>` = `bg-brand text-on-dark`, verifiably the darkest, most button-like element on the row and not interactive. It becomes a 16px check plus `Cleared all {verdict.passed.length} checks` — putting `Verdict.passed` on a screen for the first time.

**Three verdict states, not two.** `roadmap.ts:193` runs `evaluate()` only when a stage has a product *and* starts today, so **all three of Priya's stages carry `verdict: null`**. Render that explicitly — *"No product to check yet"* — so silence is never read as a pass or a refusal.

**Delete the claim that "the button's absence is the gate."** Priya has no grow stage (her stages are `free_up`, `clear_debt`, `build_buffer`) and the absence of a button on stage 2 means "no productId," not "refused." The gate demonstration lives on Record's shelf.

Goal treatment moves from every `stage.isGoal` to `stages.map(s => s.isGoal).lastIndexOf(true)` — `roadmap.ts:265` sets `isGoal` on Priya's `free_up` stage as well, so two of her three stages currently claim to be the destination.

**Wireframe (Rohan, at rest).**

```
╔══════════════════════════════════════╗
║ Plan · Enough to stop working at 60 ⛨║  56
╠══════════════════════════════════════╣  offset 0
║ ┌──────────────────────────────────┐ ║  12
║ │ ~~~ WHERE YOU ARE GOING      ~~~ │ ║
║ │      ₹2.20 crore                 │ ║  190
║ │ in today's money · by Sept 2057  │ ║
║ │ [Behind]  ₹16,607 a month short  │ ║
║ └──────────────────────────────────┘ ║  202
║ finishes September 2057              ║  route strip, 72
║ ₹10,933 a month                      ║
║ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░            ║  286
║ At this pace you reach ₹53.1 lakh    ║  reconciliation, 100
║ of ₹2.20 crore. ▓▓▓░░░░░░░░          ║
║ Closing it needs ~₹44,628 a month.   ║
║ Change the target →                  ║  398
║ THE ROUTE · 2 STAGES                 ║  37          435
║ ① Put life cover in force  ₹985/mo   ║
║   LIC Term · Moderate · Sep 26→ongoing║ actionable stage, 177
║   You have two dependents and no…    ║
║   ┌────────────────────────────────┐ ║  offset 547
║   │        Start this              │ ║  56px
║   └────────────────────────────────┘ ║  offset 603 ← 41px clear
║   ✓ Cleared all 9 checks   Why first?║
║ ────────────── fold at 644 ───────── ║
║ ② Enough to stop working at 60       ║  128, collapsed
║ ┌ IF YOU KEEP IT UP ───────────────┐ ║  56, collapsed
║ WHY THIS VERSION · v1 · 1 September  ║
╚══════════════════════════════════════╝
```

**Controls.**

| Control | Position | Target | Why |
|---|---|---|---|
| **Start this** | actionable stage, 316px wide, inline, device y ~603–659 | **56px** | Expands the stage into the shared `ActionBlock` (§5) in place — same four KFS slots, same `Do it / Not now`, one rendering |
| **Change the target** | last line of the reconciliation strip, quiet link, device y ~385–429 | 44px | `setGoal` (PATCH `/api/v1/session/goal`) is registered, typed, server-implemented, integration-tested — and has **zero callers in `apps/web`**. Its own summary: *"The next /view cuts a new roadmap version with reason 'Target changed by the customer'."* This is the honest answer to "Plan is a read-only document," and the algorithm-aversion literature's one well-evidenced mitigation is giving the user something to move. Stretch zone deliberately: lowering a retirement target should cost a reach |
| Target presets | expand **in place** below the link: three computed rows + a ±₹5 lakh stepper + `Change it` / `Cancel` | 56px | Never a free-text field. Presets are computed from the mirrored bisection at the contribution actually available — *"What ₹9,948 a month reaches: ₹1.02 crore"* — so the customer chooses between outcomes, not types a wish |
| Why this first? | last row of every stage | 44px | From `h-9` (36px, `Plan.tsx:282`). Quiet link, never a third pill |
| Assumed return 8/10/12% | inside the expanded band | **48px** | Replaces `Plan.tsx:171-182` — a 324×16px `<input type=range>` with no `aria-label` inside a `<label>` whose text is not associated, and the only control on the screen that changes anything. `projection.ts` already ships `DEFAULT_RATES` as a discrete labelled list. **A new `RadioSegment` component** — `Segments` is `role="tablist"`, `h-10`, and carries `mx-4 my-3` sized to sit outside `.scroll`; it cannot be reused |

**Stage expansion** shows the full `stage.why`, `stage.targetAmount` as one `Leader` row, and — where `stage.verdict` is non-null — the cleared checks. **Render `ruleBook`'s `description` (or the question form) with the id as a small mono tag**, never nine raw `SCREAMING_SNAKE` ids: all three judges made "no raw enum ids on a customer surface" binding. Ends in a 44px `What these rules are →` into Record.

`Bar` is `role="presentation"`, so the reconciliation sentence is the accessible source and the bar is `aria-hidden`.

**Edge states.** No projection (`contribution === 0`, keep the existing `?? 0`) → blocks 8–9 omitted entirely, reconciliation absorbs it; note that `monthsToClear`/`paymentToClear` are arithmetic on a contractual rate, so the market-risk disclaimer does not attach — the qualifier is *"at the current rate, if the rate does not change."* Zero stages → one flat block plus `reasonForChange`. Loading → the previous view stays and a 2px indeterminate hairline sits under the head; **no skeletons — a skeleton of a plan is a plan nobody can read.** Offline → both controls disabled with one sentence each; everything else renders from the simulated View.

**Sunil's stage-1 copy bug must be fixed in `roadmap.ts:308`, not the UI.** It says "there is nothing in force" while `protection.lifeCoverInForce` is ₹2,00,000. The reason lead is the sentence FG22/5 requires on the glass — suppressing it in the browser would hide a false statement rather than correct it.

**What we deliberately do not show.** A goal *date* control (`GoalPatchSchema` is `{ targetAmount }`, strict — offering a lever the app cannot pull is worse than offering none). A free-text target. Any confidence score. The nominal 2057 corpus at rest (₹3.15 crore beside a ₹2.20 crore target invites the reader to conclude they are ahead; `Plan.tsx:143` already argues this). A red hero. A second wave surface. Any stage expanded on arrival. A second disclosure level. **A manufactured BLOCKED stage** — the red treatment stays coded and correct, but no persona is engineered into one to show it off; the honest place to watch the gate refuse is Record's shelf.

---

### 4.5 Money — the 360° position, one scroll

**Job.** *"Show me everything you know about my money, and let me check any figure the rest of the app quoted at me."* Money is the evidence tab. It is deliberately **not advisory**: no action, no recommendation, no cross-sell — placing a recommendation inside a position view is the disguised-advertisement pattern, and a bank's own product governance would flag it. Only quiet links to Plan.

**The one thing.** Net position, on the single deep-green wave panel. Money currently renders **four** hero-shaped surfaces against DIRECTION's "use it once per screen," including two stacked 51px apart (the `HeroPanel` ends at offset 224 and the `bg-brand` + `Wave tone="dark"` savings card begins at 275). Three are deleted.

**Block order.**

| # | Block | Role | Height |
|---|---|---|---|
| 0 | Compact head | chrome | 56px. **The segmented control is deleted** |
| 1 | **Net position** | hero | **212px** measured (+24 for the negative-position lead line) |
| 2 | Account deck | evidence | 142px |
| 3–10 | **Eight collapsed sections**, 8px apart | ledger | **56px header each** |
| 11 | Data-quality footnote | reference | ~44px |

Sections, in order: **What you owe · What you hold · Protection · Your cushion · Where it goes · Habits · Every mandate we found · Recent.**

**The hero.** `balances.total + holdings.total − debt.total`; `parts()` already renders `−₹`. Footer: three `PanelLine` rows. **When negative, one lead line** — *"You owe ₹5,82,776 against ₹1,92,143 of savings and investments."* No red variant: Priya's −₹3,90,632 keeps the green ground and the sign is carried by the glyph plus the sentence. (Note Sunil is **also** negative at −₹1,40,875; the branch is not a Priya special case.)

**The deck.** Horizontal, `snap-x`, colour-by-product on the **tint** palette (`tint-sage` savings, `tint-clay` deposits/card) with `Wave tone="light"` — never `bg-brand`. Next card peeks ~11%, which is the bank's own documented affordance. **But measured: Priya has `deposits: 0` and `extraAccounts: []`; so does Sunil.** With `debt.revolving` unshipped, the deck is **one card for two of three personas**. So: a single-card deck renders as a plain full-width card with **no snap container and no peek** — an absent affordance must not be implied — and **the section headers, not the deck, are Money's primary control.**

**Masking.** `MASKED` (16 literal dots, `Money.tsx:127`) is deleted. One rule everywhere: `••••1234`, last four only, **nothing where no masked value exists** — never invented digits, never bare dots. Note that `cardLast4` exists only on the generator's `PersonaSpec` input and is carried nowhere (`grep -rn cardLast4` across core, contracts, api and web returns nothing), and `Account.accountNumberMasked` (`XXXXXXXXXXXX7412` — the uppercase-X idiom the research criticises) never reaches `BalanceFacts`. **First cut renders no masked line at all.** The rule is stated and enforced in the formatter for when a masked value lands.

**Section headers** carry their own figure so a closed section is legible: `What you owe · ₹5,82,776 · [34.8%]`. **Differentiate by role, not uniformly** — liability sections take the orange hairline and warn tint the code already uses for attention; balance sections stay bare; `Your data`-style customer blocks keep a container. Eight identical rows with eight right-aligned figures is the "every block weighs the same" fault `DIRECTION.md` opens by diagnosing.

**Exactly one section opens by default**, by fixed precedence: `debt.missedRepayment` → What you owe; else `debt.hasHighInterest` → What you owe; else `protection.gap > 0` → Protection; else `buffer.monthsCovered < 3` → Your cushion.

**Honest fold statement.** Measured: hero 212, deck 142, header 56, 8px gaps. All-closed, headers land at offset 390/454/518/582/646/710/774/838 — **four fully visible plus a fifth cresting at the 644 device fold** (five plus a sixth at 678). With one section open, **two headers plus the open body**. The earlier "six rows plus a seventh half-cut, with one already open" narrative is arithmetically impossible and is corrected here.

```
╔══════════════════════════════════════╗
║ Money · Priya                      ⛨ ║  56
╠══════════════════════════════════════╣  offset 0
║ ┌──────────────────────────────────┐ ║
║ │ ~~~ NET POSITION             ~~~ │ ║
║ │      −₹3,90,632                  │ ║  236 (incl. lead line)
║ │ You owe ₹5,82,776 against        │ ║
║ │ ₹1,92,143 of savings.            │ ║
║ │ Reachable ₹1,92,143 · Owed …     │ ║
║ └──────────────────────────────────┘ ║
║ ┌────────────────────────┐           ║  deck, 142
║ │ Savings   ₹1,92,143.31 │  (one card,║
║ └────────────────────────┘   no peek) ║
║ What you owe    ₹5,82,776  [34.8%] ▾ ║  56, OPEN by precedence
║   ₹24,200 a month at up to 34.8%     ║
║   ┌ KEY FACTS ─────────────────────┐ ║
║   │ Rate 34.8% · clears in never   │ ║
║   │ at this payment · ₹16,901 of   │ ║
║   │ each payment is interest       │ ║
║   └────────────────────────────────┘ ║
║ What you hold          None held   ▸ ║  56
║ ─────────────── fold at 644 ──────── ║
║ Protection        None in force    ▸ ║
║ Your cushion    1.3 of 6 months    ▸ ║
║ Where it goes       ₹71,507/mo     ▸ ║
║ Habits              ₹2.1 lakh/yr   ▸ ║
║ Every mandate found ₹51,997/mo     ▸ ║
║ Recent            1,243 read       ▸ ║
╚══════════════════════════════════════╝
```

**Section contents and the defects they fix.**

- **What you owe.** Headline: `{inr(debt.monthlyOutgo)} a month at up to {debt.highestRate}%`. The **Key Facts block requires `debt.revolving: { principal, ratePct } | null`** on `DebtFactsSchema`, populated in `derive.ts` from the liability with `isRevolving === true`. Until it lands, **the section prints the rate and no computed figure** — `debt.total × highestRate` is wrong for anyone with more than one liability, and Priya carries a 34.8% card *and* a 16.5% Bajaj loan. (`insights.ts:106` makes exactly this error and overstates her monthly interest; both fixes must land together or Money and Today will print different numbers for the same fact, which is what a fifteen-day review greps for.) When `monthsToClear` returns null, **print that**: *"At ₹24,200 a month this balance never clears — ₹16,901 of it is interest."*
- **What you hold.** **Suppress the Equity/Debt `Leader` rows when `holdings.total === 0`** — measured, that is Priya *and* Sunil, and "None held / Nothing going in / Equity ₹0 / Debt ₹0" is the zero-as-data fault this spec fixes elsewhere.
- **Protection.** Header value: `None in force` when `lifeCoverInForce === 0` (Rohan's case, and his is the default-open section) — **never `₹0`**. Body leads with the payoff: *"₹1 crore of term cover costs ₹985 a month."* The health row renders only when `healthCoverInForce > 0` or `dependents > 0`, and then as a payoff line, not a figure — measured, `healthCoverInForce` is 0 for all three, so an unconditional row is a hard zero on every persona. Sunil's ₹2,00,000 PMSBY is *accident* cover, which the snapshot drops entirely; either add `accidentCoverInForce` or state that only life and health are tracked, because a reviewer tracing his insurance debit in Recent will find nothing here to reconcile it against.
- **Your cushion (new).** `Snapshot.buffer` and `Snapshot.irregular` have **zero references in `apps/web`**. Sunil is 2.5 of 6 months covered with ₹1,978 a month silently deducted from his investable surplus for one-off costs the app never names. Two corrections: **drop the denominator** (`irregular` counts over all history, 22 months, while `quality.monthsOfHistory` is the 11-month window — the sentence would state ₹74,000 over 11 months beside a ₹1,978 provision, two numbers that cannot both be true); and **when `debt.hasHighInterest` or `missedRepayment`, suppress the shortfall rupee figure and the warn pill** — telling Priya she is ₹6,93,481 short of cash when she owes ₹5,82,776 at 34.8% is advice, and it contradicts the gate.
  **One-off rows carry PII.** Sunil's single one-off is verbatim `NEFT/DR/ORANGE CITY HOSPITAL/HDFC0000212/ADMISSION`; Rohan's include `POS 4XXXXXXXXXXX5188 CROMA INDORE`. Route every narration through `merchantOf`/`prettyMerchant` (`lib/merchant.ts` exists for exactly this), **and suppress the merchant entirely where `category === 'Health'`** — `{dayMonth} · Medical · {amount}`. Record's own NEVER STORED card promises health data is never stored; a named hospital admission on an always-rendered section contradicts it, and the raw string also leaks a masked PAN in the idiom we ban and another bank's IFSC.
- **Where it goes.** Headline from `discretionary.monthly` (a median) plus `trend`/`trendPct`, never shown today. Eight tappable category rows — **labelled as 12-month totals, not `/mo`**, because `byCategory` is a 12-month sum including one-offs while the headline is a one-off-excluding median, and the two differ by 34–35% for Rohan and Sunil. Two figures 30px apart that do not reconcile, on the traceability screen, is unacceptable; two figures in visibly different units is fine.
  The income-swing clause keys on **`income.variation >= 0.10`, not `income.stability`** — one +1m tap drops Sunil's variation to 0.142 and flips stability, and a stability-keyed sentence would vanish on the first clock tap a judge makes.
  Tapping filters Recent via the existing **`?category=` query param** (`TransactionsQuerySchema` carries it, `limit` maxes at 200, verified working live) with `limit: 200` — **not** the proposed ten-page client loop, which is unnecessary here and unworkable for habits. Label the result honestly: *"All Groceries lines, including the ones counted as commitments above"* — `byCategory` excludes `committedTxnIds` and the route does not, and for Sunil "Rent & bills" differs by ~10×.
  Add the ⓘ hint under the first bar: *"Tap a category to see what is in it."*
- **Habits.** Rows with `timesPerMonth`, `typicalAmount`, `monthlyAverage` (on the wire, unshown) and `annualTotal`. The 36px merchant initial discs are deleted — two adjacent Cs and two adjacent Rs. **No cap or cancel control**: `SessionState.caps` and `CategoryCapSchema` exist but there is **no cap-writing route in `ROUTES`**. A control that cannot write is the dead `◔` chip with better copy. **No habit→Recent filter in cut 1** — the route has no `txnIds` filter and Rohan's DMart habit is 6 charges inside 713 transactions, so the "Read 200 lines, found 1" state would be the normal case. Rows expand to their own occurrences instead.
- **Every mandate we found.** `Already investing` moves **out** of "Gone before you decide" into its own group below the rule — an investment is not a bill and a hollow dot is not enough to say so. Price-change rows sort to the top of the whole list (the ₹1,800/year Netflix fact is at scroll-offset ~1450 today, screen 3 of 3). `active === false` rows dim with `Last charged {dayMonth(lastSeen)}` (zero references today; a stopped mandate looks live). Each row opens `firstSeen`/`lastSeen`/`intervalDays`/`amountVariation` and its `txnIds` — the charges that prove *"Counted as a commitment because: fixed monthly."* **Suppress any breakdown row whose value is 0** (Sunil's `commitments.rent` is 0).
- **Recent.** `useTransactions` **does not mount until the section is opened** — it fires on mount today, so under one scroll it would fetch 20 lines on every Money open. `Show earlier` 44 → 48px.

**Footnote.** `quality.categorisedShare` is 1 and `unexplainedShare` is 0 for all three personas. *"100% matched"* plus *"0% unexplained"* is the signature a sceptical bank team reads as a generator grading itself. Say the true thing: **"1,243 lines across 11 months, all matched — because this ledger was generated. Under a live feed this line is where the gap shows."** (Or fix the generator; see Open Question 6.)

**Copy bug.** `Money.tsx:179` gates the idle sentence on `idleFloor > 0` and prints `idleMonths`, so Priya reads *"Never fell below ₹55,152 in 0 months."* Gate on `idleMonths >= 1`; otherwise print *"Lowest balance in 11 months: ₹55,152."*

**Every section always renders**, so the screen's shape is identical across personas and a reviewer can compare three sessions. Only the header value and body sentence change: `Nothing owed` / `None held` / `None in force` / `Fully covered` / `Nothing categorised yet` / `No merchant appears often enough` / `None found` / `0 read` — never a `₹0` in the value slot.

**What we deliberately do not show.** No advice, no CTA — the Protection empty state names a payoff and links to Plan; it does not offer a button, because a second entry point to Plan's stage 1 is exactly how two renderings of one refusal started diverging in Ask. No cap/cancel (no route). No red hero. No health score. No inline account chips (`Transaction` carries no account id, so a per-account statement cannot be filtered and there is no account-detail screen — a chip navigating nowhere is the dead-chip fault again). No invented masked digits. No computed interest on a mixed debt book. No donut or pie. No second `HeroPanel`. No banner or carousel. **No reviewer apparatus at all** — `ViewMeta` cannot tell this screen whether the clock has moved, so any "+7 days" claim here would be invented; Money's honest equivalent is Recent's `up to {dayMonth(asOf)}`.

---

### 4.6 Record — the chain, verified by the judge

**Job.** Let a stranger press one button and satisfy themselves that the app cannot rewrite what it told this customer — and, in the same column, let the customer see what they decided, what data is read, and how to withdraw it.

**The one thing.** The record count on the green panel, under a label that reads `Chain verified` / `Nothing chained yet` / `Chain broken` — with the button that re-derives it 12px below.

**Blocks and at-rest geometry.**

```
Fresh session                          Populated (3 chained)
╔══════════════════════════════════╗   ╔══════════════════════════════════╗
║ Record · Rohan                 ⛨ ║   ║ Record · Rohan                 ⛨ ║
╠══════════════════════════════════╣   ╠══════════════════════════════════╣
║ ┌──────────────────────────────┐ ║   ║ ┌──────────────────────────────┐ ║
║ │ ~~~ NOTHING CHAINED YET  ~~~ │ ║   ║ │ ~~~ CHAIN VERIFIED       ~~~ │ ║
║ │       0 records              │ ║172║ │       3 records              │ ║148
║ │ The first decision you take  │ ║   ║ │ Checked 12:04:31 ·           │ ║
║ │ starts the chain.            │ ║   ║ │ 3 records · replied in 8ms   │ ║
║ └──────────────────────────────┘ ║   ║ └──────────────────────────────┘ ║
║ ┌──────────────────────────────┐ ║   ║ ┌──────────────────────────────┐ ║
║ │      Verify the chain        │ ║56 ║ │      Verify the chain        │ ║56
║ └──────────────────────────────┘ ║   ║ └──────────────────────────────┘ ║
║ Nothing has been recommended     ║   ║ THE RECORD · 5 ENTRIES · 3 CHAINED
║ yet. The one waiting on Today is │ ║92║                          [COPY] ║44
║ "Add ₹8,200 to your SIP."        ║   ║ ● Accepted · 1 Sep · ₹8,200      ║
║ [ Go to Today ]                  ║   ║   Add ₹8,200 a month to your SIP ║132
║ ○ 2 session events, not chained ▸║56 ║   9a3f…c210 ← 0000…0000  genesis ║
║ THE RULES                      ▸ ║56 ║   What was checked             ▸ ║
║   9 rules · 2 already apply      ║   ║ ● Refused · 1 Sep                ║132
║ THE SHELF                      ▸ ║56 ║   LIC Market Plus ULIP           ║
║   15 products, incl. the ones    ║   ║   c4b1…88de ← 9a3f…c210          ║
║   we refuse                      ║   ║ ─────────── fold at 644 ──────── ║
║ YOUR DATA                      ▸ ║56 ║ ● Suitable · 1 Sep               ║
║   5 kinds shared · 0 withdrawn   ║   ║ THE RULES / THE SHELF / YOUR DATA║
║ ────────── fold at 644 ───────── ║   ║ Recommendations 3 · refused 1 ·  ║
║ Recommendations 0 · refused 0 ·  ║   ║ promotional messages 0 · sold 0  ║
║ promotional messages 0 · sold 0  ║   ║ How this was produced            ║
╚══════════════════════════════════╝   ╚══════════════════════════════════╝
```

Fresh: all three section headers land at offsets 492/556/620 — **above the 644 fold**. Populated: two chained entries fully visible with the third cresting, which is enough to show the `prev ← record` identity between rows 1 and 2.

**The empty state, resolved.** A judge browsing the tab bar before taking any decision currently meets `0 records / Nothing chained yet` on the pitch's strongest proof. **No genesis AdviceRecord is fabricated** — `AdviceRecordSchema.verdict` is `z.enum(['PASS','BLOCKED','UNKNOWN_PRODUCT'])` and a "session opened" row has no honest value there, so writing one would need a contract change days from the demo or a false `PASS` in the one artefact that must never contain an invented row. Instead the timeline is seeded from **`RecordView.roadmapVersions[0]`** (plan version 1, with its real `snapshotId` and `reasonForChange`) and **`RecordView.consent`** (the grant, with its real `consentId` and validity window) — both verified present on a fresh session, both real server rows with cryptographic identity. They collapse into **one 56px line**, `2 session events, not chained ▸`, so the header can honestly read `2 ENTRIES · 0 CHAINED` and the seeded rows can never read as padding.

Verify still runs and reports the truth: *"Walked 0 records. Nothing to verify yet — the chain starts with your first decision."*

**Verify the chain** is the highest-value missing control in the app, and it is nearly free: `lib/record.ts:39` **already calls `api('verifyRecord')`** and holds `ChainVerification` in state — that is where the current "CHAIN VERIFIED" label comes from. The work is splitting `verify()` out of `load()` and adding `checkedAt`. Verified live: `{ok:true,length:0}` fresh, `{ok:true,length:18}` after 18 gate runs.

The footer reads **`3 records walked · replied in 8 ms`** — `performance.now` around the call measures the HTTP round trip, not the server's hash walk, and on a venue network *"3 hashes · 1400 ms"* would fabricate an attribution on the one screen whose subject is not fabricating attributions.

`settled` keys on `${ok}-${length}` only. Pressing Verify twice must not cross-fade an identical result — the settle animation means "this was re-derived," and firing it when nothing changed says the opposite on the screen about stability.

**The chain, drawn as a chain.** `prevHash` has **zero references in `apps/web`** today, so the link that makes it a chain is invisible and the panel's claim is unfalsifiable from the screen. Verified across 18 live records: `prevHash` of seq 1 is exactly 64 zeros, and `prevHash(n+1) === recordHash(n)` throughout. Newest-first, the mono line `{recordHash12} ← {prevHash12}` puts row N's right-hand value byte-identical to row N+1's left-hand value, ~132px directly below. Twelve hex characters is 48 bits — enough to compare character by character, short enough not to read as noise.

**Tap any hash** to highlight every occurrence of the same 12 characters on screen. The hash gets a **32px** hit box with 12px of real separation below it; only `What was checked` gets 44px — two overlapping 44px boxes in a 42px vertical band would make a thumb aimed at the disclosure toggle the highlight instead, on the one interaction the screen is built around.

**One truncation rule, two shapes:** sha256 (`prevHash`, `recordHash`, `snapshotHash`, `contentSha256`) → 12 hex; a UUID (`seedRunId`, `snapshotId`) → its first group, 8 chars. `shortHash(seedRunId, 12)` would yield `93470448-4c5`, a hyphen mid-token. Both are still "one rule everywhere" in the sense that matters: nobody has to guess which.

**Entry expansion — "What was checked."** One level, never two. Verdict in plain English; the nine rules joined to *this record*; `advice.recorded`; the alternative; evidence; and an identity block rendering `engineVersion`, `consentId` and `snapshotId` **for the first time**.

The join needs no engine change: `suitability.ts:390-397` pushes a rule id onto `passed` only after it clears and returns at the first failure, so `id ∈ rulesPassed` → passed, `id === ruleId` → stopped it here, otherwise → not reached. **But branch on `passed.length`:** measured, Priya's blocked records carry `[]` (rule 1 fires) and Sunil's carry one id. Zero → *"This was the first of the nine checks. Nothing after it was reached."* — which states the mechanism better than eight identical greyed rows. Otherwise → the passed list, the stopping rule, then one line collapsing the remainder.

**THE RULES.** Nine rows from `view.rules` in engine order. Each: a **question** as the heading (from a web-side map keyed on `rule.id`, with `rule.description` as the fallback for a new engine rule), `rule.description` **verbatim** beneath so nobody can accuse the questions of rewriting the rulebook, the id as a mono tag at the right, a **reading line** stating the input for this customer, and a state chip.

The reading line is the honest form of "join the ladder to the customer." Rules 4–9 depend on the **product**, so claiming a per-rule verdict in the abstract would be a fabrication a compliance officer would catch against `suitability.ts`. The row states what the rule is *looking at* — always true — and the verdict join lives in the entry expansion, where a real product was judged.

Header summary counts **the rules whose chip is not "Clear"**, so the header and the rows agree and Rohan gets a real line (`9 rules, checked in order · 2 already apply to Rohan's file`) rather than "0 currently stopping investments."

Justify the question format as **reviewer legibility**, not with the FCA's +36% figure — that finding is about consumer understanding of contractual terms, and this spec has just declared the ladder non-customer-facing. Save the citation for the one rule that reaches the customer on Today and Ask.

**THE SHELF.** Header summary: **"15 products, including the ones we refuse."** No count — the proposed `bundlesProtectionAndInvestment` count is 2, not 4, and it is customer-independent while the refusal set is not: measured by running all 15 through the gate, Rohan refuses 3, Priya 11, Sunil 11.

Each row: name, then `manufacturer · riskometer · lock-in · min ₹X · Y% charges · Z% indicative` — **each segment omitted when its field is absent.** Measured: `expenseRatio` is missing on 10 of 15, `indicativeReturn` on 11 of 15, `coverAmount` on 9. Unguarded interpolation prints `undefined% charges`, which is precisely the shipped-GO-Mobile+ failure a contracts-and-provenance architecture exists to prevent.

`verified` is `false` on **all 15** (`seed-bundle.ts:252`), so a per-row mark distinguishes nothing and reads as "unreliable data." State it once at the head: *"Rates and names come from the fixture shelf; none has been countersigned by a banker yet."*

**"Run it through the gate"** on every row — a 100×44 outline control calling `POST /api/v1/suitability/evaluate`. **Pass the goal**: `EvaluateRequestSchema` already carries an optional `goal: { kind, horizonYears }`, and without it `VOLATILITY_VS_HORIZON` and `HORIZON_VS_LOCKIN` both early-return null (`suitability.ts:207`, `:314`) — measured, a 31-year NPS lock-in currently returns PASS. The verdict renders in place; the route always writes an advice record, so **the chain grows one link in front of the person auditing it.**

Two consequences to design for, not narrate around: **render the product name on advice-only rows** (`productId` is populated and `view.shelf` is in hand; measured, 12 of 15 Rohan rows return identical `All 9 suitability rules passed.` with `spoken: null`), and **group consecutive PASS rows from the same source**: `Checked 12 products, all suitable ▸`. Without both, five taps produce five identical 132px rows and push the seeded events 660px off screen — the uniform stack this pass exists to remove, generated by our own control.

**Say what the gate demonstrates, honestly: the ladder, not a chosen rule.** All 11 of Sunil's blocks report `MISSED_REPAYMENT` because it is rule 2 and `RISK_CEILING` is rule 4 — so his `demonstrates` promise ("a Conservative profile equity cannot serve") is unreachable through this control. Make the row say so: *"Not reached for Sunil — rule 2 stops first."* That is the ladder working, and it is a better sentence than a refusal that never fires.

**YOUR DATA** — the customer's door, reached by the head chip on every tab.

- Consent identity de-jargoned: `Wealth advisory · active · valid to 1 March 2029` with `CONS_SYN_1` as a mono tag beneath. **Keep the status** — `ConsentStatusSchema` is `ACTIVE|EXPIRED|REVOKED` and a revoked consent must not render identically to a live one.
- Five rows with their existing what/why/detail copy plus the provenance word. **Hard copy rule: no consent detail line may state a cadence, a pay day or a salary date** — counts, totals and floors only — so Sunil's null `payDay` cannot reach this glass. (Verified clean today; the rule protects a future edit.)
- **Five real switches** — 52×32 track and thumb, visible checked state, 56×56 hit box. Today they are 67.9×36 filled pills with no track and no checked state; they read as labels, and a bank privacy review would reject a consent artefact whose revocation control is indistinguishable from a badge.
- **Revocation confirms in place**, not in a sheet — the row expands to show the named consequence (*"Turning this off removes the safe-to-spend figure, 4 of your 7 insights, and stage 2 of your plan"*) with `Turn it off` and `Cancel` as two 56px rows separated by 12px, `Cancel` nearest the thumb. `ui.tsx` exports no modal, dialog, sheet or focus-trap primitive anywhere in `apps/web`; introducing one days before a demo is the wrong bet, and confirming in place keeps the consequence beside the switch that causes it.
- **The provenance map** as a 5-row block × source table, led by a summary line so it says something before it says it five times: *"All five blocks are reading the seeded Postgres. Under your sandbox, PROFILE / ACCOUNTS / TXN / LIABILITIES switch to `idbi` and HOLDINGS stays fixture until the AA link lands."* Measured, all five are `postgres` for all three personas — the value of the table is that the rows *can* differ and a reviewer can see the axis.
- **Erase this session** at the very bottom, danger-toned text on a plain ground, never a filled red button. `eraseSession` (DELETE `/api/v1/session`) is registered with **zero references in `apps/web`**. Its sentence separates the two obligations explicitly, because a compliance officer will test exactly this and "erasure wipes the audit trail" is the answer that fails:
  > *Under DPDP this deletes you and everything derived from you. The advice rows stay, immutable, and become unlinkable to you — a record of advice cannot be a record if the person it was given to can delete it. They are retained under SEBI IA record-retention.*
  **The success path is specified**: 204 kills the session token, so every subsequent call 401s — including the `/record` fetch backing this screen. On 204: clear the stored session, unmount to Pick, show one line naming what happened and what survived.
- **Switch customer** — a reviewer row at the foot of this section, and the fix for Pick's one-way door.

**The restraint line.** `Recommendations recorded 3 · of which refused 1 · promotional messages 0 · products sold 0`. The first two are counted from `record.record`; the last two are **stated as facts about the build** with a one-line footnote saying why (there is no ad slot and no transaction in this build), never dressed as computed telemetry. An absence is invisible; this makes restraint checkable.

**How this was produced.** `seed {seedRunId8} · generator {generatorVersion} · content {sha12} · source {meta.source} · snapshot {sha12} · ledger {from}→{to} · data to {dataFreshnessDate} · tier`. `RecordView.provenance` is `SeedProvenanceSchema.nullable()` — **guard it**, and say what the block reads when the source is the bank rather than a seed, which is the more interesting case for the audience it exists for. This replaces `SEED 93470448`, currently an unexplained 8-digit number in 13px grey competing with the panel's claim.

**Edge states.** Loading: the panel renders immediately with the count falling back to `record.record?.adviceRecords.length ?? 0` and the footer reading "Checking…"; **THE RULES and THE SHELF are fully readable throughout** because they read `view.rules` and `view.shelf`, which arrived with the View. Record read failed: the error card replaces **blocks 2–7 only** — `record.error` currently early-returns from the Decisions segment, which was survivable behind tabs and in one column would blank the rulebook. Verify failed: the label falls to `Chain not checked` and the button stays live; **never "Chain verified" on a null chain.** Chain broken: designed and unreachable in the demo, because a "verified" claim with no rendered failure mode is a claim nobody can test — and there is **no "break the chain" control**, which would be a superb ten seconds and would disprove the artefact. Offline: the panel is replaced, Verify and the gate controls are **absent, not disabled** (a greyed button implies waiting would help), and **THE RULES and THE SHELF render in full** — offline, the rulebook is still the rulebook, and that is the most important thing this screen can say with the network gone.

**What we deliberately do not show.** Full 64-character hashes (three lines per entry, less legible, not more; they are in COPY and in the API). Any confidence score. A compliance score or any aggregate over the nine rules — collapsing an ordered ladder where the earliest failure wins into one figure destroys the only interesting thing about it. The nine rules at the point of advice. A raw enum as a headline. Boilerplate disclaimers. Wall-clock `createdAt` as a primary date (`atSim` leads; GO Mobile+ has shipped `Last Logged on 06-03-2024 11:56:51` unchanged since 2019). A second wave surface. An avatar-sessions block when no call has happened. A download button (clipboard only — a mobile-web download is a dead end for the viewer, and the fifteen-day reader has the API).

---

### 4.7 Ask Uday — the refusal

**Job.** Let a person put the question they would only ask a cousin to a bank's own adviser and get back a refusal of a product that bank sells — in his voice, with their figures, a named better alternative, and a link to the audit entry it just wrote.

**The one thing.** Uday's face. A **192×240** 4:5 portrait tile, centred — 46,080px², **14% of the viewport**, against a next-largest element (the lead pill) of 20,048px². Today it is a 68×68 disc at 1.4% while 268px of empty green sits below it.

**Layout, greeting state.**

```
┌──────────────────────────────────────┐  0
│ [status pill]                    [×] │  64   × is 48px, top-RIGHT
│                                      │
│           ┌──────────────┐           │
│           │              │           │
│           │    UDAY      │           │  192×240 portrait, 240
│           │              │ ●         │  presence dot
│           └──────────────┘           │
│              Uday                    │  56
│     Your adviser at IDBI Bank        │
│  │ Text today — same advisor, same   │  40   one bare row, not a card
│  │ rules, same record. What I read →│
│ ┌──────────────────────────────────┐ │
│ │ Rohan, ₹85,000 comes in. ₹51,997 │ │  transcript band, 186
│ │ is committed before you decide…  │ │
│ │ Show me the numbers              │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ My cousin says I should take a   │ │  56  ← THE ONE THING
│ │ LIC savings plan            →    │ │      the only orange surface
│ └──────────────────────────────────┘ │
│ [Ask about your money        ] [Ask] │  48
│ Speak to a person   ·  More questions│  44
├──────────────────────────────────────┤
│ Seeded ledger · 1 Sep · Text tier    │  32  state only, no Move time
└──────────────────────────────────────┘  844
```

**The three fixes that matter most.**

**1. The climax routes to the gate — resolved properly.** `AnswerSchema` has no verdict field, so `backend.ask()` returns a plain bubble for the primed pill while the same refusal via the product `<select>` renders the badge, the rule and the alternative — **and writes an advice record.** The web-layer fix is one file, with three corrections to the naive version:

- **Resolve the product from `shelf`, never hardcode an id.** Mirror `ProductShelfPort.resolve`: exact name, then `p.aliases.some(a => norm(question).includes(norm(a)))`, then `shelf.find(p => p.bundlesProtectionAndInvestment)`. `'LIC savings plan'` is an alias of **`LIC_ENDOW_402`**; hardcoding `LIC_ULIP_401` would make the text path name a different product from the avatar's tool path in the same chained record, and would break the moment the IDBI shelf swaps in (`offline/index.ts:268` throws on unknown ids; the route 404s).
- **Fire both `ask()` and `evaluate()`.** The gate is earliest-failure-wins: Priya blocks at `HIGH_INTEREST_DEBT` (rule 1), Sunil at `MISSED_REPAYMENT` (rule 2), and **neither verdict mentions the ULIP, the bundling, the lock-in, or the bank selling it.** Only Rohan reaches rule 9. Routing to `evaluate()` alone would *remove* the product-specific refusal for two of three personas — the demo's climax would get worse. So: render one verdict card whose reason is the gate's `spoken` (badge, ruleId, `passed[]`, record link) and whose body carries `ask()`'s hand-written product paragraph as a second block: *"And on the product itself: …"*. One extra request on one tap.
- **The lead pill needs a deterministic fallback.** `query.ts:429` gates the LIC question on `protection.dependents > 0` and Priya's is **0**, so today her Ask screen has no primed refusal tap at all — on the persona a judge is most likely to probe. Fallback: the same shelf resolution, labelled from the **alias** (customer's voice), never the manufacturer's SKU name.

**2. The one thing, and the priority rule.** Composer row 1 holds exactly one 56px filled `--accent` control:

- `canCall === true` → **Call Uday** (the lead question moves to the top of the sheet).
- otherwise → **the lead question**.

**Consumed on tap.** Once asked, the row is removed and the composer shrinks by 64px, handing it to the transcript. Karlan: re-reminding adds nothing; re-offering a used prompt is how a coach degrades into a feed.

**3. The AI disclosure is a row, not a card.** Measured, the four ESMA ¶17 items as a transcript card are **~263px** in a **186px** greeting-state band — and with the new scroll rule (auto-scroll only within 48px of the bottom) it would pin at the top and push Uday's first sentence entirely out of view, which is exactly the sentence `firstFiveSeconds` is built on. So: **one bare row under the name**, in the reason-line treatment (2px white/35 left rule, 13px white/80), with the other three items behind a 44px link into the ask sheet:

> *I am software. Deterministic rules decide what I may suggest, and I cannot overrule them.* · **What I read, and how to reach a person →**

Art. 50 is satisfied at ~40px instead of 263px, ESMA ¶18 explicitly blesses tooltips/FAQ for exactly these four items, and Uday's first sentence stays first in the transcript.

**Portrait collapse.** On the customer's first turn (`turns.filter(t => t.who === 'you').length > 0`) the portrait becomes a 64px identity row (44px round crop, name, presence dot) pinned under the top bar, taking the transcript to **490px**, and **554px** once the lead pill is consumed — against 429px today. **Cross-fade the two sizes over 200ms** rather than animating layout; `DIRECTION.md`'s motion table has exactly five entries and ends "Nothing else moves," so this reuses the existing "clock advances" idiom rather than adding a sixth, and it is gated on `prefersReducedMotion()` from `lib/motion.ts`.

**One line, reframed from caveat to offer.** `unavailableLine()`'s `!availability.enabled` branch (`Ask.tsx:313`) currently makes *"Voice calls are switched off in this build."* the second thing a judge reads, where the value proposition belongs. But deleting it outright leaves a judge who tapped the centre disc expecting a live video adviser looking at a still with no explanation. So it becomes:

> **Text today — same advisor, same rules, same record.**

That is the fallback-ladder claim stated positively, and it is the sentence that stops a judge concluding the differentiator is broken. Actionable reasons (a failed attempt, a busy line with an ETA, minutes exhausted) still render in their own row.

**THE VERDICT CARD — one rendering, every caller.**

```
┌╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┐   3px --danger left rule
│ ● Not suitable for you   BUNDLED_… │   13px/700 · 10.5px mono, right
│                                    │
│ No. It costs about 3 times what a  │   Verdict.spoken, verbatim,
│ term plan costs for the same job.  │   untappable, never disclosed
│ IDBI sells this one, and I am      │
│ still telling you not to buy it.   │
│ ────────────────────────────────── │
│ LIC Term Assurance    ₹985 a month │   the alternative row, 56px
│                  [Check this instead]│
│ Recorded · see the entry →         │   44px, → Record
│ Show me the numbers                │   44px → passed[] + recorded
└╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴┘
```

Same white `--surface` card as an answer — **a rule is a role marker; a new ground is a new surface**, and Ask's own header already reserves the card for one thing.

**The substitute row is gated on `alternative === null` alone**, with the clause switched on `ruleId`. `MISSED_REPAYMENT` also returns `alternative: null`, and that is the rule Sunil hits on the primary demo path — gating on `HIGH_INTEREST_DEBT` only would give one of three personas a card with a header, a reason, and nothing else. `HIGH_INTEREST_DEBT` → *"That is about ₹16,901 a month in interest"* (the balance and rate are already in `spoken` one line above — carry only the new number). `MISSED_REPAYMENT` → *"Bringing the ₹11,600 instalment up to date is the thing that moves first."* Ship a default clause so a future null-alternative rule cannot regress to a bare no.

**"Recorded · see the entry →"** — no ordinal. `EvaluateResponseSchema` returns `{verdict, adviceRecordId}`, an id, not a chain length, and Ask receives no record data. `lib/ask.ts:23` currently destructures `.verdict` and throws `adviceRecordId` away; widening the `AskBackend.evaluate` return is one field.

**PASS verdicts stop speaking machine.** `suitability.ts:404` returns `recorded: 'All 9 suitability rules passed.'` with `spoken: null`, and `Ask.tsx:434` renders `v.spoken ?? v.recorded` — so a suitable product answers in the adviser's voice with a compliance string. Compose it in the web layer from the product name and amount, using `verdict.passed.length` rather than a hardcoded nine, and demote `recorded` into the evidence disclosure where reviewer language belongs.

**The ask sheet** (`More questions`) — a bottom sheet, the one overlay in the app, because 15 products and 6 questions cannot live at rest without recreating the 229px stack. Section A: every `AskSuggestions.questions` string as a 56px full-width row, never truncated, **never a horizontal scroller** — four of five chips currently render entirely off the right edge (lefts 309/584/845/1069 against 390px) with chip 2 clipped mid-word, so the strip reads as a rendering bug on the differentiator screen. Section B: all 15 shelf rows with riskometer chips, tapping calls `evaluate(productId, surplus.deployable)`. Both sections route through the same rule as the lead pill — **one refusal rendering in the app.**

**Composer row 3: `Speak to a person` on the LEFT, `More questions` on the right.** The right column belongs to the rail's instrument on every other tab; keeping a customer's human-escalation link out of that column removes an entire class of mis-tap. The link is **permanent, never conditional** — FG22/5 ¶9.18 expects an exceptions route for digital-only support and ESMA ¶17(a) requires telling the customer if and how they can reach a human. Quiet link, never a third pill.

**Controls.**

| Control | Position | Target |
|---|---|---|
| Close | top bar, **right**, y 12–60 | **48px** (from 38×38 top-left — under every standard, in the corner Parhi rates jointly worst) |
| Lead question / Call Uday | composer row 1, full width, y 626–682 | **56px** |
| Input + Ask | composer row 2, y 690–738 | 48px |
| Speak to a person · More questions | composer row 3, y 744–788 | 44px hit height |
| Show me the numbers | inline in any card | 44px via `py-3 -my-3` (from 137.8×19.5 — 44% of the WCAG 2.5.8 minimum) |
| Check this instead | verdict card, alternative row | 44px — runs the gate again, **never a "Buy"**: nothing in the contract transacts a product from this surface |
| Mute / End | in-call, bottom centre | 62px, unchanged |

**In-call layout: unchanged, and deliberately.** The 4:5 tile at `aspect-[4/5] w-full`, `object-[center_28%]`, the three shadows, the 900ms poster→video dissolve gated on `avatar.videoLive` rather than on connection, the `Waveform` for the audible-but-not-yet-visible window. **Do not make it full-bleed** — Runway publishes 1088×704 (~1.55:1) into a 0.46:1 phone, so `cover` keeps 30% of the source width and crops him to the bridge of the nose. The file's own comment records this. The instrument strip is suppressed during a call.

**Edge states.** Three catch branches (`Ask.tsx:381`, `:410`, `:435`) currently push an error sentence and dead-end; each gains a 44px `Try again` re-sending the identical request. The `:435` retry is the highest-value one in the app: it is the climax path, and a transient failure there inside a three-minute slot currently has no way back. Offline: everything works through `offlineAsk()` — suggestions, ask and evaluate all run from the local core chunk and `view.shelf` is local, so the refusal is **byte-identical**; the only differences are the strip reading `OFFLINE · local simulation · nothing recorded`, the record link becoming a flat `Not recorded — offline` at the exact place a chain entry would otherwise be promised, and the Call row never rendering. Queue: `QueueCard` unchanged in behaviour and copy — its three states are already the best error handling in the app — with every button 40 → 48px and the `×` 40 → 44px. Call drops: `avatar.mode` returns to text, **the transcript is preserved**, `avatar.reason` renders.

**What we deliberately do not show.** A confidence score. Nine rules in the transcript. A raw enum as a headline. Any horizontal scroller. A typing animation or simulated streaming — the engine is deterministic, pure and instant, and manufacturing latency to look like an LLM would undercut the exact claim that separates this from one. The raw `resolved` object (only a phrased line: *"Read as: Food & dining, 1–31 August"*, and note it is set on only two `query.ts` branches, so it will be absent from most turns including every refusal). `Verdict.recorded` as the customer-facing sentence. A "Buy" control. A health score. A floating assistant bubble over other screens. **A `Move time` control** — a clock advance mid-conversation invalidates the transcript.

---

## 5. Control Placement Rules

These are the rules that stop the next screen from drifting.

### The reach map, 390×844, right thumb

Derived geometrically from Parhi's measured thumb length (µ=115mm, σ=5.75, n=20) at 6.04 px/mm, with a pivot at ~(375, 800). **Treat band boundaries as ±50px** — this is a model, not a measurement, and where it disagrees with Hoober's or Parhi's measured data, the measured data wins.

| Band | Where | Rule |
|---|---|---|
| **EASY** | y ≥ ~520 across the full 390px width; y ≥ ~384 in the centre column | Everything that commits lives here |
| **STRETCH** | y ~224–384 centre; y ~311–519 far left | Acceptable for deliberate presses (Verify the chain, Change the target) and one-time choosers |
| **HARD** | y < ~220 anywhere; worst in the top-left quadrant | Chrome only. Never a commit control |
| **BUNCHED** | within ~181px of the pivot — the bottom-right block | Middling (Parhi µ=7.5mm), which is right for a reviewer instrument and wrong for a primary |

Comfort by region (Parhi, 3×3 grid, 7-point scale): centre µ=5.7 — **the best**; NW and SW both µ=3.7 — **jointly worst**. "Put it at the bottom" is too crude; the rule is **bottom-centre, full width**.

**Do not cite the green/yellow/red thumb-zone heat map** in the repo or the deck. Hoober withdrew his own 2013 drawings — *"Ignore those drawings… a bit of a lie because I over-assumed"* — and a bank tech team reading for fifteen days may know it. **Do not justify the bottom bar with edge-targeting Fitts**: NN/g, citing Avrahami, finds edges offer no touchscreen advantage and are actually slower to hit. The bar wins on reach and persistence.

### Target sizes

| Class | Size | Rule |
|---|---|---|
| **Commits** (`Do it`, `Not now`, `Start this`, `Verify the chain`, `Call Uday`, the lead question, consent switches, clock steps, sheet rows) | **56px** | Parhi's 9.2mm plateau, where one-handed thumb error rates stop improving |
| **Secondary** (inputs, `Ask`, `Show earlier`, `Try again`, rate segments) | **48px** | Clears Apple 44pt and Material 48dp |
| **Links, chips, disclosures** | **44px hit**, achieved with `py-3 -my-3` so layout height is unchanged | This is how every 19.5px link in the app is fixed without growing a card that has no slack |
| **Absolute floor** | 24px (WCAG 2.5.8 AA) | **This is the legal floor, not the design target.** 24px = 3.97mm, smaller than the 5.8mm targets Parhi found produced significantly elevated errors. Clearing it is not evidence of good touch design and the repo must not imply it is |

**Two stated exceptions**, both knowing:

1. The **instrument rail band** is 32px, below 44. Accepted because the whole 390px width is the target, it is a single control with no neighbour to mis-hit, the real ergonomics live in the 56px rows it opens, and **it renders only when `meta.simulatedClock` is true** — a customer on a real IDBI feed never encounters it. Its discoverability cue is that the date in it changes when the clock moves; that needs a ten-minute hallway test with someone who has not seen the app.
2. The **hash line** in Record gets 32px, so it cannot steal taps from the 44px disclosure 10px below it.

**Spacing.** 8px minimum between adjacent targets (Material). 12px between any two controls with opposite outcomes (`Turn it off` / `Cancel`; `Do it` / `Not now` use 16px). The rail sits 8px above the TabBar. **No customer-facing control shares a vertical column with a reviewer instrument.**

**Corners.** Hoober's size-by-position rule asks ~7mm (42px) at centre and ~12mm (72px) in a corner. We never put a commit control in a corner. The two corner controls that remain — the head chip and Ask's Close — are 44 and 48, below 72, and that is a stated trade: both are deliberate, rarely-used utilities with an alternate route.

### Placement

- **One solid `--accent` pill per screen.** Every other control is outline, quiet link, or plain row. If a screen has two filled pills, one of them is wrong.
- **Primaries are inline, full width, bottom-centre — never sticky.** There is no controlled evidence for sticky-vs-inline CTAs on mobile, and a pill floating over a scrolling ledger is the "button that covers content" fault `DIRECTION.md` forbids and IDBI's own published store screenshots demonstrate.
- **Accept and decline are equal width and equal height.** Hierarchy is carried by fill versus outline, never by size. Every Indian investing app ships a full-width accept CTA and makes decline the back button; this symmetry is the clearest anti-dark-pattern signal in the product and it stays.
- **`Why?` is never a third pill.** A third control of the same shape as the primary is how a screen stops having a primary action. Its being modest *is* the composure claim.
- **The whole row is the target.** No chevron is ever a separate control; no card ever contains a second tap target.
- **One disclosure level, everywhere.** NN/g: past two levels usability collapses. Every collapsed summary must be self-sufficient, because there is no evidence people open accordions.
- **This app has no modal layer.** `ui.tsx` exports `Amount, Card, Segments, Leader, Bar, Tile, Head, HeroPanel, Pill, Eyebrow` — no dialog, sheet or focus trap anywhere. Every disclosure and every confirmation happens **in place**: the action expands, the consent row expands, the target presets expand, the rail expands upward. **The single exception is Ask's question/product sheet**, which is a genuine alternate route to 21 rows that cannot live at rest.
- **One shared `ActionBlock`.** The four KFS slots plus `Do it / Not now` is **one component with three callers** — Today's card, an insight row's expansion, a Plan stage's expansion. This is the structural fix for the verified defect that the same refusal renders two ways depending on the path that reached it. If a caller passes a different shape, the divergence returns and is harder to spot than it is today.
- **`Not now` writes `deferred`.** Two lines in `mutations.ts:27`, zero contract change, and it stops a hash-chained record saying a customer refused a product when they said "ask me later." Deferring surfaces the *next* action; it never re-offers the same one.
- **No apparatus in the top 20% of any screen.** Ever.

### Formatting

- **One masking rule:** `••••1234`, last four only. Nothing where no masked value exists. Never invented digits, never bare dots, never uppercase X.
- **One money format:** `₹` + no space + Indian 2-2-3 grouping via `Intl 'en-IN'`; `approx()` above one lakh (`₹1.2L` / `₹1.4Cr`), never `K`. Paise only where paise matter. `font-variant-numeric: tabular-nums` wherever figures stack — already correct in `tokens.css` at lines 275, 306 and 455, and it is what makes the waterfall visibly sum.
- **Every value routes through a formatter with a defined empty case.** The shipped GO Mobile+ prints a literal `undefined` inside a customer's postal address; that is the failure this architecture exists to prevent.
- **No raw enum id ever leads.** The human sentence leads; the id survives as a small mono tag at the right in `--ink-soft` (never `--ink-faint`, which `tokens.css:27` documents as failing AA), and only where a reviewer needs it: Record's rules and entries, Pick's cards, Ask's verdict header.
- **Relative or human dates, never raw timestamps.** `atSim` is the primary date everywhere; wall-clock `createdAt` appears only inside an expansion.
- **THE PAYDAY RULE — binding, and a precondition.** One shared helper:
  ```
  salaryLine(safeToSpend, income):
    income.source === 'salary-series' && income.payDay !== null && incomeStability === 'regular'
      → "{days} days until your salary on {dayMonth(nextSalaryDate)}"
    otherwise
      → "{days} days left in this month"
  ```
  **No screen and no spoken answer prints a salary date when `payDay` is null, whatever `stability` says.** `derive.ts:289` sets stability from variation alone and `derive.ts:285` defaults a null day to the 1st, so one +1m tap flips Sunil to `regular` and the app invents *"your salary on 2 November"* for a shop owner. It fires on the first clock tap a judge makes, and on the live tier Uday **says it aloud**. Enforce it in the engine's test suite, not only in a screen: assert that for Sunil at `asOf + 30 days`, `income.payDay === null` implies the rendered string contains no month name.

---

## 6. What We Delete

| # | What | Where its content lands |
|---|---|---|
| 1 | **`components/OfflineBadge.tsx`** — a 56px full-width clay strip pinned *above* the head on every screen (`App.tsx:73`) | Its two jobs (say we are simulating; offer a retry) move into the instrument rail. **Ask and the Gate keep their own offline treatment** — the Gate a rail variant needing no `meta`, Ask its top-bar strip |
| 2 | **`components/DataSourceRibbon.tsx`** (26px of permanent chrome saying "Seeded database" to a customer) | Its `SOURCE` map and `dataFreshnessDate !== asOf` stale rule move verbatim into the rail |
| 3 | **`components/Clock.tsx` as a 78px in-scroll peach strip** — the first coloured break on Today, landing *before* the green hero | Rewritten as the rail's upward-expanding panel. Its explainer copy survives word for word; its five sub-44px controls (three 32px steps, a 32px Reset, a 24×24 `?`) become four 56px rows. The `?` disappears entirely — the rail's readout *is* the disclosure |
| 4 | **Both header chips** (`Today.tsx:106-118`). The `◔` has a `data-count` orange badge reading 7/5/4 and **no `onClick`**; the `U` is `aria-label="Profile"` and calls `onAsk` | One 44×44 `ShieldCheck` chip → Record → Your data, on **every** tab |
| 5 | **The `<h1>` sub-line** on every screen | The head carries `{Screen} · {context}` on one 17px line |
| 6 | **Both segmented controls** (`Money.tsx:78`, `Record.tsx:87`) | Six sub-surfaces become two scrolls of collapsed sections. Not on a clipping argument — they do not clip |
| 7 | **Pick's 233px marketing slab** — eyebrow, 30px three-line h1, three-line subtitle | 114px slab with a 22px name and one line. The pitch's three claims redistribute one per persona promise line |
| 8 | **Pick's four raw enum chips and the `demonstrates` prose tail**; **the decorative `›`** at `Pick.tsx:190` | Plain-English promise lines; the ids survive as 10px mono tags. The chevron's affordance role passes to the instruction line |
| 9 | **The waterfall's fifth row** (`Still yours ₹20,943`) — restates the hero's figure 179px below where the hero printed it at 34px | Nothing. The hero owns that number |
| 10 | **The projection paragraph on the action card's face** (~72px for Rohan) | Into `Why?`. It is duplicated on Plan and it is what the consequence-of-inaction line costs |
| 11 | **Four of Today's seven insight rows**, plus the row that duplicates the action card verbatim | Three rows with real buttons, plus a pushed `Everything I noticed`. 1,435px → ~450px |
| 12 | **Plan's 94px adviser essay** inside the hero (`Plan.tsx:103-109`) | Stage 1's expansion |
| 13 | **Plan's `<input type=range>`** (324×16px, no `aria-label`, the only control that changes anything) | A three-cell 48px `RadioSegment` at 8/10/12% |
| 14 | **Plan's `Suitability passed` filled pill** (`Plan.tsx:271`) | A check mark plus `Cleared all {passed.length} checks` |
| 15 | **Plan's 78px "every version is kept" colophon** | One line and a link. Record owns the argument |
| 16 | **Three of Money's four hero-shaped surfaces**, including the `bg-brand` savings card 51px below the panel | "A normal month" and "Gone before you decide" become section headline facts; the savings card becomes a `tint-sage` deck card |
| 17 | **Money's `MASKED` constant** — 16 literal dots conveying nothing | `••••1234` where a masked value exists; nothing where it does not |
| 18 | **Money's 1,269px always-on transaction ledger**; the 36px merchant initial discs | A 56px collapsed section whose fetch never fires unless opened; discs gone |
| 19 | **Record's `SEED 93470448`** in 13px grey on the green panel | The verification result takes the footer; the seed moves to a labelled "How this was produced" row with the generator version and content hash |
| 20 | **Record's five `Shared` pills** (67.9×36, no track, no thumb, no checked state) | Real 52×32 switches with a 56×56 hit box and an in-place consequence preview |
| 21 | **Ask's horizontal chip strip** (`Ask.tsx:547`) — four of five chips off-screen, chip 2 clipped mid-word | 56px full-width rows in the ask sheet |
| 22 | **Ask's truncated `<select>` + `Check a product` pair** (`Ask.tsx:589`) jammed below the input at the screen's bottom edge | All 15 shelf rows in the sheet with riskometer chips, plus `Run it through the gate` on Record |
| 23 | **`"Voice calls are switched off in this build."`** as the second line under Uday's name | Reframed as an offer: *"Text today — same advisor, same rules, same record."* |
| 24 | **`DecisionKind = 'did_it' \| 'declined'`** (`mutations.ts:27`) | All four kinds; `Not now` sends `deferred` |
| 25 | **Today's refusal line** (cut for the first build) | Claim 3 lives on Ask's lead pill and Record's shelf gate. `DailyPlan.refused` is a build-order item, not a fallback |
| 26 | **Any financial health score, forever** | Named as a permanent deletion because it is the single most likely thing to get added and it is precisely what this product beats |

---

## 7. Build Order

Ranked by (demo impact × real-user impact) / effort. **S** = a few hours. **M** = half a day to a day. **L** = more.

### Tier 0 — preconditions. Nothing else matters if these are wrong.

| # | What | Why | Size | Depends on | Safe? |
|---|---|---|---|---|---|
| 0.1 | **The payDay guard** (`Today.tsx:143`, `query.ts:191`, one shared helper + an engine test) | One +1m tap makes the app — and on the live tier, Uday's voice — tell a shop owner his salary date. It fires on the first clock tap a judge makes and destroys the persona's reason to exist | **S** | — | ✅ |
| 0.2 | **Pick re-entry** (`?pick=1` + `Switch customer` in Record) | Judges 2 and 3 currently land inside judge 1's session and cannot reach Pick | **S** | — | ✅ |
| 0.3 | **`Not now` sends `deferred`** | A hash-chained record misreporting customer intent, inside the artefact whose purpose is accuracy | **S** (2 lines) | — | ✅ |
| 0.4 | **Two false-claim engine fixes**: `insights.ts:130` protection headline branch on `lifeCoverInForce`; `roadmap.ts:308` stage-1 `why` branch | Both tell Sunil he has no life cover while he holds ₹2,00,000. A wrong factual claim about a customer's own policy is the worst thing a fifteen-day reviewer can find | **S** | — | ✅ |
| 0.5 | **`fold.spec.ts`** at 390×844 on all three personas, with a 34px-inset case | Every fold number in this document is derived from measured component heights, **not from a browser**. The guarantee is the test | **M** (Playwright from scratch) | — | ✅ |

### Tier 1 — the fold and the thesis.

| # | What | Why | Size | Depends on | Safe? |
|---|---|---|---|---|---|
| 1.1 | **Compact head (56px) + instrument rail (40px) + active-tab indicator + `/uday.jpg` on the centre disc** | −31 to −65px of chrome per tab; evicts every instrument from the top 20%; makes the active tab visible; removes the QR-scanner ambiguity | **M** | — | ✅ |
| 1.2 | **Today's block order + the waterfall's fifth row + the action card at ≤233px** | `Do it` clears the fold by 59px on all three personas, by construction | **M** | 1.1, 0.5 | ✅ |
| 1.3 | **`Verify the chain`** | The highest value-per-line control in the app. `lib/record.ts:39` already calls the route and holds the result — the work is splitting `verify()` out of `load()` | **S** | 1.1 | ✅ |
| 1.4 | **Record's seeded timeline + `prevHash` rendered + `shortHash`** | Kills the demo's worst risk (`0 records` on the pitch's strongest proof) with real server rows, and makes the chain visible as a chain | **M** | 1.3 | ✅ |
| 1.5 | **Ask's climax routing** — shelf-alias resolution, `ask()` + `evaluate()` both, the shelf fallback lead | The demo's centrepiece currently renders a plain bubble identical to the greeting. One file | **M** | — | ✅ |
| 1.6 | **The decision receipt**, with the null-adviceRecord branch | The one button the whole thesis rests on has no confirmation; this is what carries a judge into the chain | **M** | 0.3 | ✅ |

### Tier 2 — the free wins and the read-only fix.

| # | What | Why | Size | Depends on | Safe? |
|---|---|---|---|---|---|
| 2.1 | **Insight rows gain real buttons** + `slice(1,4)` → `slice(1)` + the no-action branch | `grep -rn 'suggests' apps/web/src` returns zero hits while `dailyplan.ts:241` already builds the Action. The biggest free win in the repo | **M** | shared `ActionBlock` | ✅ |
| 2.2 | **The shared `ActionBlock`** (three callers) | The structural fix for two renderings of one thing, and the reason no modal is needed | **M** | — | ✅ |
| 2.3 | **Ask's verdict card** — one rendering, substitute row, `passed.length` branch, record link | Turns a badge into an artefact and links it to the chain | **M** | 1.5 | ✅ |
| 2.4 | **Record's shelf gate** (`Run it through the gate`, with the `goal` param, product names, PASS grouping) | The reviewer-reachable proof of claim 3 that does not depend on Ask, on voice, or on the contract gap | **M** | 1.4 | ✅ |
| 2.5 | **Plan's guards** — the `reaches` rule, the `shortfallMonthly === 0` guard, the peak-cost sentence, `STAGE_LABEL` interpolation | Kills two misleading financial promotions (`₹0 a month, starting now` over ₹5.83 lakh at 34.8%; `On track` over a plan reaching half its goal) | **M** | — | ✅ |
| 2.6 | **Plan collapsed + route strip + reconciliation (bisected) + `Start this` + `Change the target`** | Plan stops being a read-only document; `setGoal` is registered, typed, tested and has zero callers | **L** | 2.2, mirrored `projection.ts` | ⚠️ *land 2.5 first; 2.6 can slip* |
| 2.7 | **Move time panel + diff receipt + the two-state rail + persisted `openedAsOf`** | The most persuasive thing the build can do currently happens in total silence | **M** | 1.1 | ✅ |
| 2.8 | **Pick rebuilt** | Three whole personas above the fold, no hackathon slab, the 429 and 503 branches | **S** | 0.2 | ✅ |

### Tier 3 — engine and contract work. **Not safe before demo day.**

| # | What | Why | Size | Risk |
|---|---|---|---|---|
| 3.1 | **`debt.revolving: {principal, ratePct} \| null`** on `DebtFactsSchema`, from `derive.ts` | Unlocks Money's KFS block and Priya's credit-card deck card. Two layers. **Must land with 3.2** | **M** | Contract change |
| 3.2 | **`insights.ts:106` interest denominator** | Priya's headline applies the 34.8% card rate to a 16.5% loan's principal. If 3.1 ships without this, Money (honest) and Today (overstated) print different numbers for the same fact | **S** | Coupled to 3.1 |
| 3.3 | **`Action.consequence`** on `ActionSchema` + core copy | The FG22/5 ¶8.45 line currently composed in the web layer. Better written where the numbers are | **M** | Contract change |
| 3.4 | **`DailyPlan.refused`** at `dailyplan.ts:439` | Puts claim 3 in Today's first screenful. Four layers (core → contracts → api mapping → web). **Do not ship the web-layer fallback** — it would say "the rules refused these" about array slicing | **L** | Four layers |
| 3.5 | **`ViewMeta.asOfOrigin`** | The proper home for the simulated-figures label; the persisted `openedAsOf` is a stopgap | **S** | Contract change |
| 3.6 | **`decision.service.ts:105` cap category** | `set_category_cap` caps `categoryTrends[0]` regardless of which action arrived, so Rohan's Swiggy button caps Food & dining and Priya's Restaurant button caps Shopping | **S** | Engine |
| 3.7 | **Money's eight collapsed sections** | The largest single deletion (1029 + 2706 + 1857 = 5,592px → ~869px) and the largest single risk: it touches `Money.tsx` (586 lines) wholesale | **L** | ⚠️ A half-migrated section list in front of a judge is worse than the segments it replaces |
| 3.8 | **Record's eight sections + consent switches + erasure** | Touches `Record.tsx` (681 lines) | **L** | Same risk as 3.7 |

**If time runs out**, the ranked order is: Tier 0 in full → 1.1, 1.2, 1.3, 1.5, 1.6 → 2.1, 2.3, 2.4 → and **leave Money's and Record's section migrations alone.** The segments do not clip; they are merely suboptimal, and suboptimal beats half-finished.

---

## 8. Open Questions

**1. Claim 3 on Today: ship `DailyPlan.refused`, or leave the refusal to Ask and Record?**
*Context:* it is four layers (core capture at `dailyplan.ts:439`, `DailyPlanSchema`, the API view mapping, the web). Even done correctly it cannot surface the ULIP refusal, because `buy_term_cover` filters `!p.bundlesProtectionAndInvestment` before the gate — what it shows is a sweep-in FD blocked by `HIGH_INTEREST_DEBT` or `MISSED_REPAYMENT`.
**(a)** Ship it — claim 3 lands in the first screenful at rest. **(b)** Skip it — claim 3 is one tap from rest on Ask and two on Record, and the shelf gate is the more convincing artefact anyway.
*My read: (b), and reconsider only if Tier 1 and Tier 2 land early.*

**2. Priya's hero: engine-provision the card, or leave it?**
*Context:* she sees `SAFE TO SPEND ₹60,894` in reassuring green while paying 34.8% on ₹5,82,776. The structural fix is for `dailyplan.ts` to reserve the card's interest/minimum the way it reserves `Your plan this month`, so the pot actually accounts for the most expensive thing in her life. The alternative is the current spec: the hero stays a fact, and severity is carried by the action card's `URGENT` chip and danger rule.
**(a)** Engine change — the honest number, but it moves the figure the whole demo quotes. **(b)** Card treatment only — cheaper, zero risk to the figure, but a bank reviewer may still say "your system does not know when a customer is in trouble."
*This is the one place where the audit and the rumination literature genuinely conflict and neither source tells us where the line sits. It needs your call.*

**3. Is the instrument rail discoverable enough?**
The live date in the rail is the only cue that the clock exists. If a judge never finds `Move time`, the recompute — the most persuasive ten seconds in the build, and the demonstration of claim 1 — never happens. **(a)** Ship as specified and run a ten-minute hallway test with someone who has not seen the app. **(b)** Add a one-time 20px hint above the rail on the first Today paint. **(c)** Do both.
*Guess: (a) is probably enough, but that is a guess and it is cheap to test.*

**4. Vernacular.** `Snapshot.customer.language` is `hi-IN` for Sunil, on the wire, and the app is English-only. GO Mobile+ ships 10+ scripts, so judges will ask.
**(a)** Externalise the copy strings and demo one Hindi path for Sunil (real work, big win with an IDBI room). **(b)** Say plainly in the README and the pitch that i18n is scaffolded, not populated. **(c)** Do nothing and hope it does not come up.
*My read: (b) at minimum; (a) only if Tier 3 is not attempted.*

**5. `unexplainedShare` is 0 and `categorisedShare` is 1 on all three personas.**
**(a)** Fix the generator to emit a realistic unmatched tail so the honesty number is real. **(b)** Print the honest sentence — *"all matched, because this ledger was generated; under a live feed this line is where the gap shows"* — which is a stronger claim to a code reviewer and costs nothing. **(c)** Suppress the clause.
*My read: (b) for the demo, (a) if there is generator time.*

**6. The live avatar at the venue.** If the network cannot hold a Runway call inside a three-minute slot, the demo has to be designed around the refusal in text rather than around the call. Nothing in this spec depends on the live tier — the fallback ladder produces byte-identical refusals — but the pitch's first sentence does.
**(a)** Design the pitch around the refusal and treat the call as a bonus. **(b)** Design around the call with a rehearsed text fallback.
*My read: (a). A failed video call inside a three-minute slot consumes the entire demo.*

**7. Does the seed model Rohan's FD maturity when the clock advances?**
`extraAccounts[0]` is `{accountType: 'FD', curr
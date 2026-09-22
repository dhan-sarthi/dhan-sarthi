# Slice 08 — Credit, and the fixture that priced the demo customer as spotless

Status: built. When it landed the workspace was green — typecheck clean, 908 tests. Since the
rebuild on Cleo's components on 22 September 2026 the page is a pane on Home, beside Debt
(`/spend?pane=credit`), rendered from `apps/mobile/src/screens/CreditContent.tsx`; the `/credit`
route wraps the same component. The one acceptance criterion, screenshots at 375pt and 320pt, is
still open under Known gaps. Line references below were checked against the tree on 22 September
2026; paths beginning `app/` or `src/` are in `apps/mobile`.

## The fixture bug that came first

**Karan's ledger and Karan's liability record described two different customers.** His car
loan spec (`packages/fixtures/src/personas.ts:1054-1073`) set `returnedMonthsAgo: 6` and no
`dpd`. So the generator wrote `NACH RETURN CHGS ₹300` and, twelve days later,
`IMPS/…/LATE EMI ₹18,500` into his statement — and left `dpdStatus: 0` on the liability the
engine actually reads. Every figure derived from his liabilities priced the demo customer as
spotless while his own statement priced him as delinquent.

The fix is one field, `dpd: 12` (`:1072`). The comment above it was wrong in two ways and is
corrected in the same edit: it claimed the bounce "is what MISSED_REPAYMENT reads, and it is
visible in the ledger rather than asserted on the liability", but `derive.ts:596` is
`file.liabilities.some((l) => l.dpdStatus > 0)` and is ledger-blind; and it said "eleven days
later" where `generate.ts:354` is `day(emi.day + 12)`.

Nothing else moved. `generate.ts:1146` already forwards `dpd`, `asof.ts:143` already defaults
it, no narration changed, no calibration band moved, and his headline verdict is unchanged
because `evaluate` returns on the first match and `HIGH_INTEREST_DEBT` is `RULES[0]`.

**The test that should have caught it, widened.** `realism.test.ts`'s "charges for the mandate
that came back" hard-coded `SUNIL`, which is the whole reason Karan spent six months telling
two stories at once — the test stayed green because it never looked at him. It now loops over
every persona carrying a `returnedMonthsAgo` (`:419`), asserts the charge and the hand-paid
instalment per persona, and asserts that the same EMI carries a non-zero `dpd` (`:448-451`).
A loop over the condition rather than over a name is what makes the next persona to carry a
returned mandate arrive already checked. `packages/fixtures/src/credit.test.ts:161-183` asserts
the same agreement from the other end, both ways round: a return charge with no days past due is
the bug that shipped, and days past due with no return charge anywhere in the ledger is the
opposite one, and a customer whose statement cannot show what the screen asserts about him is
just as unanswerable at a branch counter.

## The contracts edit that is not optional

The first draft of this slice claimed `packages/contracts` needed no edit. It is written down
here because three reviewers caught it and because the next person adding a key to `Snapshot`
will reach for the same wrong conclusion.

`SnapshotSchema` is a plain `z.object`, not `.strict()`, so it **strips** what it does not
name. `apps/api/src/http/register.ts` zod-parses every response and ships `checked.data`. And
the parity assert at `packages/contracts/src/domain.ts:1636` is `Extends<CoreSnapshot,
Snapshot>` — core → wire — which stays green when core gains a key, because a core type with
an extra field still extends the narrower mirror. Put together: without a mirrored
`CreditFactsSchema` the engine computes `credit`, the store holds it, `meta.snapshotHash`
covers it, the typecheck is clean, every test is green — and no client is ever told.

So `CreditBlindSpotSchema`, `CreditComponentSchema` and `CreditFactsSchema` sit beside
`DebtFactsSchema`, and `credit: CreditFactsSchema` is named inside `SnapshotSchema` at
`:557`. No new `_Parity` row: the key rides inside `Snapshot`, which already has one, and the
comment above the line says so, so the next reader does not add a redundant one.
`domain.test.ts:252-294` is the five-case block that fails on the day this drifts.

## Credit

Cleo AI's Request tab pairs its cash advance with a Credit score pane: a bureau score on a
300–850 arc ("Score provided by Equifax"), a score simulator with a slider, and a button to show
or track your score (`docs/assets/cleo/credit-score-*.png`). The category's own screens in India
are all one shape: a 300–900 figure on an arc with a carousel of loans under it. Exactly one of
those two things can be built honestly by a bank that has not pulled a bureau report, and it is
not the figure. So the hero is 0–100 from the IDBI file alone, the card directly under it says
it is not a credit score, the bureau's gauge is drawn properly and left empty — and the scroll
ends on where this goes and what to ask, rather than on offers.

One body, two doors. Home's Credit pane and the `/credit` route both render `CreditContent`, so
the two cannot drift into two screens. It returns its sections as siblings and each door brings
its own frame: the pane sits in Home's scroll under the pills, the route in a `Screen` with a
back chevron, the title "Credit" and a line under it (`app/credit.tsx`), which also owns the
first read and a read that failed.

| Section | Holds |
|---|---|
| The figure | On a light card, the conduct figure standing in Cleo's glow (`src/ui/ScoreGlow.tsx`) at the `figure` type role, 72/72, with "out of N" under it because the denominator moves; a chip, "From your IDBI file"; and an ⓘ that opens the working |
| What it means | The one ink card, directly under the figure: a headline — the cap where it fired, "This is costing you" over a card's monthly interest, else the band caption, or "Nothing to judge yet" with nothing borrowed — then *"This is not a credit score."*, and that no bureau made it, no lender sees it and it is not on the 300–900 scale |
| What a credit bureau sees | The industry's own gauge, drawn at full width and left empty ("Not pulled"), with three lines of evidence underneath for why it is empty |
| What a score is worth | The four bureau bands as `Chips`, nothing selected until the customer selects one; home and car rates for the band picked; and what the band decides about a card, which in India is never the rate |
| What moves this | Seven rows, three judged and four blind, interleaved by a bureau's own weight, each opening to what it means, what to do, and the one or two things in the app that act on it |
| Get your free report | The free annual report from each of the four bureaus, opened on the bureau's own site; nothing here asks a bureau about the customer |
| Where this goes | The payoff plan, only where expensive debt holds the figure down; the shelf this figure gates; then questions for Uday |

`figure` is the eighth type role, argued into `src/ui/Text.tsx:24-32` for this one number:
`display` set in the glow filled a quarter of it and read as a caption.

### Where it lives: a pane since 22 September 2026

The first build made credit a pushed route, not a sixth tab or a new pane, on three arguments.
Protect leads with the cheapest thing in the catalogue, and a credit screen two inches from
PMJJBY at ₹436/yr reads as bait. Home had already added a pane once, judged it a second drawing
of something that belonged elsewhere, and taken it out. And the pill strip was a horizontal
`ScrollView` with no `scrollTo`, so overflow was silent.

The rebuild on 22 September 2026 reversed it. Credit is Home's fourth pane, beside Debt, the way
Cleo's Request tab pairs "Cash advance" with "Credit score" (`app/(tabs)/spend.tsx:3-8`). Two of
the three arguments had gone. The pane that was taken out, `savings`, was a second drawing of the
roadmap's goal card and moved to Grow (`spend.tsx:21-23`); credit is not a second drawing of
anything on Home. The pills now scroll the selected one into view and fade at the edges, and trim
their sides below 360pt so four fit a 320pt phone (`src/ui/Pills.tsx:20-33`). The first argument
still holds, and credit stays off Protect.

**The ways in.** A page nobody finds is not a page, so it has four:

- **The Credit pill on Home**, `/spend?pane=credit`, which any link can name, cold or with the
  tab already mounted.
- **Home's Debt pane.** Where a repayment is missed, the card that leads the pane — "Clear the
  missed repayment first", with how many days late — carries "See what IDBI can see", which
  switches to the Credit pane (`spend.tsx:1156-1175`). Its words are "a mark on your IDBI file",
  never "your credit file": a card that spoke of the bureau file would be contradicted by the
  page it opens.
- **The gate sheet's refusal.** `GateSheet.tsx:532-543` is a text link under the refusal,
  guarded on `ruleId === 'MISSED_REPAYMENT'`. `suitability.ts:138-140` tells the customer their
  missed repayment is worth more than any investment right now and then terminates nowhere; this
  is the surface behind that sentence. The sheet closes before the pane opens (`leaveFor`,
  `GateSheet.tsx:508-513`), because a route opened behind a presented sheet arrives underneath
  it.
- **Plan's arrears card.** The missed instalment is pinned above the route under "Before anything
  else" rather than numbered in it (`app/(tabs)/plan.tsx:362-367`), and its card carries the link
  (`linksFor`, `plan.tsx:689-697`). The stage is found by `isArrears` (`plan.tsx:766-768`):
  `stage.kind === 'clear_debt' && stage.targetAmount === 0 && snapshot.debt.missedRepayment`.
  `targetAmount === 0` is what tells the arrears stage from a payoff stage, because
  `roadmap.ts:540` is the only `clear_debt` push with a zero target — and the boolean is read
  again here rather than inferred from the stage's presence, so the card and the page it opens
  cannot describe different customers.

The gate sheet and Plan carry the same sentence, *"See what your IDBI file actually shows"*: two
entrances onto one refusal should not read as two different places. Both open the pane. No link
in the app opens `/credit` by path any more; the route is there for a URL.

## The figure, published

`conductScore` is 0–100 from the IDBI file alone (`packages/core/src/credit.ts`). Three
components, weighted **50 · 30 · 20** (`CONDUCT_WEIGHTS`): repayment is half of it because it is
the only one the suitability gate refuses outright on and the weighting has to agree with the
gate; cost is 30 because `HIGH_INTEREST_DEBT` is `RULES[0]` and the component must be able to
reach zero on its own; load is 20, the only one no rule in the book refuses on, so it may shade
the figure and may not decide it. Deliberately not a bureau's 35/30/25/20, which are unpublished
aggregator estimates.

- **Repayment** runs off `DPD_BUCKETS` — 0, 1–30, 31–60, 61–90, 90+ at shares 1, 0.4, 0.2, 0.1,
  0 — the RBI SMA/NPA boundaries every Indian lender already files against. A bucket table and
  not a curve, because a bank reports a bucket and a smooth function over days would be
  arithmetic nobody upstream performs.
- **Cost** is full below `RATE_CLEAN_BELOW` (18%), ramps linearly to zero at the gate's own
  `highInterestThreshold` (24, off `DeriveOptions`, never restated), and stays there.
- **Load** is the FOIR ramp: full at or below `FOIR_CLEAN_BELOW` (0.40), zero at or above
  `FOIR_ZERO_AT` (0.60). It is the one component on the page that is the number a lender
  actually prices.
- **The cap** is `DELINQUENCY_CAP`, 64 — the ceiling of the band below "One thing to tidy",
  which is `CONDUCT_BANDS[1].min − 1`. It is written as a literal with that derivation in the
  docblock beside it rather than chosen, which is the difference between a rule and a magic
  number. A live delinquency may not lift the figure into a band whose caption contradicts a
  gate that is refusing the customer everything. The cap and the band floors are percentages of
  `outOf`, not points: `delinquencyCeiling(outOf)` floors `outOf × 64 / 100`, and `conductBand`
  divides by `outOf` before it looks a band up (`credit.ts:162-203`, `:269-276`), so a figure out
  of 80 is judged against 80.

A component the file cannot answer for is dropped from the numerator **and** the denominator,
never weighted at zero — `derive.ts:560-572`'s rule for a ratio with an unknown denominator,
applied to a composite. Repayment is always readable; cost is not where any liability's rate
came back as zero, and load is not where no income is observable or an instalment was unread
(`credit.ts:355-408`). That is why `outOf` is on the wire beside the score, and why the page
prints it: 80 out of 80 is a different statement from 80 out of 100.

The four personas are pinned in `packages/fixtures/src/credit.test.ts:43-86`, component by
component, because a total that still comes to 70 out of a repayment component that has quietly
halved and a cost component that has quietly doubled is the failure a single total cannot see.
That table is the published figure, and it is quoted here, condensed, rather than restated so the
two cannot drift:

```ts
const EXPECTED = [
  { spec: ROHAN, earned: { repayment: 50, cost: 30, load: 20 },
    conductScore: 100, capped: false, caption: 'Nothing wrong here' },
  { spec: PRIYA, earned: { repayment: 50, cost: 0, load: 20 },
    conductScore: 70, capped: false, caption: 'One thing to tidy' },
  { spec: SUNIL, earned: { repayment: 20, cost: 30, load: 20 },
    conductScore: DELINQUENCY_CAP, capped: true, caption: 'This is costing you' },
  { spec: KARAN, earned: { repayment: 20, cost: 0, load: 20 },
    conductScore: 40, capped: false, caption: 'This is costing you' },
]
```

Sunil earns 70 and is published at 64: his only fault is the missed instalment, so without the
cap he would read "one thing to tidy" while the gate refuses him every product on the shelf for
exactly that instalment. Karan — the demo customer — has both faults at once, so the cap has
nothing to do and 40 is what he earned. That row only reads this way because of the `dpd: 12`
above. Every figure is reproducible from the payload: `components[]` is on the wire, and the
one licensed gap between the working and the published number is the cap, asserted as a gap.
The ⓘ on the figure does the same sum in front of the customer — each part as "earned of
weight", then the total, which for Sunil reads "20 + 30 + 20 = 70, held at 64 out of 100 until
the late repayment clears" (`Working`, `CreditContent.tsx:676-729`).

## Decisions taken here

- **0–100, never 300–900.** A number on the bureau's own scale *is* a bureau score in an Indian
  customer's head whatever the label above it says, and "credit score" is a term of art under
  CICRA 2005 produced by a licensed CIC. No 300–900 figure is ever given as the customer's: the
  numerals appear only as the empty gauge's two end labels and in the two sentences that name
  the bureau scale to say this is not on it, and the band picker offers names, never ranges
  (`BAND_OPTIONS`, `CreditContent.tsx:186-190`). The disclaimer sits in the ink card directly
  under the figure, above the fold, because a disclaimer at the foot of a scroll is a disclaimer
  nobody reads. Until 22 September it sat inside the figure's own card; the rebuild gave the
  figure a light card of its own, because warm light fading over ink passes through olive and
  a light plate inside the ink card was a card in a card (`CreditContent.tsx:10-21`).

- **The bureau's own gauge is drawn correctly, at full width, and left empty, because the
  bank's own bureau call comes back empty.** This is the integration, not an affectation, and
  every leg of it was read rather than assumed. IDBI's sandbox declares the pull as service 408,
  `fetchCibilScoretest`, `tier: 'bureau'`, with its own side effect on the operation — *"A real
  CIBIL enquiry against the applicant, and it needs bureau credentials"*
  (`apps/api/src/adapters/idbi-sandbox/api/operations.ts:146-156`). This build was never issued
  them. The body is not a mystery either: operation 433 returns the same block without spending
  a pull, and the captured `cibilResponse` in
  `idbi-capture-20260909-011810/433-fetchLoanInterestRatestest-s1.response.json` comes back
  `"isSuccess": false`, `"errorCode": "100"`, `"segmentError": "Missing Required Field.Either
  Identifier or Telephone is mandatory."` — with **no score value anywhere in it**
  (`…/api/schemas.ts:784-789` and `docs/integration/idbi-sandbox.md:170-174` both already say
  the pull was never made). *"The gauge is empty because that is what comes back"* is a stronger
  sentence than "we decided not to look", and it is the one thing on this page that a competitor
  holding a bureau licence could not have written.

- **No "Check my score", and no primary button on the page.** Cleo's own card ends on one —
  "Show me my score", "Track changes to my score". Ours could not do anything, and a dead
  primary on a page whose whole subject is honesty is a joke at the customer's expense. Wired,
  it would not even be the reference's theatre: `…/api/transport.ts:185-187` refuses to serve a
  bureau call from memory — *"a cached credit pull is a credit pull somebody paid for and did
  not get"* — so the button is a consent moment that spends a real enquiry against a real person
  and writes a row into the hash-chained record. What the page offers instead is all real — the
  free reports, the payoff plan, the shelf this figure gates, and Uday
  (`CreditContent.tsx:34-40`) — and its two buttons, "Get your free report" and "See the payoff
  plan", are secondary. The scroll ends on links and questions, not on a call to action. The ⓘ
  sheet's "Got it" only closes the sheet.

- **The unknowns are engine output, not component copy.** `CreditBlindSpot` is a closed union
  of four, `credit.blind` is what the page maps over, and `BLIND` (`CreditContent.tsx:115-154`)
  is a total `Record` across the union — so a fifth blind spot added in core is a compile error
  in the page rather than a row that silently fails to draw. When a pull lands the array shrinks
  and the list shortens with no edit here. The judged rows are one per `CreditComponentId` for
  the same reason: the list once shipped without `load`, so a fifth of the figure moved with
  nothing naming it.

- **The blind rows are interleaved with the judged ones, and the heaviest of the four sits
  between the first two verdicts** — repayment, utilisation, cost, load, then the other three
  (`CreditContent.tsx:451-452`). Collecting the admissions at the bottom, or worse under a "what
  we don't know" heading, turns the gap into a footnote — the exact failure this page exists to
  avoid. Reading an admission *before* the second verdict is what teaches a customer the
  boundary of the product in one scroll. Every blind row's "What to do" is a real thing the
  customer can do outside this app, and its action opens the four bureaus' free reports: a row
  that admits a limit and stops is a row that should not be here.

- **No slider.** Cleo's simulator is one ("Drag the slider to see what each score means"). The
  band picker is `Chips`, which already carries the fill and border interpolation, the 46pt
  target, `radiogroup` semantics and the selection haptic — and whose `value: T | null` is
  exactly the right shape, because nothing is selected until the customer picks, which is the
  truth about a band we cannot see. The four bands wrap rather than scroll. A `Gesture.Pan`
  would have been the app's first, against a single `GestureHandlerRootView` at
  `app/_layout.tsx:40`; there is still none.

- **`bg-ink`, not `bg-hero`.** The ink card under the figure is the only saturated surface on
  the page; every other section is a white `Card`. A second green card carrying a second big
  number, one pill from Debt, is the second-drawing failure that moved Home's `savings` pane to
  Grow (`spend.tsx:21-23`).

- **Nothing was added anywhere else when the page was built, and each was checked rather than
  assumed.** No new colour token — `packages/design` did not change, and `Chip` already carried
  `danger`. No new route: `credit` is a key on the snapshot the API already returns. No tenth
  suitability rule — `HIGH_INTEREST_DEBT` and `MISSED_REPAYMENT` already refuse every
  non-protection product on exactly these two axes, and a tenth would mean rewording every place
  the app says nine — among them `GateSheet.tsx:329-330`, `:427`, `:599`,
  `ActionCard.tsx:360-361`, `protect.tsx:628` and `(onboarding)/welcome.tsx:70` — for a rule that
  decides nothing. No fourth avatar tool, and no new `ActionKind`, which reaches a CHECK
  constraint on the hash-chained, append-only `app.audit_records`
  (`apps/api/migrations/0006_app_engine.sql:179`). Since then the 22 September rebuild gave the
  page one design token, the `figure` type role (`packages/design/tokens.json`), and
  `ROUTES.length` went from 51 to 52 for the avatar's prepare route, not for credit
  (`packages/contracts/src/registry.test.ts:90-92`).

## Copy that changed during the build

Five strings in the copy deck did not survive contact with the data, and the screen was right
rather than the deck. Recorded here because the deck is otherwise the record. Most have moved
again since; each item says what ships now.

- **The list's lede was arithmetically broken.** "Four things a bureau weighs… we cannot see the
  other two — so all six are on one list" counts four, two and six in one sentence. It first
  shipped as a fixed sentence about six rows, two judged and four blind. It is now counted off
  the working, because the list grew a third judged row and an unreadable rate moves a row from
  one side to the other: *"3 of these 7 we can judge from your IDBI file; 4 we can't see."*
  (`CreditContent.tsx:454-460`).
- **The cost row's rupee figure is not `revolvingBalance`.** `highestRate` is worst-across-file,
  so pairing it with the revolving balance alone prints "9.15% on ₹0" for a customer whose only
  borrowing is a term loan — two of the four personas. It reads the revolving balance where there
  is a card and the instalment balance where there is not (`CreditContent.tsx:277-283`).
- **The cost row's closing clause is conditional.** The deck's *"…which is why the gate refuses
  to recommend anything until it is gone"* is true only while the gate is actually refusing on
  this rate; printed under a loan at 9.15% it is the page making a claim about the app's own
  rules that a judge disproves by opening the shelf. It is appended only when the cost component
  earns zero, which is exactly when the gate's own threshold has been reached. Since 22 September
  it reads *"Until it's gone, no investment is recommended."* — no investment rather than
  nothing, because `HIGH_INTEREST_DEBT` never blocks cover (`CreditContent.tsx:386-389`).
- **The cost row needed a no-borrowing arm.** "0% on ₹0" beside a hero that has just said there
  is no borrowing on the file is the page contradicting itself in the one state it was built to
  handle gracefully. It reads *"You're not carrying any borrowing"*.
- **The three bureau fact lines carry the evidence, not the decision.** The deck's versions said
  *"IDBI can pull it. We have not."* The first shipped lines said the call is built and needs
  credentials we were not given. Since 22 September they say it in a customer's words, with no
  credentials, no service codes and no "demo": *"Empty until IDBI's bureau link is switched
  on."*, *"A request today comes back with no score."* and *"We'll pull your report only with
  your go-ahead. Each pull is a real enquiry on your record."* (`CreditContent.tsx:573-580`).
  408 and 433 live in the page's header comment and in this document.

## Known gaps

- **The layout acceptance criterion is still open.** This note first argued it by arithmetic:
  the bureau card at ≈496pt against ~724pt of scroll on a 375 × 812 viewport. The 22 September
  rebuild redrew that card — a heading where the eyebrow was, one sentence where there were
  three lines, a plate beside each fact line — so the sum no longer describes it, and no new
  measurement has been recorded. The criterion stands: a screenshot at 375pt with the arc and all
  three fact lines visible together, and one at 320pt to confirm neither cap clips. The phase-2
  kit's two captures (`docs/submission/phase-2/assets/screens/04-home-credit.png` and
  `20-credit-detail.png`) do not settle it: they are 390pt wide, they show an earlier cut of the
  rebuild with the glow inside the ink card, and neither reaches the fact lines.
- **The bureau pull needs credentials this build was not issued**, so the arc's progress stroke
  has never been drawn against real data. The code path exists and is exercised only by `value`
  being non-null, which today it never is (`CreditContent.tsx:564`).
- **A `dpdStatus` read off a contract never decays** (`asof.ts:143` copies it whatever the
  date). A figure plotted over the time machine can only fall and never recover, so a judge
  advancing the clock past a bounce still sees it: Sunil stays capped at 64 and Karan keeps 20
  of 50 for repayment. Making it age is a `LiabilityContract` change, not a fixtures one.

Closed since this note was first written:

- **Stage rows go somewhere.** The gap logged in slice 03 is closed: since 22 September 2026
  every stage kind links to the screen where its step is done, and to Uday for the reasoning
  (`linksFor`, `plan.tsx:686-760`). The arrears stage is the pinned card described above.
- **The late-repayment row no longer hard-codes "twelve".** It reads `credit.dpdDays`
  (`CreditContent.tsx:351-358`), so a persona 45 days late would read 45; it already did when
  the app entered git on 21 September.

## Next

**What a credentialled 408 turns on, and what it touches.** The credentials arrive as IDBI
bureau-tier auth on the sandbox adapter; `operations.ts:146-156` already declares the operation
and its side effect, and `transport.ts:185-187` already refuses to cache it, so the transport
needs nothing. A new route — `POST /api/v1/credit/pull`, additive, `ROUTES.length` 52 → 53 —
takes the consent, calls 408, and writes an advice record so the enquiry is on the chain like
every other thing this app does on a customer's behalf. `CibilScoreResponse` in
`…/api/schemas.ts:784-789` stops being marked unconfirmed. `CreditFacts` grows the pulled score
and the date it was pulled, `credit.blind` shrinks as each bureau field becomes readable, and
`CreditFactsSchema` mirrors both. On the page the bureau card grows a `Button`, `Arc` is passed a
non-null `value` and draws the progress stroke it already has, and the list shortens by itself
because it maps over `credit.blind`. **Nothing else in `CreditContent.tsx` changes** — which is
the test of whether this is the honest version of the real screen or a different screen wearing
its clothes.

Before any of that: the screenshots. The bureau card has to be measured again, only a 375pt and
a 320pt capture settle it, and the `Arc` is the drawing the whole page rests on.

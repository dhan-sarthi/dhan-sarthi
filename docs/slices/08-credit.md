# Slice 08 — Credit, and the fixture that priced the demo customer as spotless

Status: built, with all three entrances in. Workspace green — typecheck clean, 908 tests
passing. Not yet screenshotted at 375pt and 320pt, which is this card's one acceptance
criterion and is still open under Known gaps.

## The fixture bug that came first

**Karan's ledger and Karan's liability record described two different customers.** His car
loan spec (`packages/fixtures/src/personas.ts:1058-1068`) set `returnedMonthsAgo: 6` and no
`dpd`. So the generator wrote `NACH RETURN CHGS ₹300` and, twelve days later,
`IMPS/…/LATE EMI ₹18,500` into his statement — and left `dpdStatus: 0` on the liability the
engine actually reads. Every figure derived from his liabilities priced the demo customer as
spotless while his own statement priced him as delinquent.

The fix is one field, `dpd: 12`. The comment above it was wrong in two ways and is corrected
in the same edit: it claimed the bounce "is what MISSED_REPAYMENT reads, and it is visible in
the ledger rather than asserted on the liability", but `derive.ts:596` is
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
returned mandate arrive already checked. `packages/fixtures/src/credit.test.ts` asserts the
same agreement from the other end, both ways round: a return charge with no days past due is
the bug that shipped, and days past due with no return charge anywhere in the ledger is the
opposite one, and a customer whose statement cannot show what the screen asserts about him is
just as unanswerable at a branch counter.

## The contracts edit that is not optional

The first draft of this slice claimed `packages/contracts` needed no edit. It is written down
here because three reviewers caught it and because the next person adding a key to `Snapshot`
will reach for the same wrong conclusion.

`SnapshotSchema` is a plain `z.object`, not `.strict()`, so it **strips** what it does not
name. `apps/api/src/http/register.ts` zod-parses every response and ships `checked.data`. And
the parity assert at `packages/contracts/src/domain.ts:1547` is `Extends<CoreSnapshot,
Snapshot>` — core → wire — which stays green when core gains a key, because a core type with
an extra field still extends the narrower mirror. Put together: without a mirrored
`CreditFactsSchema` the engine computes `credit`, the store holds it, `meta.snapshotHash`
covers it, the typecheck is clean, every test is green — and no client is ever told.

So `CreditBlindSpotSchema`, `CreditComponentSchema` and `CreditFactsSchema` sit beside
`DebtFactsSchema`, and `credit: CreditFactsSchema` is named inside `SnapshotSchema` at
`:557`. No new `_Parity` row: the key rides inside `Snapshot`, which already has one, and the
comment above the line says so, so the next reader does not add a redundant one.
`domain.test.ts:192-232` is the five-case block that fails on the day this drifts.

## Credit

Cleo has no credit screen, and the category's own are all one shape: a 300–900 figure on an arc
with a carousel of loans under it. Exactly one of those two things can be built honestly by a
bank that has not pulled a bureau report, and it is not the figure. So the hero is 0–100 from
the IDBI file alone, it says so inside its own card, the bureau's gauge is drawn properly beside
it and left empty — and the scroll ends on the gate rather than on offers.

A pushed route and not a sixth tab or a new pane: Protect's argument is that it leads with the
cheapest thing in the catalogue, and a credit screen two inches from PMJJBY at ₹436/yr reads as
bait; Spend already added a fourth pane once, judged it a second drawing of something that
belonged elsewhere, and deleted it (`spend.tsx:8-13`); and `Pills.tsx:43-52` is a horizontal
`ScrollView` with no `ref` and no `scrollTo`, so overflow is silent and Grow's five pills already
push `Invest` off-screen at 375pt. There is no tab-bar entry for credit, which is exactly why a
link is the right affordance and a pill is not.

| Section | Holds |
|---|---|
| The hero | The conduct figure, 0–100 from the IDBI file alone, with the denominator beside it because the denominator moves; the band caption; the cap sentence when the cap has fired; and *"This is not a credit score"* inside the same card as the figure it qualifies, not in a footnote under it |
| What a credit bureau sees | The industry's own gauge, drawn at full size as a peer of the hero and left empty, with three lines of evidence underneath for why it is empty |
| What a score is worth | The four bureau bands as `Chips`, nothing selected until the customer selects it; home and car rates for the band picked; and what the band decides about a card, which in India is never the rate |
| What moves this | Six rows, two judged and four blind, interleaved by a bureau's own weight, identical shape at identical size, each opening to "What this means" and "What to do" |
| The notes and the gate | The free annual report from each of the four bureaus; that nothing on this page touches the bureau file; and the door to the shelf, where every row goes through a gate that can refuse it |

**The three entrances**, because a pushed route with no door is a screen nobody finds:

- `(tabs)/spend.tsx:359` — a `CreditStrip` under the OUTSTANDING hero in the Debt pane, built in
  `SourceStrip.tsx:38-54`'s shape rather than by parameterising it, since that component is about
  custodians. This is the demo path and the one most reviewers reach. Its late headline says *"A
  late repayment on your IDBI file"*, never "on your credit file" — a strip that claims the bureau
  file has contradicted the screen behind it before the screen opens.
- `GateSheet.tsx:185-199` — a text link under the refusal, guarded on `ruleId ===
  'MISSED_REPAYMENT'`. `suitability.ts:137-141` tells the customer their missed repayment is worth
  more than any investment right now and then terminates nowhere; this is the surface behind that
  sentence. `onClose()` fires before the push, because a route pushed behind a presented `Modal`
  arrives underneath it.
- `(tabs)/plan.tsx:165-171` — `StageRow` gains `onCredit`, passed only where
  `stage.kind === 'clear_debt' && stage.targetAmount === 0 && snapshot.debt.missedRepayment`.
  `targetAmount === 0` is what tells the arrears stage from a payoff stage, because
  `roadmap.ts:540` is the only `clear_debt` push with a zero target — and the boolean is read
  again here rather than inferred from the stage's presence, so the row and the screen it opens
  cannot describe different customers.

Both text links carry the same sentence, *"See what your IDBI file actually shows"*: two
entrances onto one refusal should not read as two different places.


## The figure, published

`conductScore` is 0–100 from the IDBI file alone. Three components, weighted **50 · 30 · 20**
(`CONDUCT_WEIGHTS`): repayment is half of it because it is the only one the suitability gate
refuses outright on and the weighting has to agree with the gate; cost is 30 because
`HIGH_INTEREST_DEBT` is `RULES[0]` and the component must be able to reach zero on its own;
load is 20, the only one no rule in the book refuses on, so it may shade the figure and may not
decide it. Deliberately not a bureau's 35/30/25/20, which are unpublished aggregator estimates.

- **Repayment** runs off `DPD_BUCKETS` — 0, 1–30, 31–60, 61–90, 90+ at shares 1, 0.4, 0.2, 0.1,
  0 — the RBI SMA/NPA boundaries every Indian lender already files against. A bucket table and
  not a curve, because a bank reports a bucket and a smooth function over days would be
  arithmetic nobody upstream performs.
- **Cost** is full below `RATE_CLEAN_BELOW` (18%), ramps linearly to zero at the gate's own
  `highInterestThreshold` (24, off `DeriveOptions`, never restated), and stays there.
- **Load** is the FOIR ramp: full at or below `FOIR_CLEAN_BELOW` (0.40), zero at or above
  `FOIR_ZERO_AT` (0.60). It is the one component on the screen that is the number a lender
  actually prices.
- **The cap** is `DELINQUENCY_CAP`, 64 — the ceiling of the band below "One thing to tidy",
  which is `CONDUCT_BANDS[1].min − 1`. It is written as a literal with that derivation in the
  docblock beside it rather than chosen, which is the difference between a rule and a magic
  number. A live delinquency may not lift the figure into a band whose caption contradicts a
  gate that is refusing the customer everything.

A component the file cannot answer for is dropped from the numerator **and** the denominator,
never weighted at zero — `derive.ts:560-572`'s rule for a ratio with an unknown denominator,
applied to a composite. That is why `outOf` is on the wire beside the score, and why the hero
prints it: 80 out of 80 is a different statement from 80 out of 100.

The four personas are pinned in `packages/fixtures/src/credit.test.ts`, component by component,
because a total that still comes to 70 out of a repayment component that has quietly halved and
a cost component that has quietly doubled is the failure a single total cannot see. That table
is the published figure, and it is quoted here rather than restated so the two cannot drift:

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

## Decisions taken here

- **0–100, never 300–900.** A number on the bureau's own scale *is* a bureau score in an Indian
  customer's head whatever the label above it says, and "credit score" is a term of art under
  CICRA 2005 produced by a licensed CIC. No 300–900 numeral appears anywhere on the screen
  except the two flat end labels under the empty gauge's caps. The disclaimer is inside the hero
  card, on the same surface as the figure, because a disclaimer at the foot of a scroll is a
  disclaimer nobody reads.

- **The bureau's own gauge is drawn correctly, at full size, as a peer of the hero — and left
  empty, because the bank's own bureau call comes back empty.** This is the integration, not an
  affectation, and every leg of it was read rather than assumed. IDBI's sandbox declares the
  pull as service 408, `fetchCibilScoretest`, `tier: 'bureau'`, with its own side effect on the
  operation — *"A real CIBIL enquiry against the applicant, and it needs bureau credentials"*
  (`apps/api/src/adapters/idbi-sandbox/api/operations.ts:146-156`). This build was never issued
  them. The body is not a mystery either: operation 433 returns the same block without spending
  a pull, and the captured `cibilResponse` in
  `idbi-capture-20260909-011810/433-fetchLoanInterestRatestest-s1.response.json` comes back
  `"isSuccess": false`, `"errorCode": "100"`, `"segmentError": "Missing Required Field.Either
  Identifier or Telephone is mandatory."` — with **no score value anywhere in it**
  (`…/api/schemas.ts:785-789` and `docs/integration/idbi-sandbox.md:149-153` both already say
  the pull was never made). *"The gauge is empty because that is what comes back"* is a stronger
  sentence than "we decided not to look", and it is the one thing on this screen that a
  competitor holding a bureau licence could not have written.

- **There is no primary button anywhere on this screen, and that is the decision rather than an
  omission.** The obvious card wants a "Check my score" under the gauge. It could not do
  anything, and a dead primary on a screen whose whole subject is honesty is a joke at the
  customer's expense. Wired, it would not even be the reference's theatre: `…/api/transport.ts:183`
  refuses to serve a bureau call from memory — *"a cached credit pull is a credit pull somebody
  paid for and did not get"* — so the button is a consent moment that spends a real enquiry
  against a real person and writes a row into the hash-chained record. The consequence is that
  the whole scroll ends on a link and not a call to action, which is stated in the screen's
  header comment rather than left for a reader to notice.

- **The unknowns are engine output, not component copy.** `CreditBlindSpot` is a closed union of
  four, `credit.blind` is what the screen maps over, and `BLIND` in `credit.tsx` is a total
  `Record` across the union — so a fifth blind spot added in core is a compile error in the
  screen rather than a row that silently fails to draw. When a pull lands the array shrinks and
  the list shortens with no edit here.

- **The blind rows are interleaved with the judged ones, and the heaviest of the four sits
  between the two verdicts.** Collecting the admissions at the bottom, or worse under a "what we
  don't know" heading, turns the gap into a footnote — the exact failure this screen exists to
  avoid. Reading an admission *before* the second verdict is what teaches a customer the boundary
  of the product in one scroll. Every blind row's "What to do" is a real thing the customer can
  do outside this app: a row that admits a limit and stops is a row that should not be here.

- **No slider.** The band picker is `Chips`, which already carries the fill and border
  interpolation, the 46pt target, `radiogroup` semantics and the selection haptic — and whose
  `value: T | null` is exactly the right shape, because nothing is selected until the customer
  picks, which is the truth about a band we cannot see. A `Gesture.Pan` would have been the
  app's first, against a single `GestureHandlerRootView` at `app/_layout.tsx:12`.

- **`bg-ink`, not `bg-hero`.** Spend's Debt hero is `bg-hero` / `bg-danger-soft` with a
  `Count role="display"` in it, and a second saturated green card carrying a second big number
  one tap away is the second-drawing failure that got the `savings` pane deleted
  (`spend.tsx:8-13`). This scroll carries exactly one saturated card against four white ones.

- **Nothing was added anywhere else, and each was checked rather than assumed.** No new colour
  token — `packages/design` does not change, and `Chip` already carried `danger`. No new route:
  `ROUTES.length === 51` does not move, and a key added to a response the API already returns is
  the additive half of the API rule. No tenth suitability rule — `HIGH_INTEREST_DEBT` and
  `MISSED_REPAYMENT` already refuse every non-protection product on exactly these two axes, and a
  tenth would break `evaluate`'s PASS string, `GateSheet.tsx:164`, `:131` and `record.tsx:10` for
  a rule that decides nothing. No fourth avatar tool and no new `ActionKind`; the latter is nine
  edits including a CHECK constraint on a hash-chained append-only table.

## Copy that changed during the build

Five strings in the copy deck did not survive contact with the data, and the screen is right
rather than the deck. Recorded here because the deck is otherwise the record.

- **The list's lede was arithmetically broken.** "Four things a bureau weighs… we cannot see the
  other two — so all six are on one list" counts four, two and six in one sentence. It ships as
  *"Six things decide how you borrow. We can judge two of them from your file, and we cannot see
  the other four — so all six are on one list, at the same size."*
- **The cost row's rupee figure is not `revolvingBalance`.** `highestRate` is worst-across-file,
  so pairing it with the revolving balance alone prints "9.15% on ₹0" for a customer whose only
  borrowing is a term loan — two of the four personas. It reads the revolving balance where there
  is a card and the instalment balance where there is not.
- **The cost row's closing clause is conditional.** *"…which is why the gate refuses to recommend
  anything until it is gone"* is true only while the gate is actually refusing on this rate.
  Printed under a loan at 9.15% it is the screen making a claim about the app's own rules that a
  judge disproves by opening the shelf. It is appended only when the cost component earns zero,
  which is exactly when the gate's own threshold has been reached.
- **The cost row needed a no-borrowing arm.** "0% on ₹0" beside a hero that has just said there
  is no borrowing on the file is the screen contradicting itself in the one state it was built to
  handle gracefully.
- **The three bureau fact lines carry the evidence, not the decision.** The deck's versions said
  *"IDBI can pull it. We have not."* The shipped lines say the call is built and needs credentials
  we were not given, that without them it comes back refused with no score anywhere in it, and
  that a pull is a real enquiry we will not spend to fill a demo. No internal service code reaches
  a customer string — 408 and 433 live in the screen's header comment and in this document.

## Known gaps

- **`docs/slices/03-plan.md:66` is only half closed.** The `StageRow` link lands on the arrears
  stage alone — `stage.kind === 'clear_debt' && stage.targetAmount === 0 && missedRepayment`,
  the one `clear_debt` push `roadmap.ts:540` raises with a zero target. Every other stage row
  still goes nowhere, so the logged gap stands for the rest of them.
- **The layout acceptance criterion is arithmetic, not a screenshot.** The bureau card measures
  eyebrow 15 + `mt-lg` 16 + arc block ~167 (144 of drawing, plus the 8pt cap bulge and the chord
  label) + `mt-lg` 16 + headline 24 + `mt-xs` 4 + body ~66 + `mt-lg` 16 + three two-line fact
  lines ~124 + `py-xl` 48 ≈ 496pt, against ~724pt of scroll on a 375 × 812 viewport. That clears
  it with room, but **the card has not been shot yet**: it needs a screenshot at 375pt with the
  arc and all three `check` lines visible together, and one at 320pt to confirm neither cap clips.
- **The bureau pull needs credentials this build was not issued**, so the arc's progress stroke
  has never been drawn against real data. The code path exists and is exercised only by `value`
  being non-null, which today it never is.
- **The late-repayment row's copy is coupled to the fixtures.** *"settled by hand twelve days
  later, and your file records twelve days past due"* hard-codes "twelve" twice while
  `credit.dpdDays` is live beside it. It is correct today — both personas carrying
  `returnedMonthsAgo` carry `dpd: 12`, and the widened `realism.test.ts` loop now asserts the
  pairing exists (though it asserts non-zero, not twelve) — but a persona with `dpd: 45` would
  render a sentence contradicting the field it describes. It is left verbatim rather than
  interpolated because interpolating one of the two prints "twelve days later … 45 days past due",
  which is worse than either. Both halves have to move together or neither does.
- **A `dpdStatus` read off a contract never decays.** A figure plotted over the time machine can
  only fall and never recover, so a judge advancing the clock past Karan's bounce still sees him
  capped. Making it age is a `LiabilityContract` change, not a fixtures one.

## Next

**What a credentialled 408 turns on, and what it touches.** The credentials arrive as IDBI
bureau-tier auth on the sandbox adapter; `operations.ts:146-156` already declares the operation
and its side effect, and `transport.ts:183` already refuses to cache it, so the transport needs
nothing. A new route — `POST /api/v1/credit/pull`, additive, `ROUTES.length` 51 → 52 — takes the
consent, calls 408, and writes an advice record so the enquiry is on the chain like every other
thing this app does on a customer's behalf. `CibilScoreResponse` in
`…/api/schemas.ts:785-789` stops being marked unconfirmed. `CreditFacts` grows the pulled score
and the date it was pulled, `credit.blind` shrinks as each bureau field becomes readable, and
`CreditFactsSchema` mirrors both. On the screen the bureau card grows a `Button`, `Arc` is passed
a non-null `value` and draws the progress stroke it already has, and the list shortens by itself
because it maps over `credit.blind`. **Nothing else on `credit.tsx` changes** — which is the test
of whether this is the honest version of the real screen or a different screen wearing its
clothes.

Before any of that: the screenshots. The bureau card's arithmetic says it fits; only a
375pt and a 320pt capture settle it, and the `Arc` is the drawing the whole screen rests on.

# Decision register

Written 2 Sep 2026, at the point where the ledger works and the engine is about to be built.

Every open decision, with **the default I am proceeding on** and **what it costs to reverse**.
Nothing here is blocked on an answer — the point is that work continues and the default can be
redirected. Read the "expensive to reverse" ones first; the rest are enum edits.

Marked **⚠ want your call** where I think my default is genuinely arguable.

---

## A. The Autopilot loop

### A1. Goal types — 5, not 12
`emergency_fund` · `debt_payoff` · `protection` · `wealth_target` · `retirement`

House, car, child's education and wedding are **not** separate types. They are a
`wealth_target` carrying a `purpose` label and a horizon. One roadmap calculation, twelve
labels — rather than twelve near-identical branches that drift apart the first time one is
edited. Retirement stays separate because it is the only one with a product answer nothing else
has (NPS) and a horizon long enough to change the maths.

*Reverse cost: trivial.*

### A2. The action vocabulary — 13, fixed
A model may never emit an action outside this list. Each one carries params, a suitability
verdict, and an execution result.

| Action | Why it is on the list |
|---|---|
| `open_sweep_in` | IDBI's own. The zero-risk answer to idle cash — no lock-in, no risk profile, no new KYC |
| `start_ssp` | IDBI's own recurring deposit. The correct first product for a Conservative customer |
| `move_to_liquid_fund` | Emergency buffer that beats a savings account |
| `start_sip` / `increase_sip` / `pause_sip` | The growth engine. `pause` matters: an advisor that cannot say "stop for two months" is not an advisor |
| `buy_term_cover` | Protection before investment |
| `enrol_pmjjby` | ₹436/year when term cover is unaffordable. Pays the bank nothing, which is the point |
| `buy_health_cover` | One admission undoes a decade of SIP |
| `pay_down_card` | At 34.8% — IDBI's own finance charge — this outranks every product on the shelf |
| `cancel_subscription` | Behavioural. Directly grows the surplus |
| `set_category_cap` | Behavioural. The daily loop's only real lever |
| `talk_to_rm` | The escape hatch that keeps the whole thing defensible |

**Deliberately excluded: `cover_bill`.** Cleo can front you money before an overdraft. That is
lending, and we are not doing it.

Note the shape: the last two actions are the only ones that *create* surplus, and the rest
deploy it. That is the causal link between the daily loop and the wealth outcome, and it should
be visible on screen.

*Reverse cost: low. It is an enum plus one handler each.*

### A3. Safe-to-spend — the formula
The headline number on Today, so it is the one that must never be wrong.

```
pot   = currentBalance
      − billsStillDueBeforeNextSalary
      − thisMonth'sGoalContributionNotYetPaid
      − bufferFloor
perDay = pot ÷ daysUntilNextSalary
```

`bufferFloor` is one month of committed outflow, or the goal's own buffer target while the
buffer is still being built — whichever is lower. Every term is observable in the ledger, which
means the number is auditable and the model never computes it.

Shown as **both** a pot and a rate: *"₹4,200 left, 11 days to salary — ₹380 a day."* Cleo says
"the next few days" because US pay is often biweekly; Indian salary lands on the 1st, so the
window is exact and long, and running dry on the 20th leaves eleven days of nothing. The
countdown is the Indian instantiation of Cleo's line, not a departure from it.

*Reverse cost: trivial. One pure function.*

### A4. One envelope, not per-category budgets
The daily plan shows one number. Per-category caps exist **only** where the customer has
accepted a `set_category_cap` action.

Per-category budgeting screens are common and rarely used, and "one action at a time" is the
whole differentiation. A cap the customer chose is a commitment; a cap the app assigned is a
chore.

*Reverse cost: low.*

### A5. Intervention triggers — 9, all deterministic
Each has exactly one matching action, and each is a rule in data like the suitability rules —
so a compliance officer can read the list.

| Trigger | Action |
|---|---|
| Salary credited | the month's plan |
| Safe-to-spend crosses zero | `set_category_cap` |
| A category exceeds its accepted cap | reminder, no new action |
| Subscription charged with no related activity for 90 days | `cancel_subscription` |
| EMI ending within 60 days | `start_sip` / `increase_sip` at the freed amount |
| FD maturing within 30 days | goal-matched deployment |
| Idle floor above one month's outflow for 3+ months | `open_sweep_in` / `move_to_liquid_fund` |
| Dependents and no cover in force | `buy_term_cover` / `enrol_pmjjby` |
| DPD above zero | `talk_to_rm`, and every investment blocked |

*Reverse cost: trivial.*

---

## B. Compliance and presentation

### B2. ⚠ Projections: a band, three rates, visible and adjustable
**The one I would most like you to look at, because it is the most expensive to reverse** — it
shapes the Plan screen's core visual.

- **Three scenarios**, not one number: **6% / 10% / 12%** nominal for an equity-heavy
  allocation. Deposits use their contractual rate (~7%) because that one is not a guess.
- **The rate is on screen and the customer can change it.**
- Labelled an illustration, with the standard "past performance is not indicative".
- A secondary line in **real terms at 5.5% inflation**, because "₹41 lakh" in 2056 money is the
  number that actually misleads people.

Why this shape: nobody may project assured returns on a market-linked product. IRDAI's
convention for insurance illustrations is two standardised rates; there is no mandated rate for
mutual funds, and Indian planning tools conventionally use 10–12% for equity. A single confident
corpus figure is not defensible under those rules; a band with its assumption exposed is. Same
screen, same effort.

Your instinct in the earlier discussion — *"in what range"* — is exactly this. I am building it.

*Reverse cost: **high** once the UI is built around it. Cheap right now.*

### B3. The notional gain is never shown as a return
The fixtures give holdings a flat 1.19× notional value so balances look plausible. Nothing may
present that as performance. Already commented at the point it is generated.

### B4. Audit record: one per proposal
Snapshot hash · rule that fired · verdict · **the exact sentence shown to the customer** ·
their decision · timestamp. Five-year retention, per the deck.

The sentence matters: an audit trail that records "recommended MF_INDEX_103" cannot answer the
only question a regulator asks, which is what the customer was actually told.

*Reverse cost: low.*

### B5. Both refusals stay
Refuse a **product** (the ULIP) and refuse an **amount** (`AFFORDABILITY`, already built).
Nobody expects a bank app to turn down money, and the second one costs nothing.

---

## C. Conversation and the avatar

### C1. Who Uday is now — and six registers, not eight
Future Self is cut, which quietly invalidated the persona's whole rationale:
`voice-and-memory.md` justifies the tone system with *"ours is you, thirty years on —
irreverence from your own future self is self-loathing"*, and the emotional range
regret → pride was specific to that premise.

**Uday is the relationship manager you were never profitable enough to get.** It is the honest
description of what we built.

Registers: `candid` (the diagnosis) · `encouraging` (progress) · `firm` (the refusal) ·
`pleased` (a commitment kept — the one moment he may show it) · `steady` (a market drop) ·
`careful` (debt, distress, a missed EMI). Order matters, `careful` outranks everything.

Cleo's governing rule, adapted and kept: **only name a gap they can act on within the next
month.** Money already spent cannot be unspent, so mentioning it is cruelty dressed as honesty.

*Reverse cost: moderate — a `character.ts` rewrite.*

### C2. ⚠ The customer raises the ULIP, the app does not offer it
For the refusal to land, something unsuitable has to be on the table. Two ways: the app proposes
it and then refuses itself (incoherent), or **the customer brings it in** —
*"my cousin says I should take this LIC plan"*.

The second is how mis-selling actually reaches people, it needs no contrivance, and it shows
the app disagreeing with a human being. Needs one line in the demo script.

*Reverse cost: trivial, but it changes the script.*

### C3. Accuracy: the model never does arithmetic
A `query_spend` tool resolves merchant, category and date window **in code**, aggregates **in
code**, and hands the model a number to read out. Asked "how much did I spend on food last
month?", an LLM will do the sum and get it wrong.

Accuracy and warmth are both stress-tested. This is the accuracy half, and it is the same
principle as the suitability gate: rules own the numbers, the model owns the words.

*Reverse cost: low, but skipping it is how we fail the stress test.*

---

## D. Engineering

### D1. Storage behind an interface; no Postgres yet
A `Store` interface with an in-memory implementation and optional JSON-file persistence.
Postgres and pgvector become one more adapter. This is what makes the API a single container
deployable anywhere in ten minutes, which is the insurance you asked for.

### D2. No API keys in this environment
Per the README's own open items, there is no `OPENAI_API_KEY` here. So the model path gets built
against stubs and the deterministic Tier-3 fallback, and **is unverified against a real
provider**. I will not claim otherwise. Everything else — the engine, the rules, the numbers —
is provable with `pnpm test` and no key at all.

### D3. Recurring detection must *infer*, and the fixtures let us grade it
The generator sets `isRecurring` because it knows the truth. Production cannot trust that field,
so `recurring.ts` infers periodicity from dates and amounts instead.

The useful consequence: the generator has effectively handed us a **labelled dataset**. The
detector can be scored against ground truth in a test — precision and recall on a real number.

### D4. ⚠ English first, Hindi as a translation file
The UI ships English, but every string goes through a copy layer keyed for translation rather
than being inlined, so Hindi is a data file and not a rewrite.

**This is a real gap, not a shrug.** An English-only demo is a recorded weakness. Against that: a
half-built Hindi demo reads worse than a confident English one, and Sunil's
`preferredLanguage: 'hi-IN'` makes the *point* that the product is language-aware without
requiring the translation to exist.

### D6. No branded name for the loop
Internally these docs say Autopilot, because that names the idea. The **UI says "Today" and
"your plan"** and nothing else. "Autopilot" is Cleo's word, and to a bank it implies
unsupervised control of customer money — the exact impression we spend the rest of the app
dismantling.

*Reverse cost: trivial.*

---

## The biggest open risk

**Nobody has confirmed the Runway video track renders in a real browser.**
`CONTRIBUTING.md` has flagged it. The session runs, the text comes back, an MP4 is produced — but
headless Chromium has no H.264, so the WebRTC video path has never been seen working by anyone.

---

# What got built, and the decisions the build forced

Appended 2 Sep 2026, after the first build. These are decisions **not** in the register
above, because they only became visible once the code existed. Each one is reversible; the ones
worth a second look are marked **⚠**.

## The engine

`packages/core` is complete and pure: `merchants` · `categorize` · `recurring` · `dates` ·
`derive` · `suitability` · `projection` · `roadmap` · `insights` · `actions` · `dailyplan` ·
`query`. 54 tests, all passing, no providers wired.

### ⚠ The demo runs entirely in the browser
`apps/web` imports `@dhan/core` and `@dhan/fixtures` directly and computes the snapshot, roadmap
and daily plan client-side. So the demo is a **static site with no server** — it cannot fail
because an API is down, and it deploys anywhere in minutes.

That is the insurance you asked for, and it is not the production shape. Core is pure, so every
function moves behind `apps/api` unchanged once the data is a real customer's; `@dhan/fixtures`
must never be in a production bundle. Worth confirming you are happy with the trade.

### Protection is exempt from the investment gates
The gate initially refused Sunil term insurance because he has a missed repayment. That is
backwards — if he dies his family inherits the debt and loses the income, so debt is an argument
*for* cover. `HIGH_INTEREST_DEBT`, `MISSED_REPAYMENT` and `EMERGENCY_BUFFER` now skip
protection-only products. A ULIP is not protection-only, so every investment rule still applies
to it.

Related: substitution happens only within a cover type. Offering ₹2-a-month accident cover in
place of life cover is not a cheaper option, it is a different product.

### Commitments and habits are different things
Sixty-seven Swiggy orders a year is not a recurring charge. The detector was calling weekly
Amazon shopping a "commitment", which would have read as broken and — worse — subtracted it
before working out safe-to-spend, telling the customer they had less freedom than they do. Every
series now records *why* it counts (`mandate` · `fixed-monthly` · `utility` ·
`regular-obligation` · `income`), and anything that qualifies for none is a habit.

### An irregular-expense provision, credited against the buffer
Every figure in the snapshot is a median, which describes a normal month correctly — but a year
also contains a hospital bill and a Diwali, and a SIP sized against the median breaks the first
time one lands. So one-off costs are amortised and **subtracted before anything is called
deployable**.

Scaled by how far the buffer falls short, though: charging a customer twice — holding six months
in reserve *and* shrinking their SIP for the same hospital bill — is wrong. A funded buffer is
what absorbs it.

### ⚠ Long-horizon goals are stated in today's money
The retirement suggestion first inflated current spending to age 60 and quoted the nominal
figure. Arithmetically fine; it produced **₹11.48 crore**, overflowed the card, read as absurd,
and made every plan infeasible for a reason that had nothing to do with the customer.

Now: 25× current annual outflow, in today's money, funded at the **real** rate (nominal less
inflation) for horizons over ten years. The Plan screen leads with the real figure and shows the
nominal beside it, so it is comparable with the target.

### Debt is amortised properly
The roadmap was promising to clear ₹5.83 lakh by paying ₹6,898 a month. The interest alone is
₹16,901 a month, so the balance *grows* and that payoff never arrives. Now it says so:

> *"The interest alone is ₹16,901 a month. At ₹6,898 the balance grows, so there is no date I can
> give you — it is not a slow plan, it is not a plan. Clearing it inside three years needs about
> ₹26,297 a month."*

True, useful, and the kind of thing that would have ended a demo if anyone had checked it.

The rate behind those figures is now **34.8%**, IDBI's own published finance charge of 2.90% a
month, rather than the 42% the persona used to carry. The lower rate does not soften the
conclusion — it is still four times anything on the shelf — and it is the difference between a
number a banker can look up and one they cannot.

## The app

### ⚠ Five tabs, not four
`Today · Plan · Ask Uday · Money · Record`, with the advisor in the centre — Cleo's arrangement,
and it is right: putting the assistant in the middle of the bar makes it the thing you reach for
rather than a feature you go and find. The register said four tabs plus a mic.

### Ask Uday takes the whole screen
No tab bar, no header, no card. Video edge to edge, everything else floating over it, and the
portrait recedes once a conversation starts. The fallback ladder is built in: no session means
"Uday is with another customer" and a working typed conversation, not a spinner.

### The conversation works with no keys at all
`packages/core/src/query.ts` answers deterministically — it resolves which merchants count as
food, which window "last month" means, aggregates in code, and only then hands over a sentence.
Ask it what you spent on food last month and it says:

> *"₹7,655 on food & dining in August, across 24 payments. Mostly Swiggy (₹3,689) and Fast food
> (₹1,128)."*

with the window and the per-merchant breakdown one tap away. This is the accuracy half of the
stress test, and it is why the model is never allowed to do arithmetic.

### No web fonts
System stack only. "Degrade gracefully" is a stated guardrail and a demo should not block first
paint on `fonts.googleapis.com` — and the system stack is the only reliable way to render ₹, which
most webfont Latin subsets do not carry.

### The time machine is a visible control
Labelled "Simulated clock", with +1 day / +1 week / +1 month and a reset, sitting at the top of
Today. Advancing it produces real transactions, the safe-to-spend figure falls, and the plan
recomputes. Nothing scripted.

## Still not done

- **`apps/api` is untouched** beyond the health route. Not needed for the demo, needed for Runway.
- **Runway is unwired end to end.** The client asks `/api/avatar/session`, gets nothing, and falls
  to text — which is the designed behaviour, but the live path has never run.
- **The Runway browser check is still open**, and still the biggest risk in the project.

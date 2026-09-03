# Autopilot — the product spine

**Written 1 Sep 2026. This document is canonical where it conflicts with earlier product
notes.** Those were written when the future-self avatar was the spine. It is now cut. What
replaces it is here.

Source of the idea: Cleo's Autopilot. The transplant needs two changes to survive contact
with a bank.

---

## What changed, in one paragraph

Dhan Sarthi was: *diagnose the customer, recommend, refuse when the product is wrong.*
That is a **moment**. It happens once and then the app has nothing to say. Autopilot makes
it a **loop**: the customer names a destination, we read every transaction to work out the
route, and every day we say the one thing that keeps them on it. The refusal survives
intact — it is now the thing that fires when a step on the route involves a product IDBI
sells that does not suit them.

## Why this is more on-brief, not less

IDBI's problem statement names the gap as *"comprehensive customer investment behaviour
and spending habits."* We were answering the investment half and skipping the behaviour
half. Autopilot **is** the behaviour half. The spending engine is not a detour from the
brief — it is the clause we were underserving.

## The two changes Cleo's design needs for a bank

### 1. Cadence: daily awareness earns the right to monthly advice

Cleo's loop is daily because *spending* is daily. Wealth decisions are not — nobody starts
a SIP four times a month. So:

- **Daily:** what happened since you last looked, are you still on route, what is safe to
  spend today, one small action.
- **On trigger:** the deployment decision. Salary credited · EMI ending · FD maturing ·
  idle balance crossing a threshold · a milestone missed twice.

The daily loop is what makes the app worth opening. The trigger events are where the money
actually moves. One does not work without the other.

### 2. Autonomy: Cleo holds the wallet, we hold a fiduciary duty

Cleo moves money on its own. A bank cannot let a model do that. Our shape is:

```
propose  ->  suitability gate  ->  one-tap consent  ->  bank rails execute  ->  audit record
```

State this as a feature, not an apology: **Autopilot with the customer's hand on the wheel,
and every turn recorded.** And note what follows from it — Cleo has no suitability gate
because Cleo sells nothing. IDBI sells products. Our version has a component Cleo
structurally cannot have, and it is the component a bank cares most about.

`Sarthi` means charioteer: the one who drives while you decide where to go. The metaphor
is already in the name.

## The new one-line pitch

The old line — *"your bank statement, as a photograph of you at 60"* — dies with the aged
face. Replacement, two parts, metaphor then credibility:

> **A GPS for your customer's money — with a compliance officer in the passenger seat.**

Or, led with the numbers:

> *"₹18,400 idle every month, four months running. Sarthi finds it, routes it, and tells
> him not to buy the ULIP."*

---

## Object model

Everything below lives in `packages/contracts` as zod schemas, and every route returns one
of these shapes. Deterministic code owns all of it; the model only phrases it.

| Object | What it is |
|---|---|
| `Ledger` | 24 months of transactions. Synthetic for now, IDBI's later. Same shape either way. |
| `Snapshot` | Derived truth: income, fixed commitments, discretionary, surplus, idle balance, runway in days. **One snapshot, one source of truth** — screens and the avatar read the same object, so neither can quote a number the other does not show. |
| `Insight` | A detected fact: forgotten subscription · category creep · EMI ending · idle cash · protection gap. Carries `evidence[]` (the actual transactions), `magnitude`, `confidence`. |
| `Goal` | The destination. `emergency_fund` · `debt_payoff` · `protection` · `wealth_target`. Target amount, target date. |
| `Roadmap` | Goal broken into `Milestone[]` with monthly targets, aware of the customer's pay cycle and fixed commitments. Versioned, and every version carries `reason_for_change`. |
| `DailyPlan` | `{ date, since_last_checkin[], on_route, safe_to_spend_today, actions[] }` — exactly one primary action. |
| `Action` | **From a fixed vocabulary. Never free text from a model.** `move_to_liquid_fund` · `start_sip` · `increase_sip` · `set_merchant_cap` · `cancel_subscription` · `cover_bill` · `buy_term_cover` · `talk_to_rm`. Each carries params, a suitability verdict, and an execution result. |
| `Decision` | The customer's response: `did_it` · `declined` · `deferred` · `pushed_back(reason)`. |
| `AuditRecord` | Per proposal: snapshot hash, rule that fired, verdict, the sentence shown, the decision, timestamp. Retained five years. |

**The property worth noticing:** `Roadmap.version` + `reason_for_change` + `Decision` gives
us Cleo's *"it learns from you"* and the bank's *"prove why you said that"* out of the same
data structure. The flywheel and the compliance artefact are the same table.

## Memory's real job

We already built semantic memory. Point it at decisions, not trivia. *"Last month you said
₹10,000. You did ₹4,000. I have re-cut the plan at ₹6,000"* is a far stronger demo than
remembering someone's name, and it is the mechanism by which the roadmap adapts.

## Insights worth building first

Ranked by how hard they are to fake and how Indian they are:

1. **EMI ending.** *"Your bike EMI ends in March — ₹4,200 a month freed up. Route it to the
   SIP before it disappears into spending?"* Deterministic and verifiable.
2. **Idle cash with duration.** Not "you have savings" — *"₹18,400 has sat idle four months
   running."* The duration is what makes the claim credible.
3. **Forgotten subscription.** Cleo's opener, works everywhere.
4. **Category creep.** One category quietly up 40% over three months, with the transactions.
5. **Protection gap.** The setup for the refusal.

---

## Screens

Settles the earlier four-tabs / three-tabs contradiction:

**Today · Plan · Money · Record**, plus a persistent mic.

- **Today** — the daily plan. Since you were away · on route or not · safe to spend today ·
  one action with **Do it / Not now / Why?**
- **Plan** — the roadmap. Destination, milestones, timeline, and the recalculation history
  visible as a list of versions with reasons. This is what replaces the Future tab.
- **Money** — the 360° proof: accounts, spending, recurring commitments, liabilities.
  Boring on purpose. Where the diagnosis numbers come from.
- **Record** — audit trail, consent centre, "why this advice" for every past recommendation.

The avatar is not a tab. It is a **mode** reachable from anywhere via the mic.

## The avatar is a moment, not a surface

Runway is $0.20/min and **Tier 1 permits one concurrent session.** That rules it out as an
always-on surface, and no bank would fund it for casual chat. So:

- **Avatar handles the high-intent moments:** the onboarding diagnosis, a trigger-event
  decision, and the refusal.
- **Everyday loop is text + tap**, driven by the same engine.
- Runway has **no mid-call context push**, so the planning engine reaches it only as tools
  it pulls: `get_snapshot` · `get_daily_plan` · `get_roadmap` · `check_suitability` ·
  `propose_action`, plus `client_event` to drive the UI. Design accordingly.

## The fallback ladder — build it on day one, not at the end

Reviewers will use this unsupervised, possibly several at once, possibly on a hotel wifi.
It must never hard-fail.

| Tier | Condition | Behaviour |
|---|---|---|
| 0 | Runway session available | Live avatar, voice in / video out |
| 1 | Session busy, or Runway down | **Honest message** — *"Uday is with another customer. Continue in text?"* — plus a short pre-recorded Uday clip for the diagnosis and the refusal. The moment still lands. |
| 2 | No keys, no network, quota gone | Fully deterministic phrasing straight from `packages/core`. Every number is still real, because the engine is pure. |

A spinner is not a fallback. Tier 1 must be a designed state.

## Self-serve demo

- **No signup, no OTP.** Landing screen offers three pre-loaded customers:
  *"Try as Rohan — 29, Indore, ₹85,000 a month."* One tap, straight in.
- **A time machine.** Memory, nudges and adaptation cannot be verified in a short demo
  because they need time to pass. Fix: a visible control that advances the simulated clock.
  Day 1 → day 8 → a surprise expense → the roadmap recalculating, in twenty seconds. Honest,
  because we say plainly that the ledger is synthetic — and it converts our three
  unverifiable strengths into verifiable ones.
- **Hard cost caps before the link goes anywhere.** Max session length, sessions per day,
  per-IP limit. A public URL at $0.20/min left up over a weekend is a real bill.

---

## The numbers, as the ledger actually produces them

Regenerated 3 September 2026 by `packages/fixtures` after the realism pass, seeded and
reproducible. **These supersede every earlier figure, including those in the deck.** Two rounds
of numbers have now been retired: the hand-typed fixture whose transactions summed to ₹51,630
while the script said ₹49,600, and the pre-calibration generator, whose statements carried
Indian Bank's IFSC prefix, Indore's electricity company on a Kochi account and no interest credit
anywhere.

Re-derive at any time with `pnpm --filter @dhan/fixtures figures` — it prints exactly this table
plus the suitability verdict each persona exists to demonstrate. If a number is going on a slide,
take it from there, not from here: this is a snapshot and the generator is the source of truth.

### Rohan Mehta — 29, Indore. The headline customer.

| | |
|---|---|
| Salary credit | **₹85,000** a month, on the 1st, by inward NEFT from his employer's HDFC branch |
| Committed each month | **₹51,997** — rent ₹24,500 · EMI ₹8,200 · family ₹8,000 · SIP ₹5,000 · bills |
| Discretionary | **₹22,070** — the part that could move |
| Monthly surplus | **₹10,933**, all of it deployable |
| Savings balance | **₹2,82,448** |
| Twelve-month floor | **₹1,41,663** — never went below this, so it was never needed |
| Emergency buffer | **6.5 months**, which is why nothing is held back for irregular costs |
| Protection gap | **₹1.02 crore** against two dependents and nothing in force |

The opening line writes itself, and every figure in it is arithmetic over 1,356 transactions:

> *"₹85,000 in. ₹1,41,663 has sat in your savings account for a year without once being
> needed — earning 2.5% while prices rose 5.5%."*

That 2.5% is now on the statement rather than in the sentence: the ledger carries a quarterly
`SB INT CR` credit computed at IDBI's own slab rates on his daily closing balance, so a customer
who doubts the number can add up the four credits.

Four live insights the data supports without a single scripted string:

1. **The education loan has five instalments left.** Advance the clock six months and the
   ₹8,200 debit genuinely stops and the liability leaves the file — so *"₹8,200 a month is
   about to free up, route it before it disappears into spending"* is computed, not written.
2. **A forgotten gym subscription.** Identical ₹1,499 charges on the same day of the month,
   with no gym-adjacent activity anywhere near them.
3. **Netflix went from ₹499 to ₹649** five months ago. Both are published Netflix India tiers,
   so it is a finding he can check rather than a step between two invented numbers.
4. **No cover at all, two dependents.** The setup for the ULIP refusal, which the gate answers
   `BLOCKED / BUNDLED_PROTECTION` and points at term cover at **₹985 a month** — LIC's Digi
   Term quote for a non-smoker at 29, not the ₹880 the shelf used to claim.

### Priya Nair — 34, Kochi. Earns well, cannot invest a rupee.

₹1,40,000 a month, ₹76,097 committed and ₹71,507 discretionary, so a **median surplus of
−₹7,604**: she spends more than she earns. A credit card revolving at **34.8%** — IDBI's own
published finance charge of 2.90% a month, not the 42% the persona used to carry — on ₹5,82,776,
a twelve-month floor of ₹55,152 and a buffer of 1.3 months. Deployable surplus is **zero**, so
every investment is blocked by `HIGH_INTEREST_DEBT` and the right advice is the unglamorous one.
Her card shows up as `CreditCard Payment XX 1184 Ref#…` for a different amount every month, which
is exactly why the balance never clears.

### Sunil Kumar — 47, Nagpur. Irregular income, no buffer.

**₹68,522** median income arriving as four unpredictable collections a month — a customer's UPI
credit, a Razorpay settlement, the day's takings banked at a machine — with **no payroll flag on
any of them**, so deriving a stable income for him is real work. ₹38,475 committed, ₹22,907
discretionary, a surplus of ₹7,140 of which only **₹5,162 is deployable** once the provision for
irregular months is taken out, and a buffer of 2.5 months against four dependents. A missed
instalment is on the statement as well as on the liability: in May 2026 the NACH mandate was
presented against an account that could not pay it, a ₹300 return charge and its GST landed, and
the instalment was settled by hand twelve days later. His answers are `SSP`, the sweep-in FD and
the ₹436-a-year PMJJBY he already holds — not equity.

### What a banker sees before they read a single figure

The realism pass changed what the statement *looks* like as much as what it says. Every line now
matches a declared template for its rail — `UPI/DR/<RRN>/<payee>/<bank>/<vpa>/<remark>`,
`ACH-DR-<creditor>-<UMRN>-<date>`, `BIL/BBPS/<biller>/<consumer no>/<ref>` — with reference
numbers that decode back to their own dates. The account header carries an IDBI branch IFSC for
the customer's own city; the salary is remitted by the employer's bank and never by IDBI. Kochi
is billed by KSEB and Nagpur by MSEDCL. Onam moves money in Kochi and Ganesh Chaturthi in Nagpur,
on the dates they actually fell. Interest, SMS charges and their GST are on the statement as
separate lines, with paise, because that is where a bank puts paise.

### What the ledger is built to guarantee

Forty-nine tests hold these — twenty on the generator and twenty-nine on realism — and they exist
because each one is a way the demo could quietly become untrue:

- **Determinism.** Same seed, same ledger, on any machine.
- **The running balance is continuous**, never negative, and no purchase is ordered before the
  salary that funded it. Carried in paise, because the statement now has paise on it.
- **The time machine reveals the future the ledger always had.** Days generated live when a
  user advances the clock are identical to the days that month produces as history, and
  advancing does not rewrite what they already read. This is why each month draws from its own
  stream keyed on a fixed anchor — and why the bank's own lines are computed from the persona's
  ledger start rather than from whatever window the caller asked for.
- **Every line is a form a bank would print.** No narration matches nothing; no template goes
  unexercised; no IDBI account carries another bank's IFSC prefix.
- **The statistics are inside published bands.** How many UPI payments a month, how many of them
  are under ₹500, and how the ticket sizes are shaped, each cited to NPCI or the RBI Payment
  System Report — with the one figure that cannot be reproduced explained rather than fudged.
- **Coherence, not just arithmetic.** A customer paying a third a year on a card may not also be
  sitting on months of cash. That is the kind of thing a reviewer spots in two seconds and we
  would never catch by reading the code.

### Known tuning item

Priya's *closing* balance (₹1,92,143) still sits higher than her floor implies, because her
monthly surplus is skewed: a median of −₹7,604 against twenty-four months that nonetheless end
higher than they started. The cause is her card, which only starts revolving sixteen months
before the anchor, so the eight months before it are genuinely comfortable. Coherent enough to
demo — the buffer is 1.3 months and the deployable surplus is zero, which is what the advice
turns on — and worth a second pass before it goes in front of anyone.

---

## Explicitly out of scope

Photo age progression · a native mobile app · real bank rails · IDBI's actual APIs · any
model deciding suitability.

## What is superseded

- The "Future Self — the money shot" screen — cut. The Plan tab replaces it.
- The first-run photo step — cut. Onboarding is consent, then goal, then the diagnosis.
- The earlier navigation (Home · Future · Money · Goals) — replaced above.
- The demo beat of "the two faces" — replaced by the roadmap recalculating live under the
  time machine.
- The earlier one-line pitch, including in the root `README.md`.

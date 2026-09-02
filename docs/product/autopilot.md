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
  *"Try as Rohan — 29, Mumbai, ₹85,000 a month."* One tap, straight in.
- **A time machine.** Memory, nudges and adaptation cannot be verified in a short demo
  because they need time to pass. Fix: a visible control that advances the simulated clock.
  Day 1 → day 8 → a surprise expense → the roadmap recalculating, in twenty seconds. Honest,
  because we say plainly that the ledger is synthetic — and it converts our three
  unverifiable strengths into verifiable ones.
- **Hard cost caps before the link goes anywhere.** Max session length, sessions per day,
  per-IP limit. A public URL at $0.20/min left up over a weekend is a real bill.

---

## The numbers, as the ledger actually produces them

Generated 2 Sep 2026 by `packages/fixtures`, seeded and reproducible. **These supersede every
earlier figure, including those in the deck** — the old ₹85,000 / ₹49,600 / ₹18,400 set came
from a hand-typed fixture whose transactions summed to ₹51,630, and nobody could see it.

Re-derive at any time with `pnpm --filter @dhan/fixtures summary`. If a number is going on a
slide, take it from there, not from here — this table is a snapshot and the generator is the
source of truth.

### Rohan Mehta — 29, Indore. The headline customer.

| | |
|---|---|
| Salary credit | **₹85,000** a month, on the 1st |
| Total outflow | **₹72,198** |
| — committed | ₹50,390 rent ₹24,500 · EMI ₹8,200 · family ₹8,000 · SIP ₹5,000 · utilities |
| — discretionary | **₹22,684** — the part that could move |
| Monthly surplus | **₹11,481** never deployed |
| Savings balance | **₹2,58,773** |
| Twelve-month floor | **₹1,22,841** — never went below this, so it was never needed |

The opening line writes itself, and every figure in it is arithmetic over 1,227 transactions:

> *"₹85,000 in. ₹1,22,841 has sat in your savings account for a year without once being
> needed — earning 2.7% while prices rose 5.5%."*

Four live insights the data supports without a single scripted string:

1. **The education loan has five instalments left.** Advance the clock six months and the
   ₹8,200 debit genuinely stops and the liability leaves the file — so *"₹8,200 a month is
   about to free up, route it before it disappears into spending"* is computed, not written.
2. **A forgotten gym subscription.** Sixteen identical ₹1,499 charges on the same day of the
   month, with no gym-adjacent activity anywhere near them.
3. **Food spend drifting up ~40%** over six months, visible against its own baseline.
4. **No cover at all, two dependents.** The setup for the ULIP refusal.

### Priya Nair — 34, Kochi. Earns well, cannot invest a rupee.

₹1,40,000 a month, outflow ₹1,40,624, **surplus −₹779** — she spends exactly what she earns.
A credit card at 42% and a twelve-month floor of ₹42,697. Every investment recommendation is
blocked by `HIGH_INTEREST_DEBT`, and the right advice is the unglamorous one.

### Sunil Kumar — 47, Nagpur. Irregular income, no buffer.

₹71,979 median income arriving as four unpredictable collections a month with **no payroll
flag to read it off** — deriving a stable income for him is real work. Outflow ₹62,301, a
missed instalment on record, a Conservative profile, and a balance that bottoms out just above
zero after a ₹74,000 hospital bill eleven months ago. His answers are `SSP`, the sweep-in FD
and PMJJBY — not equity.

### What the ledger is built to guarantee

Twenty tests hold these, and they exist because each one is a way the demo could quietly become
untrue:

- **Determinism.** Same seed, same ledger, on any machine.
- **The running balance is continuous**, never negative, and no purchase is ordered before the
  salary that funded it.
- **The time machine reveals the future the ledger always had.** Days generated live when a
  user advances the clock are identical to the days that month produces as history, and
  advancing does not rewrite what they already read. This is why each month draws from its own
  stream keyed on a fixed anchor.
- **Coherence, not just arithmetic.** A customer paying 42% on a card may not also be sitting
  on months of cash. That is the kind of thing a reviewer spots in two seconds and we would
  never catch by reading the code.

### Known tuning item

Priya's *closing* balance (₹1,74,265) still sits higher than her floor implies, because her
monthly surplus is skewed — a median of −₹779 against a positive mean. Coherent enough to
demo, worth a second pass before it goes in front of anyone.

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

# The demo persona: Karan Deshpande

Status: **built.** The persona is `KARAN` in `packages/fixtures/src/personas.ts`; every
figure below is read off the 2,157 transactions it generates, not typed beside them. This is the story the one-minute demo tells and the
data generator must produce. Every figure here is arithmetic that closes — the deficit
explains the card balance, the card balance explains the idle cash being wrong, and the
idle cash is what pays for the fix.

## Three decisions, settled

1. **One customer, not four.** Karan is the only persona in the app. Rohan, Priya and
   Sunil stay in `packages/fixtures` as **test-only** fixtures — they are what 600+ lines
   of realism and suitability tests assert against — but they are removed from the picker
   and never appear in the product. Depth over breadth.
   *Reversed since (as of 22 September 2026): all four are in the sign-in list, Karan first
   (`PERSONAS`, `packages/fixtures/src/personas.ts:1486`), and seeded into Postgres. The demo is
   still told on Karan; each of the other three makes one rule fire cleanly on its own facts.*
2. **Full ledgers on all four accounts.** 24 months of transaction-level data per account,
   not just balances. Aggregation is the pitch; computing insights off 27% of his money
   would undercut it.
3. **The IDBI account maps to the sandbox's Pune fixture** (branch 105, `IBKL0000105`), so
   one screen can pull genuinely live from the bank on stage while everything else is
   generated.

## What one customer has to carry

With three personas gone, Karan alone must exercise the nine suitability rules. He does —
eight fire on his own facts, and the ninth is more convincing passing than firing.

| Rule | Fires on | |
|---|---|---|
| `HIGH_INTEREST_DEBT` | ₹1,86,240 card at 34.8% — blocks every investment until cleared | ✅ |
| `MISSED_REPAYMENT` | Car loan EMI returned unpaid, March 2026 | ✅ |
| `AFFORDABILITY` | ₹5 crore house: EMI is 182% of take-home | ✅ |
| `VOLATILITY_VS_HORIZON` | Equity proposed against a 5-year house goal | ✅ |
| `BUNDLED_PROTECTION` | The 2019 ULIP — savings wearing cover's clothes | ✅ |
| `TAX_BENEFIT_UNAVAILABLE` | He is on the **new regime**; ELSS and voluntary NPS sold as tax savers are a false benefit | ✅ |
| `HORIZON_VS_LOCKIN` | PPF and ULIP lock-in against a 5-year goal | ✅ |
| `RISK_CEILING` | Risk profile "Balanced", **last assessed 2021** — a Very High product breaches it, and the staleness triggers re-profiling | ✅ |
| `EMERGENCY_BUFFER` | ₹12.46L against ₹1.69L/mo = **7.3 months. Passes.** This is *why* moving ₹6L is safe — and on the counterfactual where the HDFC money was already spent, the buffer is 2.5 months and it fires | ✅ passing |

---

## Who he is

**Karan Deshpande, 30.** Born 12 February 1996, Pune.
Senior engineering manager at a mid-size SaaS company (Kharadi). ₹32L CTC.
Married; wife Ananya works part-time; one daughter, age 2.
Parents in Nashik — he sends money every month.

IDBI is his **salary account**, opened 2019, Pune branch (IFSC `IBKL0000105`).
That matters: it is the account the bank can actually see, and it is the smaller half
of his money.

| | |
|---|---|
| Net salary credited | **₹1,92,000** on the 1st |
| Declared annual income | ₹32,00,000 CTC |
| Employment | Salaried |
| Dependents | 2 (daughter, mother) |
| Tax regime | New |
| KYC | Verified |
| Risk profile on record | Balanced, last assessed 2021 — **stale** |

### Why this income level

High enough that four accounts, a demat and a ₹5 crore aspiration are all credible.
Low enough that the ₹5 crore house is genuinely out of reach, so the app's refusal is
*arithmetic* rather than an obvious joke. A wrong answer the customer can argue with is
the only kind worth refusing on camera.

---

## The one-minute profile

This is the single screen the demo opens on. Six numbers, and the fourth one is the story.

| | |
|---|---|
| **Net worth** | **₹34,65,599** |
| Cash across 4 accounts | ₹12,45,774 — **₹8,20,000 of it untouched since 24 June 2025** |
| Investments across 3 platforms | ₹30,34,140 across 16 holdings |
| Liabilities | ₹8,14,315 — **₹1,86,240 of it at 34.8%** |
| Life cover | **₹0**, with two dependents |
| This month | +₹1,92,000 in, ₹1,69,499 out → **+₹22,501 spare** |

He is **not** broke. He has ₹22,501 spare every month — and ₹1,86,240 on a credit card
at 34.8%, costing him ₹5,400 a month in interest, while ₹8.2 lakh sits in an account he
has not touched since June 2025 earning 3%.

That is the story, and it is better than a deficit: nothing here is a hardship. It is
three large months in 2025 he never cleared, and an account he forgot he had. He does not
know either of those things, because nobody has ever shown him all four accounts on one
screen.

---

## The four accounts

| # | Bank | Type | Balance | Story |
|---|---|---|---|---|
| 1 | **IDBI** `XXXX3308` | Savings (salary) | ₹3,18,774 | Current salary account. Pune branch 105, `IBKL0000105` — the sandbox's own Pune fixture. The only one the bank sees. |
| 2 | **HDFC** `XXXX2188` | Savings | **₹8,20,000** | Previous employer's salary account. **Ten lines in two years**, and the last one the customer initiated was 24 June 2025. Holds a bonus and the proceeds of his old car. **Forgotten.** |
| 3 | **Kotak** `XXXX6031` | Savings (811) | ₹12,000 | UPI and subscriptions run off this. Deliberately kept near empty. |
| 4 | **ICICI** `XXXX4477` | Savings (joint) | ₹95,000 | Household account with Ananya. Rent, groceries, daycare, utilities — 614 lines, the busiest of the four. |

**Total cash ₹12,45,774.** IDBI can see 26% of it.

The aggregation moment: the app pulls all four via Account Aggregator consent and the
HDFC balance appears for the first time.

---

## The investments

Six buckets, three platforms, nobody has ever looked at them together.

| Holding | Where | Invested | Value | Note |
|---|---|---|---|---|
| Parag Parikh Flexi Cap | Groww | ₹3,60,000 | ₹5,15,000 | ₹12,000/mo SIP. Good fund, well bought. **Do not touch.** |
| Axis Bluechip | Groww | ₹2,40,000 | ₹2,62,000 | ₹8,000/mo SIP |
| ICICI Pru Bluechip | IDBI distributed | ₹2,10,000 | ₹2,38,000 | ₹7,000/mo SIP — **68% portfolio overlap with Axis Bluechip** |
| SBI Small Cap | Groww | ₹90,000 | ₹85,000 | ₹8,000/mo SIP, started Jan 2025, underwater |
| **Direct equity** | Zerodha | ₹7,80,000 | ₹6,40,000 | 9 stocks. 61% in two names. Mostly bought Oct 2021. Down 18%. |
| EPF | — | ₹9,80,000 | ₹9,80,000 | |
| NPS Tier-I | Employer, 80CCD(2) | ₹1,85,000 | ₹2,10,000 | |
| PPF | — | ₹4,20,000 | ₹4,60,000 | ₹5,000/mo |
| **ULIP** | Bought 2019 from a cousin | ₹2,70,000 | ₹3,20,000 | ₹45,000/yr premium, 7 years in. **IRR 4.1%.** Sum assured ₹4,50,000 — not cover, a savings product wearing cover's clothes. |

**Total ₹30,34,140 across 16 holdings**, against ₹29,74,750 invested — a portfolio that has
barely moved. Monthly in: ₹35,000 of SIPs, ₹5,000 to PPF, and ₹45,000 a year to the ULIP.

### The three findings

1. **Two large-caps, 68% overlap.** He is paying two expense ratios for one exposure.
2. **₹6.4L of direct equity, 61% in two stocks**, bought at the top of 2021 and never reviewed.
3. **The ULIP is not insurance.** ₹4.5L sum assured against two dependents is not cover,
   and 4.1% over seven years is not an investment either.

---

## The liabilities

| | Outstanding | Rate | Monthly |
|---|---|---|---|
| Car loan | ₹6,28,075 | 9.4% | ₹18,500 |
| **Credit card, revolving** | **₹1,86,240** | **34.8%** | ₹12,000 |

The card balance is eleven months old. It did not come from living beyond his means —
his flows very nearly balance — it came from **three large months**: ₹78,400 at Vijay
Sales, ₹46,500 to MakeMyTrip, and ₹42,800 at Sahyadri Hospital, none of which he ever
cleared. At 34.8% it is the most expensive rupee in his life, and it is outstanding only
because he does not know about the HDFC account.

---

## Where the money goes

Derived from the ledger, not declared: **₹1,69,499 out against ₹1,92,000 in.**
Commitments ₹1,19,308, discretionary ₹50,191, leaving **₹22,501 deployable** and a buffer
of 7.3 months.

The envelopes below are what the persona spec asks for; the figures above are what the
2,157 generated transactions actually come to.

| | |
|---|---|
| Rent (Kharadi, 3BHK) | ₹42,000 |
| Groceries and household | ₹22,000 |
| Parents, Nashik | ₹15,000 |
| Daycare | ₹12,000 |
| Car EMI | ₹18,500 |
| Credit card payment | ₹12,000 |
| SIPs | ₹35,000 |
| PPF | ₹5,000 |
| ULIP premium (annualised) | ₹3,750 |
| Food delivery and dining | ₹14,500 |
| Transport and fuel | ₹6,500 |
| Utilities | ₹5,200 |
| Subscriptions (11 live, **3 unused**) | ₹3,400 |
| Shopping and everything else | ₹11,000 |

Behaviour the generator must produce, because these are the insights that land:

- **Food delivery drifting up** — ₹9,200/mo eighteen months ago, ₹14,500 now.
- **Three forgotten subscriptions** — a gym app, a cloud storage tier, a news site.
- **Payday clustering** — 38% of discretionary spend lands in the five days after the 1st.
- **One returned mandate**, March 2026: the **car loan EMI** was presented against the IDBI
  account on a day the balance could not carry it. The debit is missing, a ₹590 return
  charge lands, and the instalment is paid by hand eleven days later. This is what fires
  `MISSED_REPAYMENT`, and it has to be visible in the ledger rather than asserted on the
  liability.

---

## The two goals

The demo asks both. They must produce **different kinds of answer**, or the app looks
like a calculator with one opinion.

### Goal 1 — "Retire at 45"

Fifteen years. Answer: **not at 45. At 52, and here is the path.**

| | |
|---|---|
| Retirement expenses, today's money | ₹1,45,000/mo |
| Inflated at 6% for 15 years | ₹3,48,000/mo |
| Corpus needed at a 4% withdrawal rate | **₹10.4 crore** |
| What today's ₹37.1L becomes at 11% over 15 years | ₹1.77 crore |
| Gap | ₹8.6 crore |
| Monthly investment that closes it | **₹1,92,000** — his entire take-home |
| What he actually invests | ₹35,000 |
| Age he reaches ₹10.4 crore at that rate | **61** |
| Age he reaches it after the four fixes below | **52** |

The app does not say no. It says *45 is not on the table, 52 is,* and shows the nine years
it just bought him. **That is the product.**

### Goal 2 — "Buy a ₹5 crore house in 5 years"

Answer: **no — and here is the house you can actually buy.**

| | |
|---|---|
| Down payment needed (20%) | ₹1 crore in 60 months |
| Monthly saving required, at 12% | ₹1,22,000 |
| His current net monthly saving | **₹22,501**, against ₹1,22,000 needed |
| EMI on the remaining ₹4 crore, 8.6%, 20 years | **₹3,49,000/mo** |
| That as a share of take-home | **182%** |
| Maximum EMI a lender allows (50% of net) | ₹96,000 |
| Loan that supports | ₹1.10 crore |
| Down payment he can build in 5 years, after the fixes | ₹38,00,000 |
| **House he can actually buy** | **≈ ₹1.48 crore today, ₹1.9 crore in 5 years** |

Uday says the hard sentence out loud, with the arithmetic on screen behind him. No IDBI
product is offered against this goal, because none of them make a ₹5 crore house possible
and pretending otherwise is the thing this product exists not to do.

---

## The four fixes — the app's action plan

Ordered by rupees per minute of the customer's attention.

| # | Action | Frees | Why it is safe |
|---|---|---|---|
| 1 | **Clear the ₹1,86,240 card** from the idle HDFC balance | **₹64,811/yr** | Paying 34.8% while earning 3% on the same rupee. No market view required, and the plan clears it in 11 months even without the HDFC money. |
| 2 | **Move ₹6L of the remaining idle cash** to a liquid allocation | **₹24,000/yr** | Still liquid; buffer stays intact at 6 months of expenses. |
| 3 | **Consolidate the overlapping large-caps**, redirect ₹7,000/mo | ~₹9,000/yr in fees | Stops paying twice for one exposure. **The Parag Parikh SIP is not touched** — somebody else sold that well. |
| 4 | **Exit the ULIP, buy ₹1.5 crore term cover** at ₹18,400/yr | **₹26,600/yr** | Zero real cover today with two dependents. This is the suitability rule firing, not a sale. |

**Freed: about ₹1,24,000 a year**, on top of the ₹22,501 a month he already has spare.
Roughly **₹32,800 a month** redirected — which is what moves retirement from 61 to 52.

---

## What this persona exercises

- **Aggregation** — 4 banks, 3 investment platforms, one screen.
- **The refusal** — a ₹5 crore goal declined on arithmetic, on the record.
- **Do-not-churn** — the Parag Parikh SIP is explicitly left alone.
- **The protection rule** — zero cover + two dependents blocks investment advice until addressed.
- **The revolving-debt rule** — no investment is recommended while 34.8% debt is outstanding.
- **Stale risk profile** — last assessed 2021, triggers re-profiling.
- **Time** — the simulated clock moves the car loan toward payoff and the SIPs forward.

---

---

## What has to be built

In order. Each step is checkable before the next one starts.

1. **Domain types.** `Account` gains an institution (name + IFSC) so an account can belong
   to a bank that is not IDBI. `Holding.holdingType` gains `EQUITY` and `EPF`; an equity
   holding gains ticker, ISIN, units and average cost.
2. **Goals as a first-class thing.** Core has `suggestGoal`, which *infers* one. A declared
   goal — target amount, target date, priority — with a projection and a shortfall is a
   different object and needs its own type, its own projection function and its own record.
3. **The persona spec.** Karan in `packages/fixtures/src/personas.ts`, four accounts, nine
   holdings, two liabilities, the drift, the three dead subscriptions, the returned mandate.
4. **The generator, extended** to emit a ledger per account rather than one, and to route
   each transaction to the account that would really carry it — rent from ICICI, subscriptions
   from Kotak, salary and EMIs into IDBI, nothing at all in HDFC for fourteen months.
5. **Realism tests**, in the shape of the existing ones: the four balances must equal the
   ledgers, the deficit must equal the card's growth, the overlap figure must be computed
   from holdings rather than typed, and no figure on any screen may disagree with another.
6. **The APIs** — the routes that serve this: aggregated net worth, per-account ledgers,
   consolidated holdings, the two goals with their projections, and the action plan.

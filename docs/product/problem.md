# What problem are we actually solving

Worked out from first principles, 25 Aug 2026.

---

## The bank's framing, and why it is wrong

IDBI's problem statement says the barrier is *"absence of comprehensive insight into customer
investment behaviour and spending habits."*

Read literally that is an information problem. It isn't true. **IDBI has every transaction of
every customer** — richer behavioural data than any fintech in India. The insight isn't absent,
it is unused.

This reframes the problem from "we need better data" to "we already have it, and here is why it
has never been converted into advice."

## The actual constraint

Advice requires someone to look at *your particular* situation and think about it. Historically
that someone was human, and human attention costs money.

- A wealth RM costs a bank roughly ₹15L/year fully loaded. Across a ~100-client book that is
  **₹15,000 per client per year**; across 300 clients, nearer ₹5,000.
- Mutual fund trail commission is roughly **0.75%/year of AUM**. So ₹20L invested generates about
  ₹15,000/year — **breakeven sits around ₹20 lakh invested.** Banks set the service threshold
  higher for margin.
- Below that line, advice has never been *given* — not through negligence, but because it has
  never been economically possible.

Everything in the problem statement is downstream of that one constraint. Fragmented, because
nobody assembles a picture for someone not worth assembling it for. Not timely, because nobody is
watching. Not personalised, because generic product pushes are what you send when you haven't looked.

> *"Below roughly ₹20 lakh invested, the bank loses money serving you with a human."* That one we
> can show the arithmetic for.

Note: ₹50L is often quoted as a threshold. That is SEBI's **minimum ticket for Portfolio
Management Services** (raised from ₹25L in 2020) — an investor-protection line, not a
service-cost line. Do not claim it explains RM economics.

## Three barriers, not one

If cost were the only constraint, AI solves the problem outright. It isn't.

**1. Economics.** Advice costs too much to give everyone.
*AI genuinely solves this. Table stakes.*

**2. Trust.** A mass-market customer's entire experience of a bank recommending a product is being
sold to. "You should invest in this" is heard as "what's your cut?" Free advice that is assumed to
be a sales pitch is worth nothing.

**3. Action.** Even trusted, correct advice mostly is not acted on. Saving trades a real present
against an abstract future, and humans systematically lose that trade.
*This is what the future-self avatar exists for.*

Layer 3 is where our avatar lives, and it is the one part of our submission that is not a feature.

## The sharpest statement of the problem

> **Millions of IDBI customers have money sitting idle in savings accounts, losing value to
> inflation, because nobody has ever told them what to do with it in a way they trusted enough to
> act on.**

Three reasons this framing works:

- **It is about money that already exists.** Not people who cannot afford to invest — that is a
  different and unsolvable problem, and we should be honest we cannot help someone with no
  surplus. Our customer *has* a surplus and does not deploy it.
- **It names both failure modes** — trust and action — not just availability.
- **It makes the business case trivial.** The idle money is already inside IDBI. No customer
  acquisition, no marketing spend. The job is moving money from one IDBI product to another, which
  serves the customer better *and* earns fee income.

## The obvious objection

**"Why would IDBI want money leaving deposits?"** The bank pays ~3% on savings and lends at ~9%,
so ₹10L of deposits earns more in spread than ₹7,500 of trail commission.

Answer: fee income needs **no capital set aside and carries no credit risk**, so return on equity
is far higher even though the rupee number is smaller. SIPs come from monthly *surplus*, not the
existing balance, so the deposit largely stays. And advised customers stick, whereas depositors
chase rates.

## What advice actually is, mechanically

Retail financial planning is close to a solved, deterministic waterfall:

1. High-interest debt (credit card, personal loan)? Clear it — nothing beats avoiding 36%.
2. Emergency fund of 3–6 months of expenses, somewhere liquid.
3. Dependents? Term cover before any investing.
4. Deploy surplus by time horizon: <3 yrs debt/FD · 3–7 yrs hybrid · >7 yrs mostly equity.
5. Close the 80C gap if there is one — **only under the old tax regime**, which is no longer the
   default, so check before leading with it.
6. Step up with every income increase.

The realistic product list for our customer is about five things: a **liquid fund** for emergency
money, **term insurance**, an **index fund SIP**, **ELSS or PPF** for a tax gap, and an **FD** for
1–3 year needs. Everything else — ULIPs, endowments, direct equity — is either mis-selling or not
our customer.

**The implication is strategic:** *what* to advise is not the hard part and is not where we
differentiate. Any advice engine will land on roughly the same recommendations because the correct
answer is standardised. Persona — age, surplus, holdings, risk appetite — mostly changes the
**amount**, the **equity/debt split**, and the **tone of explanation**, not the structure.

Build the advice engine to "boringly correct and fully explainable" and spend the remaining effort
on whether the person believes it and acts. Rough split: **20% advice, 80% delivery.**

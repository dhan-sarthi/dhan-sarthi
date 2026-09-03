# What IDBI actually sells to this customer, and which product suits when

Written 1 Sep 2026. Verified against IDBI's own site and public filings, not from memory —
sources at the bottom. Anything marked **[verify]** should be re-checked before it ships.

This doc exists because the product shelf **is** the suitability logic. A gate that refuses
the wrong product can only be built once we know what is on the shelf.

---

## First, the two words the whole demo turns on

### SIP is not a product

**A SIP (Systematic Investment Plan) is a method, not a thing you buy.** It is a standing
instruction that debits a fixed amount from the account every month and buys units of a
**mutual fund scheme**. The product is the scheme. The SIP is just the plumbing.

This matters for us in a very concrete way: *"I recommend a SIP"* is an incomplete
recommendation and a compliance officer will say so. The recommendation is
*"₹6,000 a month into <named scheme>, which is rated <riskometer band>, for a goal
<N> years out."* The scheme's risk band is what the gate checks — which is why
`productShelf` in our fixture carries `riskometer` per scheme. That part we already got
right.

Two cousins worth knowing, because IDBI offers both: **STP** (systematic transfer plan —
move a lump sum into equity gradually instead of all at once) and **SWP** (systematic
withdrawal plan — the reverse, for drawing an income). STP is genuinely the right answer for
"I have ₹2 lakh in an FD maturing, where do I put it".

### ULIP is why the refusal is credible

**A ULIP (Unit Linked Insurance Plan) bundles life insurance with market investment in one
product.** The monthly premium is split: some pays for the life cover (mortality charge),
some is eaten by premium-allocation, policy-administration and fund-management charges, and
what survives gets invested. Five-year lock-in. The cover is typically small relative to the
premium — often around 10× the annual premium.

So the customer gets **expensive insurance and mediocre investing**, and cannot exit for
five years. The right answer is almost always what the industry calls **BTID** — buy term,
invest the difference: a pure term policy for the cover, a mutual fund for the growth. Same
protection, a fraction of the cost, no lock-in, and the two halves can be changed
independently.

**Why the refusal matters:** a ULIP pays the distributor substantially more than
term-plus-fund does. So an app that refuses it is turning down the bank's own higher-margin
sale. That is not a small claim, and it is the reason the product is not just another sales
funnel with a face on it.

**The obvious objection:** *"why would IDBI ship something that suppresses its best-margin
product?"* The answer is on our side — trail commission on a mutual fund relationship that
lasts thirty years is worth more than one ULIP commission plus the mis-selling complaint
that follows it.

---

## The shelf

IDBI's position is unusual and it works in our favour: **LIC is IDBI's majority
shareholder, and IDBI is LIC's largest bancassurance partner.** LIC is appointed as a
corporate agent. So the insurance shelf is real, deep, and the conflict of interest in
refusing a LIC product is genuine — which is exactly what makes refusing one meaningful.

Note also that IDBI **distributes** mutual funds as an AMFI-registered distributor (among
the top ten in India) — it does not manufacture them. So scheme names on our shelf should
be real schemes from real AMCs, not invented "IDBI funds". Our current fixture invents them.

### The bank's own balance-sheet products

| Product | Real IDBI name | What it is | Suits |
|---|---|---|---|
| Savings account | Advantage / DIVA / Prime variants | 2.5–3%. Below inflation. | Nothing. This is where the problem lives. |
| Fixed deposit | **Suvidha Fixed Deposit** | Lump sum locked for a term, ~6.5–7.5%, interest taxable | Goals under 3 years; the emergency buffer |
| Tax-saving FD | **Suvidha Tax Saving FD** | 5-year lock-in, 80C eligible | Only on the old tax regime **[verify rate]** |
| Recurring deposit | **Systematic Savings Plan (SSP / SSP Plus)** | Fixed monthly contribution for a term, FD-like rate, no market risk | **The bank's own SIP.** The right first product for a risk-averse customer, and it keeps the money on IDBI's balance sheet |
| Floating-rate deposit | Floating Rate Term Deposit | Rate tracks a benchmark | Rate-rise view |
| Health-linked FD | **Aarogya Fixed Deposit** | FD bundled with a health cover | Niche, but a nice specific to name |
| Sweep-in / flexi | **[verify IDBI's brand name]** | Balance above a threshold auto-moves to FD and comes back on demand | **Literally the product for "₹18,400 idle four months running"** — one tap, no lock-in, no market risk, no new KYC |

**`Systematic Savings Plan` and the sweep-in facility are the two most under-used facts in
this whole project.** Using IDBI's own product names in the demo, instead of generic
"savings pot", is free specificity — and the sweep-in is a suitability-clean answer to the
idle-cash problem that requires no risk appetite at all.

### Distributed — mutual funds

| Category | What it is | Suits |
|---|---|---|
| **Liquid / overnight fund** | Debt fund, ~6–7%, redeem in ~1 day | Emergency buffer and parked cash. Better than savings, no lock-in |
| **Short-duration debt fund** | ~7%, low volatility | Goals 1–3 years out |
| **Index fund** (Nifty 50) | Tracks the index, ~0.2% expense | Long-horizon growth, cheapest way to own equity |
| **Large-cap / flexi-cap equity** | Actively managed | Long-horizon growth |
| **ELSS** | Equity + 80C deduction + 3-year lock-in | **Only on the old tax regime.** The new regime is the default since FY 2023-24, so for most customers 80C is worthless and ELSS is just an equity fund with a lock-in. Getting this right is a real sophistication signal |

Never equity for a goal under three years. That rule is already in `suitability.js` as
`HORIZON_VS_LOCKIN`, but it should also cover volatility, not only lock-in.

### Distributed — insurance

Verified partners: **LIC** (life, corporate agent, and IDBI's majority shareholder),
**Ageas Federal Life**, **Niva Bupa** (health), **TATA AIG** (general), **New India
Assurance** (general).

| Product | What it is | Suits |
|---|---|---|
| **Term life** | Pure cover, no maturity value, cheapest per rupee of protection | Anyone with dependents. Rohan has two and no cover **[verify a real premium quote — ours says ₹850/mo for ₹1 crore at 29]** |
| **Health insurance** | Genuinely under-bought in this segment | Almost everyone. One hospital admission undoes a decade of SIP |
| **ULIP** | See above | Almost nobody. On the shelf so it can be refused |
| **Endowment / money-back** | "Savings plus insurance", IRR typically ~4–5% | Almost nobody for a long-horizon goal. Same refusal logic as ULIP, and LIC sells a lot of them |

### Government schemes — the segment's best-kept secret

These pay the bank almost nothing, which is exactly why recommending them is unimpeachable.

| Scheme | Cost / return | Suits |
|---|---|---|
| **PMJJBY** | ₹436/year for ₹2 lakh life cover, auto-debited before 1 June | A customer who cannot afford term cover. An app that recommends a ₹436-a-year government scheme over a ₹2,500-a-month ULIP has made its entire argument in one screen |
| **PMSBY** | ~₹20/year for ₹2 lakh accident cover **[verify]** | Everyone. Costs nothing |
| **APY** (Atal Pension Yojana) | Guaranteed pension, small contributions | Informal / low-income |
| **NPS** | Very low cost, locked till 60, extra ₹50k deduction under 80CCD(1B) | **Retirement specifically.** Fits our thirty-year horizon perfectly and IDBI is a Point of Presence |
| **PPF** | ~7.1%, tax-free, 15 years, ₹1.5L/yr cap, sovereign guarantee | Conservative long-horizon. IDBI accepts subscriptions at ~675 branches |
| **Sukanya Samriddhi** | ~8%, tax-free | A customer with a daughter. Strong personalisation hook |
| **Floating Rate Savings Bond (RBI)** | ~8% **[verify]** | Conservative income |
| **Sovereign Gold Bonds** | — | **[verify — new issues appear to have stopped after Feb 2024, though IDBI's page still lists them.** Indians want gold exposure; if SGBs are closed, a gold fund is the compliant route.] |

Not relevant to this segment: Capital Gains Account Scheme, 54EC bonds, demat/broking,
Retail Direct.

---

## The suitability ladder

This is the order the gate should enforce, and it is close to what `suitability.js` already
does. Protection and solvency before growth — always.

```
0. High-interest debt          IDBI's card at 34.8% beats every investment. Pay it first.
1. Missed repayments           fix the record before adding a commitment.
2. Emergency buffer            1 month, then 3, then 6. Sweep-in FD or liquid fund.
                               Nothing with a lock-in until 3 months exists.
3. Protection                  term cover if dependents; PMJJBY if the budget is tiny.
                               Health cover. One admission undoes a decade of SIP.
4. Goal-matched growth         under 3 years -> RD/SSP or short-duration debt.
                               over 7 years -> index or large-cap equity.
                               retirement specifically -> NPS.
                               conservative and long -> PPF.
5. Tax efficiency LAST         and only on the old regime. Never the reason for a product.
```

**Two refusals, not one.** The demo currently plans to refuse a *product* (the ULIP). The
`AFFORDABILITY` rule already lets us refuse an *amount* — and nobody expects a bank app to
turn down money:

> *"You said ₹10,000. I'd take ₹6,000. You have no term cover and a buffer that covers
> three months. ₹4,000 more and you're borrowing again in March — I'd rather you got there
> slower and didn't."*

A bank product that declines a larger deposit is arguably the most credible thing it can
do, and it costs nothing to build because the rule exists.

---

## Projections: the compliance trap in the trajectory screen

Showing a customer "your net worth will be ₹41 lakh" as a statement of fact is not
defensible. Nobody may promise or project assured returns on a market-linked product.

The credible version, and it is barely more work:

- Show a **band, not a number** — two or three scenarios side by side.
- Put the **assumed return rate on screen**, and let the customer change it.
- Label it an **illustration**, with the standard "past performance is not indicative of
  future results".
- For insurance illustrations, IRDAI's convention is two standardised rates. Mirroring that
  convention signals we know the rules.

A band with the assumption exposed replaces a single confident corpus number. Same screen,
same effort.

## Gamification: reward the behaviour, never the amount

Rewarding a bigger number is how mis-selling starts, and it puts us on the wrong side of
our own argument. Reward instead:

- **Streaks of not leaking** — weeks inside the discretionary envelope.
- **Commitments kept** — memory already tracks `keptLastCommitment` in `facts.js`, which is
  the one moment the advisor is permitted to be visibly pleased.

The reward is never a green tick. It is the trajectory band moving.

---

## What this means for our fixture

The archived prototype's `rohan.js` fixture needs work when it moves to `packages/fixtures`:

1. **Invented scheme names.** IDBI distributes; it does not manufacture funds. Use real
   scheme names, or clearly generic ones — not `IDBI_MF_00184`.
2. **No SSP, no sweep-in, no government schemes on the shelf.** The three most suitable
   things for this customer are all missing, and two of them are IDBI's own.
3. **The EMI is missing from the transaction list.** There is an ₹8,200 education-loan EMI
   in `liabilities` that never appears as a debit, so derived outflow is wrong.
4. **The month does not reproduce the demo numbers.** The script quotes ₹49,600 out and
   ₹18,400 idle; the fixture month sums to about ₹51,630 including a ₹5,000 SIP, and
   `minBalance12m` is where ₹18,400 actually comes from. This is precisely why the ledger
   must be *generated* and the demo numbers *derived* — the current mismatch is invisible
   until a reviewer adds it up.
5. **The buffer is sized to dodge a rule.** The fixture comment admits the balance was
   chosen so `EMERGENCY_BUFFER` would not fire and block the ULIP refusal. The honest fix,
   which the comment itself recommends: give him the buffer *and* no term cover, so
   `BUNDLED_PROTECTION` is the rule that fires.
6. **He already holds a third-party fund** (Axis Flexi Cap, ₹5,000/mo). Keep that — it is
   realistic, and the advisor should not tell him to switch it just so IDBI earns the trail.

## Sources

- [IDBI Bank — mutual funds and third-party products](https://www.idbi.bank.in/mutual-funds.aspx)
- [IDBI Bank — general insurance](https://www.idbi.bank.in/general-insurance.aspx)
- [IDBI Capital — mutual fund distribution](https://idbicapital.com/mf_distribution.asp)
- [LIC signs insurance distribution pact with IDBI Bank](https://www.lifeinsuranceinternational.com/news/lic-idbi-bank-distribution-pact/)
- [LIC keen to keep part of its stake in IDBI Bank for bancassurance gains — Business Standard](https://www.business-standard.com/companies/news/lic-keen-to-keep-part-of-its-stake-in-idbi-bank-for-bancassurance-gains-123112700718_1.html)
- [IDBI Bank appoints LIC as agent — Moneylife](https://www.moneylife.in/article/idbi-bank-appoints-lic-as-agent-forms-joint-group-to-identify-synergies/56562.html)
- [IDBI Bank PPF — BankBazaar](https://www.bankbazaar.com/saving-schemes/idbi-ppf-account.html)

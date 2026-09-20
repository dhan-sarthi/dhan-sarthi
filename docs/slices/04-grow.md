# Slice 04 — Grow, and the cadence fix

Status: built, runs end to end against the live API. Full workspace suite green (592 tests).

## The backend fix that came first

**Accepting the app's own primary recommendation always refused.** The gate runs twice on
a money action — once when the daily plan proposes it, once in the decision route when the
customer accepts — and AFFORDABILITY measures a monthly commitment against
`surplus.deployable` but a one-off transfer against the balance. `buildDailyPlan` knew
which was which and passed it; the `Action` it returned dropped the distinction. So
"move your ₹2,00,000 maturing deposit into a sweep-in" was re-read on acceptance as
"commit ₹2,00,000 a month" and blocked, every time.

Fix, four files:
- `packages/core/src/actions.ts` — `Action.cadence?: 'monthly' | 'lump_sum'`, optional so
  an action written before the field keeps the stricter reading.
- `packages/core/src/dailyplan.ts` — `withVerdict` keeps the cadence it already had.
- `packages/contracts/src/domain.ts` — carried on the wire.
- `apps/api/src/application/decision.service.ts` — passed back into `evaluate`.

`conversation.service.ts` and `check-suitability.tool.ts` were deliberately **not** changed:
they answer "is this product suitable at this monthly amount", where `monthly` is correct.

Regression test in `packages/fixtures/src/suitability.test.ts` asserts the action carries
`lump_sum`, that accepting it passes, that dropping the cadence reproduces the old refusal,
and that a genuinely unaffordable monthly commitment is **still** blocked — the refusal has
to keep working, it is the product's whole claim.

Verified live: `cadence: lump_sum` on the wire, accept returns `PASS`, 9 of 9 rules passed.

## Grow

Cleo's Save tab is Cleo's own savings account. A bank's equivalent is a balance sheet, so
this tab has no Cleo source and is built from the data.

| Pane | Holds |
|---|---|
| Net worth | Assets less borrowing, the four-line breakdown, allocation across cash / equity / fixed, and the idle-cash finding |
| Holdings | Current value, what went in, paper gain, then every holding with its asset class and whether it is held outside IDBI |
| Invest | The shelf grouped into IDBI's own / market-linked / protection — every row goes through the gate |

**The gate sheet** is the screen this whole product exists to show. Pick a product, name an
amount, and nine rules run against the statement. Verified both branches:

- **LIC Market Plus ULIP at ₹2,500** → BLOCKED on `BUNDLED_PROTECTION`, 8 of 9 passed,
  *"IDBI sells this one, and I am still telling you not to buy it"*, with LIC Term Assurance
  at ₹985 named as the alternative.
- **LIC Term Assurance at ₹985** → PASS, all nine.

Either way an advice record is written: a verdict nobody recorded is one nobody can audit.

## Decisions taken here

- **Cash counts as an allocation, not as "not invested yet."** Eleven months of idle balance
  is a decision even when nobody made it on purpose.
- **Paper gain is shown in rupees, never as a return.** A notional gain annualised into a
  percentage is a performance claim, and this is not one.
- **The refusal is styled as seriously as the pass.** Same weight, same structure.

## Also fixed

- **An expired session showed "Could not reach the bank."** A 401 is not a network problem
  and that copy is advice the customer cannot act on. A dead bearer is now dropped and the
  app returns to the way in — which is also what a server restart looks like.

## Known gaps

- The gate sheet checks suitability but does not place an order; there is no cart, no OTP,
  no mandate. `POST /actions/:id/decision` is the only write that exists.
- Holdings do not link to a detail screen.
- Bell and profile controls still inert.

## Next

Slice 05 — **Protect**: cover against need, the emergency buffer, nominees. Then Uday.

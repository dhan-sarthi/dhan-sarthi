# Slice 04 — Grow, and the cadence fix

Status: built, runs end to end against the live API. The workspace suite was green when this
slice landed (592 tests then; CONTRIBUTING.md carries the current count). Grow was rebuilt on
Cleo's components on 21–22 Sep 2026; this note describes the tab as it now stands.

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

`apps/api/src/application/conversation.service.ts` and
`apps/api/src/application/avatar/tools/check-suitability.tool.ts` were deliberately **not**
changed: they answer "is this product suitable at this monthly amount", where `monthly` is
correct. The gate sheet below goes through the first of them (`evaluateProduct`).

Regression test in `packages/fixtures/src/suitability.test.ts` asserts the action carries
`lump_sum`, that accepting it passes, that dropping the cadence reproduces the old refusal,
and that a genuinely unaffordable monthly commitment is **still** blocked — the refusal has
to keep working, it is the product's whole claim.

Verified live when it landed: `cadence: lump_sum` on the wire, accept returns `PASS`, 9 of 9
rules passed.

## Grow

Cleo's Save tab is Cleo's own savings account. A bank's equivalent is a balance sheet, so the
three panes this slice built — Net worth, Holdings and Invest — have no Cleo source and are built
from the data. Two panes were added in front of them later, and they are Cleo's Save tab read
screen by screen: Save, a pot of the customer's own savings that save hacks and deposits fill,
which replaced a `savings` pane on Home that drew the roadmap's goal a second time; and
Challenges. They come first because a customer can act on them today; the three after them are
positions. `?pane=` links to any of the five (`/grow?pane=invest`), and each pane opens at its
top (`apps/mobile/app/(tabs)/grow.tsx`).

| Pane | Holds |
|---|---|
| Save | The goal card: what is in the pot, its share of the target, what the plan and the save hacks put in each month, the done-by and target dates, Add to goal (`/deposit`) and a gear (`/save-settings`); Cleo's "Finish setting up" checklist until its four first moves are made; a challenge the statement points at; the five save hacks, each opening its editor (`/save-hack`); the interest IDBI's savings rate earns; the pot's activity, by day |
| Challenges | With nothing running, the pitch: a challenge built from the statement (`/challenge-generating`) or Choose my own (`/challenge`). With one running: spent against the limit, the day grid, a tip, daily spending, ₹0-spend days and the longest streak, the lines that count, and a gear whose sheet ends it, or clears a finished one |
| Net worth | Assets less borrowing; four lines, each opening where that number lives (the statement, Uday on the deposits, Holdings, Home's Debt pane); the split across cash and deposits, equity, and fixed income and other; See what suits you, which opens Invest; the idle-cash finding once the balance has not dipped below a floor for six months |
| Holdings | Worth today, what went in and the paper gain, and the monthly SIP; whose rows these are (`SourceStrip`, to `/connections`); every holding with its asset class, its SIP and where it is held, each opening a sheet with the record behind its figure. With the holdings block switched off, it says so rather than "Nothing held yet" |
| Invest | The shelf, grouped by core's `shelfGroup` into IDBI's own, From other providers, and Protection; every row opens the gate sheet. "Ask Uday if I should invest" while anything is owed |

**The gate sheet** (`src/ui/GateSheet.tsx`) is the screen this whole product exists to show.
Pick a product, name a monthly amount (cover at a nominal premium asks for none), and nine rules
run against the statement through `POST /suitability/evaluate`. The ruling lands on the sheet: a
chip ("All 9 rules passed", or "Not suitable · rule N of 9"), "This one fits" or "I'm not going to
sell you that", the reason, the nine rules as a checklist ticked up to the one that stopped it, an
"Instead" that moves the sheet onto the better product where the shelf carries it, and a link to
the record. A refusal over a missed repayment also opens Home's Credit pane. The sheet opens over
Invest, over Protect's cover and shelf, and from today's action card on Home. Verified both
branches when this slice landed:

- **LIC Market Plus ULIP at ₹2,500** → BLOCKED on `BUNDLED_PROTECTION`, 8 of 9 passed,
  *"IDBI sells this one and I am still telling you not to buy it"*, with LIC Term Assurance
  at ₹985 named as the alternative.
- **LIC Term Assurance at ₹985** → PASS, all nine.

Either way an advice record is written: a verdict nobody recorded is one nobody can audit.

## Decisions taken here

- **Cash counts as an allocation, not as "not invested yet."** Eleven months of idle balance
  is a decision even when nobody made it on purpose.
- **Paper gain is shown in rupees, never as a return.** A notional gain annualised into a
  percentage is a performance claim, and this is not one.
- **The refusal is styled as seriously as the pass.** Same weight, same structure; the chip
  carries the colour.
- **The shelf's middle group is "From other providers"** (22 Sep), not "Market-linked". It holds
  the Public Provident Fund, which pays a rate the government sets, and a traditional endowment
  beside the funds, so "market-linked" was false about two of its rows; whose they are is true of
  all of them.
- **A position is still something to act on** (22 Sep). Each net-worth line opens where its
  number lives, each holding opens the record behind it, a finished challenge offers the next, and
  a running one can be ended: `api.endChallenge` existed and nothing called it.
- **One goal, one horizon** (22 Sep). The Save card takes its time and monthly from the plan
  (`goalHorizon` in `src/state/save.ts`), exactly as Plan's hero does, so the two tabs cannot count
  one goal two ways. The one figure the card owns is what is in the pot.

## Also fixed

- **An expired session showed "Could not reach the bank."** A 401 is not a network problem
  and that copy is advice the customer cannot act on. A dead bearer is now dropped and the
  app returns to the way in — which is also what a server restart looks like
  (`src/state/snapshot.tsx`). A link opened with no bearer at all does the same (`BearerGate` in
  `app/_layout.tsx`).

## Known gaps

- The gate sheet checks suitability but places no order; there is no cart, no OTP, no mandate.
  The one hand-off to the bank is the lead `decision.service.ts` raises when a customer accepts a
  product action from today's card and the gate passes it. A check on the gate sheet raises none.
- A holding opens its record and nothing more: nothing on the sheet redeems, switches or changes a
  SIP.
- `/challenges` keeps no history. Once a challenge is ended or cleared nothing on the wire says one
  ran, so Save's "Start a spending challenge" step stays ticked only while the tab stays mounted.

Closed since this slice landed: holdings open the record behind their figures (22 Sep), and the
bell and profile controls work (slice 05 and 22 Sep).

## Next

[Slice 05](05-protect-uday-record.md) — Protect: cover against need, the safety net, and the cover
the shelf can place. Then Uday, the record and the clock. Nominees, which this line once listed,
are not in the app.

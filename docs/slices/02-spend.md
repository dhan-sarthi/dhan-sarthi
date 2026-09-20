# Slice 02 — App shell + Spend

Status: built, runs end to end against the live API.
Reference: Cleo AI "Spend" — title, three pills, account carousel, insight cards.

## What landed

**The shell.** `app/(tabs)/` with the five tabs: **Spend · Plan · Uday · Grow · Protect**.
Custom `TabBar` — circular plate per destination, filled when active, label beneath.
Uday keeps a filled plate even when inactive; the avatar is the product's first person
and the bar should say so.

**Spend**, three panes mapping one-to-one onto Cleo's Overview / Budget / Debt:

| Pane | Holds |
|---|---|
| Overview | Today's one action, account carousel, recent transactions, what the engine noticed |
| Budget | Safe-to-spend envelope, what is already spoken for, where the discretionary goes |
| Debt | Outstanding, the "this comes first" block when the rate is high, what ends soon |

**Placeholders** for the other four tabs, each naming what will fill it. A demo that
admits what is not built reads better than one that fakes it.

## The one deliberate divergence from Cleo

Cleo leads Spend with its own card. We lead with **today's action**, above the balances.
The balance is a fact GO Mobile+ already gives the customer; the action is the only thing
on this screen they cannot get anywhere else.

## The engine now runs inside the app

`metro.config.js` resolves `@dhan/core` straight to `packages/core/src/index.ts`. It is
pure TypeScript with no dependencies, so Metro compiles it like app code — an edit to a
suitability rule hot-reloads, and the app can never be looking at a stale `dist`. This is
what makes slices 04 and 05 (Grow, Protect) tractable: the nine rules are already here.

## Bugs found and fixed

- **Four-letter merchants were being read as bank IFSC codes.** `UBER` → "Money out";
  `ZARA`, `IKEA`, `BATA` would do the same. Fixed by identifying the bank code by
  *position* (the field immediately before the VPA) rather than by shape.
  **`apps/web/src/lib/merchant.ts` had the same bug and was left unfixed, because web was
  frozen.** That file went with `apps/web` on 20 Sep ([ADR-0001](../architecture/adr/ADR-0001.md)),
  so the second copy of the bug is gone rather than outstanding. The fix described here is the one
  that survives, in `apps/mobile/src/lib/merchant.ts:47-51`.
- **`discretionary.byCategory` is cumulative over the whole ledger, not monthly.**
  Shopping came back as ₹93,234 against a ₹22,070 monthly envelope. Now divided by
  `quality.monthsOfHistory` and labelled as an average.

## Known gaps

- "Do it" on the action card does nothing yet. It should POST
  `/actions/:actionId/decision` — that route exists; wiring it is slice 03.
- The bell and profile controls in the header are inert.
- Category monthly averages sum to more than `discretionary.monthly`, because the latter
  looks like a median month rather than a mean. Labelled honestly rather than reconciled;
  worth settling which one the screen should show.
- Account carousel has no detail screen behind it.

## Next

Slice 03 — **Plan**: the roadmap, the stages, the projection band with three adjustable
rates, and wiring the daily action's did-it / declined / deferred decisions.

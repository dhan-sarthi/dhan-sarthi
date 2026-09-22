# Slice 02 — App shell + Home (`/spend`)

Status: built, runs end to end against the live API. Rebuilt on Cleo's components on 21–22 Sep
2026; this note describes the shell and the tab as they now stand. The customer sees the tab as
**Home**; its route and file are still `spend` (`apps/mobile/app/(tabs)/spend.tsx`).
Reference: Cleo AI "Spend" — title, pills, account carousel, insight cards — and Cleo's Request
tab, which pairs "Cash advance" with "Credit score".

## The shell

`app/(tabs)/` holds five tabs, and the bar reads **Home · Plan · Uday · Grow · Protect**
(`src/ui/TabBar.tsx`). Each destination is a ring with its mark inside and its label beneath; the
selected ring fills and lifts 2pt. Uday sits in the centre slot Cleo gives its assistant, and like
Cleo's assistant his ring is an outline until you are on him. That reverses this slice's original
call, which kept Uday's plate filled on every tab because the avatar is the product's first
person. It changed on 22 Sep for Cleo parity: with two filled plates on every other tab, the
selected one was the hard one to find.

Home, Plan, Grow and Protect open with `TabHeader` (`src/ui/TabHeader.tsx`): the tab's name, a
bell that opens `/noticed` ([slice 05](05-protect-uday-record.md)) and carries a dot while a
finding is urgent, and a person that opens `/profile`. Profile, added on 22 Sep, is Cleo's profile
sheet: who you are, "Ask Uday anything", rows for the record, where the data comes from, the
statement, budget and save settings and, under the simulated clock, the clock; two links out to
IDBI; and Log out.

A paned tab puts `Pills` (`src/ui/Pills.tsx`) under its header, and `usePane` reads `?pane=` from
the route, so any pane can be linked to — `/spend?pane=credit` — cold or with the tab already
mounted. The param is cleared once adopted, and on Home a pane starts at the top however it was
reached.
Screens that finish a task (`profile`, `noticed`, `set-limit`, `deposit`, `challenge`,
`challenge-generating`) rise as modal sheets; the rest slide in from the right
(`app/_layout.tsx`). A save shows a `Toast` (`src/ui/Toast.tsx`) whose host sits above the
navigator, so it lands on the screen the customer returns to. A tab whose read failed says
"Couldn't reach the bank." beside a Try again pill (`src/ui/SnapshotScroll.tsx`). In a desktop
browser the app is drawn inside a 390×844 phone (`src/ui/PhoneFrame.tsx`).

The other four tabs were placeholders when this slice landed, each naming what would fill it;
slices 03 to 05 filled them.

## Home

Four panes. Overview, Budget and Debt map one-to-one onto Cleo's three; Credit sits beside Debt
the way Cleo's Request tab pairs "Cash advance" with "Credit score".

| Pane | Holds |
|---|---|
| Overview | Today's action (`ActionCard`, [slice 03](03-plan.md)); a card per savings or current account, then deposits and investments, with a dot rail; the `ActionDial` (Statement · Set a limit · My data); one `PromoCard`; "Since last week", the six newest lines; Smart insights (`InsightCarousel`) |
| Budget | The safe-to-spend hero: what is left until the next salary, days to go, a day's share, spent against the month's budget, coming in and going out, and Set up a budget or Change the limit; a "Next steps" `Checklist` until its steps are done; Smart insights; "Going out this month", one row per kind of commitment plus the plan's share, then what is usually left over or short; "Where it goes", everyday spending in a usual month and up to six categories with any caps |
| Debt | A missed repayment first, when there is one; what is owed; Cleo's Debt Reset card with the plan's payoff drawn as a line, or "Your loans are cheap money" when nothing is expensive; an EMI that ends soon; "Nothing owed" when there is no debt |
| Credit | `src/screens/CreditContent.tsx`: the 0–100 figure from the IDBI file in a `ScoreGlow`, set in the `figure` type role, with "This is not a credit score" in the card beside it; the bureau's gauge, drawn and left empty; what moves the figure; the free bureau reports. [Slice 08](08-credit.md) has the reasoning |

Credit moved in on 22 Sep. It had been a strip inside the Debt pane pointing at `/credit`, a
pushed route with no tab of its own and a door most customers scrolled past. The pane renders the
same `CreditContent` the route does, so the two cannot drift.

**Every card leads somewhere.** Much of this arrived on 22 Sep, when too many cards could only be
read:

- Account cards open `/statement`; the deposits card asks Uday what to do with the deposit; the
  investments card opens Grow on Holdings. The first IDBI account is the dark card, as Cleo's own
  is, and another bank's account says it came through an Account Aggregator.
- The promo is the one loud card. With expensive debt or a missed repayment it hands Uday that
  question ("Ask Uday how to clear ₹…", "Ask Uday what to pay first") beside his portrait; anyone
  else gets "Spend less on one habit", which opens `/challenge-generating`.
- Every statement line, here and on `/statement`, opens `TransactionSheet`: the amount, what the
  bank recorded about the line, an Ask Uday where he can total it, and "Set a limit for…" on a
  debit a limit can steer.
- A Smart insight says the thing to do, with its amount (`src/lib/insight-copy.ts`). "Talk me
  through this" asks Uday about it; the finding about talking to a person dials IDBI's toll-free
  line instead (`src/lib/idbi.ts`). The thumbs stay on the phone: a finding rated down moves to
  the back of this tab's list the next time a pane opens.
- On Budget the gear opens `/budget-settings`, each category row opens `/set-limit` on that
  category, "Usually left over" opens Grow on Save and "Usually short by" opens the Plan's free-up
  stage. The checklist is worked out from the file: set a spending limit, cap one category, and,
  for a salary the statement found as a series, a pay-and-bills step that is already done.
- On Debt, "See what IDBI can see" switches to the Credit pane, and "See your path to zero" (or
  "See what it takes to clear", where the plan's payment is below the interest) opens the Plan's
  Numbers on the payoff.

**Every "Ask Uday about this" is one shape and one source.** `AskUday` (`src/ui/AskUday.tsx`)
draws it as Cleo's underlined link and hands the question to the Uday tab as `?ask=`, which opens
his chat with it asked. Every prefilled question in the app comes from `src/lib/ask.ts`, worded so
the engine's keyword router answers on the card's subject, and `ask.test.ts` puts each one through
core's own `answer()`. A subject no rule answers gets no question; the card offers the place that
holds the answer instead.

## The one deliberate divergence from Cleo

Cleo leads Spend with its own card. Home leads with **today's action**, above the balances.
The balance is a fact GO Mobile+ already gives the customer; the action is the only thing
on this screen they cannot get anywhere else.

## The engine runs inside the app

`metro.config.js` resolves `@dhan/core` straight to `packages/core/src/index.ts`. It is
pure TypeScript with no dependencies, so Metro compiles it like app code — an edit to a
suitability rule hot-reloads, and the app can never be looking at a stale `dist`. This is
what made slices 04 and 05 (Grow, Protect) tractable: the nine rules were already here.

## Bugs found and fixed

- **Four-letter merchants were being read as bank IFSC codes.** `UBER` → "Money out";
  `ZARA`, `IKEA`, `BATA` would do the same. Fixed by identifying the bank code by
  *position* (the field immediately before the VPA) rather than by shape: `isBankCode` in
  `apps/mobile/src/lib/merchant.ts`. `apps/web/src/lib/merchant.ts` had the same bug and was left
  unfixed, because web was frozen; that file went with `apps/web` on 20 Sep
  ([ADR-0001](../architecture/adr/ADR-0001.md)), so this fix is the only copy there is.
- **`discretionary.byCategory` is cumulative over the whole ledger, not monthly.**
  Shopping came back as ₹93,234 against a ₹22,070 monthly envelope. Now divided by
  `quality.monthsOfHistory` (`monthlyByCategory` in `src/lib/spend.ts`) and labelled as an
  average. That left the category averages adding up to more than `discretionary.monthly`, which
  is the median month (`packages/core/src/derive.ts`). Settled on 22 Sep: the card's header is
  the median month, the figure the plan, the safety net and Uday work from; the rows stay
  averages; and when they add up to more, a caption under them says so.

## Known gaps

- The account cards have no screen of their own. A savings or current account opens
  `/statement`, which lists every account's lines together.
- Nothing links to `/credit` any more. The route still renders `CreditContent`, but the gate
  sheet's missed-repayment link and the Plan's arrears stage both open `/spend?pane=credit`, so
  the route is reachable only by URL. The header comments in `spend.tsx` and `credit.tsx` still
  say those two link to it by name.
- Insight ratings have no route to record them. They live on the tab for the session and reorder
  only its own list; `/noticed` and Uday's opening still lead with the same finding.

Closed since this slice landed: the action card's buttons write decisions (slice 03), the bell
opens `/noticed` (slice 05), and the person opens `/profile` (22 Sep).

## Next

[Slice 03](03-plan.md) — Plan: the route, its stages and the numbers under them, and today's
action's did-it / deferred / declined decisions.

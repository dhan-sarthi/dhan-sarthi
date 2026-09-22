# Destination — what we are building

Worked out in conversation, 16 September 2026. This is the **what**. The journey is
[`BUILD-PLAN.md`](../architecture/BUILD-PLAN.md); the *why* is [`problem.md`](problem.md) and
[`what-good-looks-like.md`](what-good-looks-like.md). Read those two first — this document assumes
them and does not repeat their arguments.

Status: **adopted as the design target** on 16 September. Sections marked ⬚ were open then.

> **Superseded as the target, as of 22 September 2026.** The app was rebuilt against Cleo AI's
> interaction design: five tabs, Home · Plan · Uday · Grow · Protect, in place of the five surfaces
> below, and the HDFC SmartWealth reference that section draws on is retired. This page is kept as
> the record of 16 September; [`CONTRIBUTING.md`](../../CONTRIBUTING.md) has the current shape.

---

## The one sentence

> **An advisor who has read your bank statement, tells you the one thing worth doing today — or
> tells you nothing is — and can look you in the eye and explain why.**

Everything below is a consequence of that sentence. When a decision is unclear, re-read it.

## What it is not

- **Not a portfolio viewer.** Our customer has ₹1.4 lakh idle and four instruments. An asset
  allocation donut is for someone else.
- **Not a chatbot with a dashboard attached.** The avatar is the *author* of the app, not a tab
  inside it.
- **Not a spending tracker.** Spending is the raw material for advice, not the product.
- **Not a store.** We sell nothing. The advisor's ability to say *no* is the asset.

---

## Who it is for

**Design for Rohan. Verify against Priya and Sunil.** These are different activities. Designing
for three at once produces the compromise that fits nobody — which is how a product becomes a
portfolio browser with a tab for everyone.

| | Rohan Mehta | Priya Nair | Sunil Kumar |
|---|---|---|---|
| | 29, Indore, salaried | 34, Kochi, salaried | Nagpur, trader |
| Income | ₹85,000/mo | ₹1,40,000/mo | ₹72,408/mo, irregular |
| Surplus | ₹13,102/mo | **−₹2,519/mo** | ₹11,573/mo |
| Idle floor | ₹1,41,663 | ₹55,152 | ₹80,296 |
| The test | Two dependents, zero cover. Refuses the ULIP. | Earns most, can invest **nothing**. High-interest debt first. | Irregular income; no salary credit to anchor on. |

Priya is the important one. An engine that recommends a SIP to a woman with negative surplus is
exposed instantly; one that refuses is obviously real. **She is the proof the thing thinks.**

These are test fixtures, not market segments. In the product there is one user and they see only
their own file.

---

## The five surfaces

Bottom nav, Uday raised in the centre.

**Today · Money · ⟨Uday⟩ · Plan · More**

### Today

Opens with the diagnosis, then one action, then the horizon. Scrolling back through earlier days
**is the Record** — the audit trail is not a separate tab, it is this screen's history.

- **Where you stand** — `Came in` / `Gone` / `Left`, then `Working for you` and `Ready if you need
  it`. Fixed, always computable, works for every persona in `PERSONAS` — four, as of 20 Sep 2026.
- **The finding** — e.g. *₹1,41,663 hasn't moved in twelve months*. Empirical, from his own
  behaviour, not a rule of thumb he can argue with.
- **Today** — **one** action, with its reason, and `Do it` / `Not now` / `Why?`. Never a list.
- **Coming up** — the next dated event. Gives the app a future tense.

Never call a man's emergency fund "doing nothing." He needs ~3 months liquid and having it is
correct. The finding is the money *beyond* that, which his own ledger proves he never touched.

### Money

Where the money actually goes, and the home of the two actions that *create* surplus
(`cancel_subscription`, `set_category_cap`).

- `In` / `Out` / `Left`
- **`Committed` vs `Yours to move`** — the idea that makes this advice rather than a report. Only
  ₹22,918 of Rohan's ₹71,995 outflow is actually his to change this month.
- Categories, with drift flagged (his food spend is 1.9× over six months)
- Recurring mandates, with findings attached (Cultfit: 16 charges, no gym activity anywhere near
  them)

**Aggregates only. Every number is a door.** Tapping a figure opens the transactions behind it in
a sheet, pre-filtered, header repeating the arithmetic. There is no "see all transactions" button
because tapping `Out` is that. A number you can check is a number you believe.

### Uday

Never a blank prompt — Rohan doesn't know what to ask, which is why he never invested.

Before the call: what Uday already knows, what he'll probably raise, and three example questions.
`Prefer to type?` presented as a choice, not a failure.

**During the call:**

- Cards rise **as he speaks**, not after. The tool call fires server-side mid-sentence; that
  timing is the magic. A card after he stops is a chatbot.
- He **never shrinks below ~40%**. Identity is the whole argument for an avatar; a thumbnail
  spends the budget and throws away the reason.
- **Three card types:** Action (`Do it` / `Not now`), Evidence (the figure he just quoted), and
  **Refusal** — when he says no. The refusal card should be the most visually distinct thing in
  the app. It is the moment nobody can fake.
- Tapping never interrupts him. He acknowledges it and the card collapses to a tick.
- Cards outlive the call and write the Record.

**Layout: a 4:5 tile with the card beneath it — not a full-bleed crop.**

Settled 17 Sep by reading `apps/web/src/screens/Ask.tsx` (that app has since been deleted; the
framing it settled is what `apps/mobile/src/avatar/AvatarStage.tsx` renders): **Runway
publishes a landscape track, 1088×704 (~1.55:1), and a phone is ~0.46:1.** Filling the screen with
`object-fit: cover` keeps only **30% of the source width** and crops him to the bridge of the
nose. A 4:5 tile keeps a little over half the width, which is the head-and-shoulders framing the
Character was composed for.

So the reflowing split is right in *structure* — video above, card below on solid ground — and
wrong in the detail I mocked: the video is a letterboxed tile, never a full-bleed crop. The
lower-third and in-scene candidates are both dead, because both assume a full-bleed portrait
video that does not exist.

### Plan

The gap between the life he said he wanted and the one his current behaviour buys. This is
SmartWealth's drift mechanic pointed at something better than asset allocation — and it never
runs empty, because the gap is never "done."

- Where you're headed, versus what you said you wanted
- What would close it, in rupees per month
- Goals, few, with status
- Dated events that change the maths (his loan ends in five months; ₹8,200/mo appears)

### More

Mostly deliberately boring. Two rows are not:

- **What Uday can see** — per-scope consent toggles. Withdraw `Loans` and the advice depending on
  it stops firing. DPDP made operable rather than claimed.
- **Talk to a human** — the `talk_to_rm` escape hatch. The app knowing the edge of its own
  competence is what makes it defensible to a bank.

Plus the full Record with chain verification, declared investment profile, statements,
notifications, security, help.

---

## Onboarding

Three steps, and **the conversation is mandatory**. You cannot reach Today without meeting Uday.

1. **Mobile number, OTP.**
2. **Context gathering** — an animation pulling the customer's own history into Uday. It names
   real artifacts — `1,356 transactions` · `24 months` · `Acme Technologies` · `₹2,00,000 fixed
   deposit` · `2 dependents`. Named things read as true; abstract particles read as a spinner in
   costume. It also covers real work: fetching the ledger, computing the view, building the
   server-side brief.
3. **The first conversation**, ~90 seconds.

**Mandatory conversation, not mandatory voice.** It degrades to typed — same script, same
questions, same engine, same cards. A mandatory *live call* is a single point of failure for the
entire app: a reflexively denied mic permission, a judge testing at 11pm, hotel wifi.

**Uday confirms; he does not gather.** Rohan is already an IDBI customer — asking his income would
be an insult. The ledger knows income, spending, EMIs, dependents, holdings, city, tax regime. It
cannot know what he *wants*, whether the ₹8,000 to Meena Mehta is support, whether the idle money
is spoken for, or whether Acme gives him cover. Four or five questions, because the bank did its
homework.

**He proves it in the first sentence:** *"I've just gone through two years of your account, so I
won't ask you anything the bank already knows."*

**The call assembles Today.** Each card he raises while talking stays. When he shrinks away, the
cards he left behind **are** the Today screen. The customer doesn't get let into the app — they
watch it built for them, one card per sentence. One card component, used in onboarding, in calls,
and as Today's content.

**It ends with a diagnosis, not a sale.** No product named, an explicit exit offered. Anil earned
no commission on the calls that mattered.

**✅ Built 17 Sep** as `apps/web/src/screens/onboarding/Conversation.tsx` — deleted with that app
on 20 Sep and rebuilt in `apps/mobile/app/(onboarding)/` — replacing the form at
step 2. Five questions, every answer a tap, opening on a line that proves the reading: *"I have
just been through 200+ lines over 11 months and ₹4,82,448 across your accounts, so I will not ask
you anything the bank already knows."* It closes on a diagnosis with no product named.

The form survives as the tier below — reachable from *"Fill in a form instead"*, and taken
automatically where the feed supplied no date of birth, because a date picker in a chat is a form
in a costume. Both save the identical `ProfilePatch`.

⬚ The wording is a first draft and is yours to sharpen. The risk question is asked as a
behaviour ("it drops 20% in a month — what do you do?") rather than as a label, because
self-assessing against *Conservative / Balanced / Growth* asks a customer to rank themselves
against words the industry invented.

---

## Rules

**Ordering.** The waterfall from `problem.md` (debt → cushion → protection → deploy by horizon)
sets what matters; **deadlines jump the queue.** Rohan's biggest structural gap is no life cover,
but his FD matures in ten days, so the FD goes first. This rule is the advisor's judgement made
explicit, and it should be written in code, not implied.

**Advice is computed, never stored.** Every recommendation is a function of (ledger + what he has
told us). Add a fact and everything re-derives; nothing "breaks" because nothing was ever frozen.
This is a property `derive.ts` / `suitability.ts` / `roadmap.ts` already have. Its human half:
when a recalculation contradicts something he was already told, **he hears it in a sentence** —
*"then ignore what I just said"* — rather than watching a number quietly change.

**Ask before advising.** A good advisor establishes the picture, then speaks.

**Restraint is the trust mechanic.** Most days the honest thing is *"nothing needs you today, here
is what's coming on the 14th."* A bank app that refuses to manufacture urgency is unlike anything
in the market. Anil called Meena twice during the 2020 crash to tell her to do nothing, and earned
nothing for it. The advisor must also be able to withdraw an idea **without replacing it** — one
that can't is just selling.

**Life drift, not portfolio drift.** SmartWealth can only see a portfolio wander off its
allocation. IDBI sees a life: an FD maturing, a loan ending, Netflix up ₹150, food spending at
1.9×. Life generates events; events generate advice; it never runs dry. This is the answer to
"what does the app say on day six."

---

## What we take from SmartWealth, and what we leave

See [`../../../smartwealth-reference/spec/`](../../../smartwealth-reference/spec/). Its screens are
**interaction grammar, not a product blueprint**. SmartWealth contains no advisory at all — it is
an excellent conversion-and-retention machine for mutual fund distribution. It is the bottom
two-thirds of our app; the top third is what IDBI actually asked for and SmartWealth cannot supply.

**Take:** the transaction spine (`add → cart → one OTP` — advice you cannot execute in-app is a
chatbot with opinions); status bands as tinted full-bleed card footers, three states; amount +
amount-in-words on every money input; SIP pause/stop/resume; reports.

**Leave:** Model Portfolios (that is the advisor's job), analytics donuts, Family Wealth, CAS,
rebalancing-as-a-feature, the six-question risk quiz (his ledger says more than his self-report;
keep a minimal declared profile in More for the regulator).

---

## The judged build and the bank artefact

Two configurations of one codebase, not a fork. They differ at one point only: who says which
customer this is. In Phase 2, inside GO Mobile+, that becomes a host-token exchange —
planned in [ADR-0008](../architecture/adr/ADR-0008.md), not built, and deliberately not an
interface until IDBI supplies the token format.

**Judged build.** The judge has no ledger, and our entire product is "an advisor who has read your
bank statement." So they pick a customer — `personas.ts` already carries the pitches — and then
get the *complete* experience: animation, call, cards, Today.

**Say what it is.** *"This is what an IDBI customer sees. Pick one."* A judge who believes the app
read their own statement and later works out it was synthetic will distrust every number
afterwards, including the true ones. Framed honestly, the picker is the demo's strongest feature:
switching to Priya and watching the advisor **refuse to sell her anything** proves more in fifteen
seconds than any architecture slide.

**Bank artefact.** Real login, real ledger, no picker.

---

## Scope

Roughly fifteen screens: login, context animation, the Uday call, Today, Money + drill-in sheet,
Plan, More + three sub-screens, and the act → confirm → OTP → done spine. Not seventy-three.

Build in the order the demo tells the story: **onboarding → Today → the call with cards.** That is
the first sixty seconds of the video and the core loop of the product. Money, Plan and More after.
If time runs out, it runs out on the tabs that are not the argument.

---

## Open

- ⬚ Final wording and order of the onboarding questions
- ⬚ Design verified against Priya and Sunil
- ⬚ Mobile spike: `@livekit/react-native` + Runway on a physical handset, and how a card reaches
  the phone mid-sentence
- ✅ **Fate of the existing 73-screen web app — settled 20 Sep 2026: deleted.** The spike answered
  the portability question by the app being rebuilt rather than ported; `apps/mobile` is the
  product and `apps/web` has been removed from the repository. See the amendment on
  [ADR-0001](../architecture/adr/ADR-0001.md).

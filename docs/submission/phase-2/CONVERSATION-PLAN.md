# Planning the conversation with Uday

Everything in this document was **run against your live API on Rohan today.** Where a
question is marked ✅ it came back `matched: true` and on subject; where it is marked ❌ it
came back *"I am not sure what you are asking."* Nothing here is guessed.

> **What carries over from these tests to a voice call, and what doesn't.**
> On a call the model calls `query_spend`, which runs **the same `answer()`** in
> `packages/core/src/query.ts` that the text chat runs. So **whether a question matches, and
> every figure it returns, carries over exactly.** Two things do not: whether Runway's model
> *chooses* to call the tool on that turn, and the words it wraps around the result. Plan the
> content from this document; rehearse the delivery once, on the day.

---

## 1. Where Uday's words come from

Three sources, and knowing which one a question hits is the whole game.

| Source | What it is | How it behaves |
|---|---|---|
| **The brief** | A facts block built server-side from the same View the screens render, plus his persona and the rules he must follow. Capped at 10,000 chars | He can quote these without any tool. Reliable, but it is a fixed set |
| **A tool** | `query_spend` · `check_suitability` · `get_plan`. Each runs real code and returns a finished sentence | **This is where the good answers come from.** The figures are computed, not generated |
| **Himself** | Anything else | He is instructed *"never state a figure that is not in this brief or in a tool result"* — so he should say he does not have it. **This is the failure mode to design around** |

The brief's hard instructions, verbatim from `brief.builder.ts` — these are why he behaves
the way he does, and worth knowing before you try to break him on camera:

- *"Before you recommend, endorse or agree to ANY specific product, including one the
  customer raises, call `check_suitability`… You do not decide suitability yourself, and
  **you may not soften a refusal.**"*
- *"For any figure about what they spent, earned, pay for or owe, call `query_spend`…
  **Never do the arithmetic yourself.**"*
- *"You are the RM this customer was never profitable enough to be given. **Act like it.**"*
- *"Answer in the language of the customer's last turn."*

---

## 2. The rule that decides whether a question works

`answer()` is **eight keyword rules, evaluated in order, first match wins:**

```
safe to spend  >  subscriptions  >  spending (a category word + a period)  >  ULIP/endowment
>  cover  >  debt  >  why / how do you know  >  savings and balances
```

Miss all eight and you get *"I am not sure what you are asking, and I will not guess at a
number"* — honest, and terrible on camera.

**The counter-intuitive part: natural-sounding questions miss more often than clumsy ones.**
Four of the five most natural questions I tried missed. Three traps:

| Trap | Misses | Hits |
|---|---|---|
| **Words match whole** | *"Am I **saving** enough?"* · *"my **loans**"* · *"my **SIPs**"* | *"How much do I have in **savings**?"* · *"my **loan**"* · *"a **SIP**"* |
| **You need a trigger word, not a natural question** | *"Where is my money going?"* · *"What is my biggest waste?"* · *"What is the first thing I should fix?"* | *"What am I **spending** the most on?"* · *"What should I do first, **and why**?"* |
| **Order decides** | — | *"savings plan"* is read as the **ULIP** question. Any spending word anywhere makes it a **spending** question. *"why"* anywhere returns **the top finding** |

**The practical rule for the shoot:** never improvise a question on camera. Every question
you ask is on the A-list below, word for word.

---

## 3. The verified question bank

### A-list — use these

| # | Ask | He answers | Why it is on the A-list |
|---|---|---|---|
| **A1** | *"What do my subscriptions cost me?"* | *"Three live: Cult.fit at ₹1,499, Netflix at ₹649, Spotify at ₹119. That is **₹27,204 a year.** I cannot tell which you still use — you can."* | Three merchant names and an annual total nobody scripts. The closing clause is the most human line in the product |
| **A2** | *"My brother says the ULIP gives guaranteed returns. Is he wrong?"* | The full rule-9 refusal: *"…IDBI sells this one and I am still telling you not to buy it. Take term cover at ₹985 a month…"* | **Better than asking plainly** — it is a challenge, and he holds. Works in Hindi too (see §5) |
| **A3** | *"Why should I trust you when you work for the bank?"* | *"I work for the bank, yes, but I am still telling you the same thing your ledger shows…"* | **The question the jury is silently asking, asked out loud.** Matches on the `why` rule |
| **A4** | *"Can I afford ₹10,000 a month towards a SIP?"* | *"₹20,943 is left… so ₹10,000 a month towards a SIP is **not comfortable** from this month's free cash; I would not call it affordable right now."* | **A second refusal, of a completely different kind** — not a bad product, just a number that does not fit |
| **A5** | *"Is my family protected if something happens to me?"* | *"**No, not fully.** Two people depend on your income and you hold **₹0** of cover, while the rule of thumb is ₹1,02,00,000…"* | The emotional question, and it opens with "No" |
| **A6** | *"How do you know all this?"* | *"I know it from **the ledger you shared** and the dates in it…"* | The "prove it" question. Matches on `how do you know` |
| **A7** | *"How much can I spend safely until payday?"* | *"₹20,943 — about **₹698 a day** for 30 days. That is after rent, bills and EMIs ₹51,997, ₹10,933 set aside for your plan, and ₹1,127 already spent, out of ₹85,000."* | The "code did the arithmetic" beat — the whole breakdown is computed |

### B-list — spares, all verified

| Ask | He answers |
|---|---|
| *"How much do I have in savings?"* | ₹2,82,448 + ₹2,00,000 in deposits — **₹1,41,663 has not moved in twelve months** |
| *"How much interest do I pay on my debt?"* | ₹39,770 at 9.15%, ₹303 a month — **education loan ends in 5 months, freeing ₹8,200** |
| *"What happens when my education loan ends?"* | Same answer, reached from a more natural question |
| *"What did I spend on food last month?"* | ₹8,290 across 20 payments in August; mostly Coffee shop ₹3,654 and Swiggy ₹2,773 |
| *"What should I do first, and why?"* | The ₹2,00,000 deposit — *"if you do nothing it auto-renews at the counter rate"* |
| *"What should my spare savings do now?"* | The idle ₹1,41,663, then the sweep-in at ~6.8%, **no lock-in** |
| *"Is a Jeevan plan a good way to save?"* | The same refusal, via a different product name |
| *"Can I afford ₹5,000 a month towards an investment?"* | *"…within what you have left, but I would not call it comfortable because you also have 2 dependants and ₹0 life cover"* |

### Blacklist — verified to miss. Do not say these on camera.

| ❌ | Why |
|---|---|
| *"Where is my money going?"* · *"Where does my money actually go each month?"* | No category word, no period |
| *"What is my biggest waste?"* | No trigger word at all |
| *"Am I saving enough?"* | "saving" ≠ "savings" |
| *"Should I start a SIP?"* | No spend or cost verb — "SIP" alone is not enough |
| *"What is the first thing I should fix?"* | Needs the word **why** |
| *"What should I do with the two lakh deposit?"* | "deposit" alone matches nothing |
| *"What am I spending the most on?"* | ⚠️ It **matches**, but the top category comes back as **"Other at ₹34,500"**, which looks broken on camera. Avoid |

---

## 4. The conversation, designed

Four turns, ~63 seconds. The order is an argument, not a list.

| Turn | Ask | What it proves | Cut priority |
|---|---|---|---|
| **0** | *(nothing — he opens)* | It read the statement, unprompted, and knows a date ten days out | **Never** |
| **1** | **A1** subscriptions | It read the statement **line by line** — and admits what it cannot know | **Never** |
| **2** | **A2** the ULIP, **in Hindi** | The gate refuses IDBI's own product · and it speaks the customer's language | **Never** |
| **3** | **A3** *"why should I trust you?"* | It has a defensible reason to be believed | Cut first if over time |
| **4** | *(hang up → Record)* | The refusal is already filed, with the rule and the seal | **Never** |

**Why this order.** Turn 1 earns the right to Turn 2: you cannot be impressed by a refusal
from something you do not believe has read anything. Turn 3 only works *after* the refusal —
"why should I trust you" answered right after he has just talked you out of a sale is a
completely different sentence from the same question asked cold.

**The one swap worth considering.** If you would rather end on a number than on a sentiment,
replace Turn 3 with **A4** (*"Can I afford ₹10,000 a month towards a SIP?"*). You then have
**two refusals of different kinds** — one because the product is wrong, one because the
amount is. That is a stronger engineering story and a weaker emotional one. Pick one; do not
try to fit both.

> **Turn 3 is the only unverifiable beat.** A3 matched on the text path, but its answer came
> from the `why` rule plus the model's phrasing — on a call, after a refusal, Runway has the
> conversation as context and should do *better*, not worse. It is the highest-reward and
> highest-variance turn in the script. **A4 is the safe substitute and is fully verified.**

---

## 5. Hindi — where it works and where it breaks

The router is **English regex run over Devanagari text.** Tested live:

| Asked in Hindi | Result |
|---|---|
| *"मेरा भाई कहता है **ULIP** में guaranteed return मिलता है। क्या वो सही है?"* | ✅ **matched** — full refusal |
| *"क्या मुझे **ULIP** लेना चाहिए?"* | ✅ **matched** |
| *"मेरे सब्सक्रिप्शन पर कितना खर्च होता है?"* | ❌ **missed** — pure Devanagari, no keyword |

**Only the product question is safe in Hindi, and it is the best question anyway.** Two
independent paths make it work, which is why it is robust:

1. The model calls **`check_suitability`** with the **English shelf name** — the brief hands
   it the product list in English — so the gate never sees Hindi at all; or
2. It routes to `query_spend`, and the Latin token **"ULIP"** matches the rule regardless of
   the Devanagari around it.

**Rules for the take:** keep the product name in Latin script inside the Hindi sentence.
Ask every other turn in English. The language switch between Turn 2 and Turn 3 is itself a
demo — do not hide it.

---

## 6. Rehearse the content for free

**The text chat runs the same engine.** `Chat in text` → `/ask` → the same `answer()` that
`query_spend` calls. So:

| Rehearse | Where | Cost |
|---|---|---|
| **Does the question match? What figures come back?** | Chat in text | **₹0 / 0 credits** |
| The tap path, the tab order, the hang-up, opening Record | A Runway session created and never consumed | **0 credits** |
| Uday's voice, his phrasing, whether he calls the tool, Hindi | A live call | **~2 + 2 per 6s** |

Run **every** question in §3 through the text chat first and confirm it comes back matched
and on subject. Do this **on the deployed app, not localhost** — the deployment has no
`OPENAI_API_KEY`, so it returns the rules' raw sentence unphrased, which is the purest view
of what the engine actually says.

Then spend credits once, on delivery.

---

## 7. Pre-flight — do these in order on the day

1. **Start a fresh session.** Pick Rohan from the picker again rather than reusing an old
   one. Every figure in this document is as of the anchor date, **1 September 2026**
2. **Check the clock has not been moved.** You press +1 month during the *app* half — do it
   **after** you have shot the call, or re-pick Rohan before the call. A moved clock changes
   every number Uday says
3. **Clear stale decisions.** The brief includes *"What they decided recently"* — the last
   five. If you tapped "Not for me" while rehearsing, Uday may bring it up. A fresh session
   starts clean
4. **Check the credit balance**, and again after every take:
   ```bash
   curl -s https://api.dev.runwayml.com/v1/organization \
     -H "Authorization: Bearer $RUNWAY_API_KEY_1" | jq .creditBalance
   ```
5. **Confirm the Uday tab says "Start a call"** and shows minutes left. If it says he is with
   another customer, the budget or the pool is exhausted
6. **Text-rehearse all four questions** on the deployed app. Confirm four matches
7. **Silently rehearse the Hindi sentence out loud** three times. A mispronounced product
   name is the one thing that will break the turn
8. **Record audio from the tab, not the room mic**

---

## 8. When a turn misfires, live

You will know instantly: he says *"I am not sure what you are asking"*, or he states a
figure with no number you recognise.

| What happened | Do this |
|---|---|
| He says he is not sure | **Do not rephrase on the fly.** Ask the next A-list question and move on. Cut the dead turn in the edit |
| He answers in English after a Hindi question | Keep going, finish the take, and use it. **Then cut the Hindi turn and re-ask it in English** in a second take. An English refusal is still the best moment in the video |
| He states a number you do not recognise | **Kill the take.** The entire claim is *code owns the numbers.* Never ship this |
| The call drops, or he is unavailable | **Show the fallback ladder instead — and say so out loud:** *"The avatar is the face, not the brain. If Uday is busy, the same question, the same rules and the same record come back in text, phrased entirely by the engine with no model involved at all."* Then ask the same ULIP question in Chat in text and show the identical refusal |

A jury that watches a system degrade gracefully trusts it more than one that watches a
flawless take. The fallback is a feature; treat it like one.

---

## 9. After the take — prove he actually called the tools

This is what turns "a nice video" into evidence, and it is worth a line on slide 11.

- **The API log** prints one line per tool call: `tool call answered`, with the tool name,
  the latency, and for the gate the verdict, the rule id and the product. That is the
  proof the rules answered and the model did not
- **Record → Advice** shows the refusal as a row with source `avatar_tool`, the exact
  sentence spoken, and the seal — written **before** the verdict was returned, so the record
  exists before the sentence does
- **The reconciler** compares Runway's own transcript against our tool ledger after the call
  and records the coverage rather than assuming it

Screenshot the log line and the Record row. Together with
[`../../engineering/avatar-live-call.md`](../../engineering/avatar-live-call.md) — the
3 September call where the rules answered in **665 ms** — that is a complete evidence chain
from "a model said something" to "our code decided it."

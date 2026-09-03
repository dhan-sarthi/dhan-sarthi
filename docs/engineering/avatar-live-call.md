# The gate on a live call: the model asked, the rules answered, the customer heard the refusal

**The claim this page exists to settle.** Dhan Sarthi says the model never decides whether a
product suits a customer: it calls `check_suitability`, our process runs the deterministic rules
in `packages/core`, and the model reads back the sentence the rules wrote. Every earlier page in
this repository could only show that in pieces — the rules are unit-tested, and
[the RPC spike](runway-rpc-spike.md) showed our handler joining the room before the browser is
handed its credentials. Neither showed the model actually calling the tool during a conversation.

This one does, on a billed call, with the provider's own record as the evidence.

## The call

| | |
|---|---|
| Session | `3477379d-6d24-42ab-aacd-20ebba5340e8` |
| When | 3 September 2026, 10:41:28 → 10:43:54 UTC |
| Duration | 122 seconds, ended cleanly (`status: ended`) |
| Tools registered | `check_suitability`, `query_spend`, `get_plan`, all `backend_rpc` |
| Customer | Rohan Mehta, from the seeded database, at the anchor date |

The customer's side was a real browser: Chromium with a synthesised WAV played into a fake
microphone, so the audio reached the worker exactly as a person's would. The driver is
[`evidence/avatar-live-call.mjs`](evidence/avatar-live-call.mjs); the full provider record is
quoted below and was fetched from `GET /v1/avatar_conversations/{id}` after the call.

## What was said, and what happened underneath

The customer asked the question the demo is built around:

> "Uday, my cousin says I should take the LIC Market Plus ULIP for two and a half thousand a
> month. Should I?"

The model did not answer from its own judgement. It called our tool:

```json
{
  "name": "check_suitability",
  "arguments": { "product_name": "LIC ULIP", "monthly_amount": 2500 }
}
```

Our process answered in **665 ms**, from the same `evaluate()` the screens use:

```json
{
  "verdict": "BLOCKED",
  "product": "LIC Market Plus ULIP",
  "rule_id": "BUNDLED_PROTECTION",
  "spoken": "No. It costs about 3 times what a term plan costs for the same job, and the charges
             are buried inside it where you cannot see them. IDBI sells this one, and I am still
             telling you not to buy it. Take the term cover at around ₹880 a month and invest the
             difference where you can watch it.",
  "alternative": { "product_id": "LIC_TERM_201", "name": "LIC Term Assurance — ₹1 crore cover", "monthly": 880 }
}
```

And the customer heard that sentence, near enough word for word, in Uday's voice:

> "No. It costs about three times what a term plan costs for the same job, and the charges are
> buried inside it where you cannot see them. I sell this one, and I am still telling you not to
> buy it. Take the term cover at around eight hundred and eighty rupees a month and invest the
> difference where you can watch it."

The rule that fired, `BUNDLED_PROTECTION`, is rule nine of nine and is the one that makes the
product the bank sells refusable. Nothing in the model chose it. The rules chose it, from the
customer's own ledger, and the model was left with the phrasing.

## What this proves, and what it does not

**Proven.** The tool boundary is real on the voice path, not a prompt instruction: the tool was
registered on the session, the model called it for a product the *customer* raised, our
deterministic engine produced the verdict, and the spoken answer carried it. The provider's own
conversation record holds the call and the result, so the audit trail can be reconciled against a
third party rather than only against our own ledger.

**Not proven here.** That the model *always* calls the tool. Nothing in Runway's API can promise
that, which is why the reconciler exists: after every call we compare the provider's `toolCalls`
against our own tool ledger and record the coverage on the session, so a call where the gate did
not fire is visible rather than assumed. A model that answers a product question without calling
the tool is a defect we can detect after the fact, not one we can prevent in the provider.

## Two things this call taught us

**Runway speaks `startScript` verbatim, including anything that reads as a stage direction.** The
first attempt's script began "Greet Rohan by name, briefly. Then say, in your own words…" and the
provider's transcript carries that instruction text as the avatar's opening turn, word for word.
`brief.builder.ts` now writes the opening *as the words themselves*, and deliberately names no
product: a scripted product mention would reach the customer without passing the gate the
transcript is reconciled against.

**The conversation record populates only after a session ends cleanly.** Every earlier session in
this account was cancelled rather than ended, and each returned zero turns — which is what
[`runway.md`](runway.md) recorded as an open question. A session that ends properly returns the
full transcript with `toolCalls` and `toolResults` attached to the assistant's turn. Teardown is
therefore not only a billing concern; it is what makes the audit trail retrievable.

One smaller observation, carried here so nobody re-diagnoses it: the model called
`check_suitability` twice for the single question, with identical arguments, and our handler
answered both. Duplicate calls are harmless — the rules are pure and each call is recorded — but
the advice record writer de-duplicates on the product and amount within a call so the customer's
record does not show the same refusal twice.

## Repeating it

```bash
# Costs about $0.20/minute and caps itself at 180 seconds.
node docs/engineering/evidence/avatar-live-call.mjs
```

It reads `apps/api/.env`, starts an API on its own port, drives a headless Chromium with the
synthesised question, waits for the tool call, then ends the session in a `finally` block whatever
happens. Ending it is what makes the transcript fetchable afterwards.

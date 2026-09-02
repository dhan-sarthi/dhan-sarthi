# Voice and memory

Built 27 Aug 2026, modelled on the architecture Cleo describe publicly.

## What Cleo actually do

**Memory (their V1).** They rejected knowledge graphs — too much upkeep — and agent-managed
memory as a long-term direction, and settled on **semantic retrieval**: summarise each
conversation, extract key topics and emotional tone, **use those topics to decide what should
not be stored at all**, embed the lot, and retrieve later by meaning, filtered for recency and
context.

**Voice.** A tone classifier decides what register the user needs, an LLM writes the script, and
that streams chunk-by-chunk to ElevenLabs over the same WebSocket the chat already uses. Audio
comes back in pieces so the conversation keeps rhythm.

**Tone.** Three parts: identity (who she is), personality (scored on OCEAN), voice (mapped to
Nielsen's four tone dimensions). Their stated unlock was **contextual tone shifting** — the roast
that motivates before an overdraft is the wrong register on payday, when the user wants a plan.
Engagement up 250%. Their governing rule: **only roast what users have the power to change.**

## What we took, and where we diverged

| | Cleo | Dhan Sarthi |
|---|---|---|
| Memory | Semantic retrieval, vector DB | Same, with a harder safeguard layer |
| Tone system | Identity / OCEAN / Nielsen | Same |
| Contextual shifting | roast ↔ hype ↔ plan | 8 registers, regret ↔ pride |
| Register | Irreverent, roasts you | Warm, never mocks |
| Voice pipeline | LLM → chunked TTS → WebSocket | gpt-realtime speech-to-speech over WebRTC |
| Horizon | 5 days (overdraft) | 30 years (retirement) |

**Why we can't roast.** Cleo is a witty third party. Ours is *you*, thirty years on. Irreverence
from a friend is funny; the same line from your own future self is self-loathing. Our emotional
range runs from regret to pride instead.

**Why our voice pipeline is simpler and faster.** Cleo assemble theirs from parts because they
predate real-time speech models. We go straight to speech-to-speech: sub-second, with genuine
barge-in.

## Files

The persona and memory system — identity, OCEAN and Nielsen dimensions, the 8 tone registers,
guardrails, 8 languages, `classifyTone()`, the vector store (cosine + recency decay +
topic-overlap boost), conversation extraction with safeguards, `remember()` / `recall()` /
`openCommitments()` / `forget()`, and a server-side proxy for chat + embeddings — was implemented
and tested end to end in the archived prototype, with the model calls stubbed. It is pending port
into `apps/api` (memory) and `packages/core` (tone registers).

## The tone registers

Chosen deterministically by `classifyTone()` before the model is ever called. Rules rather than a
learned classifier: predictable, auditable, and impossible to get embarrassingly wrong.
Order matters — distress outranks everything.

`debt_stress` → `market_drop` → `protection_gap` → `payday` → `good_progress` → `idle_surplus` →
`shortfall`, with `first_meeting` overriding all of it.

The adaptation of Cleo's rule: **only name a gap they can act on within the next month.** Money
already spent cannot be unspent, so mentioning it is cruelty dressed as honesty.

## Memory safeguards

Cleo mention filtering what not to remember. We hardened it, because a bank storing the wrong
inference about a customer is a different order of problem than a consumer app doing it.

Never stored: health, medical, disability, pregnancy, mental health · caste, religion, politics,
ethnicity · sexuality, gender identity · legal trouble · credentials, OTP, PIN, PAN, Aadhaar,
card numbers · third-party finances.

Plus regex redaction of anything Aadhaar-, PAN- or card-shaped before text is embedded or
persisted, and a `worthRemembering` flag so small talk never reaches the store.

There is also a product reason, not only a legal one: a future self that remembers your medical
history is not reassuring, it is uncanny. The moment a customer feels surveilled, the product is
finished.

## Retrieval

`score = cosine_similarity × recency_weight + context_boost`

Recency halves over 60 days, floored at 0.55 so nothing important disappears. Context boost is
topic overlap with what is being discussed now, capped at 0.15 — enough to stop a six-month-old
aside about tax outranking last week's promise about a SIP, not enough to swamp meaning.

Verified in the archived prototype's memory test: a week-old SIP promise correctly outranks a
200-day-old memory of near-identical cosine similarity.

## Where this runs in production

The server-side LLM proxy is the only piece that touches a provider. In IDBI's sandbox it becomes
a Bedrock call from inside the VPC and the client stays identical. The vector store's interface is
deliberately narrow so IndexedDB becomes pgvector in the bank's own RDS in one file.

## How the app feeds it

A facts layer sits between the behaviour engine and the persona, and produces two things:

- **`buildFacts()`** — the only figures the future self may state, written as short natural-language
  statements rather than JSON. Models reproduce phrasing far more reliably than they reformat
  structured data mid-sentence.
- **`buildToneSignals()`** — the input to `classifyTone()`, including `keptLastCommitment`, which
  comes from memory. That is what lets him notice you kept your word, the one moment he is allowed
  to be visibly pleased.

The app shell loads open commitments and memory count on mount, recomputes facts from live state on
every render, and re-reads memory when a call ends so the next one knows about the last.

The mock data fields deliberately mirror the derived-signal group in the sandbox data spec,
so swapping mock for the real IDBI feed is a data-source change and nothing more.

Verified end to end in the archived prototype's session test: a first call opens in `first_meeting`,
the commitment made during it is stored, and the second call opens in `good_progress` carrying the
memory of what was promised.

## A choice worth making deliberately

Register order puts `protection_gap` above `payday`. With the demo persona — two dependents, no
term cover — that means the call opens on insurance, not on the idle money the demo script leads
with.

That is arguably correct: protection before investment is our stated principle, so the classifier
is being consistent with the product. But it is not what the demo script assumes. Either give the
demo persona term cover, or rewrite the opening beat. Do not fix it by reordering the registers —
that would make the product contradict its own advice.

## Still to do

- **The proactive layer.** Cleo's "insight pool" — structured financial facts generated on a
  schedule rather than in response to a question — is what makes a notification-first product
  possible. We have the memory half; this is the other half.
- **Evaluation.** Cleo run simulated conversations pre-launch with pass/fail criteria, then
  LLM-as-judge plus human annotators against a golden set, scoring seven dimensions:
  comprehension, repetitiveness, usefulness, accuracy, tone of voice, suggested actions, overall
  quality. Worth copying.

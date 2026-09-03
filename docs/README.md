# Documentation

Reading order for someone new to the project. About thirty minutes end to end.

## Product

1. [`product/problem.md`](product/problem.md): what is actually being solved, from first
   principles. Why bank advisory has never reached most customers, and the three barriers.
2. [`product/what-good-looks-like.md`](product/what-good-looks-like.md): the private-banker
   ceiling, where software beats a human, and what an avatar is for.
3. [`product/autopilot.md`](product/autopilot.md): **the product spine.** Object model, screens,
   the fallback ladder, and the derived numbers for the three synthetic customers.
4. [`product/product-shelf.md`](product/product-shelf.md): what IDBI actually sells this
   customer, what SIP and ULIP are, and the suitability ladder.
5. [`product/decisions.md`](product/decisions.md): every settled decision, its default, and what
   it costs to reverse.
6. [`product/voice-and-memory.md`](product/voice-and-memory.md): the voice persona and the
   semantic memory design with its safeguards.

## Engineering

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md): the engineering contract. Where code goes, the
  invariant that matters most, conventions, and what is still to port.
- [`engineering/runway.md`](engineering/runway.md): the avatar provider, verified behaviour,
  and the operational gotchas.
- [`engineering/schema/`](engineering/schema/README.md): the relational schema the API is built
  on. Four Postgres schemas, the compliance properties the database itself enforces, the field
  mapping from IDBI's specification and the Account Aggregator schemas, and how an unknown
  sandbox payload becomes a mapping rather than a rewrite. The DDL sits beside it.
- [`engineering/data-calibration.md`](engineering/data-calibration.md): what a real IDBI
  statement looks like and the public numbers the synthetic generator is calibrated against.

## IDBI integration

- [`integration/data-requirements.md`](integration/data-requirements.md): the 93 fields across
  8 groups the product needs from the bank, with fallbacks for every optional field.
- [`integration/aws-sandbox.md`](integration/aws-sandbox.md): the sandbox stack requested, and
  the network-egress requirement the voice feature depends on.

## Submission

- [`submission/problem-statement.md`](submission/problem-statement.md): the official Problem
  Statement 1 text and the hackathon format.
- [`submission/phase-1-deck.md`](submission/phase-1-deck.md): the Phase 1 deck as submitted.
- [`submission/research.md`](submission/research.md): market, regulatory and behavioural
  research with sources.

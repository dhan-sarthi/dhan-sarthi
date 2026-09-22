# Documentation

Reading order for someone new to the project. About thirty minutes end to end.

## Product

1. [`product/problem.md`](product/problem.md): what is actually being solved, from first
   principles. Why bank advisory has never reached most customers, and the three barriers.
2. [`product/what-good-looks-like.md`](product/what-good-looks-like.md): the private-banker
   ceiling, where software beats a human, and what an avatar is for.
3. [`product/autopilot.md`](product/autopilot.md): **the product spine.** Object model, screens,
   the fallback ladder, and the derived numbers for Rohan, Priya and Sunil. Written 1 September
   2026, before Karan; there are four personas now, and the fourth has a document of its own.
4. [`product/demo-persona.md`](product/demo-persona.md): **Karan Deshpande**, the customer the
   demo is told on and the only one who exercises all nine suitability rules by himself.
5. [`product/product-shelf.md`](product/product-shelf.md): what IDBI actually sells this
   customer, what SIP and ULIP are, and the suitability ladder.
6. [`product/decisions.md`](product/decisions.md): every settled decision, its default, and what
   it costs to reverse.
7. [`product/voice-and-memory.md`](product/voice-and-memory.md): the voice persona and the
   semantic memory design with its safeguards.

## Engineering

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md): the engineering contract. Where code goes, the
  invariant that matters most, conventions, and what is still to port.
- [`architecture/HLD.md`](architecture/HLD.md): the adopted architecture. The system diagram,
  the folder tree, the ports every adapter implements, and the non-functional requirements.
- [`architecture/LLD.md`](architecture/LLD.md): module signatures and dependencies, one section
  per module the design introduces.
- [`architecture/lifecycles.md`](architecture/lifecycles.md): six sequence diagrams, from
  opening the app to advancing the simulated clock, including the gated avatar grant.
- [`architecture/DATA-AND-API.md`](architecture/DATA-AND-API.md): the tables the API reads and
  writes, the 51-route surface, sessions and idempotency, and the avatar integration in detail.
- [`architecture/adr/`](architecture/adr/ADR-0001.md): fourteen architecture decision records,
  each with the alternatives considered and the consequences accepted. An ADR is amended, never
  rewritten: ADR-0001, ADR-0008, ADR-0011 and ADR-0013 carry dated amendment sections, and the
  amendment is the current position where it disagrees with the decision above it. Each of the
  four says so on its `Status:` line, which is the list to re-derive this one from.
- [`architecture/THREAT-MODEL.md`](architecture/THREAT-MODEL.md): threats, STRIDE category and
  the mitigation that carries each one.
- [`architecture/TESTING-AND-DEPLOYMENT.md`](architecture/TESTING-AND-DEPLOYMENT.md): the five
  test layers, CI, containers, the AWS topology, secrets, observability and cost.
- [`architecture/BUILD-PLAN.md`](architecture/BUILD-PLAN.md): the eight-day schedule across
  the backend, web, and data and infrastructure tracks, with the demo that proves each day. It is
  a record of the plan as adopted, not of the tree as it stands — its `## Notes on the record`
  section lists the deliverables that were later reversed, the Web track among them.
- [`../infra/terraform/README.md`](../infra/terraform/README.md): the deployment runbook: the
  ten-step apply, the operator actions, and the egress the bank's network team must allow.
- [`engineering/runway.md`](engineering/runway.md): the avatar provider, verified behaviour,
  and the operational gotchas.
- [`engineering/avatar-accounts.md`](engineering/avatar-accounts.md): the account chain (Runway
  1 → 2 → 3, then Anam), what Runway bills, measured, and the tap-to-first-word latency and how
  readying the call ahead of the tap halved it.
- [`../infra/fly/README.md`](../infra/fly/README.md): the public review link on Fly.io in Mumbai,
  built from the repository's own Dockerfile, one login and one command. `fly.api.toml` is the
  only target; the second app it used to deploy was `apps/web`'s and went with it on 20 Sep 2026.
- [`engineering/schema/`](engineering/schema/README.md): the relational schema the API is built
  on. Four Postgres schemas, the compliance properties the database itself enforces, the field
  mapping from IDBI's specification and the Account Aggregator schemas, and how an unknown
  sandbox payload becomes a mapping rather than a rewrite. The DDL sits beside it.
- [`engineering/data-calibration.md`](engineering/data-calibration.md): what a real IDBI
  statement looks like and the public numbers the synthetic generator is calibrated against.

## IDBI integration

- [`integration/idbi-sandbox.md`](integration/idbi-sandbox.md): **what the sandbox actually
  does.** The twenty-four real operations, three envelopes, three refusals, every trap that cost
  a capture to find, the per-customer coverage table, and the list of things for IDBI to fix.
  Read this before the one below.
- [`integration/data-requirements.md`](integration/data-requirements.md): the 93 fields across
  8 groups the product asked the bank for. A request, not a description — IDBI built something
  different, and the file above is what exists.
- [`integration/aws-sandbox.md`](integration/aws-sandbox.md): the sandbox stack requested, and
  the network-egress requirement the voice feature depends on.

## Submission

- [`submission/problem-statement.md`](submission/problem-statement.md): the official Problem
  Statement 1 text and the hackathon format.
- [`submission/phase-1-deck.md`](submission/phase-1-deck.md): the Phase 1 deck as submitted.
- [`submission/research.md`](submission/research.md): market, regulatory and behavioural
  research with sources.

## Working record

Not part of the reading order above, and not maintained as reference — these are logs. Each was
written on the day the work happened and is left as written.

- [`slices/`](slices/01-onboarding.md): one file per vertical slice of `apps/mobile`, in build
  order — onboarding, spend, plan, grow, protect, imagery, the live avatar, credit. What landed,
  what broke, and what the next slice is blocked on.
- [`product/destination.md`](product/destination.md): the design target worked out in
  conversation on 16 September, with its own `## Open` list.
- [`agents/`](agents/domain.md): how an agent works in this repository — the domain-doc
  convention (this page's ADRs and the root `CONTEXT.md`), the issue tracker, the triage labels.

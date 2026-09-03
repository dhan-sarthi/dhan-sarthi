# Contributing

This file is the engineering contract for the repository. Read it before changing anything;
it records the rules that keep the compliance story true, the decisions we have already made,
and the provider behaviour we learned the hard way.

## What the product is

Dhan Sarthi is a conversational wealth advisor for IDBI Bank customers, built for IDBI Innovate
2026 (Problem Statement 1, Digital Wealth Management) by Team Atomic.

It **diagnoses before it prescribes**, and it **refuses to sell an IDBI product when that product
is wrong for the customer**. The refusal is the differentiator, not a caveat. It is what makes
the product credible inside a bank, and it is enforced by deterministic rules rather than by a
prompt.

The target customer sits below the threshold where a relationship manager is economical to
assign: the mass-market account that has a surplus and has never been told what to do with it.

## Architecture

```
apps/api             the ONLY process that holds a secret or calls a provider (Fastify)
apps/web             React client, mobile-first, runs the engine in the browser for the demo
packages/core        domain logic — PURE, zero I/O; the suitability rules live here
packages/contracts   request/response schemas shared by API and clients (zod)
packages/fixtures    synthetic customers and the product shelf; never real data
```

Infrastructure as code for the AWS deployment is planned under `infra/` once the sandbox exists.

### Three rules that decide where code goes

1. **Secrets and provider calls live in `apps/api`.** A client that can reach Runway or an LLM
   directly is a client that can leak a key. Clients receive short-lived, scoped tokens.
2. **Decisions live in `packages/core`, and it does no I/O.** No database, no network, no
   `process.env`. Pure functions over data the caller supplies. The suitability rules are the
   compliance story; a rule you can only exercise by standing up a server is a rule nobody can
   audit. `pnpm test` proves the whole advisory brain with zero providers configured.
3. **A route may not return a shape that is not declared in `packages/contracts`.** The API
   validates against those schemas and clients import the inferred types. This is what makes a
   second client cheap.

### The invariant that matters most

**The model never decides suitability.** It asks the rules through a tool boundary
(`check_suitability`) and receives a verdict plus the sentence the rules wrote. It phrases; it
does not judge. The Runway conversation record's `toolResults` then prove, after the fact, that
the gate fired.

Do not add a code path where a model's output determines whether a product is suitable.

Status: this holds on both paths. The screens run every product action through `evaluate()` in
`packages/core/src/suitability.ts`, and on the avatar path the brief is built server-side,
`check_suitability` is registered as a `backend_rpc` tool, and the session lifecycle hands the
browser its credentials only once our RPC handler is in the room
(`apps/api/src/application/avatar/lifecycle.ts`). On a live call the model called the tool for a
product the customer raised, our rules answered in 665 ms, and the customer heard that sentence:
the provider's own conversation record is quoted in
[`docs/engineering/avatar-live-call.md`](docs/engineering/avatar-live-call.md).

What no provider can promise is that the model calls the tool *every* time, so the reconciler
compares the provider's transcript against our tool ledger after each call and records the
coverage. A call where the gate did not fire is visible, not assumed.

## Running it

```bash
pnpm install
pnpm build              # packages first, then apps
pnpm test               # builds packages/*, then every unit and contract test
```

Three ways to run the app, by what you have:

```bash
# 1. No database, no keys. The API serves the three customers from memory.
BANK_SOURCE=memory AVATAR_PROVIDER=none pnpm dev          # api :3001 · web :5173 (proxies /api)

# 2. The shared Postgres. Ask a teammate for DATABASE_URL and put it in apps/api/.env.
pnpm --filter @dhan/api migrate                            # applies apps/api/migrations once
pnpm --filter @dhan/api seed                               # 42 months for three customers, hash recorded
BANK_SOURCE=postgres AVATAR_PROVIDER=none pnpm dev

# 3. The live avatar as well: add RUNWAY_API_KEY and RUNWAY_CHARACTER_ID to apps/api/.env.
BANK_SOURCE=postgres AVATAR_PROVIDER=runway pnpm dev
```

`pnpm --filter @dhan/api seed:check` regenerates the ledger in memory and compares its hash with
the one the database recorded; CI runs the same check. `pnpm --filter @dhan/api audit:verify`
walks every record chain. Integration tests run when `DATABASE_URL` is set:
`pnpm --filter @dhan/api exec node --test --experimental-strip-types 'test/integration/*.test.ts'`.

`pnpm test` on a fresh clone requires the packages to be built first because `@dhan/fixtures`
imports `@dhan/core` through its `dist/` export. The root scripts do this for you.

The team shares one Postgres database (Supabase, `pgvector` enabled). Only the API ever connects
to it. Browsers talk to the API and nothing else; the token in `localStorage` is the only thing
they keep.

## Conventions

- **TypeScript, strict.** `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
- **Tailwind utilities over the tokens in `tokens.css`.** No new hand-written component CSS.
  `apps/web/DESIGN.md` has the recipes and the GO Mobile+ rules every screen follows.
- **Node 22+, pnpm.** The `packageManager` field pins the pnpm version; pnpm switches to it
  automatically. The API runs `.ts` directly in dev via `--experimental-strip-types`.
- **pnpm workspaces.** `workspace:*` for internal dependencies.
- **Comments explain why, not what.** Match the density of the surrounding file.
- **No app-specific branching in shared modules.** Per-customer facts belong in fixtures or that
  customer's own record, never `if (cif === ...)` in a shared path. Rules stay principles, not
  product names.
- **Every rupee figure on a screen is arithmetic over the ledger.** Nothing is typed alongside
  the data. If a demo script needs a number, derive it from the snapshot the screen reads.
- **Commits.** Imperative subject under 72 characters; a body that explains why and what it
  found, not what changed line by line. No tool attribution trailers.
- **Never commit `.env`.** Run `git status --short | grep -i "\.env$"` before every commit.

## The avatar

Runway Characters owns the entire conversation: microphone audio in, its own cloned voice
("Uday") out, photorealistic video out over WebRTC via LiveKit. We do not generate the voice.

| Capability | Status |
|---|---|
| Transcript | live over the data channel, and fetchable after the call |
| Context injection | at session start via `personality` (10k chars) / `startScript` (2k) |
| Mid-call context push | **does not exist**; the model pulls via tools instead |
| Tool calling | `backend_rpc` (round trip to us) and `client_event` (fire-and-forget to the UI) |
| Video | **verified** in a real browser, 1088×704 at ~26 fps, measured on decoded pixels |
| Barge-in | **unverified**; Runway documents it nowhere; do not claim it in UI copy |

Operational findings, including the `queued: true` behaviour that cost twelve dead sessions, are
in [`docs/engineering/runway.md`](docs/engineering/runway.md). Read it before touching
`apps/api/src/providers/runway.ts`.

### Cost discipline

Runway bills $0.20 per minute from session creation. Teardown is wired on every path, but a
hard-killed browser bills until the session cap. **Tier 1 allows one concurrent session**, so two
people demoing at once will queue; the API answers 409 and the client must degrade honestly.

## Deployment

Target is IDBI's AWS sandbox in `ap-south-1`. **The API cannot be fully serverless**: the Runway
backend-RPC handler joins the LiveKit room as a participant and holds that connection for the
conversation's life.

- API → **ECS Fargate** or EC2 (persistent process required)
- Database → **RDS Postgres** with the `pgvector` extension
- Web → **S3 + CloudFront** (static build; the built app must reach the API by a configured
  base URL, not only through the dev proxy)
- Secrets → **AWS Secrets Manager**, fetched at startup and cached in memory, not per request

The sandbox request and the network-egress caveat are in
[`docs/integration/aws-sandbox.md`](docs/integration/aws-sandbox.md).

## Product decisions already made

These are settled. Rationale and reversal costs are in
[`docs/product/decisions.md`](docs/product/decisions.md).

- **Autopilot is the spine.** The customer names a destination; the engine builds a versioned
  roadmap; every day it emits exactly one primary action, gated by the rules, one-tap consented,
  and written to the record. See [`docs/product/autopilot.md`](docs/product/autopilot.md).
- **Future Self is cut.** No photo age-progression, no first-person future voice.
- **The avatar is male ("Uday").** UI copy must not say "she".
- **Five tabs:** Today · Plan · Ask Uday · Money · Record. Ask Uday takes the whole screen.
- **The avatar is a moment, not a surface.** It handles the diagnosis, a trigger-event decision
  and the refusal; the daily loop is text and tap over the same engine.
- **Nothing may hard-fail.** Three tiers: live avatar; then an honest "Uday is with another
  customer" with a text conversation; then fully deterministic phrasing out of `packages/core`.
  A spinner is not a fallback.
- **Projections are bands, never a single number.** Three scenarios, the rate visible and
  adjustable, labelled as an illustration, with a real-terms line.
- **The customer raises the ULIP; the app never offers it.**
- **No web fonts.** System stack only, so first paint is instant and the ₹ glyph always renders.
- **A visible simulated clock** on Today, so time-dependent behaviour can be verified in seconds.
- **No branded name for the loop in the UI.** Screens say "Today" and "your plan".

## What is still to port from the archived prototype

The earlier prototype (React + a single Fastify/Postgres server) is archived in a private
repository. Its engine, Runway transport, suitability tool, server-side brief and advice record
have been re-implemented here; the pieces below have not, in rough dependency order.

| Piece | Where it goes | Notes |
|---|---|---|
| `show_artifact` client event + canvas | `apps/web` | The rule ladder and the ULIP-vs-term comparison the customer sees while Uday speaks. |
| Semantic memory + safeguard | `apps/api/src/memory.ts` | **Port the safeguard test with it.** It pins a real leak: exact-string topic matching let a medical conversation through. Matching must stay bidirectional-substring plus a summary keyword scan. |
| Tone registers | `packages/core` | Six registers: candid, encouraging, firm, pleased, steady, careful. Chosen deterministically from the snapshot before any model call. |
| Portrait proxy | `apps/api/src/http/routes/avatar.ts` | Runway's image URL carries an expiring token; the browser cannot hold it. Today a static portrait is served instead. |
| Per-IP session limit | `apps/api` | The daily minute budget exists; the per-IP limiter does not. |

## Where the docs live

[`docs/README.md`](docs/README.md) is the reading order. Product reasoning is under
`docs/product/`, provider and deployment notes under `docs/engineering/`, the IDBI integration
specification under `docs/integration/`, and the Phase 1 submission under `docs/submission/`.

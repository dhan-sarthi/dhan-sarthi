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
apps/mobile          Expo + Expo Router + NativeWind — the product, and the only client
packages/core        domain logic — PURE, zero I/O; the suitability rules live here
packages/contracts   request/response schemas shared by the API and the client (zod)
packages/fixtures    synthetic customers and the product shelf; never real data
packages/design      the design tokens, consumed twice: raw values, and the NativeWind preset
packages/assets      generated imagery the app ships with (icons, portraits)
```

`infra/terraform` deploys it to AWS (ECS Fargate, RDS Postgres, S3 and CloudFront) and
`infra/scripts` holds the deploy, seed and smoke scripts; the runbook is
[`infra/terraform/README.md`](infra/terraform/README.md).

### The mobile app is the product

`apps/mobile` is the only client: a ground-up rewrite against **Cleo AI's** interaction design,
pulled screen by screen from Mobbin, in IDBI green. It runs on iOS and Android through Expo, and
in a browser through Expo's web target, which is what the deployment serves.

`apps/web` was frozen and then, on 20 September 2026, deleted outright. A reference to it is stale
and worth fixing, unless it is dated and says "at adoption", in which case it is provenance and
should be left alone. The amendment on [ADR-0001](docs/architecture/adr/ADR-0001.md) is the
record of the removal and of what it cost. The HDFC SmartWealth reference that preceded Cleo is
retired: nothing new is built from it.

The five tabs are **Spend · Plan · Uday · Grow · Protect**, a one-to-one map onto Cleo's five,
with Uday (the avatar) in Cleo's centre chat slot. `Grow` and `Protect` have no Cleo equivalent
and are designed in the same language. Build vertically, one flow at a time, front to back; each
flow has a note in [`docs/slices/`](docs/slices/).

### Three rules that decide where code goes

1. **Secrets and provider calls live in `apps/api`.** A client that can reach Runway or an LLM
   directly is a client that can leak a key. Clients receive short-lived, scoped tokens.
2. **Decisions live in `packages/core`, and it does no I/O.** No database, no network, no
   `process.env`. Pure functions over data the caller supplies. The suitability rules are the
   compliance story; a rule you can only exercise by standing up a server is a rule nobody can
   audit. `pnpm test` proves the whole advisory brain with zero providers configured.
3. **A route may not return a shape that is not declared in `packages/contracts`.** The API
   validates against those schemas and the client imports the inferred types. This is what makes
   a second client cheap — and it is why `apps/web` could be deleted in an afternoon without the
   API noticing ([ADR-0001](docs/architecture/adr/ADR-0001.md)).

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
# 1. No database, no keys. The API serves the four generated customers from memory.
BANK_SOURCE=memory AVATAR_PROVIDER=none pnpm dev:api      # api :3001 — `pnpm dev` runs only this now
pnpm --filter @dhan/mobile start                          # the client, separately: press w for the browser target

# 2. The shared Postgres. Ask a teammate for DATABASE_URL and put it in apps/api/.env.
pnpm --filter @dhan/api migrate                            # applies apps/api/migrations once
pnpm --filter @dhan/api seed                               # 42 months for four customers, hash recorded
BANK_SOURCE=postgres AVATAR_PROVIDER=none pnpm dev:api

# 3. The live avatar as well: fill RUNWAY_API_KEY_1 and RUNWAY_CHARACTER_ID_1 (and the Anam
#    slots, for the fallback) in apps/api/.env; .env.example lists every variable.
BANK_SOURCE=postgres AVATAR_PROVIDER=runway,anam pnpm dev:api
```

For a local Postgres instead of the shared one, `docker compose up -d` starts
`pgvector/pgvector:pg16` on port 5433 with the throwaway credentials in `docker-compose.yml`.

`pnpm --filter @dhan/api seed:check` regenerates the ledger in memory and compares its hash with
the one the database recorded; CI runs the same check. When the generator changes, the seed
refuses to run while anyone holds a live session, because reseeding erases them:

```bash
pnpm --filter @dhan/api seed --force     # note: NOT `seed -- --force`, which pnpm passes through
```

A seed whose content already matches is a no-op and never asks. `pnpm --filter @dhan/api audit:verify`
walks every record chain. Integration tests run when `DATABASE_URL` is set:
`pnpm --filter @dhan/api exec node --test --experimental-strip-types 'test/integration/*.test.ts'`.

`pnpm test` on a fresh clone requires the packages to be built first because `@dhan/fixtures`
imports `@dhan/core` through its `dist/` export. The root scripts do this for you.

In development the team shares one Postgres database (Supabase, `pgvector` enabled); the
deployment has its own RDS instance. Only the API ever connects to either. The client talks to
the API and nothing else, and the bearer is the only thing it keeps: SecureStore on a device,
`localStorage` on the Expo web build (`apps/mobile/src/api/storage.ts`).

## Conventions

- **TypeScript, strict.** `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
- **NativeWind utilities over the tokens in `packages/design/tokens.json`.** Never write a hex in
  a component; add the colour to `tokens.json` first. Typography is the eight roles on `<Type>`,
  not free-form sizes. [The design system](#the-design-system) below has both.
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

## The design system

One source of truth: `packages/design/tokens.json`. It is consumed twice: by
`packages/design/src/index.ts` for raw runtime values, and by
`packages/design/tailwind-preset.cjs` for the NativeWind utility classes. **Adding a colour means
adding it to `tokens.json` first.** Never write a hex in a component.

The structure is Cleo's: one dark ink (`#0E3329`), one warm cream ground (`#F6F2EA`), and a small
set of saturated surface fills that carry meaning (`goal`, `streak`, `budget`, `success`,
`hero`). The ink never changes; the surface under it does.

Typography is eight roles on `<Type>` (figure / display / title / answer / heading / body / label
/ caption), not free-form sizes. `apps/mobile/src/ui/Text.tsx` is the authority: `answer` was
argued in as the sixth, for the chat, and `figure` as the eighth, for the one hero number on a
screen (the credit score). A ninth is a design decision made the same way.

### Two things that bite

1. **NativeWind only styles components it registered.** `className` on a library component
   (SafeAreaView, Reanimated views, expo-image) is silently dropped and renders unstyled.
   Register it in `apps/mobile/src/ui/interop.ts`.
2. **SafeAreaView writes all four padding values**, zeroing the edges it is not managing. Put
   gutters on a child, never on the SafeAreaView itself.

Changing `tokens.json` or `tailwind-preset.cjs` needs Metro restarted with `--clear`; NativeWind
does not pick new utility classes up on a hot reload.

## Changing a route

The rule used to read: *`apps/api` serves both clients; mobile may add routes, never change or
remove one, because `apps/web` has no end-to-end tests and would break silently.* Its reason went
with `apps/web`. Formally retiring it is the owner's call, and `apps/mobile/src/api/client.ts`
says the same. What actually constrains a route change now:

1. **The registry is the declaration.** A route not in `packages/contracts/src/registry.ts`
   cannot exist, and `apps/api/test/contract/no-undeclared-route.test.ts` walks it both ways.
   Change the registry and the OpenAPI document, the validation and the client's types all move
   together.
2. **A shape change fails at `tsc`, not at runtime.** `apps/mobile/src/api/client.ts` imports
   every request and response type from `@dhan/contracts`, so the client will not compile against
   a route it no longer matches.
3. **The route table in `docs/architecture/DATA-AND-API.md` is tested.**
   `apps/api/test/contract/documented-surface.test.ts` fails if a route has no row or a row has no
   route. A route change is a documentation change.

**The one thing genuinely unprotected:** nothing proves the *screens* still render what the routes
return. The Playwright walkthrough that would have caught it went with `apps/web`, and
[`TESTING-AND-DEPLOYMENT.md`](docs/architecture/TESTING-AND-DEPLOYMENT.md) records that as an open
hole. A route change is safe from the compiler's point of view and still wants a look at the
screen that reads it.

## Where tests live

A package's tests live in that package. `@dhan/core` has its own suites over hand-built literals:
`snapshot.testkit.ts` builds a complete `Snapshot` so a test can say "the same customer, but
carrying a card at 34.8%" without a generator. `*.testkit.ts` is a test helper: excluded from
`dist` by `packages/core/tsconfig.json`, loaded by `tsconfig.test.json`, and never picked up by
`node --test`.

The whole tree is **865 tests, zero failures** as of 22 September 2026: core 218, contracts 25,
fixtures 171, api 256, mobile 195. The API's Postgres integration suite adds 73 more when
`DATABASE_URL` is set, and CI runs it against a fresh database on every push to `main`.

**The coverage has a deliberate gap.** Seven suites stay in `packages/fixtures/src` (`roadmap`,
`suitability`, `waterfall`, `goal`, `query`, `challenge`, `credit`) because they assert outcomes
over a *generated persona*, and the generator is downstream of core. They cannot move:

- `@dhan/fixtures`'s `exports` map resolves to `dist/`, so a core test importing it would read
  fixtures' **built** output. Fixtures builds with `tsc -b` and a project reference on `../core`,
  so core's tests would need fixtures built and fixtures needs core built.
- `pnpm -r --filter './packages/*' build` prefixes all three root scripts (`build`, `typecheck`
  and `test`), and pnpm orders `-r` by `devDependencies` as well as `dependencies`, so a
  `@dhan/core` → `@dhan/fixtures` devDependency makes that graph cyclic. That entry was
  considered and rejected, not overlooked.
- `.dependency-cruiser.cjs` excludes every `*.test.ts` from its graph, so `no-circular` is blind
  to exactly that import. A green `pnpm test:arch` is not permission here; it is absence of
  coverage.

So the two kinds of test are different jobs: core's isolate one rule against a literal, fixtures'
exercise the combinations against a realistic customer. Run **both** before trusting a change to a
core module: `pnpm --filter @dhan/core test && pnpm --filter @dhan/fixtures test`.

## The avatar

Uday runs on **Runway Characters** first and **Anam** as the fallback. `AVATAR_PROVIDER=runway,anam`
tries every numbered Runway account (`RUNWAY_API_KEY_1`, `RUNWAY_CHARACTER_ID_1`, …) and then every
Anam one, failing over when an account is out of credit, busy or refused. The accounts, their
measurements and the failover design are in
[`docs/engineering/avatar-accounts.md`](docs/engineering/avatar-accounts.md); Anam's specifics are
in [`docs/engineering/anam.md`](docs/engineering/anam.md).

On Runway, the provider owns the entire conversation: microphone audio in, its own cloned voice
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

The app is live on AWS in `ap-south-1`, deployed from `infra/terraform` with the scripts in
`infra/scripts`; [`infra/terraform/README.md`](infra/terraform/README.md) is the runbook, from an
empty account to a running deployment. **The API cannot be fully serverless**: the Runway
backend-RPC handler joins the LiveKit room as a participant and holds that connection for the
conversation's life.

- API → **ECS Fargate**, one task behind an ALB (a persistent process is required)
- Database → **RDS Postgres 16** with the `pgvector` extension
- Web → **S3 + CloudFront**: the Expo web export, with `/api/*` routed to the ALB
- Secrets → **AWS Secrets Manager**, injected at task start

A new build ships with `deploy-api.sh`, then `seed-remote.sh` (migrations and the reseed), then
`deploy-web.sh`, then `smoke.sh`. The IDBI sandbox request and the network-egress caveat are in
[`docs/integration/aws-sandbox.md`](docs/integration/aws-sandbox.md).

## Product decisions already made

These are settled. Rationale and reversal costs are in
[`docs/product/decisions.md`](docs/product/decisions.md).

- **Autopilot is the spine.** The customer names a destination; the engine builds a versioned
  roadmap; every day it emits exactly one primary action, gated by the rules, one-tap consented,
  and written to the record. See [`docs/product/autopilot.md`](docs/product/autopilot.md).
- **Future Self is cut.** No photo age-progression, no first-person future voice.
- **The avatar is male ("Uday").** UI copy must not say "she".
- **Five tabs:** Spend · Plan · Uday · Grow · Protect, Cleo's five with Uday in the centre. The
  Uday tab takes the whole screen.
- **The avatar is a moment, not a surface.** It handles the diagnosis, a trigger-event decision
  and the refusal; the daily loop is text and tap over the same engine.
- **Nothing may hard-fail.** Three tiers: live avatar; then an honest "Uday is with another
  customer" with a text conversation; then fully deterministic phrasing out of `packages/core`.
  A spinner is not a fallback.
- **Projections are bands, never a single number.** Three scenarios, the rate visible and
  adjustable, labelled as an illustration, with a real-terms line.
- **The customer raises the ULIP; the app never offers it.**
- **No web fonts.** System stack only, so first paint is instant and the ₹ glyph always renders.
- **A visible simulated clock** on the Record screen, so time-dependent behaviour can be verified
  in seconds.
- **No branded name for the loop in the UI.** Screens say "your plan".

## What is still to port from the archived prototype

The earlier prototype (React + a single Fastify/Postgres server) is archived in a private
repository. Its engine, Runway transport, suitability tool, server-side brief and advice record
have been re-implemented here; the pieces below have not, in rough dependency order.

| Piece | Where it goes | Notes |
|---|---|---|
| `show_artifact` client event + canvas | `apps/mobile` | The rule ladder and the ULIP-vs-term comparison the customer sees while Uday speaks. Named `apps/web` until that app was deleted; the work did not move, it simply has one destination now. |
| Semantic memory + safeguard | `apps/api/src/memory.ts` | **Port the safeguard test with it.** It pins a real leak: exact-string topic matching let a medical conversation through. Matching must stay bidirectional-substring plus a summary keyword scan. |
| Tone registers | `packages/core` | Six registers: candid, encouraging, firm, pleased, steady, careful. Chosen deterministically from the snapshot before any model call. |
| Portrait proxy | `apps/api/src/http/routes/avatar.ts` | Runway's image URL carries an expiring token; the client cannot hold it. Today a static portrait is served instead. |
| Per-IP session limit | `apps/api` | The daily minute budget exists; the per-IP limiter does not. |

## Where the docs live

[`docs/README.md`](docs/README.md) is the reading order. Product reasoning is under
`docs/product/`, provider and deployment notes under `docs/engineering/`, the IDBI integration
specification under `docs/integration/`, and the Phase 1 submission under `docs/submission/`.

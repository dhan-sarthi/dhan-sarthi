# Dhan Sarthi

Conversational wealth advisor for IDBI Bank customers. Built for IDBI Innovate 2026,
Problem Statement 1 (Digital Wealth Management), by Team Atomic.

This file is the contract for anyone — human or agent — working in this repo.

## What the product is

An advisor that **diagnoses before it prescribes**, and **refuses to sell an IDBI product when
that product is wrong for the customer**. The refusal is the differentiator, not a caveat: it is
the thing no competing entry does, and it is what makes the pitch credible to a bank.

The target user sits below the ₹50L threshold where SEBI-registered portfolio management becomes
available — the mass-market customer a relationship manager cannot afford to serve.

## Architecture

```
apps/api        the ONLY process that holds a secret or calls a provider
apps/web        React client
packages/core   domain logic — PURE, zero I/O
packages/contracts   request/response schemas; the reason a second client is cheap
packages/fixtures    synthetic customers and product shelf
infra           AWS infrastructure as code
```

### Three rules that decide where code goes

1. **Secrets and provider calls live in `apps/api`.** A client that can reach Runway or OpenAI
   directly is a client that can leak a key. Clients get short-lived, scoped tokens.
2. **Decisions live in `packages/core`, and it does no I/O.** No database, no network, no
   `process.env`. Pure functions over data the caller supplies. The suitability rules are the
   compliance story; a rule you can only exercise by standing up a server is a rule nobody can
   audit.
3. **A route may not return a shape that is not declared in `packages/contracts`.** The API
   validates against those schemas and clients import the inferred types.

### The invariant that matters most

**The model never decides suitability.** It calls `check_suitability` and receives a verdict plus
the sentence the rules wrote. It phrases; it does not judge. This is enforced architecturally —
the rules are a tool boundary, not a prompt instruction — and `toolResults` in the Runway
conversation record proves after the fact that the gate fired.

Do not add a code path where a model's output determines whether a product is suitable.

## The avatar

Runway Characters owns the entire conversation: microphone audio in, its own cloned voice
("Uday") out, photorealistic video out over WebRTC via LiveKit. We do not generate the voice.

Verified working in the prototype:

| Capability | Status |
|---|---|
| Transcript | live over the data channel, and fetchable after the call |
| Context injection | at session start via `personality` (10k) / `startScript` (2k) |
| Mid-call context push | **does not exist** — the model pulls via tools instead |
| Tool calling | `backend_rpc` (round-trip to us) and `client_event` (fire-and-forget to UI) |
| Barge-in | **unverified** — Runway documents it nowhere; do not claim it in UI copy |

### Open question, highest risk

**We have never confirmed the video track renders in a real browser.** The session runs, the
Character speaks, the transcript returns, and a recording MP4 is produced — all verified. But
headless Chromium has no H.264, so the WebRTC video path could not be tested locally. If video
does not appear, debug that before building anything on top of it.

### Cost discipline

$0.20/min. Teardown is wired, but a hard-killed browser bills until the session cap.
**Tier 1 allows one concurrent session** — two people demoing at once will queue.

## Deployment

Target is IDBI's AWS sandbox. Not yet provisioned as of 1 Sep 2026.

**The API cannot be fully serverless.** The Runway backend-RPC handler joins the LiveKit room as
a participant and holds that connection for the conversation's life. So:

- API → **ECS Fargate** or EC2 (persistent process required)
- Database → **RDS Postgres** with the `pgvector` extension
- Web → **S3 + CloudFront** (static build)
- Secrets → **AWS Secrets Manager**, fetched at startup and cached in memory, not per request

## Conventions

- **TypeScript, strict.** `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
- **Node 22+.** The API runs `.ts` directly in dev via `--experimental-strip-types`.
- **pnpm workspaces.** `workspace:*` for internal dependencies.
- **Comments explain why, not what.** Match the density of the surrounding file.
- **No app-specific branching in shared modules.** Per-customer facts belong in fixtures or that
  customer's own record, never `if (cif === ...)` in a shared path.
- **Never commit `.env`.** Run `git status --short | grep -i "\.env$"` before every commit.

## Running it

```bash
pnpm install
cp .env.example apps/api/.env    # then fill in the keys
pnpm dev                          # api on :3001, web on :5173 (proxied at /api)
```

Postgres for local work:
```bash
docker run -d --name dhan-sarthi-pg -p 5433:5432 \
  -e POSTGRES_USER=dhan -e POSTGRES_PASSWORD=dhan -e POSTGRES_DB=dhan pgvector/pgvector:pg16
```

## What still needs porting from `../prototype`

Nothing has been ported yet — this is a scaffold. In rough dependency order:

| From | To | Notes |
|---|---|---|
| `server/src/suitability.js` | `packages/core/src/suitability.ts` | 7 rules as data. Order matters; earliest failure is the one reported. Keep rules as principles, not product names. |
| `server/src/derive.js` | `packages/core/src/derive.ts` | One snapshot, one source of truth. Screens and conversation must read the same object. |
| `server/src/providers/bank.js` | `packages/fixtures/src/` | Fixtures branch only. |
| `server/src/providers/runway.js` | `apps/api/src/providers/runway.ts` | Verified working. Note: every POST needs `Content-Type: application/json` even with an empty body, or `/consume` returns 400. |
| `server/src/avatar-brief.js` | `apps/api/src/avatar-brief.ts` | Builds the personality brief and the tool handlers. |
| `server/src/memory.js` | `apps/api/src/memory.ts` | **Port `test/safeguard.test.mjs` with it.** That test pins a real leak: exact-string topic matching let a medical conversation through. Matching must stay bidirectional-substring plus a summary keyword scan. |
| `server/src/routes/avatar.js` | `apps/api/src/routes/avatar.ts` | Includes the portrait proxy — Runway's image URL carries an expiring token, so the browser cannot hold it. Field is `referenceImageUri` on the character endpoint and `imageUrl` on the conversation record. |
| `src/styles/tokens.css` | `apps/web/src/styles/` | Chime-derived palette, single hue at 152°. Plus Jakarta Sans, self-hosted, with U+20B9 in the subset — the default latin subsets do not cover ₹. |

## Product decisions already made — do not relitigate

- **Future Self is cut.** Dropped as too hard to land and not universally liked.
- **The avatar is male** ("Uday"). UI copy must not say "she".
- **Chat as a separate screen is gone.** The conversation with the avatar is the primary surface.
- **Three tabs:** Adviser, Money, Record.
- **Screens exist for the judge as much as the customer.** A remote 60-year-old banker cannot
  feel a conversation, but recognises a compliance artifact. The supporting screens are the paper
  trail the conversation leaves behind.

## Where the research lives

`../docs/` — competitor intelligence on all 23 shortlisted teams, the avatar technology
evaluation, compliance and NDA analysis. `../prototype/` — the working prototype this
replaces, tagged `runway-working-prototype`.

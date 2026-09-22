# Testing and deployment

This document describes how the design is proven and how it is run: the five test layers and what
each one guards, the CI jobs, the container images, the three ways to run the stack locally, the
AWS topology Terraform creates in `ap-south-1`, secrets handling, observability, the deploy path
and the monthly cost. The infrastructure itself is under [`infra/`](../../infra/terraform/README.md);
this document explains why it is shaped the way it is.

Status: adopted 3 September 2026 · amended 2026-09-20 (layer 4, the web image, and the layer-1
test topology) · amended 2026-09-22 (the counts, the suites and jobs as they exist, and the live
deployment; see below).

> **Amendment, 2026-09-20.** `apps/web` has been deleted ([ADR-0001](adr/ADR-0001.md)), and it
> owned two things this document describes: the browser end-to-end suite in layer 4, and the nginx
> image and S3 upload in the deployment section. Both entries below are corrected to say what is
> there now rather than left describing a directory that is gone — **including where the answer is
> "nothing"**. There are still five layers, but layer 4 has lost its browser half and nothing
> replaced it, which is exactly the kind of thing a document like this exists to stop passing
> unnoticed. The AWS topology is unchanged: S3 and CloudFront still serve a browser build, now the
> Expo web export.
>
> **Layer 1 was separately wrong, and not because of the deletion.** It said fixtures held 158
> tests across ten named suites and that `packages/core` held 16, "in `asof.test.ts`". Both
> numbers had simply been overtaken: fixtures holds 164 across eleven — `credit.test.ts` was the
> suite nobody added to the list — and core holds 188 across ten suites, of which `asof.test.ts`
> is still exactly the 16 the sentence was written about. The paragraph also predicted that
> `goal.test.ts` would not move to core, and a core `goal.test.ts` has since been written; the
> constraint it reasoned from is intact, the prediction was not, and both are described above.
> Every figure here is the `# tests` line `node --test` printed on 20 September 2026, per suite
> and per package, not an arithmetic on the old ones.
>
> **Amendment, 2026-09-22.** The counts are re-read the same way on 22 September: 865 across the
> five workspaces, `apps/mobile`'s 195 among them, which this layer had never mentioned. Layers 2
> and 3 and the CI and deployment sections still described suites, jobs and a workflow that were
> planned and never written — a test per registry entry, an OpenAPI snapshot, three more port
> suites, `pnpm replay`, five CI jobs, `deploy.yml`, the metrics the avatar alarm reads — and now
> say what exists. The topology is deployed: the team-sandbox stack serves
> https://d31q2ik7f7eu67.cloudfront.net.

## Testing

Five layers; `pnpm test` at the root runs every test that needs no database and no keys — 865 on
22 September 2026: core 218, contracts 25, fixtures 171, api 256, mobile 195 — and the Postgres
integration suite adds 73 when `DATABASE_URL` is set, which CI's `integration` job does on every
push to `main`. The property the README already advertises must survive. Node's built-in
`node:test` throughout; no mocking library; the memory adapters are shipped implementations, not
mocks.

1. **Unit (pure, no I/O).** `packages/fixtures` holds **171 tests across eleven suites**:
   generator 22, engine 22, as-of 3, suitability 15, goal 16, query 5, challenge 27, credit 6,
   roadmap 15, waterfall 11, and **realism 29** — the last added by the calibration pass of
   3 September 2026 and covering
   exactly what was planned here (every narration matches a declared template; MCC on every
   merchant debit and on nothing else; KSEB for Kochi and MSEDCL for Nagpur; account IFSC
   `^IBKL0`; a per-employer remitter IFSC in place of the `IDIB000M` literal; unique masked
   account numbers; UPI count, ticket mean and sub-₹500 share inside the bands in
   `packages/fixtures/src/calibration.ts`), plus the bank's own lines and the festival calendar.
   Still to add: `seed-bundle.test.ts` (42-month row counts, balance continuity across the span,
   forward rows dated after the anchor, generator ↔ bundle hash stable).
   `packages/core` holds **218 tests across ten suites** of its own, over hand-built literals
   rather than over a generated customer: as-of 16, contribution 7, credit 20, goal 30,
   net worth 5, projection 22, protection 8, query 21, roadmap 53, suitability 36.
   `snapshot.testkit.ts` builds a complete `Snapshot` so a case can state one fact — the same
   customer, but carrying a card at 34.8% — without reaching for the generator; it is excluded
   from `dist` and never collected by `node --test`. The original of this paragraph described
   only `asof.test.ts` (`elapsedMonths`, `accountFactsAsOf`, `liabilityAsOf` and `sipHoldingAsOf`
   over literal `LiabilityContract`/`SipContract` values, which are core's own types, so the
   generator is not needed to state a loan), and that suite is still there and still 16.
   The six-date parity property — that `generateCustomerFile` and those functions agree at every
   clock position, which is what the whole seed rests on — stays in
   `packages/fixtures/src/asof.test.ts`, because it is a statement about two packages and core may
   not depend on the fixtures. That constraint has not moved, but the conclusion this paragraph
   drew from it has: a `goal.test.ts` **did** arrive in core, and the fixtures one stayed. They
   are two jobs, not one. Core's walks each rung of the ladder against a literal, including the
   sizing fallback that stopped a six-month emergency fund being proposed with a target of ₹0;
   fixtures' asserts the same ladder over derived personas, where several conditions are live at
   once and `priya.debt.highInterestTotal < priya.debt.total` is a claim about Priya's debt mix
   rather than about `suggestGoal`. Seven fixtures suites exercise core modules over a generated
   persona for that reason — roadmap, suitability, waterfall, goal, query, challenge, credit —
   and five of them (all but waterfall and challenge, which core has no suite for) have a
   literal-driven half in core under the same name. CONTRIBUTING.md's "Where
   tests live" carries the full argument for why the split cannot be collapsed.
   `apps/api` unit-tests its pure modules with `FixedClock`: `brief.builder` (≤10,000/≤2,000 for
   all four personas × six clock positions; every figure present in the snapshot), `lifecycle`
   (illegal transitions throw; `assertConsumable` passes only from `gated`), `waitlist` (order, 20 s hold expiry,
   ETA), minute-budget day roll, circuit breaker, the idbi-sandbox mapping against the 42 bodies
   the sandbox actually sent, tool product resolution including `UNKNOWN_PRODUCT`, reconciler
   over fixture transcripts with and without a matching toolResult.
   `apps/mobile` holds **195** over its pure per-screen derivations in `src/lib` and the call's
   framing in `src/avatar/frame.ts`, and `packages/contracts` **25** over the registry and the
   domain mirrors.

2. **Contract.** `apps/api/test/contract/`: `smoke.test.ts` walks the demo through the real
   routes on the memory profile over `app.inject()`, and every body is parsed on the way out
   against the entry's response schema by the registrar itself (a mismatch fails). There is no
   file per registry entry. Cross-cutting: `no-undeclared-route.test.ts` walks Fastify's route
   table against `ROUTES` both ways; `documented-surface.test.ts` holds the route table in
   `DATA-AND-API.md` to the registry; `rate-limit.test.ts` and `app-owned-blocks.test.ts` pin
   their rules. No snapshot of the OpenAPI document is committed or diffed. At compile time, the
   `_Parity` tuple (`packages/contracts/src/domain.ts:1629`) asserts that a core `Snapshot` (and
   `Roadmap`, `DailyPlan`, `Verdict`, `Answer` and ten more) is always a valid instance of its zod
   mirror, so a core change breaks the contracts build before a client. The Runway tool schemas
   are asserted to serialise to the JSON Schema shape recorded from the Day-1 spike's 200
   response.

3. **Port contract suites.** `bankDataPortContract(makeAdapter)` runs twice: `InMemoryBankData`
   (always) and `PostgresBankData` (the integration job). Its centrepiece is parity: for
   each persona × asOf ∈ {anchor, +1d, +7d, +30d, +6m, +18m},
   `derive(await port.loadCustomerFile(cif, asOf, 24), asOf)` deep-equals
   `derive(generateCustomerFile(spec, {anchor, asOf, months:24}), asOf)`. The IDBI adapter is held
   instead by `test/adapters/`, against its own 42 captured bodies. The other stores have
   no shared suite: the planned `auditStoreContract`, `leaseStoreContract` and
   `sessionStoreContract` were never written, and `test/integration/postgres.test.ts` covers the
   Postgres stores directly — UPDATE, DELETE and TRUNCATE on the record fail for the owner and
   for `dhan_app`, the chain verifies per subject, one credential has one winner and the waitlist
   is FIFO, and sessions keep their optimistic version and idempotency replay.

4. **Integration and end-to-end.** `apps/api/test/integration/` against a
   `pgvector/pgvector:pg16` service container: migrations from empty, `pnpm seed`,
   `pnpm seed --check`, then the suite — the Postgres port suite, append-only, the chain verified
   in code, and every session route walked as `dhan_app`. (`pnpm replay` was never written.)
   `apps/api/test/avatar/` with `FakeAvatarProvider` + `FakeRpcHost`: RPC
   opened before consume (order asserted); rejected open ⇒ exactly one cancel, zero consume, lease
   released, 502; QUEUED for the whole window ⇒ 409 `provider_concurrency` and lease released;
   budget < 2 min ⇒ 429 with no create; budget read from the store survives rebuilding the app
   object; three sessions join the waitlist ⇒ order, hold expiry promotes the next, `/end`
   releases; the ULIP tool call ⇒ BLOCKED, `BUNDLED_PROTECTION`, an `advice_records` row
   with the exact spoken sentence and source `avatar_tool` written before the handler returns.
   **There is no browser end-to-end suite today.** The walkthrough this paragraph specified — pick
   Rohan, advance the clock five months, watch the education loan leave Money, decide, find the
   sentence and snapshot id on Record, reload, be refused the ULIP by rule 9 in text, and a second
   browser picking Priya with no cross-talk — was Playwright under `apps/web/e2e/`, and it was
   deleted with the app. Nothing in `apps/mobile` replaces it. What still covers that ground is
   `apps/api/test/integration/`, which drives every one of those routes over `inject` on both the
   memory and the Postgres adapter; what is **not** covered is the part only a browser could prove,
   which is that the screens render the figures the routes returned. That is a known hole, not a
   layer that quietly passed. (The offline-badge leg of the old walkthrough is not part of the
   hole: there is no offline tier any more — see [ADR-0011](adr/ADR-0011.md).) The live Runway path
   is exercised by one billed manual smoke per day during the build, logged in
   `docs/engineering/runway.md`; it is not in CI.

5. **Architecture as tests.** `test/architecture/depcruise.test.ts`: `packages/core` imports
   nothing outside itself; `application/` may import core, contracts, ports, never adapters or
   http; `http/` never imports adapters; adapters never import each other; `process.env` appears
   only in `config.ts`. The client rule this list used to carry — `apps/web` outside `offline/`
   imports neither `@dhan/core` nor `@dhan/fixtures` — has no rule left in
   `.dependency-cruiser.cjs` and does not need one: `apps/mobile` is outside the cruise entirely,
   as that file's own header says, and the half of the rule that mattered — keeping the
   synthetic-data package off a device — is now held by `apps/mobile` not depending on
   `@dhan/fixtures` at all.

**Load and chaos (not in CI).** `infra/scripts/load.sh` (autocannon, 50 virtual reviewers
creating sessions and pressing +1 month ten times, 10 minutes) against the team sandbox with p95
targets from the NFRs; no run has been recorded, and `docs/architecture/perf.md`, where results
were to go, does not exist. `FAULT_INJECT=runway:500,db:down,rpc:refuse` was to walk every tier
locally; the variable is parsed and refused when `NODE_ENV=production`, and nothing injects a
fault yet.

**CI** (`.github/workflows/ci.yml`, on every push to `main` and every pull request) is three
jobs: `quality` (lint, format, typecheck, `pnpm test` — which carries the contract, port and
architecture tests — and the apps' build), `hygiene` (tracked env files and credential-shaped
strings refused across every tracked file, `pnpm audit --prod`) and `integration` (a
`pgvector/pgvector:pg16` service: migrate, seed, `seed --check`, then the integration suite as
`dhan_app`). The `docker`, `infra` and `bundle` jobs planned here were never added: nothing in CI
builds the image, validates the Terraform or scans a bundle.

## Deployment

**Containers.** `apps/api/Dockerfile` is multi-stage: `pnpm install --frozen-lockfile` →
`pnpm -r --filter './packages/*' build && pnpm --filter @dhan/api build` →
`pnpm deploy --filter @dhan/api --prod /out` → runtime `node:22-bookworm-slim` running
`node dist/index.js` as a non-root user with a HEALTHCHECK on `/api/v1/health`. Debian-slim
rather than Alpine because `@runwayml/avatars-node-rpc` sits on the LiveKit Node SDK's native
N-API binaries; glibc avoids the musl question on day one. The seed CLI is in the same image
(`node dist/cli/seed.js`; the replay CLI planned beside it was never written), run as a one-off
task, never from the entrypoint. **There is no second image.** The nginx image that served
`apps/web`'s static build locally is gone with the app, and so is the compose service that ran
it. The browser build is now the Expo web export:
`infra/scripts/deploy-web.sh <env>` runs `expo export --platform web` out of `apps/mobile` with
`EXPO_PUBLIC_API_URL` set to the CloudFront origin and syncs the result to the same S3 bucket — so
the AWS half of this paragraph is unchanged, and only the local half lost a container.

**Local, three ways** (the root README's *Run it locally*):
`BANK_SOURCE=memory AVATAR_PROVIDER=none pnpm dev:api` plus `pnpm --filter @dhan/mobile start`:
no database, no keys, everything works except Tier 0. Two terminals rather than one, because
`apps/mobile` has no `dev` script (Expo's is `start`), so root `pnpm dev` now runs the API alone.
`docker compose up`: postgres (`pgvector/pgvector:pg16` on 5433 as CONTRIBUTING documents,
volume, healthcheck), seed (profile, `depends_on` postgres healthy, runs migrate + seed + verify,
exits 0) and api (`BANK_SOURCE=postgres`, `AVATAR_PROVIDER` from `.env`). There is no browser tier
in compose; the mobile app reaches the API over the published host port.
`docker compose --profile seed run --rm seed` then `docker compose up` chains seed then up.
`pnpm dev:api` against `DATABASE_URL` as at adoption.

**Topology, `ap-south-1`, Terraform** ([ADR-0010](adr/ADR-0010.md)) in `infra/terraform` with
`envs/team-sandbox.tfvars` and `envs/idbi-sandbox.tfvars` differing in CIDRs, database class and
protections, image tag, and which avatar accounts the task reads. The team-sandbox stack is the live
one, applied from a laptop into the team's own account; it serves
https://d31q2ik7f7eu67.cloudfront.net. One VPC, two AZs, public subnets for the ALB and one NAT
gateway, private subnets for Fargate and RDS. ECS cluster, one service, `desired_count 1`, Fargate 1
vCPU / 2 GB, circuit-breaker rollback on, rolling min 100 % / max 200 % with `stopTimeout` 120 s
(SIGTERM drain in the API), the execution role reading three Secrets Manager ARNs and the task role
writing only its own logs and metrics; ALB with an ACM certificate and HTTPS when a domain is set —
without one, as in the live stack, CloudFront reaches it over HTTP on port 80 — health
`/api/v1/health`, idle timeout 120 s (the client's WebRTC goes to LiveKit directly, not through the
ALB). RDS Postgres 16 db.t4g.micro by default (the live stack runs db.t3.micro: there was no t4g
capacity in `ap-south-1` on 20 September 2026), 20 GB gp3, single-AZ (`multi_az` is one variable),
private, encryption at rest, `rds.force_ssl`, 7-day backups, deletion protection in `idbi-sandbox`;
`CREATE EXTENSION vector` by migration 0001. S3 private bucket with Origin Access Control plus a
CloudFront distribution with two behaviours: default → S3, `/api/*` → ALB with caching disabled and
`Authorization` / `Idempotency-Key` / `X-Waitlist-Ticket` / `X-Operator-Key` forwarded; same origin,
so production runs with CORS off. Security groups: ALB→task 3001 only; task→RDS 5432 only; task
egress via NAT restricted by port to TCP 443 and UDP 50000–60000, with the hostnames
(`api.dev.runwayml.com`, LiveKit signalling and media, TCP 443 TURN fallback) recorded for a bank's
firewall to enforce: the concrete version of the ask in `docs/integration/aws-sandbox.md`, whose
model-API egress lines are superseded by [ADR-0011](adr/ADR-0011.md).
`infra/ec2-compose/cloud-init.yaml` installs Docker and runs the compose file on a t3.medium behind
Caddy with an Elastic IP, tested once, for a sandbox that grants literally what the form asked for.

**Secrets.** Secrets Manager entries `dhan-sarthi/<env>/runway` (the avatar accounts: the
numbered `RUNWAY_API_KEY_n` / `RUNWAY_CHARACTER_ID_n` / `ANAM_*` keys that `avatar_secret_keys`
names, merged in by `infra/scripts/put-avatar-secret.sh`; the legacy comma lists still work),
`/database` (the master login's URL, which the pool narrows with `SET ROLE dhan_app`; the migrate
URL; `DHAN_APP_PASSWORD`), `/operator` (`OPERATOR_KEY`), referenced in the task definition's
`secrets:` block so values arrive as env at task start and are read once by `config.ts`:
CONTRIBUTING's fetch-at-startup rule. The seed run-task uses a separate task definition carrying
the migrate URL. Locally the same names come from `apps/api/.env`. Nothing is in the image; CI
keeps the credential-shaped-string grep, and the bundle scan was never added.

**Seeding in AWS.** `infra/scripts/seed-remote.sh` runs `aws ecs run-task` with the seed task
definition after `terraform apply`; reseed is the same with `--force`. No bastion; the database
is never public.

**Observability.** pino JSON to CloudWatch Logs via awslogs (14-day retention), with the
`authorization`, `x-operator-key`, `idempotency-key` and `x-waitlist-ticket` request headers
redacted, `X-Request-Id` on every line and response. Embedded-metric-format metrics were planned
(`avatar_minutes_used_today`, `avatar_grants`, `avatar_waitlist_length`,
`advice_records_written`, `breaker_open`) and the API publishes none of them yet. Alarms:
ALB 5xx > 5 in 5 min, no healthy task, RDS CPU > 80 %, RDS free storage < 2 GB,
`avatar_minutes_used_today` > 0.8 × budget — which, with no metric behind it and missing data
treated as not breaching, cannot fire; the budget itself is enforced in code, where
`POST /avatar/session` answers 429 — and AWS Budgets at US$100/month. A CloudWatch dashboard
with those widgets is in `observability.tf` so a reviewer sees the running system. The runbook
in `infra/terraform/README.md`: stuck lease → operator release-all; reseed → run-task; rotate or
add an avatar account → `put-avatar-secret.sh`, force new deployment; kill switch →
`AVATAR_ENABLED=false` + force new deployment; ten-step laptop apply with expected outputs.

**CI/CD.** `ci.yml` as in the testing section. There is no `deploy.yml`: deploys run from a
laptop, as the runbook documents — `infra/scripts/deploy-api.sh` builds and pushes the image to
ECR and waits for the service to stabilise, `seed-remote.sh` migrates and reseeds,
`deploy-web.sh` syncs the Expo web export to S3 and invalidates CloudFront, and `smoke.sh` checks
health, customers, a session, a view, a decision and an availability call. A workflow would need
an OIDC role in the target account, and we do not assume IDBI will let GitHub into theirs.
Deploys are scheduled outside announced demo windows.

**Cost** (monthly, `ap-south-1` list, rounded): Fargate 1 vCPU/2 GB ≈ $35, ALB ≈ $20, NAT ≈ $35
(the largest line, kept because a private subnet is what a bank network team expects), RDS ≈ $18,
CloudFront + S3 + Secrets + CloudWatch ≈ $8: about $115–130 for the platform, below the $150–250
the sandbox form estimated. Runway is the variable: $0.20/min × 240 min/day worst case = $48/day,
capped by the Postgres-backed budget (the 80 % alarm cannot fire yet; see Observability).

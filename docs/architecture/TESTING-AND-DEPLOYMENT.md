# Testing and deployment

This document describes how the design is proven and how it is run: the five test layers and what
each one guards, the CI jobs, the container images, the three ways to run the stack locally, the
AWS topology Terraform creates in `ap-south-1`, secrets handling, observability, the deploy path
and the monthly cost. The infrastructure itself is under [`infra/`](../../infra/terraform/README.md);
this document explains why it is shaped the way it is.

Status: adopted 3 September 2026.

## Testing

Five layers; `pnpm test` at the root runs the first two with no database and no keys. The
property the README already advertises must survive. Node's built-in `node:test` throughout; no
mocking library; the memory adapters are shipped implementations, not mocks.

1. **Unit (pure, no I/O).** `packages/fixtures` holds 114 tests: generator 20, engine 21,
   as-of 19, suitability 13, goal 7, query 5, and **realism 29** — the last added by the
   calibration pass of 3 September 2026 and covering exactly what was planned here (every
   narration matches a declared template; MCC on every merchant debit and on nothing else; KSEB
   for Kochi and MSEDCL for Nagpur; account IFSC `^IBKL0`; a per-employer remitter IFSC in place
   of the `IDIB000M` literal; unique masked account numbers; UPI count, ticket mean and
   sub-₹500 share inside the bands in `packages/fixtures/src/calibration.ts`), plus the bank's
   own lines and the festival calendar. Still to add: `seed-bundle.test.ts` (42-month row
   counts, balance continuity across the span, forward rows dated after the anchor, generator ↔
   bundle hash stable).
   `packages/core` gains `asof.test.ts` (`accountFactsAsOf`/`liabilityAsOf`/`sipHoldingAsOf`
   reproduce `generateCustomerFile`'s figures for six dates: the property the whole seed rests
   on) and `goal.test.ts` (moved with `suggestGoal`). `apps/api` unit-tests its pure modules with
   `FixedClock`: `brief.builder` (≤10,000/≤2,000 for all personas × six clock positions; every
   figure present in the snapshot), `lifecycle` (illegal transitions throw; consume only from
   gated), `waitlist` (order, 20 s hold expiry, ETA), minute-budget day roll, circuit breaker,
   idbi-sandbox mapping against the sample values in `data-requirements.md`, tool product
   resolution including `UNKNOWN_PRODUCT`, reconciler over fixture transcripts with and without a
   matching toolResult.

2. **Contract.** `apps/api/test/contract/`, one file per registry entry: boot
   `buildRoot({profile:'memory', avatar:'fake'})`, `app.inject()`, assert status, parse the body
   with the entry's response schema (a mismatch fails). Cross-cutting:
   `no-undeclared-route.test.ts` walks Fastify's route table and fails on any (method, path)
   absent from `ROUTES`; `openapi.snapshot.test.ts` diffs the generated document against the
   committed one; a type-level test asserts `z.infer<SnapshotSchema>` equals core's `Snapshot`
   (and `Roadmap`, `DailyPlan`, `Verdict`, `Answer`) so a core change breaks the contracts build
   before a client. The Runway tool schemas are asserted to serialise to the JSON Schema shape
   recorded from the Day-1 spike's 200 response.

3. **Port contract suites.** `bankDataPortContract(makeAdapter)` runs three times:
   `InMemoryBankData` (always), `PostgresBankData` (integration job), `IdbiSandboxBankData` fed by
   an undici `MockAgent` serving `adapters/idbi-sandbox/fixtures`. Its centrepiece is parity: for
   each persona × asOf ∈ {anchor, +1d, +7d, +30d, +6m, +18m},
   `derive(await port.loadCustomerFile(cif, asOf, 24), asOf)` deep-equals
   `derive(generateCustomerFile(spec, {anchor, asOf, months:24}), asOf)`. Same pattern for
   `auditStoreContract` (append-only: no update on the interface; Postgres additionally asserts a
   raw UPDATE as `dhan_app` raises; the chain verifies and detects a tampered row written as
   `dhan_migrate`), `leaseStoreContract` (two concurrent `tryAcquire` yield exactly one lease),
   `sessionStoreContract` (version conflict, TTL, idempotency replay).

4. **Integration and end-to-end.** `apps/api/test/integration/` against a
   `pgvector/pgvector:pg16` service container: migrations from empty, `pnpm seed`,
   `pnpm seed --check`, the Postgres port suites, `pnpm replay` on a sample advice record,
   `pnpm audit:verify`. `apps/api/test/avatar/` with `FakeAvatarProvider` + `FakeRpcHost`: RPC
   opened before consume (order asserted); rejected open ⇒ exactly one cancel, zero consume, lease
   released, 502; QUEUED for the whole window ⇒ 409 `provider_concurrency` and lease released;
   budget < 2 min ⇒ 429 with no create; budget read from the store survives rebuilding the app
   object; three sessions join the waitlist ⇒ order, hold expiry promotes the next, `/end` from a
   beacon releases; the ULIP tool call ⇒ BLOCKED, `BUNDLED_PROTECTION`, an `advice_records` row
   with the exact spoken sentence and source `avatar_tool` written before the handler returns.
   Playwright (`apps/web/e2e/`) against docker compose: pick Rohan → Today shows the safe-to-spend
   figure from `/view` → +1 month ×5 → education loan gone from Money → Do it → Record shows the
   sentence and snapshot id → reload keeps it → Ask with no keys refuses the ULIP by rule 9 in
   text with term cover named → stop the api container → offline badge appears with figures
   intact → start it → badge clears; a second browser context picks Priya concurrently and sees
   rule 1 with no cross-talk. The live Runway path is exercised by one billed manual smoke per
   day during the build, logged in `docs/engineering/runway.md`; it is not in CI.

5. **Architecture as tests.** `test/architecture/depcruise.test.ts`: `packages/core` imports
   nothing outside itself; `application/` may import core, contracts, ports, never adapters or
   http; `http/` never imports adapters; adapters never import each other; `apps/web` (excluding
   `offline/`) never imports `@dhan/core` or `@dhan/fixtures`; `process.env` appears only in
   `config.ts`.

**Load and chaos (not in CI).** `infra/scripts/load.sh` (autocannon, 50 virtual reviewers
creating sessions and pressing +1 month ten times, 10 minutes) against the team sandbox with p95
targets from the NFRs, results committed to `docs/architecture/perf.md`;
`FAULT_INJECT=runway:500,db:down,rpc:refuse` walks every tier locally and is refused when
`NODE_ENV=production`.

**CI** (`.github/workflows/ci.yml`, trigger stays `[main]`): the existing `quality` (lint,
format, typecheck, `pnpm test`, build) and `hygiene` (secret and env-file grep, dependency audit)
jobs unchanged, plus `contract`, `integration` (pg service), `architecture`, `docker` (build both
images, run the API image in memory mode, curl `/health`), `infra` (`terraform fmt -check`,
`validate` for both envs) and `bundle` (grep `dist/` for credential-shaped strings and for
fixtures in the bank build). Target under 12 minutes.

## Deployment

**Containers.** `apps/api/Dockerfile` is multi-stage: `pnpm install --frozen-lockfile` →
`pnpm -r --filter './packages/*' build && pnpm --filter @dhan/api build` →
`pnpm deploy --filter @dhan/api --prod /out` → runtime `node:22-bookworm-slim` running
`node dist/index.js` as a non-root user with a HEALTHCHECK on `/api/v1/health`. Debian-slim
rather than Alpine because `@runwayml/avatars-node-rpc` sits on the LiveKit Node SDK's native
N-API binaries; glibc avoids the musl question on day one. The seed and replay CLIs are in the
same image (`node dist/cli/seed.js`), run as one-off tasks, never from the entrypoint. `apps/web`
builds to static files; locally nginx serves them with `/api` proxied to `api:3001`; in AWS the
same `dist/` goes to S3.

**Local, three ways** (root README's Run section):
`BANK_SOURCE=memory AVATAR_PROVIDER=none pnpm dev`: no database, no keys, everything works except
Tier 0. `docker compose up`: postgres (`pgvector/pgvector:pg16` on 5433 as CONTRIBUTING documents,
volume, healthcheck), seed (profile, `depends_on` postgres healthy, runs migrate + seed + verify,
exits 0), api (`BANK_SOURCE=postgres`, `AVATAR_PROVIDER` from `.env`), web (nginx).
`docker compose --profile seed up seed` then `docker compose up` chains seed then up. `pnpm dev`
against `DATABASE_URL` as at adoption.

**Topology, `ap-south-1`, Terraform** ([ADR-0010](adr/ADR-0010.md)) in `infra/terraform` with
`envs/team-sandbox.tfvars` and `envs/idbi-sandbox.tfvars` differing only in account id, domain,
CIDRs and egress list: one VPC, two AZs, public subnets for the ALB and one NAT gateway, private
subnets for Fargate and RDS. ECS cluster, one service, `desired_count 1`, Fargate 1 vCPU / 2 GB,
circuit-breaker rollback on, rolling min 100 % / max 200 % with `stopTimeout` 120 s (SIGTERM
drain in the API), task role limited to three Secrets Manager ARNs and CloudWatch log writes; ALB
with ACM certificate, HTTPS only, health `/api/v1/health`, idle timeout 120 s (browser WebRTC
goes to LiveKit directly, not through the ALB). RDS Postgres 16 db.t4g.micro, 20 GB gp3,
single-AZ (`multi_az` is one variable), private, encryption at rest, `rds.force_ssl`, 7-day
backups, deletion protection; `CREATE EXTENSION vector` by migration 0001. S3 private bucket with
Origin Access Control plus a CloudFront distribution with two behaviours: default → S3, `/api/*`
→ ALB with caching disabled and `Authorization` / `Idempotency-Key` / `X-Waitlist-Ticket` /
`X-Operator-Key` forwarded; same origin, so production runs with CORS off. Security groups:
ALB→task 3001 only; task→RDS 5432 only; task egress via NAT restricted to 443
(`api.dev.runwayml.com`, LiveKit signalling) plus LiveKit media UDP 50000–60000 with TCP 443 TURN
fallback: the concrete version of the ask in `docs/integration/aws-sandbox.md`, whose model-API
egress lines are superseded by [ADR-0011](adr/ADR-0011.md). `infra/ec2-compose/cloud-init.yaml`
installs Docker and runs the compose file on a t3.medium behind Caddy with an Elastic IP, tested
once, for a sandbox that grants literally what the form asked for.

**Secrets.** Secrets Manager entries `dhan-sarthi/<env>/runway` (`RUNWAY_API_KEY`,
`RUNWAY_CHARACTER_ID` as comma lists), `/database` (RDS-managed master; `dhan_app` URL),
`/operator` (`OPERATOR_KEY`), referenced in the task definition's `secrets:` block so values
arrive as env at task start and are read once by `config.ts`: CONTRIBUTING's fetch-at-startup
rule. The seed run-task uses a separate task definition carrying the `dhan_migrate` URL. Locally
the same names come from `apps/api/.env`. Nothing is in the image; CI keeps the
credential-shaped-string grep and gains the bundle scan.

**Seeding in AWS.** `infra/scripts/seed-remote.sh` runs `aws ecs run-task` with the seed task
definition after `terraform apply`; reseed is the same with `--force`. No bastion; the database
is never public.

**Observability.** pino JSON to CloudWatch Logs via awslogs (14-day retention),
`redact: ['req.headers.authorization','token','key','narration']`, `X-Request-Id` on every line
and response. Embedded-metric-format metrics: `avatar_minutes_used_today`, `avatar_grants`,
`avatar_waitlist_length`, `advice_records_written`, `breaker_open`. Alarms: ALB 5xx > 5 in 5 min,
`RunningTaskCount` < 1, RDS CPU > 80 %, RDS free storage < 2 GB,
`avatar_minutes_used_today` > 0.8 × budget, AWS Budgets at US$100/month. A CloudWatch dashboard
with those widgets is in `observability.tf` so a reviewer sees the running system. The runbook
in `infra/terraform/README.md`: stuck lease → operator release-all; reseed → run-task; rotate
Runway key → update secret, force new deployment; kill switch → `AVATAR_ENABLED=false` + force
new deployment; ten-step laptop apply with expected outputs.

**CI/CD.** `ci.yml` as in the testing section. `deploy.yml` on `workflow_dispatch`: build and
push the image to ECR, `aws ecs update-service --force-new-deployment`, wait for stability,
`aws s3 sync` the web build, CloudFront invalidation, then `infra/scripts/smoke.sh` (health,
customers, a session, a view, a decision, an availability call). It assumes an OIDC role only if
the target account allows it; otherwise the runbook documents the same steps from a laptop with
the bank's credentials. We do not assume IDBI will let GitHub into their account. Deploys are
scheduled outside announced demo windows.

**Cost** (monthly, `ap-south-1` list, rounded): Fargate 1 vCPU/2 GB ≈ $35, ALB ≈ $20, NAT ≈ $35
(the largest line, kept because a private subnet is what a bank network team expects), RDS ≈ $18,
CloudFront + S3 + Secrets + CloudWatch ≈ $8: about $115–130 for the platform, below the $150–250
the sandbox form estimated. Runway is the variable: $0.20/min × 240 min/day worst case = $48/day,
capped by the Postgres-backed budget and alarmed at 80 %.

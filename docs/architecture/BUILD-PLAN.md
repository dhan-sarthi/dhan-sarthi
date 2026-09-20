# Build plan

This document is the eight-day schedule that takes the codebase from the state at adoption to the
architecture in [`HLD.md`](HLD.md), split across three tracks that can work in parallel: the
backend track (`apps/api`, `packages/core`, `packages/contracts`), the web track (`apps/web`) and
the data and infrastructure track (`packages/fixtures`, `infra/`, `docs/`). Each row ends with the
demo that proves the day's work, so progress is checked by running something rather than by
reading a ticket.

Status: adopted 3 September 2026.

| Day | Track | Deliverable and demo |
|---|---|---|
| Day 1 | Backend | RPC spike first (timed, one billed session): install `@runwayml/avatars-node-rpc`, open a handler against a real session, confirm `onConnected` and that a `tools` body is accepted (200 recorded as a fixture); write `adapters/runway/rpc-host.ts` to what the SDK exposes; document the fallback posture if it fails. Then: `packages/contracts` populated (common, domain mirrors, `routes/*`, `tools/*`, `registry.ts`) with type-equality tests; `ports/` interfaces; memory adapters; `composition/root.ts` + profiles; `http/register.ts`, `server.ts`, `auth.ts`; routes health, customers, sessions, session, clock, view, shelf, rules on the memory profile. **Demo:** `curl /api/v1/view` returns Rohan's View from the API with no database; the spike result is in `runway.md`. |
| Day 1 | Web | `api/client.ts` typed from the registry; token bootstrap (`dhan.session.v2`); Pick reads `/customers`; Today renders `/view`; `@dhan/core` and `@dhan/fixtures` moved out of the main path into `offline/` (lazy, `VITE_OFFLINE_FALLBACK`); `suggestGoal` moved to `packages/core/src/goal.ts`. **Demo:** Today populated entirely from the API; DevTools shows only a token in localStorage. |
| Day 1 | Data and infrastructure | `apps/api/Dockerfile` (bookworm-slim), `docker-compose.yml` (postgres 5433, seed profile, api, web/nginx); `infra/terraform` skeleton with `terraform validate` clean; ADR-0001..0004; `docs/architecture/HLD.md` first cut with the HLD diagram. **Demo:** `docker compose up` serves the app in memory mode. |
| Day 2 | Backend | `packages/core/src/asof.ts` with `generateCustomerFile` switched to it (54 tests green) and `asof.test.ts`; migrations 0001–0004; `db/migrate.ts`; `pool.ts` type parsers; `fixtures/seed-bundle.ts`; `cli/seed.ts` (42 months, `seed_runs` hash, `--check`, `--force`); `PostgresBankData`, `PostgresSessionStore`, `PostgresSnapshotStore`; `bankDataPortContract` + parity suite green against memory and postgres. **Demo:** `pnpm seed && BANK_SOURCE=postgres pnpm dev:api`: the same ₹1,41,663 idle floor from Postgres; +1 month ×5 removes the education loan. |
| Day 2 | Web | Clock calls `POST /session/clock` with `expectedVersion` (409/422 handled, horizon message); Plan and Money from `/view` and `/transactions` with cursor paging; Record skeleton; `dataFreshnessDate` and `TierBadge` under Today's header; `OfflineBadge` path tested by killing the API. **Demo:** two browsers, two reviewers, independent clocks; kill the API and the badge appears with figures intact. |
| Day 2 | Data and infrastructure | Generator realism pass 1 in `packages/fixtures`: `cities/{indore,kochi,nagpur}.ts` (MPPKVVCL · KSEB · MSEDCL, gas, transit, bazaars, hospitals), `mcc.ts`, `ifsc.ts` (IBKL0 branch per city, per-employer remitter IFSC), unique masked account numbers; `realism.test.ts`; `docs/data/statement-formats.md` and `calibration.md` started with NPCI/RBI/MOSPI/IDBI sources and `[verify]` marks; a request to the IDBI liaison for one redacted e-statement. **Demo:** `pnpm --filter @dhan/fixtures summary` shows KSEB on Priya's statement, not MPPKVVCL. |
| Day 3 | Backend | Migrations 0005 + 0007 (record tables, append-only, roles); `PostgresAuditStore` with hash chain; `DecisionService` with unit of work and idempotency keys; `POST /actions/:id/decision`, `GET /record`, `GET /record/verify`, `POST /ask`, `GET /ask/suggestions`, `POST /suitability/evaluate`; helmet, rate limits, body limit, request timeout; `cli/audit-verify.ts`. **Demo:** Do it → reload → the row is still there; a raw UPDATE as `dhan_app` fails; verify prints OK and a tampered row prints the break. |
| Day 3 | Web | Do it / Not now / Why? wired to `/actions` with `Idempotency-Key`; Record tab from `/record` with sentence, rule, snapshot id, roadmap versions and chain status; Tier-1 typed conversation UI over `/ask` and `/suitability/evaluate` inside Ask; the barge-in line in `Ask.tsx` removed. **Demo:** the ULIP refusal lands in text with no keys and appears on the record; "how much on food last month" answers ₹7,655 with evidence. |
| Day 3 | Data and infrastructure | Terraform `vpc.tf`, `rds.tf`, `secrets.tf`; `envs/team-sandbox.tfvars`; `terraform plan` clean against the team account; CI: contract, integration (pg service: migrate → seed → `--check` → parity → chain), architecture (dependency-cruiser), docker, infra jobs. **Demo:** green CI on a PR. |
| Day 4 | Backend | Avatar refactor: `adapters/runway/transport.ts` moved with tools, `AbortSignal` timeouts and breaker; `RunwayAvatarProvider`, `NullAvatarProvider`, `FakeAvatarProvider`, `FakeRpcHost`; migration 0006; `PostgresLeaseStore` with atomic claim; `CredentialPool`, `MinuteBudget` (from Postgres), `LeaseReaper`; `lifecycle.ts` state machine; `brief.builder.ts` with length tests; `tools/*` handlers writing `advice_records` + `avatar_tool_calls`; `AvatarSessionService` enforcing open-before-consume; `/avatar/session` (strict empty body), `/avatar/availability`, `/avatar/session/:id/end`; operator routes behind `X-Operator-Key`; `avatar.test.ts`. **Demo:** on a billed call, ask Uday about "the LIC plan my cousin recommends" and `advice_records` gains a `BUNDLED_PROTECTION` row with source `avatar_tool` before he finishes the sentence; restart the API mid-day and the budget is unchanged. |
| Day 4 | Web | Ask sends only the bearer (client-built brief removed), reads `/avatar/availability` before Call, renders server error sentences and the client state machine (idle · connecting · live · waitlisted · text · offline); end-of-call sendBeacon retained. **Demo:** the refusal on a live call with the record visible immediately after. |
| Day 4 | Data and infrastructure | IDBI sandbox stub, started early because the sandbox arrives in about a week: `adapters/idbi-sandbox/{client,endpoints,wire,mapping,composite}.ts` and `fixtures/*.json` shaped per `data-requirements.md`; `bankDataPortContract` green over a `MockAgent`; `describe()` reports `simulatedClock=false`; `docs/data/field-mapping.md` (93 fields → columns/fallbacks, the `tax_regime` ask). **Demo:** `BANK_SOURCE=idbi-sandbox` boots against the samples and Today renders with provenance 'fixture' on holdings and the clock hidden. |
| Day 5 | Backend | Waitlist over `avatar_waitlist` with claim window; `GET/DELETE /avatar/waitlist/:ticket`; `X-Waitlist-Ticket` on `/avatar/session`; `TranscriptService` with backoff; `Reconciler` with `gate_coverage`; `GET /avatar/session/:id/record`; `consent-scope.ts` + `POST /session/consent` + `DELETE /session`; `cli/replay.ts`; `infra/fault-inject.ts`. **Demo:** two phones, one credential: the second sees position 1 and an ETA, talks in text, then "Uday is free"; replay reproduces a stored sentence byte-for-byte; withdraw "Loans" and rule 1 stops firing for Priya. |
| Day 5 | Web | `QueueCard` states (waiting with position/ETA, claimable with 20 s countdown, expired); Record shows avatar sessions with "Gate fired n/n · verified against transcript" or "transcript unavailable — our ledger shown"; Record → Your data with per-scope toggles and a `ProvenanceLine` per block; clock hidden when `capabilities.simulatedClock` is false. **Demo:** the fallback ladder walked on a phone with `FAULT_INJECT`; the consent panel does what its copy says. |
| Day 5 | Data and infrastructure | Terraform `ecs.tf`, `alb.tf`, `cdn.tf`, `observability.tf`, `budget.tf`; first deploy to the team account; Secrets Manager populated; `seed-remote.sh`; CloudWatch dashboard and alarms; `docs/architecture/lifecycles.md` with the six sequence diagrams. **Demo:** a public HTTPS URL running postgres mode from AWS; the budget alarm fires when the budget is set to 3 minutes. |
| Day 6 | Backend | Hardening: OpenAPI served and snapshot-tested; no-undeclared-route test; SIGTERM drain; reaper on boot; deep `/health` (breaker, rpcOpen, seed hash); log redaction; `pnpm seed --check` in CI; chaos run with `FAULT_INJECT` proving no ungated session and no hard failure; load test (autocannon, 50 virtual reviewers) with fixes and results in `docs/architecture/perf.md`. **Demo:** the chaos checklist all green; p95 `/view` under target. |
| Day 6 | Web | Playwright e2e against compose (pick → clock → decide → reload → record → text refusal → offline badge → concurrent second persona); bundle check that the bank build has no `@dhan/fixtures` chunk; mobile Safari and Android Chrome check including LiveKit autoplay and the audio meter; accessibility pass. **Demo:** e2e green in CI; the app on three real phones. |
| Day 6 | Data and infrastructure | Realism pass 2 after the redacted statement (if obtained) and reseed; `infra/ec2-compose` cloud-init tested once on a t3.medium; `docs/integration/adapter-guide.md` ("swap `BANK_SOURCE`: one directory, one env var, run the conformance suite") and `go-mobile-plus.md` (WebView, `HostIdentityPort`, `VITE_OFFLINE_FALLBACK=false` build); `THREAT-MODEL.md` v1 with file references. **Demo:** a colleague follows the adapter guide cold and has the stub running in 15 minutes. |
| Day 7 | Backend | Freeze candidate: bug bash across every route; budget knobs set for the review window (600 s cap, 240 min/day); `seed --force` reset path tested; `pnpm test` / contract / integration / architecture green on a clean clone; tag `v1.0.0-rc`. **Demo:** fresh clone → `pnpm install && pnpm test && docker compose up`. |
| Day 7 | Web | Freeze candidate: final copy pass ("he", never "she"; no barge-in claim; every tier labelled); screenshots regenerated into `docs/assets`; demo script re-derived from `pnpm --filter @dhan/fixtures summary` and the API so every number on a slide matches the ledger. **Demo:** the bank build and the demo build both pass the Playwright smoke. |
| Day 7 | Data and infrastructure | README rewritten for a reviewer with the repo for two weeks: three run modes, the architecture diagram, the lifecycle of one recommendation, what is real/simulated/missing, the first-fifteen-minutes path; `docs/architecture/{HLD,LLD,BUILD-PLAN}.md` and `adr/` finalised; CONTRIBUTING's "still to port" table updated; Q&A crib sheet (challenges and mitigations, scalability, robustness, DPDP posture, what happens when IDBI's APIs arrive). **Demo:** a stranger reads the README and names the three adapters and the append-only migration unprompted. |
| Day 8 | Backend | Code freeze; fixes from the dry run only; tag `v1.0.0-review`; image pushed to ECR; daily avatar smoke scheduled for the review window. **Demo:** tagged deploy with a green smoke. |
| Day 8 | Web | Twenty-person dry run (team, friends, mentors) opening the link at once for thirty minutes; fix only what breaks; final build to S3 with `VITE_OFFLINE_FALLBACK=true` for the public URL and `false` for the bank artefact. **Demo:** the dry-run log with zero hard failures. |
| Day 8 | Data and infrastructure | `terraform apply` into IDBI's sandbox if credentials have arrived (else team-sandbox stays the demo URL), rehearsed from a clean account using only the runbook, timed under 45 minutes; `aws-sandbox.md` updated with exact egress domains; recorded walkthrough (live avatar, refusal, queue state, Record tab, adapter switch); submission checklist ticked. |

---

## Notes on the record

The table is the plan as adopted on 3 September 2026 and stays as written: it records what each
day was meant to deliver, not what exists today. Where a deliverable was later reversed, the note
belongs here and not in the row.

- **Day 6, data and infrastructure — `go-mobile-plus.md` (WebView, `HostIdentityPort`).** Not
  delivered, and no longer planned in this shape. `apps/api/src/ports/host-identity.port.ts` was
  written and then deleted on 20 September 2026, having never had an adapter, an importer or an
  entry in `Deps`; `docs/integration/go-mobile-plus.md` was never written. GO Mobile+ Phase 2 is
  still the plan, and [ADR-0008](adr/ADR-0008.md) is now its only record: the host-token exchange
  returns as a port together with its first adapter, once IDBI supplies the token format.
- **The whole Web track — every Web row, Days 1 through 8.** It was delivered and then retired.
  `apps/web` was frozen once `apps/mobile` became the product, and was deleted from the repository
  on 20 September 2026, so each of those eight rows records work that shipped and has since been
  removed rather than work outstanding. The three a reader is most likely to chase:
  - **Day 1's `offline/` chunk behind `VITE_OFFLINE_FALLBACK`**, and the Day 6 and Day 8 rows that
    build with the flag set. Neither the chunk nor the flag exists in any form now — nothing in
    the tree reads `VITE_OFFLINE_FALLBACK` and there is no bundle left to set it on. See the
    amendments on [ADR-0001](adr/ADR-0001.md) and [ADR-0011](adr/ADR-0011.md).
  - **Day 6's Playwright end-to-end suite against compose.** It was written, it lived in
    `apps/web/e2e/`, and it went with the app. Nothing replaced it;
    [TESTING-AND-DEPLOYMENT.md](TESTING-AND-DEPLOYMENT.md) records that as an open hole rather
    than as a layer that still passes.
  - **Day 8's final build to S3.** The S3-and-CloudFront half of that is still exactly how the
    product is served; what changed is what is uploaded, which is now the Expo web export out of
    `apps/mobile`, published by `infra/scripts/deploy-web.sh`.

  Nothing on the Backend or Data-and-infrastructure tracks was affected, and the Day 6 data row's
  `VITE_OFFLINE_FALLBACK=false` mention is part of the `go-mobile-plus.md` deliverable covered by
  the note above, which was never written either.

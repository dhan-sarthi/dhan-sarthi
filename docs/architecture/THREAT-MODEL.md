# Threat model

This document lists the threats the design takes seriously, the STRIDE category each falls under,
and the concrete mitigation with the file or mechanism that carries it. It is the place to look
when the question is "what happens if someone tries to…". Rows that describe the code at adoption
(3 September 2026) say so; everything else describes the target design in [`HLD.md`](HLD.md).

Status: adopted 3 September 2026 · amended 2026-09-20 (two mitigations, and the text tier's
egress; see below).

> **Amendment, 2026-09-20.** `apps/web` has been deleted ([ADR-0001](adr/ADR-0001.md)). No threat
> in this table went away with it — a client is a client — but two mitigations named a bundle or a
> tier that no longer exists and have been rewritten to name what actually carries them now. The
> rows describing the code at adoption are left as they are, because that is what they are for.
>
> **A third mitigation asserted a safety property the code does not have.** The egress row said
> Tier 1 "makes no outbound call at all", and the gate row said the text tier "never involves a
> model". Both were true when they were written and both were overtaken by
> `apps/api/src/adapters/openai/chat.openai.ts`: `TEXT_MODEL_ENABLED` now defaults to `true`, and
> `/ask` calls a model to phrase an answer the engine has already computed. The two rows now say
> what the process actually does when egress is blocked, which is still that the review keeps
> working — but for a different reason, and one a bank's network team can check. A threat model
> is the wrong document to find that out from, so it is stated here rather than only in the cell.
>
> One consequence for a reader: [ADR-0011](adr/ADR-0011.md) decided *no model anywhere in this
> build*, and its Decision and Consequences ("Runway and LiveKit are the only external calls")
> no longer describe the tree. That is a decision to revisit in an ADR amendment, not something
> this table can settle, and it is flagged rather than quietly worked around.

| Threat | Category | Mitigation |
|---|---|---|
| Client edits the personality brief and removes the compliance instructions (at adoption: `buildBrief` in `Ask.tsx` is forwarded verbatim by `routes/avatar.ts`) | Tampering | Brief built server-side in `application/avatar/brief.builder.ts` from the session's View; `POST /avatar/session` body is `z.object({}).strict()`; the gate is a `backend_rpc` tool, not a prompt; every verdict is written by our handler before the model speaks. |
| Model recommends a product without calling `check_suitability` | Tampering / Repudiation | Tool instruction in the brief; post-call `Reconciler` computes `gate_coverage` over the transcript and shows misses on the Record tab; the CONTRIBUTING invariant is enforced by the tool boundary. The screens never involve a model. The text tier does, and the same division holds there without a tool call: `ConversationService.gateFor` resolves the product the question names, runs `evaluate()` and writes the advice record **before** the prompt is built, so the model is handed the sentence the rules already wrote and has no branch in which it can reach a verdict of its own. |
| Ungated avatar session issued because the RPC handler failed to connect | Elevation of privilege | Lifecycle state machine: `Lifecycle.assertConsumable()` passes only from `'gated'`, which is reached only after `AvatarRpcHost.open` resolves, and `issueGrant` runs behind it; rejected open → cancel + release + 502; composition root refuses real provider + null RPC host; unit test asserts ordering with fakes. |
| Runway key or LiveKit credentials reach the client | Information disclosure | Keys only in `apps/api` via Secrets Manager → task env; the client receives a short-lived LiveKit token minted per call and nothing else. The bundle grep that carried this at adoption was over `apps/web`'s `dist/`; what carries it now is `ci.yml`'s `hygiene` job, which `git grep`s credential-shaped strings over every tracked file rather than over one app's build output — a wider net, and one that does not depend on a build step running. `@dhan/fixtures` no longer needs a bundle assertion either: `apps/mobile` does not depend on it in any configuration. |
| Reviewer A reads or mutates reviewer B's session, clock or record | Information disclosure / Tampering | 256-bit opaque bearer, sha256 at rest; every store method keyed by `session_id`; preHandler resolves the principal; waitlist and avatar routes check ownership; `DELETE /session` erases only the caller's subject. |
| Double-tap or retry creates duplicate audit rows or double-advances the clock | Tampering | `Idempotency-Key` with stored responses; `UNIQUE(session_id, action_id)`; optimistic `version` on sessions with 409 `STALE_CLOCK`. |
| Audit rows edited after the fact | Repudiation | REVOKE UPDATE/DELETE from `dhan_app`; BEFORE triggers RAISE; per-session sha256 hash chain; `pnpm audit:verify` and `GET /record/verify`; migrate role never held by the runtime task. |
| Public link runs up a Runway bill (US$0.20/min) or exhausts the single slot | Denial of service | Daily minute budget as `sum(minutes_charged)` in Postgres; per-call cap 600 s; 5 grants/hour/IP; one live call per session; reaper; sendBeacon `/end`; `AVATAR_ENABLED` kill switch; release-all behind operator key; CloudWatch alarm at 80 % and AWS Budgets at US$100. |
| Hung provider call stalls a grant or a request thread | Denial of service | `AbortSignal` timeouts on every Runway fetch (8 s / 3 s), RPC open 8 s, Postgres `statement_timeout` 2 s, Fastify request timeout 10 s; circuit breaker opens after 3 failures and answers the text tier immediately. |
| Unauthenticated operator routes (at adoption `/api/avatar/release-all` and `/api/avatar/status` are open) | Elevation of privilege | `/operator/*` behind `X-Operator-Key` from Secrets Manager with constant-time compare; the status route lists session ids so it is operator-only. |
| Request flooding / abusive clients | Denial of service | `@fastify/rate-limit` keyed on forwarded client IP (120/min, 20 sessions/hour, 30 ask/min/session), 16 KB body limit, helmet, CloudFront in front; ALB 5xx alarm. |
| PII in logs or backups (DPDP) | Information disclosure | All data synthetic; no schema column for PAN/Aadhaar/full account number; pino redact on authorization, token, key, narration; audit rows carry `subject_id` not `cif`; 14-day log retention; RDS encrypted at rest, `sslmode=require`; everything in `ap-south-1`. |
| Consent withdrawn but advice still computed over the withdrawn block | Tampering (policy) | `consent-scope.ts` filters the CustomerFile by `consent.scopes` minus `session.scope_overrides` before `derive()`; every advice_record carries `consent_id`; the IDBI adapter reads block 08 `consent_status` and halts on EXPIRED/REVOKED with a specific message. |
| Seed drift makes the database disagree with the generator (numbers on slides stop matching) | Tampering / Integrity | `seed_runs.content_sha256`; `pnpm seed --check` in CI; parity test at six clock positions per persona; seed refuses while sessions exist unless `--force`. |
| Deploy or crash orphans a billed Runway session or resets the budget | Denial of service / Cost | Leases and minutes in Postgres; reaper on boot and every 2 s; SIGTERM drain cancels with `end_reason='deploy'`; ECS replaces a crashed task; operator release-all. |
| Bank VPC blocks UDP/egress so LiveKit or Runway cannot be reached inside IDBI's account | Denial of service (environmental) | Egress ask names `api.dev.runwayml.com`, `*.livekit.cloud`, UDP 50000–60000 with TURN/TLS 443 fallback; the deployment is stood up in the team's account first; Tier 1, the deterministic text engine, keeps the review working — `core/query.ts` computes every figure and `evaluate()` decides every product question before anything leaves the process, so a blocked egress costs the phrasing and nothing else. **It is not an outbound-free tier, and this row used to say it was.** `TEXT_MODEL_ENABLED` defaults to `true` (`apps/api/src/config.ts:174`) and `ConversationService.ask` awaits `LanguageModelPort.complete` whenever an `OPENAI_API_KEY` is configured alongside it, so `/ask` reaches `OPENAI_API_BASE` on the hot path. What carries the tier through the block is the adapter's contract rather than the absence of a call: `OpenAiChatModel.complete` never throws and never retries — a refused connection, a 429 and the 8 s `OPENAI_TIMEOUT_MS` deadline all return `null` — and the caller then answers with the engine's own sentence, its own evidence and `phrasedBy: 'rules'`, which is the body the tier shipped with. Three consecutive failures open a 30 s breaker, so the second blocked ask costs nothing rather than another eight seconds. With `TEXT_MODEL_ENABLED=false` or no key the null adapter is wired and the tier genuinely makes no outbound call, which is the posture to ask for inside a VPC that will not allow `api.openai.com` (`docs/integration/aws-sandbox.md:36` holds it ready for the network team). `/health` reports the bank source and the avatar provider, not the text model — what is wired is on the boot log, `describeConfig` in `apps/api/src/config.ts`. (Tier 2, the badged local simulation, was `apps/web`'s and is gone: [ADR-0011](adr/ADR-0011.md).) |
| Supply chain: `@runwayml/avatars-node-rpc` drift or malicious update | Tampering | Exact version pinned in the lockfile; SDK confined to `adapters/runway/rpc-host.ts`; a failing spike degrades to the documented prompt-only posture rather than a crash. |

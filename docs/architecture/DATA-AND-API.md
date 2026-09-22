# Data model and API surface

This document is the contract between the API and everything around it: the tables the API reads
and writes, the roles that may touch them, the 51 routes and what each returns, and the session,
idempotency, caching and rate-limit rules that make many concurrent reviewers safe. It also
records the avatar integration in the detail a reviewer of the compliance story will want. The
route table is the human-readable twin of `packages/contracts/src/registry.ts`, which is the
executable one.

Status: adopted 3 September 2026 · amended 2026-09-20 (one client, not two; four personas, not
three; the renamed provider calls — see below).

> **Amendment, 2026-09-20.** `apps/web` has been deleted; `apps/mobile` is the only client. No
> table, route, status code, header or limit in this document changed as a result — the server is
> the same server. What changed is the sentences that said *"the browser"* or named an `apps/web`
> file, and those have been corrected below. Where a field is described as having been shaped
> *"at adoption"* after something in `apps/web`, that is the provenance of the column and stays,
> because it is why the column has the shape it has. See [ADR-0001](adr/ADR-0001.md).
>
> Two further corrections were made on the same day, neither of them about the client. The
> counts in the brief-test sentence and in the `transactions` bullet were written when there
> were three personas and there are now four (`PERSONAS`,
> `packages/fixtures/src/personas.ts:1486`); both have been re-derived from the generator rather
> than scaled. And the grant sequence still named `waitUntilReady` and `consume`, which
> [ADR-0013](adr/ADR-0013.md)'s amendment renamed to `awaitIssuable` and `issueGrant`.

## Relationship to the relational schema record

[`docs/engineering/schema/`](../engineering/schema/README.md) holds the full relational design
for the wealth-advisory module (four Postgres schemas: `bank`, `app`, `ref`, `staging`), with
tested DDL. The tables below are the working set this build reads and writes, applied
incrementally through the numbered migrations in `apps/api/migrations`, starting with what the
demo needs. Where a name here is shorter than its counterpart there (for example
`advice_records` against `app.verdicts` plus `app.audit_records`), the migrations are the
executable truth and the schema record is the design they grow into.

## Data model

Postgres 16, schema `sarthi`, plain SQL migrations in `apps/api/migrations` applied by
`src/db/migrate.ts` ([ADR-0005](adr/ADR-0005.md): no ORM). Two roles: `dhan_migrate` (owner; used
only by migrate and the one-off seed task) and `dhan_app` (runtime: SELECT on bank tables;
SELECT/INSERT/UPDATE on session tables; SELECT/INSERT on record tables; UPDATE/DELETE revoked and
trigger-blocked on record tables). Money is `numeric(18,2)` parsed to Number once
(`pg.types.setTypeParser(1700, Number)`); dates are `date` parsed to `'YYYY-MM-DD'` strings
(`setTypeParser(1082, s => s)`) because core dates are strings and a Date crossing a timezone is
how the 1st becomes the 31st. No column anywhere for PAN, Aadhaar or a full account number, by
schema. Region `ap-south-1` only.

### Bank data — written only by `pnpm seed`, SELECT-only for `dhan_app`

- `seed_runs(id, generator_version, anchor, history_from, horizon_to, personas text[], row_counts jsonb, content_sha256, ran_at)`.
  `pnpm seed --check` regenerates in memory and compares the hash; CI fails on drift. Surfaced on
  Record → Your data as provenance.
- `customers(cif PK, cust_id, cust_name, date_of_birth, gender, marital_status, dependents int, employment_type, declared_annual_income, city, state_code char(2), preferred_language, risk_profile, risk_profile_date, kyc_status, customer_since, tax_regime, persona_slug, pitch, demonstrates, ledger_anchor date, ledger_horizon date, seed_run_id)`.
  Mirrors block 01 plus `tax_regime`, which the specification lacks and rule 8 needs
  (`docs/engineering/schema/README.md:456` records the ask, in the column's own comment).
- `consents(consent_id PK 'CONS_SYN_<n>', cif, purpose 'Wealth advisory', scopes text[], status ACTIVE|EXPIRED|REVOKED, valid_from, valid_to)`.
  Block 08 shape; echoed on every advice record.
- `accounts(id PK, cif, account_number_masked (unique per persona, not the shared XXXXXX7412), account_type, ifsc char(11) 'IBKL0'+city branch, opening_date, interest_rate, maturity_date, is_primary)`.
  Deliberately no balance columns: current balance and 3m/12m/min aggregates are computed as of
  the session date by `core/asof` over the ledger, exactly as `generateCustomerFile` does.
- `transactions(txn_id PK, cif, account_id, seq int, txn_date, value_date, txn_amount, txn_type CREDIT|DEBIT, txn_mode, narration varchar(200), merchant_name, mcc_code char(4), counterparty_vpa, balance_after_txn, label_spend_category, label_is_salary_credit bool, label_is_recurring bool, seed_run_id)`;
  index `(cif, txn_date, seq)`. 42 months per customer (anchor−23 → anchor+18, 2024-10 →
  2028-03), 2,506–4,187 rows per persona and 13,479 in total over the four (`seedBundles()` at
  the default 24/18 window). Rows after the session's `as_of` are never
  returned. `seq` preserves the generator's sealed intra-day order so `balance_after_txn` is
  reproducible. `label_*` map onto the optional bank-supplied fields IDBI's feed may carry; core
  still infers and `disagreements()` stays the honesty test; the adapter never reads
  `label_is_recurring`.
- `liability_contracts(id, cif, lender, loan_type, emi_amount, rate, emi_day, tenure_remaining_at_anchor int, principal_at_anchor, dpd_status, is_revolving)`;
  `sip_contracts(id, cif, scheme, asset_class, sip_amount, sip_day, starts_months_before_anchor, held_outside_idbi)`;
  `holdings(id, cif, holding_type, name, asset_class, invested_amount, current_value, maturity_date, interest_rate, is_policy bool, insurer_name, policy_type, cover_type, sum_assured, premium_amount)`.
  Contracts, not as-of facts; `liabilityAsOf` and `sipHoldingAsOf` in `core/asof` roll them, so
  the education loan still leaves the file after five +1-month presses.
- `products(product_id PK, name, category, riskometer, min_investment, lock_in_years, transactable, manufacturer, expense_ratio, insurance_product, bundles_protection_and_investment, cover_amount, cover_type, indicative_return, note, aliases text[], source 'fixture'|'idbi', verified bool)`.

### Reviewer state — `dhan_app` SELECT/INSERT/UPDATE

- `subjects(subject_id uuid PK, cif, created_at)`: the pseudonymisation seam. Audit rows reference
  `subject_id`, never `cif`. DPDP erasure deletes the subjects row (and cascades sessions,
  snapshots); audit rows are untouched and become unlinkable. This resolves the immutable-audit
  versus erasure contradiction.
- `sessions(id uuid PK, subject_id FK, token_hash char(64) UNIQUE, as_of date, last_seen date, goal_target numeric null, caps jsonb, scope_overrides text[], version int, client_hint text (hashed UA + /24), created_at, last_active_at, expires_at (30-day sliding), revoked_at)`.
  Field-for-field the `Session` the browser held in `localStorage` at adoption
  (`apps/web/src/lib/session.ts`, deleted with that app): the row is that object, moved server-side
  and given an owner.
- `idempotency_keys(session_id, key, request_hash, response jsonb, created_at; PK(session_id, key))`;
  24 h sweep.

### Versioned, immutable derivations — INSERT only

- `snapshots(id uuid PK, subject_id, session_id, as_of, engine_version (core version + git sha), input_hash char(64) (sha256 of canonical scoped CustomerFile window + shelf), snapshot jsonb, created_at; UNIQUE(subject_id, as_of, input_hash, engine_version))`.
  The first reviewer to open Rohan at a clock position pays `derive()`; everyone after reads JSON.
  `snapshotId:roadmapVersion` is the `/view` ETag.
- `roadmap_versions(id, session_id, version int, snapshot_id FK, goal jsonb, roadmap jsonb, reason_for_change, created_at; UNIQUE(session_id, version))`.
  What the browser computed at adoption as `1 + accepted.length` becomes a real row per version:
  the "it learns" list on Plan and the audit trail at once.

### Append-only record — hash-chained per session

Migration 0007 revokes UPDATE/DELETE from `dhan_app` and adds `BEFORE UPDATE OR DELETE` triggers
that `RAISE 'record rows are immutable'`.

- `advice_records(id uuid PK, seq bigserial, session_id, subject_id, snapshot_id FK, consent_id, source 'screen'|'avatar_tool'|'text'|'api', action_id null, action_kind (13-value CHECK) null, product_id, amount, verdict PASS|BLOCKED|UNKNOWN_PRODUCT, rule_id, rules_passed text[], spoken text, recorded text, alternative jsonb, evidence text[], engine_version, runway_session_id null, verified_in_transcript bool null, at_sim date, prev_hash char(64), record_hash char(64), created_at)`.
  `record_hash = sha256(prev_hash ‖ canonical(row minus hashes))`; `pnpm audit:verify` walks the
  chain. One row per proposal, including tool calls the customer never decided on.
- `decisions(id, session_id, advice_record_id FK null, action_id, action_kind, kind did_it|declined|deferred|pushed_back, amount, product_id, shown text, evidence text[], note, at_sim date, created_at; UNIQUE(session_id, action_id))`:
  the idempotency guard even without the header.
- `avatar_sessions(runway_session_id PK, session_id, credential_label, task_id, opened_at, ready_at, rpc_connected_at, granted_at, ended_at, end_reason client|reaped|failed_grant|release_all|deploy, minutes_charged numeric, transcript_status pending|fetched|unavailable, transcript jsonb, gate_coverage jsonb)`.
  The daily budget is `sum(minutes_charged) WHERE opened_at::date = today`; no counters in
  process memory.
- `avatar_tool_calls(id, runway_session_id FK, tool, args jsonb, result jsonb, advice_record_id FK null, latency_ms, verified_in_transcript bool null, created_at)`.

### Avatar operations — `dhan_app` SELECT/INSERT/UPDATE/DELETE

- `avatar_leases(credential_label PK, session_id, runway_session_id, task_id, claimed_at, expires_at)`;
  acquire is `INSERT … ON CONFLICT (credential_label) DO NOTHING RETURNING *`: atomic without an
  application lock, safe across the two-task overlap of a rolling deploy.
- `avatar_waitlist(ticket PK, session_id UNIQUE, enqueued_at, claimable_until, granted_at, expired_at)`.

### pgvector and retention

pgvector: migration 0001 runs `CREATE EXTENSION IF NOT EXISTS vector` (RDS supports it natively)
so the deferred memory adapter lands without an infrastructure change. No memories table ships
([ADR-0011](adr/ADR-0011.md)); the demo beat "last month you said ₹10,000, you did ₹4,000" is
answered deterministically from `decisions` and `roadmap_versions`.

Retention ([ADR-0006](adr/ADR-0006.md), [THREAT-MODEL.md](THREAT-MODEL.md)): sessions and
idempotency keys expire in 30 days idle; snapshots follow their subject; `advice_records`,
`decisions` and `avatar_tool_calls` are designed for five-year retention (SEBI/IRDAI
record-keeping) and are the one class erasure does not touch; `DELETE /session` removes the
subjects row and cascades everything else. All data is synthetic.

## API surface

| Method | Path | Purpose | Auth | Contract |
|---|---|---|---|---|
| GET | `/api/v1/health` | Liveness plus dependency truth: `{ok, at, version, engineVersion, bank: {source, ok, latencyMs, seedHash}, avatar: {provider, enabled, breaker, rpcOpen}, faultInject}`. ALB target. | none | `HealthResponse` |
| GET | `/api/v1/openapi.json` | OpenAPI 3.1 generated from `packages/contracts/src/registry.ts` at boot; what a reviewer imports into Postman. | none | OpenAPI document (snapshot-tested) |
| GET | `/api/v1/customers` | The picker, from `BankDataPort.listCustomers()`: `[{cif, slug, name, age, city, pitch, demonstrates}]`. Replaced `PERSONAS` imported straight into the client at adoption. 503 when `listCustomers()` comes back empty — a source that names the customer itself leaves nothing to pick ([ADR-0008](adr/ADR-0008.md)). | none · 60/min/IP | `CustomersResponse` |
| POST | `/api/v1/sessions` | Body `{cif}`. Creates an isolated reviewer session at the persona anchor (`as_of=2026-09-01`, `last_seen=anchor−6d`), 30-day sliding expiry; returns the opaque bearer once. | none · 20/hour/IP | `CreateSessionRequest → {token, session: SessionState}` |
| GET | `/api/v1/session` | Session state: cif, asOf, lastSeen, goalTarget, goalBasis, caps, scopeOverrides, version, ledgerHorizon, expiresAt, capabilities `{simulatedClock, avatar}`. | session bearer | `SessionState` |
| DELETE | `/api/v1/session` | DPDP erasure of reviewer state: deletes the subjects row, cascading sessions and snapshots; audit rows stay immutable and become unlinkable. | session bearer | 204 |
| POST | `/api/v1/session/clock` | Body `{advanceDays: 1\|7\|30, expectedVersion}` or `{reset: true, expectedVersion}`. Moves `last_seen` to the old `as_of` (what `advance()` did client-side at adoption). 409 `STALE_CLOCK` on version mismatch; 422 `CLOCK_BEYOND_SEEDED_HORIZON` past `ledger_horizon`. | session bearer | `ClockRequest → SessionState` |
| PATCH | `/api/v1/session/goal` | Body `{targetAmount, amountBasis?}`. Overrides the suggested goal target; `amountBasis` says which money it is in — `today` (the default when omitted) or `at_horizon` where the customer inflated the figure themselves, which the engine funds at the nominal rate rather than discounting a second time. The next `/view` cuts a new roadmap version with reason 'Target changed by the customer'. | session bearer | `GoalPatch → SessionState` |
| POST | `/api/v1/session/consent` | Body `{scope, granted}`. Per-session scope override; the next `/view` recomputes with the block removed, which makes the consent copy in `Record.tsx` true. | session bearer | `ConsentPatch → SessionState` |
| POST | `/api/v1/session/caps` | Body `{category, monthlyLimit}`, the limit nullable to remove it. A decision about the future, so it lives on the session and not on the file: no bank endpoint anywhere carries what somebody meant to spend. `dailyplan` reads caps over the thirty days ending at `as_of` and marks the plan breached. | session bearer | `CategoryCapPatch → SessionState` |
| POST | `/api/v1/session/spend-limit` | Body `{monthlyLimit}`, nullable to remove it. The ceiling on *everything*, where `caps` is the ceiling on one category. `buildDailyPlan` measures safe-to-spend against it, and holds it to what the month can actually afford — a limit above that is stored as the customer typed it and applied as the lower figure, because an app that agreed a customer had more money than they do is the only thing in the room lying to them. | session bearer | `SpendLimitPatch → SessionState` |
| GET | `/api/v1/save` | The savings pot: the roadmap's goal seen from the saving end, the five hacks with what each put aside over the last four weeks, the deposits themselves, the interest the balance attracted, and the merchant and payday facts the configuration screens read. The hacks accrue lazily on this read — `SaveService` replays them from `save.accrued_to` to the session's `as_of` and writes back only what it produced — so the pot is a function of the clock and nothing has to run on a schedule to keep it true. | session bearer | `SaveView` |
| POST | `/api/v1/save/hacks` | Body a discriminated union on `id`: one hack, set whole, so the wire cannot carry a weekly amount for the swear jar. Switching a hack off keeps its configuration, because somebody who pauses Set & Forget in a thin month should not be asked to choose ₹500 again in the next one. 422 `SAVE_HACK_UNAVAILABLE` where the hack has nothing to run on — the swear jar with no merchant, the payday saver where the statement shows no regular salary — since an app that accepts a standing instruction the account cannot honour is the one lying in the room. | session bearer | `SaveHackPatch → SaveView` |
| POST | `/api/v1/save/deposits` | Body `{amount}`: money the customer moved themselves, on top of whatever the hacks are doing. Requires `Idempotency-Key`, because a double tap on a slow connection must not put the amount aside twice. Answers with the whole pot rather than the deposit it made — the deposit moves the progress, the interest and the projected monthly inflow with it, and a client patching its own copy would draw a pot that disagrees with the next refresh. | session bearer | `SaveDepositRequest → SaveView` |
| GET | `/api/v1/challenges` | The running challenge scored against the statement — spent, remaining, the day-by-day series, the zero-spend streak, the lines that count against the limit and a written check-in — plus the merchants, categories and lengths the wizard offers for the next one. The wizard's material is present even while a challenge is running: it falls out of the same pass over the statement, and a four-step wizard that fetched per step would trade one computed answer for three loading states. | session bearer | `ChallengeView` |
| GET | `/api/v1/challenges/quote` | Query `{kind, name, days}`. The three limits on offer for one target over one length, what each would save against the four-week baseline, and what repeating the challenge once or twice more would add. A GET because it writes nothing and the wizard asks it again on every tap of a different length; a POST that changed nothing would be lying about itself. Declared immediately before the `:challengeId` row so the literal segment and the parameter that could swallow it stay where a reader can check both at once. | session bearer | `ChallengeQuoteQuery → ChallengeQuote` |
| POST | `/api/v1/challenges` | Body `{target, limit, days}` — the rupee limit rather than the tier that produced it, because a tier is a percentage of a baseline that moves with every new statement line, and the figure the customer agreed to is the one the progress bar has to be measured against for the whole run. 409 `CHALLENGE_ALREADY_RUNNING` while one is still going, 422 `NOTHING_TO_CHALLENGE` where the target has no spend in the window to spend less of. Requires `Idempotency-Key`. | session bearer | `ChallengeDraft → ChallengeView` |
| DELETE | `/api/v1/challenges/:challengeId` | Give up on the running challenge. The id is in the path and is checked, rather than ending whatever happens to be running: a screen left open while one challenge completed would otherwise end the one started after it. A mismatch is 404 `CHALLENGE_NOT_FOUND`, which is the honest answer — the thing they were looking at is not there any more. | session bearer | 204 |
| GET | `/api/v1/view` | The one object every screen reads: `{snapshot, accounts, goal, roadmap, plan, insights, shelf, rules, meta:{asOf, ledgerHorizon, dataFreshnessDate, source, simulatedClock, snapshotId, snapshotHash, roadmapVersion, provenance, tier}}`. `accounts` is the accounts themselves, which the snapshot's two balance totals cannot carry; `snapshot` carries `credit` (`packages/contracts/src/domain.ts:557`), what IDBI can see about how the customer borrows and the typed list of what it cannot. ETag = `snapshotId:roadmapVersion`; 304 on If-None-Match; `Cache-Control: private, no-store`. | session bearer | `View` (`ViewSchema`, `packages/contracts/src/domain.ts:1238`) |
| GET | `/api/v1/transactions` | Query `{from?, to?, category?, cursor?, limit≤200}`. Cursor-paged statement lines ≤ `as_of` for Money → Spending. | session bearer | `TransactionsQuery → {items: Transaction[], nextCursor}` |
| GET | `/api/v1/profile` | The declared half of the customer: income, employment, dependents, risk profile, tax regime, date of birth, and `missing[]`. IDBI's catalogue has no operation carrying any of it, so the app owns it and the first run asks for it. | session bearer | `DeclaredProfileResponse` |
| PATCH | `/api/v1/profile` | Body: any subset of the declared facts. The next `/view` re-derives on them, so an income typed here moves the goal, the surplus and the cover requirement. | session bearer | `ProfilePatch → DeclaredProfileResponse` |
| GET | `/api/v1/holdings` | What the customer says they already own: funds, deposits elsewhere, and policies kept separate because cover is not capital. | session bearer | `HoldingsResponse` |
| POST | `/api/v1/holdings` | Add one. | session bearer | `HoldingInput → Holding` |
| PATCH | `/api/v1/holdings/:holdingId` | Replace one. | session bearer | `HoldingInput → Holding` |
| DELETE | `/api/v1/holdings/:holdingId` | Remove one. | session bearer | 204 |
| GET | `/api/v1/consent/aa` | Every Account Aggregator consent this session has raised, with the bank's own events against each. | session bearer | `ConsentRequestResponse[]` |
| POST | `/api/v1/consent/aa` | Raise one (IDBI 590) and return the approval link the bank gave, if it gave one. | session bearer | `ConsentRequestResponse` |
| POST | `/api/v1/consent/aa/:consentHandle/verify` | Ask the bank (591) whether the consent is really active. The only thing that can move one to ACTIVE: an approval that arrives any other way is recorded and then checked, never acted on. | session bearer | `ConsentRequestResponse` |
| POST | `/api/v1/consent/aa/return` | The customer coming back from the aggregator's redirect. Records the return; grants nothing. | session bearer | `ConsentRequestResponse` |
| POST | `/api/v1/webhooks/idbi/consent` | IDBI 497 posting a consent event at us. Recorded against the handle, then verified before it changes anything. | none · signature-free by IDBI's design, so treated as a claim | `202` |
| POST | `/api/v1/webhooks/idbi/data` | IDBI's data-ready notification. Same rule. | none | `202` |
| POST | `/api/v1/actions/:actionId/decision` | Body `{kind, note?}`. Server re-derives the plan, finds the action, runs `evaluate()` for money actions, appends advice_record + decision + roadmap_version in one transaction, applies a cap for `set_category_cap`. Requires `Idempotency-Key`. | session bearer | `DecisionRequest → {adviceRecord, decision, roadmapVersion}` |
| POST | `/api/v1/suitability/evaluate` | Body `{productId, amount, goal?}`. Verdict from core `evaluate()` over the session's current snapshot; always writes an advice_record (source 'text' or 'api'). Used by 'Why?' and by the ULIP refusal in the text tier. | session bearer · 30/min/session | `EvaluateRequest → {verdict: Verdict, adviceRecordId}` |
| POST | `/api/v1/ask` | Body `{question, history?}`. Text conversation: `core.answer()` over the session's snapshot and file computes the figures, the suitability rules decide any shelf product the question names (writing its advice_record), and only then does `LanguageModelPort` phrase the result → `{text, evidence[], resolved, matched, phrasedBy}`. `evidence` and `matched` are always the engine's. No `OPENAI_API_KEY`, a failed completion or a timeout all return the engine's own sentence with `phrasedBy: 'rules'`. | session bearer · 30/min/session | `AskRequest → Answer` |
| GET | `/api/v1/ask/suggestions` | `openingLine(snapshot)` and `suggestedQuestions(snapshot)` for the text tier's first screen. | session bearer | `{opening: Answer, questions: string[]}` |
| GET | `/api/v1/record` | Everything the Record tab shows: advice records with decisions and snapshot ids, roadmap versions, consent state and scope overrides, seed provenance, avatar sessions with gate_coverage and transcript status, chainVerified. | session bearer | `RecordView` |
| GET | `/api/v1/record/verify` | Walks this session's hash chain: `{ok, length, brokenAt?}`. The compliance-reviewer demo moment. | session bearer | `ChainVerification` |
| GET | `/api/v1/shelf` | `ProductShelfPort.list()` including the products that will be refused, with source and verified flags. | none · public, max-age=300 | `Product[]` |
| GET | `/api/v1/rules` | `ruleBook` from core: the nine rules in plain English. | none · public, max-age=300 | `Rule[]` |
| GET | `/api/v1/avatar/availability` | Public minimal: `{available, enabled, minutesLeftToday, queueLength, estimatedWaitSeconds, breaker}`. Lets Ask render the right tier before the tap. | none | `AvatarAvailability` |
| POST | `/api/v1/avatar/session` | Empty strict body; optional `X-Waitlist-Ticket`. Server builds the brief, registers tools, opens the RPC host, then consumes → `{transport, url, token, runwaySessionId, expectVideoAfterMs, expiresInSeconds}`. `transport` is `livekit` (Runway) or `anam`, and is the only provider fact the client is told. 409 `{cause: pool_busy\|provider_concurrency, ticket, position, estimatedWaitSeconds}`; 429 budget; 502 `gate_unavailable\|provider_error`; 503 not configured/disabled. | session bearer · 5/hour/IP · one live call per session | `z.object({}).strict() → AvatarGrant \| ErrorBody` |
| POST | `/api/v1/avatar/session/prepare` | Ready a call before the customer taps: claim the first free account in the chain, create the session, wait for READY, open the gate, and hand nothing over → `{prepared, usableForSeconds}`. Free on Runway until handed over (a READY, gated, unconsumed session cost 0 credits, measured 22 Sep 2026); Runway fails it ~21 s after READY, so it is let go after 16 s. The next `POST /avatar/session` from the same session and topic hands it over in one round trip. Never queues, never audited; a caller who asks for a call takes the account back from a session that only readied one. `prepared: false` means the tap builds its call from nothing. | session bearer · 30/hour/session | `{topic?} → AvatarPrepared` |
| GET | `/api/v1/avatar/waitlist/:ticket` | Poll: `{position, estimatedWaitSeconds, claimable, holdUntil}`. When claimable, `POST /avatar/session` with `X-Waitlist-Ticket` wins the slot for 20 s. | session bearer (owner) | `WaitlistStatus` |
| DELETE | `/api/v1/avatar/waitlist/:ticket` | Leave the queue. | session bearer (owner) | 204 |
| POST | `/api/v1/avatar/session/:runwaySessionId/end` | Release the lease, close the RPC handler, cancel the provider session, charge actual minutes, schedule the transcript fetch. Always 204. sendBeacon-safe. Only the owning session (any task marks it; the owning task's reaper closes its handler). | session bearer (owner) | 204 |
| POST | `/api/v1/avatar/tool/:runwaySessionId/:tool` | The tool gate, called by the provider rather than answered inside a room — Anam only; Runway's model reaches the tools over LiveKit RPC. Authenticated by the per-call secret minted at session creation, since Anam signs nothing and its body carries only the model's arguments. 403 wrong secret; 404 no such live call; 409 the gate is not open, which is never answered rather than retried. | `X-Avatar-Call` per-call secret · 240/min/IP | `Record<string, unknown> → the tool's own result` |
| GET | `/api/v1/avatar/session/:runwaySessionId/record` | What the gate did during the call: tool calls, advice records, transcript status, reconciliation and gate_coverage: 'Gate fired n/n · verified against provider transcript' or 'transcript unavailable — our ledger shown'. | session bearer (owner) | `AvatarCallRecord` |
| GET | `/api/v1/operator/avatar/status` | The `/api/avatar/status` of adoption (credentials, held leases with task_id, waitlist, minutes from Postgres, breaker), behind the operator key because it lists live session ids. | `X-Operator-Key` (constant-time compare) | `OperatorAvatarStatus` |
| POST | `/api/v1/operator/avatar/release-all` | Cancel every held session and close every handler on this task. At adoption this route has no authentication. | `X-Operator-Key` | `{released: string[]}` |
| GET | `/api/v1/operator/mapping-report` | What the last read of the bank could not map: the fields that were blank, the ones that failed to parse, the pages that stalled, and the cross-checks that disagreed. Behind the operator key because it quotes wire values. | `X-Operator-Key` | `MappingReportResponse` |
| GET | `/api/v1/operator/seed` | `seed_runs` metadata, `--check` drift result, active `BANK_SOURCE`, composite provenance map. | `X-Operator-Key` | `SeedStatus` |

## Sessions and multi-client

**Isolation.** A reviewer session is a row, not a device. `POST /api/v1/sessions {cif}` creates
`subjects` (if absent for this reviewer) and `sessions` with `as_of = 2026-09-01` (the anchor, now
`packages/fixtures/src/seed-bundle.ts:126`), `last_seen = anchor − 6 days` (`FRESH`), a 30-day
sliding expiry, and returns a 256-bit opaque token (`ds_` + base64url) whose sha256 is the only
thing stored. Fifteen reviewers on fifteen phones get fifteen rows with fifteen clocks, caps, goal
overrides and records; every bearer route resolves the session in a Fastify preHandler and every
store method takes `sessionId` first, so no query shape crosses sessions. The client keeps only
the bearer — SecureStore on a device, `localStorage` on the Expo web build
(`apps/mobile/src/api/storage.ts`) — which is what makes "no customer data on the client" a claim
someone can check rather than one they have to take. Opaque
tokens rather than JWTs ([ADR-0008](adr/ADR-0008.md)): revocable, one indexed lookup, no key
management. Phase 2 inside GO Mobile+ replaces the picker with a host-token exchange creating
the same session row; it is a plan, not an interface — [ADR-0008](adr/ADR-0008.md) holds it until
IDBI supplies the token format, and it arrives with its first adapter.

**The server-side clock.** `POST /session/clock` is the only mutation of `as_of`; it takes
`{advanceDays: 1|7|30}` or `{reset}` plus `expectedVersion`, moves `last_seen` to the previous
`as_of`, and is a single `UPDATE … WHERE id = $1 AND version = $2`: a stale second tab gets 409
`STALE_CLOCK` and refetches, so two tabs pressing +1 month move the clock once. Past
`customers.ledger_horizon` (anchor + 18 months, seeded) it answers 422
`CLOCK_BEYOND_SEEDED_HORIZON` and the Clock component shows "end of simulated data". Every read
then filters `txn_date <= as_of` and computes aggregates as of that date through `core/asof`, so
the future the ledger always had is revealed one row at a time.
`BankDataPort.describe().simulatedClock` is false under the IDBI adapter, and the UI hides the
clock control from `session.capabilities` rather than assuming.

**Statelessness.** The API task holds nothing about a customer between requests. In-process state
is (a) an LRU in front of `SnapshotStore` (a pure function of Postgres rows, safe to lose), (b)
rate-limit counters, (c) open RPC handles. Leases, waitlist tickets and the minute budget live in
Postgres (`avatar_leases`, `avatar_waitlist`, `sum(minutes_charged)` over `avatar_sessions`), so
a task replacement cannot orphan a billed Runway session, drop a queue, or reset the meter. The
one genuinely stateful thing, the LiveKit RPC participant, is pinned to a task by nature; the ECS
service runs `desired_count = 1`, leases carry `task_id`, `/end` from any task marks the lease
released and the owning task's 2-second reaper closes its handle. Rolling deploys use min 100 % /
max 200 % with `stopTimeout` 120 s: on SIGTERM the old task stops granting, waits for live calls
to end (up to 120 s), then cancels them with `end_reason='deploy'`; the atomic lease claim means
two overlapping tasks cannot double-grant one credential. Scaling non-avatar traffic is a
`desired_count` change; scaling avatar concurrency is more Runway credentials
([ADR-0004](adr/ADR-0004.md) records the boundary rather than hiding it).

**Idempotency.** `POST /actions/:id/decision` and `POST /avatar/session` require
`Idempotency-Key`; the service stores `(session_id, key, request_hash, response)`; a replay with
the same hash returns the stored response, a different hash returns 409 `IDEMPOTENCY_MISMATCH`.
`decisions` additionally carries `UNIQUE(session_id, action_id)`, so a double-tap on "Do it" on
hotel wifi produces one row even without the header. The seed is idempotent by construction
(deterministic generator, TRUNCATE + reload in one transaction, hash in `seed_runs`, refuses
while sessions exist unless `--force`).

**Caching.** `snapshots` rows are keyed `(subject, as_of, input_hash, engine_version)`: the first
reviewer at a clock position pays the ~20 ms derivation, everyone after reads JSON; an LRU(64)
sits in front. `/view` sets `ETag: <snapshotId>:<roadmapVersion>` and
`Cache-Control: private, no-store`; the client sends If-None-Match. Shelf and rules are
`public, max-age=300`. **The client persists nothing but the bearer.** The last-successful-View
cache described here at adoption fed the offline tier, and both went with `apps/web`; `apps/mobile`
holds its View in memory for the life of the process and re-reads on refresh
([ADR-0001](adr/ADR-0001.md)).

**Limits** (all `@fastify/rate-limit`, keyed on the CloudFront/ALB-forwarded client IP with
`trustProxy`, documented in [THREAT-MODEL.md](THREAT-MODEL.md)): 120 req/min general, 20 session
creates/hour, 5 avatar grants/hour, 30 ask/evaluate per minute per session, one live avatar per
session, 16 KB body limit, 10 s request timeout. `@fastify/helmet` on. CORS is dev-only because
CloudFront serves `/` and `/api/*` from one origin. Sessions expire after 30 days idle;
`DELETE /session` erases immediately.

## Avatar integration

**Day-1 spike, not day 4.** `@runwayml/avatars-node-rpc` is not a dependency of this repository
at adoption and the prototype used 0.1.0; it is the top technical risk of the build. Day 1 opens
with a timed spike on one billed session: install the current SDK, open a handler against a real
session from a laptop, confirm `onConnected` fires, confirm a `tools` body is accepted by
`POST /v1/realtime_sessions` (recorded 200 kept as a test fixture), confirm the handler can join
from behind NAT. `adapters/runway/rpc-host.ts` is written to whatever the SDK exposes, so version
drift touches one file. If the SDK cannot connect at all, the honest fallback is documented on
day 1: Tier 0 ships prompt-only and the Record tab labels avatar advice "rule-verified on screen,
not gate-verified on the wire"; never a claim the code cannot back.

**Server-side brief.** `application/avatar/brief.builder.ts` ports `buildBrief` from `Ask.tsx`
onto the same View the screens render, so the avatar physically cannot quote a figure the UI does
not show. It adds the prototype's instruction ("before you recommend, endorse or agree to ANY
specific product, including one the customer raises, call check_suitability and read back its
sentence"), the shelf as `productId · name · aliases` so the model can name what it is asking
about, and the session's recent decisions ("Last month you said ₹10,000; you did ₹4,000"). A unit
test (`test/avatar/brief.test.ts`) asserts ≤10,000 / ≤2,000 characters for all four personas at
six clock positions and that every rupee figure in the brief exists in the snapshot. `POST /api/v1/avatar/session` takes
`z.object({}).strict()`; the client sends nothing but its bearer. The `{personality}` body that
`useAvatar` sends at adoption is rejected with 400.

**Tools, from contracts.** `packages/contracts/src/tools/` declares
`check_suitability {product_name, monthly_amount?}` →
`{verdict PASS|BLOCKED|UNKNOWN_PRODUCT, product, rule_id, spoken, alternative}`,
`query_spend {question}` → `{text, evidence[]}` (`docs/product/decisions.md` C3: the model never
does arithmetic), `get_plan {}` → compact plan summary. `zod-to-json-schema` produces Runway's
`tools: [{type:'backend_rpc', name, description, parameters, timeoutSeconds}]` (6 s for
`check_suitability`, inside Runway's 1–8 s window with room for the rules plus the audit INSERT;
4 s `query_spend`; 2 s `get_plan`). `show_artifact` (`client_event`) is deferred.

**Order of operations, enforced by a state machine.** `AvatarSessionService.start()`:
(1) `MinuteBudget.assertAvailable()` from `sum(minutes_charged)` today (429 under 2 minutes);
`LeaseReaper.run()`; `LeaseStore.tryAcquire()` atomic (miss → waitlist ticket, 409 `pool_busy`).
(2) `lifecycle: claimed → creating`; `AdvisoryService.view()` (cached) → `BriefBuilder.build()`.
(3) `AvatarProvider.createSession(cred, {brief, tools, maxSeconds: min(RUNWAY_MAX_SESSION_SECONDS=600, budgetLeft)})`
→ `awaitIssuable` (`queued:true` tolerated; only FAILED/CANCELLED/timeout end it, per
`docs/engineering/runway.md`) → `lifecycle: ready`. (4) `AvatarRpcHost.open(runwaySessionId, cred, handlers)`:
for Runway the hidden participant joins here and for Anam the handlers land in the registry the
webhook route reads; either way it resolves only once the tools are answerable, 8 s timeout.
Reject → `cancel`, `release`, `lifecycle: failed`, 502 `gate_unavailable`. (5) `lifecycle: gated`:
`Lifecycle.assertConsumable()` throws from any other state, so a grant is legal only from here.
(6) `issueGrant(cred, id)` → `avatar_sessions` row with `rpc_connected_at` and `granted_at` →
`lifecycle: granted` → the grant with `expectVideoAfterMs: 5000` and `expiresInSeconds`.
Nothing is carried from step 3 to step 6 in the open: whatever the adapter learned while waiting
it kept privately — see [ADR-0013](adr/ADR-0013.md)'s amendment, which renamed this pair from
`waitUntilReady` / `consume(id, sessionKey)`.
`test/avatar/rpc-before-consume.test.ts` uses `FakeRpcHost` + `FakeAvatarProvider` to assert
`open()` completed before the grant and that a rejected `open()` produced exactly one `cancel()`
and zero `issueGrant()`.

**The `check_suitability` handler.** Parse args with the contract schema (bad args → a tool
result the model can read, never an exception); `ProductShelfPort.resolve()` exact → alias →
substring; unknown → `UNKNOWN_PRODUCT` with "I don't have that product on IDBI's shelf, so I
can't check it"; `evaluate({product, snapshot, amount, goal, alternatives: shelf})` from
`packages/core/src/suitability.ts` over the snapshot computed at grant (no I/O on the hot path);
`AuditStore.appendAdvice({source:'avatar_tool', runwaySessionId, snapshotId, consentId, spoken, recorded, ruleId, verdict})`
and `appendToolCall` awaited before returning, so the record exists before the model speaks the
sentence; measured budget under 100 ms. A slow audit write (>500 ms) is logged and the verdict
still returns; with Postgres down the memory audit store is not substituted (silently switching
stores would break the chain); the call is answered and the failure is on the Record tab as
"record write failed", which is honest.

**Single slot.** Runway Tier 1 permits one concurrent session per credential and cancelling before
READY does not free the slot. `Waitlist` over `avatar_waitlist`: FIFO tickets, one per session;
409 carries `{ticket, position, estimatedWaitSeconds}` where the estimate is the held lease's
remaining cap or the median of the last ten call lengths, whichever is smaller.
`GET /avatar/waitlist/:ticket` reports position; when a lease frees, `promote()` makes the head
ticket claimable for 20 s and `POST /avatar/session` with `X-Waitlist-Ticket` acquires ahead of
anyone else; unclaimed tickets expire and the next moves up. `GET /avatar/availability` is public
so the Ask screen shows "Uday is with another customer — you are next, about 4 minutes" before
the tap, with the deterministic text conversation live underneath.
`RUNWAY_MAX_SESSION_SECONDS=600` during the review window so one shared slot turns over across
twenty reviewers (the 1,800 default at adoption is right for one customer and wrong for a shared
slot); the existing two-minute warning in Ask stays. Runway's own QUEUED-for-the-whole-window is
surfaced as `cause:'provider_concurrency'` with the same UX, and the log line says which of the
two it was, because only one is fixed by adding keys.

**Timeouts and breaker.** Every Runway fetch carries `AbortSignal.timeout` (8 s
create/consume/cancel, 3 s poll); a circuit breaker opens after 3 consecutive failures for 30 s
and half-opens with the unbilled `GET /v1/avatars/{id}`; while open, `POST /avatar/session`
answers 503 at once with "Uday's line is down right now" and the text tier, so nobody waits for a
slot that cannot be granted. Breaker state is on `/health`.

**Audit of toolResults.** `docs/engineering/runway.md` records that
`GET /v1/avatar_conversations/{id}` returned zero turns immediately after a cancelled session.
`TranscriptService` schedules on `/end` or reap with backoff (5 s, 15 s, 45 s, 2 min, 10 min) and
models both outcomes: `transcript_status = fetched | unavailable`. When fetched, `Reconciler`
matches each assistant turn's `toolCalls/toolResults` to `avatar_tool_calls` by tool, arguments
and order (`verified_in_transcript = true`), then scans for gate coverage: every shelf product
name or alias spoken in an assistant turn must be preceded by a `check_suitability` call for that
product. The Record tab shows "Gate fired 3/3 · verified against provider transcript", "Gate
fired 2/3 — 'PPF' was named without a check" or "transcript unavailable — our own tool ledger
shown". Our ledger is written synchronously inside the handler, so the record never depends on
the provider's transcript existing, which is the posture `runway.md` asks for.

**Cost and safety knobs**, all in `config.ts`: `RUNWAY_MAX_SESSION_SECONDS` (600 for the review),
`RUNWAY_DAILY_MINUTE_BUDGET` (240; ≤US$48/day), `AVATAR_ENABLED` (false = `NullAvatarProvider`
without a deploy of code), `AVATAR_SESSIONS_PER_IP_PER_HOUR` (5). Teardown on every path:
`sendBeacon` to `/end` on pagehide, reaper before every acquire and every 2 s, `release-all`
behind the operator key, Fastify `onClose`, SIGTERM drain. CloudWatch alarm at 80 % of the daily
budget; AWS Budgets alarm at US$100/month. Cut from UI copy: "Interrupt him whenever you like"
(in `Ask.tsx` at adoption); barge-in is unverified and CONTRIBUTING forbids claiming it.

# Low-level design

This document lists the modules the high-level design introduces, one section each, with the
signature the rest of the codebase depends on and the modules it may import. It is the reference
to read before writing or reviewing a file under `apps/api/src`, `packages/core/src/asof.ts`,
`packages/core/src/goal.ts`, `packages/contracts/src` or `apps/mobile/src/api`. The architecture it
serves is in [`HLD.md`](HLD.md); the flows these modules take part in are in
[`lifecycles.md`](lifecycles.md).

Status: adopted 3 September 2026 · amended 2026-09-20 (the client module) · amended 2026-09-22
(server-side signatures re-read off the code; see below).

> **Amendment, 2026-09-20.** `apps/web` has been deleted and `apps/mobile` is the only client, so
> the last section of this document — the client's `api/client` module — now describes
> `apps/mobile/src/api/client.ts` and has been rewritten against it. Nothing on the server side
> moved. Where a section below says *"at adoption"* and names an `apps/web` file, it is stating
> where a piece of logic came from on 3 September, which is still true and is why the function it
> names lives where it does; see the amendment on [ADR-0001](adr/ADR-0001.md) for the removal
> itself.
>
> **Amendment, 2026-09-22.** "Nothing on the server side moved" was not so. The route entry moved
> to `packages/contracts/src/route.ts` and grew; `Deps` gained nine members; `suggestGoal` takes the
> goal kind the customer chose (migration 0012); the IDBI adapter was rewritten over the real
> sandbox; the pool is `src/db/pool.ts`. Those sections are corrected below. Modules added since —
> the Anam adapter, the provider router, `LanguageModelPort`, the save and challenge services —
> have no section here: [ADR-0013](adr/ADR-0013.md) covers the avatar ones, and the code is the
> reference for the rest.

## core/asof — `packages/core/src/asof.ts`

The as-of arithmetic that lives inside `generateCustomerFile` at adoption, as pure functions:
account aggregates from a ledger prefix, liability tenure/outstanding roll, SIP instalments. Called
by the generator and by every `BankDataPort` adapter so Postgres and memory agree to the rupee by
construction. (The offline chunk was the third caller and went with `apps/web`; the two that
remain are the two that were ever hard to keep in step.)

```ts
accountFactsAsOf(txns: readonly Transaction[], asOf: string): { currentBalance: number; avgMonthlyBalance3m: number; avgMonthlyBalance12m: number; minBalance12m: number }
liabilityAsOf(c: LiabilityContract, anchor: string, asOf: string): Liability | null  // null when cleared
sipHoldingAsOf(c: SipContract, anchor: string, asOf: string, months: number): Holding
```

Depends on: `core/dates`, `core/types`.

## core/goal — `packages/core/src/goal.ts`

`suggestGoal`, moved verbatim from `apps/web/src/lib/view.ts`. Domain logic belongs in core.

It has since learned the customer's own choice: `chosenKind` is the goal kind onboarding stores
in `sessions.goal_kind`, planned wherever it has something to aim at, and `overrideBasis` says
whether an overridden target is in today's money or the year it lands.

```ts
suggestGoal(snapshot: Snapshot, asOf: string, override: number | null, overrideBasis: GoalAmountBasis | null = null, chosenKind: GoalKind | null = null): Goal
```

Depends on: `core/derive`, `core/roadmap`, `core/projection`.

## contracts/registry — `packages/contracts/src/registry.ts`

The one readonly table of routes, 52 rows. Drives Fastify validation in and out, OpenAPI 3.1,
the client's types, the no-undeclared-route test and the documented-surface test. The row's shape
is `packages/contracts/src/route.ts`.

```ts
interface RouteEntry { id: string; method: 'GET'|'POST'|'PATCH'|'DELETE'; path: `/api/v1${string}`; summary: string; auth: 'none'|'session'|'operator'; rateLimit?: { max: number; window: string; keyBy: 'ip'|'session' }; idempotent?: boolean; request?: { params?; query?; body?; headers? }; response: { [status: number]: z.ZodTypeAny }; cache?: { control: string; etag?: boolean } }
export const ROUTES = [ … ] as const satisfies readonly RouteEntry[]
```

Depends on: `contracts/route`, `contracts/routes/*`, `contracts/common`.

## contracts/tools — `packages/contracts/src/tools/index.ts`

Zod argument/result schemas for the tools; `zod-to-json-schema` turns them into the JSON
Schema a provider needs to register them.

```ts
CheckSuitabilityArgs = z.object({ product_name: z.string(), monthly_amount: z.number().optional() })
CheckSuitabilityResult = z.object({ verdict: z.enum(['PASS','BLOCKED','UNKNOWN_PRODUCT']), product: z.string().nullable(), rule_id: z.string().nullable(), spoken: z.string(), alternative: AlternativeSchema.nullable() })
QuerySpendArgs / QuerySpendResult · GetPlanResult
export function toolJsonSchemas(): ToolDefinition[]
```

Depends on: `contracts/domain`.

## http/register — `apps/api/src/http/register.ts`

The only way to add a route. Parses the request against `entry.request`, runs the handler, parses
the response against `entry.response` (a mismatch is a 500 in dev and a logged violation in
prod), applies auth and rate-limit from the entry.

```ts
registerRoute<E extends Route>(app: FastifyInstance, deps: RegisterDeps, entry: E, handler: RouteHandler<E['id']>): void   // ctx: { principal, session, params, query, body, headers, request, log }
```

Depends on: `contracts/registry`, `http/auth`, `application/errors`.

## composition/root — `apps/api/src/composition/root.ts`

Composition root. Picks one adapter per port from config, wires services by constructor,
registers every `ROUTES` entry, enforces startup invariants (a real `AvatarProvider` requires a
real `AvatarRpcHost`; `FAULT_INJECT` is refused in production).

```ts
buildRoot(config: Config, options?: RootOptions): Promise<{ app: FastifyInstance; deps: Deps; services: AppServices; taskId: string; close(): Promise<void> }>
interface Deps { bank: BankDataPort; profiles: DeclaredProfileStore; holdings: HoldingsStore; aa: { store: AaConsentStore; gateway: AaGatewayPort } | null; leads: LeadSinkPort; mappingReport: (() => MappingReport | null) | null; shelf: ProductShelfPort; sessions: SessionStore; snapshots: SnapshotStore; audit: AuditStore; leases: LeaseStore; avatar: AvatarProvider; rpc: AvatarRpcHost; toolWebhook: AvatarToolWebhook; clock: Clock; credentials: AvatarCredential[]; model: LanguageModelPort; seed: SeedInfo }
```

Depends on: `config`, `ports/*`, `adapters/*`, `application/*`, `http/*`.

## application/advisory.service — `apps/api/src/application/advisory.service.ts`

Builds the View every screen reads, exactly as `apps/web/src/lib/view.ts` does in the browser at
adoption, server-side and memoised through `SnapshotStore`.

```ts
class AdvisoryService { constructor(deps: { bank: BankDataPort; shelf: ProductShelfPort; snapshots: SnapshotStore; engineVersion: string; now?: () => number })
  view(session: Session): Promise<ServerView>  // View = { snapshot, accounts, goal, roadmap, plan, insights, shelf, rules, meta: { asOf, ledgerHorizon, dataFreshnessDate, source, simulatedClock, snapshotId, snapshotHash, roadmapVersion, provenance, tier } }
  recut(session: Session, reasonForChange: string): Promise<number>  // a new roadmap version }
```

Depends on: `core`, `application/consent-scope`, `application/hash`, `ports/bank-data`,
`ports/snapshot-store`.

## application/decision.service — `apps/api/src/application/decision.service.ts`

Server-side decision. Re-derives the current plan, finds the action by id (never trusts client
amounts), runs `evaluate()` for money actions, appends `advice_record` + `decision` (+ category
cap) + `roadmap_version` in one unit of work. The `set_category_cap` handling moves here from
`App.tsx`.

```ts
class DecisionService { decide(session: Session, actionId: string, kind: DecisionKind, note?: string): Promise<{ adviceRecord: AdviceRecord | null; decision: DecisionRecord; roadmapVersion: number }> }
```

Depends on: `application/advisory.service`, `core/suitability`, `ports/audit-store`,
`ports/session-store`, `ports/snapshot-store`.

## application/conversation.service — `apps/api/src/application/conversation.service.ts`

The text tier and direct suitability evaluation. The figures and the verdicts are
deterministic; the sentence over them is not, where a model is configured.

`ask` runs in three steps, in this order and for this reason: `core.answer()` computes the
figures, `gateFor` resolves any shelf product the question names and records its verdict before
anything is said, and `LanguageModelPort.complete` is handed both as material. The model gets no
ledger and no discretion over a verdict, so a bad completion is a quality bug rather than a
compliance one. `null` back from the model — no key, a timeout, a refusal — returns the
engine's own sentence, or the rules' refusal where the gate produced one.

```ts
ask(session: Session, question: string, history?: AskTurn[]): Promise<Answer>
suggestions(session: Session): Promise<{ opening: Answer; questions: string[] }>
evaluateProduct(session: Session, request: EvaluateRequest, source: 'text'|'api'): Promise<EvaluateResponse>   // { verdict, adviceRecordId }
```

Depends on: `core/query`, `core/suitability`, `application/advisory.service`,
`ports/audit-store`.

## application/consent-scope — `apps/api/src/application/consent-scope.ts`

Applies the consent artefact plus per-session scope overrides to a `CustomerFile` before
`derive()` runs, so switching a block off on "Where my data comes from"
(`apps/mobile/app/connections.tsx`) genuinely recomputes the advice, as that screen's copy
promises.

```ts
type Scope = 'PROFILE'|'ACCOUNTS'|'TXN'|'LIABILITIES'|'HOLDINGS'
scopeFile(file: CustomerFile, granted: ReadonlySet<Scope>): CustomerFile
```

Depends on: `core/types`.

## application/avatar/avatar-session.service — `apps/api/src/application/avatar/avatar-session.service.ts`

The grant sequence, in this order and no other: budget → claim lease → brief → createSession →
`awaitIssuable` → `RpcHost.open` → `issueGrant` → persist → grant. A rejected `open()` cancels,
releases and answers 502 `gate_unavailable`. The last two port calls were `waitUntilReady` and
`consume` as adopted and were renamed by [ADR-0013](adr/ADR-0013.md); the Runway transport below
still spells them the old way, because those are Runway's own HTTP steps and they did not move.

```ts
start(session: Session, ticket?: string, topic?: string | null): Promise<AvatarGrant>   // busy: 409 carrying a waitlist ticket
prepare(session: Session, topic?: string | null): Promise<AvatarPrepared>   // the same sequence up to the grant, handed nothing; free on Runway until used
end(session: Session, runwaySessionId: string): Promise<void>
record(session: Session, runwaySessionId: string): Promise<AvatarCallRecord>
```

Depends on: `application/avatar/lifecycle`, `application/avatar/brief.builder`,
`application/avatar/tools/*`, `application/avatar/credential-pool`,
`application/avatar/minute-budget`, `application/avatar/waitlist`, `ports/avatar-provider`,
`ports/avatar-rpc-host`, `ports/lease-store`, `ports/audit-store`.

## application/avatar/lifecycle — `apps/api/src/application/avatar/lifecycle.ts`

Explicit state machine. `assertConsumable()` passes only from `'gated'`, so `issueGrant` cannot
run before the tool gate is open; any other transition throws `IllegalTransition` and is
unit-tested.

```ts
type AvatarState = 'claimed'|'creating'|'ready'|'gated'|'granted'|'live'|'ended'|'reaped'|'failed'
class Lifecycle { get state(): AvatarState; to(next: AvatarState): void; tryTo(next: AvatarState): boolean; assertConsumable(): void  // to() and assertConsumable() throw IllegalTransition }
const TRANSITIONS: Readonly<Record<AvatarState, readonly AvatarState[]>>
```

Depends on: nothing.

## application/avatar/brief.builder — `apps/api/src/application/avatar/brief.builder.ts`

Server-side personality brief and startScript, from the same View the screens read (a port of
`buildBrief` in `Ask.tsx` plus the prototype's tool instructions and the shelf's names and
aliases). Length ceilings asserted for all personas at several clock positions.

```ts
buildBrief(view: ServerView, recentDecisions: readonly DecisionRecord[], shelf: readonly ShelfProduct[], topic?: string | null): { personality: string; startScript: string }
```

Depends on: `core/derive`, `contracts/domain`.

## application/avatar/tools/check-suitability.tool — `apps/api/src/application/avatar/tools/check-suitability.tool.ts`

`backend_rpc` handler. Resolves the spoken product through `ProductShelfPort.resolve`, runs
`evaluate()` over the session's already-computed snapshot, appends `advice_records`
(`source='avatar_tool'`) and `avatar_tool_calls` before returning. Unknown product →
`UNKNOWN_PRODUCT` with an honest sentence, never a guess.

```ts
makeCheckSuitability(ctx: { view: View; shelf: ProductShelfPort; audit: AuditStore; session: Session; runwaySessionId: string }): (args: unknown) => Promise<CheckSuitabilityResult>
```

Depends on: `core/suitability`, `contracts/tools`, `ports/product-shelf`, `ports/audit-store`.

## application/avatar/waitlist — `apps/api/src/application/avatar/waitlist.ts`

FIFO tickets over `LeaseStore` for the single Tier-1 slot: position, ETA (remaining cap of the
live call, else median call length), 20-second claim window, expiry promotes the next.

```ts
join(sessionId: string): Promise<WaitlistTicket>
status(ticket: string): Promise<{ position: number; estimatedWaitSeconds: number; claimable: boolean; holdUntil: string | null }>
leave(ticket: string): Promise<void>
promote(): Promise<void>  // called on every release
```

Depends on: `ports/lease-store`, `ports/clock`.

## application/avatar/reconciler — `apps/api/src/application/avatar/reconciler.ts`

After the transcript arrives: match each `toolResult` to an `avatar_tool_calls` row (tool, args,
order) and compute `gate_coverage`: every shelf product name or alias spoken in an assistant turn
must be preceded by a `check_suitability` call for it.

```ts
reconcile(transcript: ConversationTurn[], calls: AvatarToolCall[], shelf: Product[]): { verified: string[]; unverified: string[]; gateCoverage: { fired: number; expected: number; misses: string[] } }
```

Depends on: `ports/product-shelf`.

## adapters/postgres/bank-data.postgres — `apps/api/src/adapters/postgres/bank-data.postgres.ts`

`BankDataPort` over seeded rows. Reads transactions `WHERE txn_date <= $asOf`, shapes accounts,
liabilities and holdings through `core/asof`. Reports `describe()` with `simulatedClock=true` and
the seed horizon.

```ts
class PostgresBankData implements BankDataPort { constructor(db: Db, opts: PostgresBankDataOptions); static connect(db: Db, …): Promise<PostgresBankData> }
```

Depends on: `db/pool`, `core/asof`, `ports/bank-data`.

## adapters/idbi-sandbox/composite — `apps/api/src/adapters/idbi-sandbox/composite.ts`

Answers each `BankDataPort` method from IDBI's sandbox where the catalogue has an operation and
from the app's own `HoldingsStore` where it does not (holdings, policies), tagging provenance per
block for the UI. The sandbox side is no longer a stub: `IdbiSandboxBankData` reads the
twenty-four real operations through `api/gateway.ts`, live or replayed from the captured bodies.

```ts
class CompositeBankData implements BankDataPort { constructor(primary: IdbiSandboxBankData, holdings: HoldingsStore) }
```

Depends on: `adapters/idbi-sandbox/bank-data.idbi-sandbox`, `ports/holdings`, `ports/bank-data`.

## adapters/runway/transport — `apps/api/src/adapters/runway/transport.ts`

`providers/runway.ts` moved, plus a `tools` body field on `createSession`, `AbortSignal` timeouts
(8 s create/consume/cancel, 3 s poll) and a circuit breaker (3 failures → open 30 s → half-open
probe on the unbilled `GET /v1/avatars/{id}`).

```ts
createSession(cred, opts: { personality; startScript; tools: ToolDefinition[]; maxDuration }): Promise<string>
waitUntilReady(cred, id, { timeoutMs }): Promise<{ sessionKey }>
consumeSession(id, sessionKey): Promise<LiveKitGrant>
cancelSession(cred, id): Promise<boolean>
getConversation(cred, id): Promise<ConversationRecord | null>
breaker: CircuitBreaker
```

Depends on: `infra/circuit`, `infra/timeout`.

## adapters/runway/rpc-host — `apps/api/src/adapters/runway/rpc-host.ts`

`AvatarRpcHost` over `@runwayml/avatars-node-rpc` `createRpcHandler`. `open()` resolves only on
`onConnected` (8 s timeout); handlers held in a `Map` on the task; closed on end, reap,
release-all and Fastify `onClose`. Written to whatever the Day-1 spike finds the SDK exposes.

```ts
class RunwayRpcHost implements AvatarRpcHost { open(runwaySessionId: string, cred: AvatarCredential, handlers: ToolHandlers): Promise<RpcHandle>; close(handle: RpcHandle): Promise<void>; liveness(handle: RpcHandle): Promise<CallLiveness>; openCount(): number }
```

Depends on: `ports/avatar-rpc-host`.

## adapters/postgres/audit-store.postgres — `apps/api/src/adapters/postgres/audit-store.postgres.ts`

INSERT-only repository. Computes `record_hash = sha256(prev_hash ‖ canonical(row))` per session
inside the insert transaction.

```ts
class PostgresAuditStore implements AuditStore
```

Depends on: `db/pool`, `application/hash`, `ports/audit-store`.

## cli/seed — `apps/api/src/cli/seed.ts`

`pnpm seed`: migrate → `toSeedBundle(spec, {anchor, historyMonths: 24, forwardMonths: 18})` for
every persona → COPY in one transaction → `seed_runs` row with content sha256 → verify (re-derive
the summary and diff against the generator). `--check` compares hashes only; refuses to run while
sessions exist unless `--force`.

```ts
seed(pool: pg.Pool, opts: SeedRunOptions): Promise<SeedReport>   // the CLI's flags: --check --force --anchor --forward --history
checkSeed(pool: pg.Pool, opts: SeedOptions): Promise<CheckReport>
```

Depends on: `fixtures/seed-bundle`, `db/seed-bundle`, `db/pool`, `db/migrate`.

## fixtures/seed-bundle — `packages/fixtures/src/seed-bundle.ts`

Runs the existing `generateLedger` once to the horizon and emits rows for every bank table, plus
contracts (liabilities, SIPs, policies) rather than as-of facts. Shared by the seed CLI and the
memory adapter.

```ts
toSeedBundle(spec: PersonaSpec, options?: Partial<{ anchor: string; historyMonths: number; forwardMonths: number }>): SeedBundle
interface SeedBundle { slug; customer; pitch; demonstrates; displayOrder; consent; accounts; transactions; liabilityContracts; sipContracts; holdings; policies; horizon: SeedHorizon }
```

Depends on: `fixtures/generate`, `fixtures/personas`, `fixtures/calendar`, `fixtures/shelf`.

## mobile/api/client — `apps/mobile/src/api/client.ts`

The one client. A flat object of named methods rather than a generic typed-fetch helper: every
request and response type is imported from `@dhan/contracts`, so a route that changes shape fails
here at `tsc` rather than at runtime, and a screen takes the body type from the method it is about
to call instead of having to know which route file the contract filed it in. The bearer is the
whole of what the client persists, and `api/storage.ts` is the one module that knows where:
SecureStore on a device, `localStorage` on the Expo web build, with its own comment arguing why
the fallback is acceptable on a target that only ever holds a synthetic customer. `onTokenChange`
lets the snapshot store re-arm when the bearer appears or is dropped. Idempotency keys are minted per
request and their shape is per route — derived for a decision, so a retry of the same choice
collapses; random for an avatar call, because each attempt genuinely leases a credential and
starts billing.

There is no offline tier and no last-good cache, so no `tier` field: `apps/mobile` renders what the
API returned or says it could not reach the bank. See [ADR-0001](adr/ADR-0001.md)'s amendment.

```ts
class ApiError extends Error { readonly status: number; readonly code: string }
getToken(): Promise<string | null>
setToken(token: string | null): Promise<void>
onTokenChange(fn: () => void): () => void
api.view(): Promise<View>
api.decide(actionId, kind): Promise<DecisionResponse>   // idempotency-key `${actionId}:${kind}`
```

Depends on: `@dhan/contracts`, `mobile/api/storage`, `expo-constants`.

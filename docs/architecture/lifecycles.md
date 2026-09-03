# Lifecycles

Six sequence diagrams, one per flow that a reviewer is likely to exercise or ask about: opening
the app, rendering Today, recording a decision, granting a gated avatar session, a second person
hitting the single avatar slot, and advancing the simulated clock. Each names the module that
owns every step, so a question about a flow can be answered with a filename. The modules are
specified in [`LLD.md`](LLD.md); the routes and tables they touch are in
[`DATA-AND-API.md`](DATA-AND-API.md).

Status: adopted 3 September 2026.

## Open app and pick a customer

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (apps/web)
    participant H as http/register.ts
    participant S as SessionService
    participant BD as BankDataPort
    participant DB as Postgres
    B->>H: GET /api/v1/customers
    H->>BD: listCustomers()
    BD->>DB: SELECT cif, cust_name, city, pitch, demonstrates FROM customers
    DB-->>BD: 3 rows
    BD-->>H: CustomerSummary[]
    H-->>B: 200 (validated against registry response schema)
    Note over B: tap Rohan
    B->>H: POST /api/v1/sessions {cif}
    H->>S: create(cif)
    S->>S: token = random 32 bytes · hash = sha256(token)
    S->>DB: INSERT sessions (subject_id, token_hash, as_of=anchor, last_seen=anchor-6d, version=1, expires_at=now+30d)
    S-->>H: {token, session}
    H-->>B: 201 {token, session:{asOf, lastSeen, ledgerHorizon, capabilities:{simulatedClock:true, avatar:'runway'}}}
    Note over B: localStorage holds only the token
```

## Today plan (GET /view)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant H as http/register.ts
    participant A as AdvisoryService
    participant CS as consent-scope
    participant BD as BankDataPort (postgres)
    participant SS as SnapshotStore
    participant K as packages/core
    B->>H: GET /api/v1/view (Bearer, If-None-Match)
    H->>H: auth preHandler → session
    H->>A: view(session)
    A->>BD: loadCustomerFile(cif, asOf, 24)
    BD->>BD: SELECT … WHERE txn_date <= asOf · core/asof for accounts, liabilities, SIPs
    BD-->>A: {file, provenance}
    A->>CS: scopeFile(file, consent.scopes − session.scopeOverrides)
    A->>A: inputHash = sha256(canonical(scopedFile, shelf))
    A->>SS: find(cif, asOf, inputHash, engineVersion)
    alt hit
        SS-->>A: snapshot row
    else miss
        A->>K: derive(file, asOf) → suggestGoal → buildRoadmap → buildDailyPlan → findInsights
        A->>SS: put(snapshot) · putRoadmap(version = 1 + did_it count)
    end
    A-->>H: View {snapshot, goal, roadmap, plan, insights, shelf, rules, meta}
    H-->>B: 200 ETag=snapshotId:roadmapVersion (or 304)
    Note over B: Today renders safe-to-spend, since-you-were-away, ONE action
```

## Decide an action (audit record)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant H as http/register.ts
    participant D as DecisionService
    participant A as AdvisoryService
    participant K as core/suitability
    participant AU as AuditStore (postgres)
    participant SS as SnapshotStore
    B->>H: POST /api/v1/actions/:actionId/decision {kind:'did_it'} · Idempotency-Key
    H->>H: replay? → stored response
    H->>D: decide(session, actionId, kind)
    D->>A: view(session)
    D->>D: action = plan.actions.find(id) — never client amounts
    alt action carries a product
        D->>K: evaluate({product, snapshot, amount, goal, alternatives})
        K-->>D: Verdict {PASS|BLOCKED, ruleId, spoken, recorded, passed}
    end
    rect rgba(111, 76, 255, 0.12)
        Note over D,SS: one unit of work
        D->>AU: BEGIN · appendAdvice({snapshotId, consentId, source:'screen', spoken, prev_hash→record_hash})
        D->>AU: appendDecision({actionId, kind, at_sim=asOf}) — UNIQUE(session_id, action_id)
        D->>SS: putRoadmap(version+1, reason 'Re-cut after N decisions')
        D->>AU: COMMIT
    end
    D-->>H: {adviceRecord, decision, roadmapVersion}
    H-->>B: 200 · stored under Idempotency-Key
    Note over B: Record tab shows the exact sentence, rule and snapshot id — reload keeps it
```

## Start avatar session with the gate (RPC before credentials)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant H as http/register.ts
    participant AS as AvatarSessionService
    participant L as LeaseStore (postgres)
    participant P as AvatarProvider (runway)
    participant R as AvatarRpcHost
    participant LK as LiveKit
    participant RW as Runway
    participant K as core
    participant AU as AuditStore
    B->>H: POST /api/v1/avatar/session {} (strict, bearer)
    H->>AS: start(session)
    AS->>L: minutesUsed(today) ≥ budget? → 429
    AS->>L: reapExpired() · tryAcquire(label) — atomic
    alt no lease
        AS-->>B: 409 {cause:'pool_busy', ticket, position, estimatedWaitSeconds}
    end
    AS->>AS: lifecycle: claimed → creating · brief = BriefBuilder.build(view)
    AS->>P: createSession(cred, {personality, startScript, tools, maxSeconds: min(600, budgetLeft)})
    P->>RW: POST /v1/realtime_sessions (8 s timeout, breaker)
    AS->>P: waitUntilReady (queued is not contention)
    AS->>AS: lifecycle: ready
    rect rgba(111, 76, 255, 0.12)
        Note over AS,LK: the gate opens before any credential is issued
        AS->>R: open(runwaySessionId, handlers) — joins room as hidden participant
        R->>LK: connect · await onConnected (8 s)
        alt open() rejects
            AS->>P: cancel
            AS->>L: release
            AS->>AS: lifecycle: failed
            AS-->>B: 502 {cause:'gate_unavailable'} → text tier
        end
        AS->>AS: lifecycle: gated — only now may consume run
        AS->>P: consume(id, sessionKey) (one shot)
    end
    AS->>AU: appendAvatarSession({rpc_connected_at, granted_at})
    AS-->>B: 200 {url, token, runwaySessionId, expectVideoAfterMs:5000, expiresInSeconds}
    B->>LK: join · publish mic
    RW->>LK: Uday voice + video
    RW->>R: check_suitability("LIC ULIP", 5000)
    R->>K: evaluate(product, snapshot, amount)
    K-->>R: BLOCKED · BUNDLED_PROTECTION · spoken · term cover alternative
    R->>AU: appendAdvice(source:'avatar_tool') · appendToolCall — before returning
    R-->>RW: {verdict, rule_id, spoken, alternative}
    RW->>LK: Uday reads the verdict
    B->>H: POST /avatar/session/:id/end (sendBeacon)
    H->>AS: end → R.close · P.cancel · L.release(minutesCharged) · transcript fetch scheduled
```

## Second reviewer hits the busy slot

```mermaid
sequenceDiagram
    autonumber
    participant B2 as Reviewer 2 browser
    participant H as http/register.ts
    participant AS as AvatarSessionService
    participant W as Waitlist
    participant L as LeaseStore (postgres)
    participant C as ConversationService
    B2->>H: GET /api/v1/avatar/availability
    H-->>B2: {available:false, queueLength:0, minutesLeftToday, estimatedWaitSeconds:240}
    B2->>H: POST /api/v1/avatar/session {}
    H->>AS: start(session2)
    AS->>L: tryAcquire → null (reviewer 1 holds runway-1)
    AS->>W: join(session2) → ticket, position 1
    AS-->>B2: 409 {cause:'pool_busy', ticket, position:1, estimatedWaitSeconds:240}
    Note over B2: QueueCard: "Uday is with another customer — you are next, about 4 minutes. Continue in text meanwhile?"
    B2->>H: POST /api/v1/ask {question:"how much on food last month"}
    H->>C: ask → core.answer()
    C-->>B2: {text:"₹7,655 on food & dining in August…", evidence[], resolved}
    loop every 3 s
        B2->>H: GET /api/v1/avatar/waitlist/:ticket
        H-->>B2: {position:1, claimable:false}
    end
    Note over L: reviewer 1 ends → release → W.promote(): ticket claimable, holdUntil = now+20 s
    B2->>H: GET /avatar/waitlist/:ticket → {claimable:true, holdUntil}
    B2->>H: POST /api/v1/avatar/session {} · X-Waitlist-Ticket
    H->>AS: start(session2, ticket) → acquires ahead of anyone else
    AS-->>B2: 200 grant (same gated sequence)
    Note over B2: unclaimed after 20 s → ticket expires, next in line promoted
```

## Simulated clock advance (server-side)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (Clock component)
    participant H as http/register.ts
    participant S as SessionService
    participant ST as SessionStore (postgres)
    participant A as AdvisoryService
    participant BD as BankDataPort
    B->>H: POST /api/v1/session/clock {advanceDays:30, expectedVersion:3}
    H->>S: advanceClock(session, 30, 3)
    S->>BD: ledgerHorizon(cif) → 2028-03-01
    alt asOf+30d > horizon
        S-->>B: 422 CLOCK_BEYOND_SEEDED_HORIZON
    end
    S->>ST: UPDATE sessions SET last_seen = as_of, as_of = as_of + 30, version = 4 WHERE id AND version = 3
    alt 0 rows (stale tab)
        S-->>B: 409 STALE_CLOCK → client refetches
    end
    S-->>B: 200 {asOf, lastSeen, version:4}
    B->>H: GET /api/v1/view
    H->>A: view(session) — new (cif, asOf) → new inputHash → derive over rows ≤ new asOf
    A-->>B: View — EMI count drops when the education loan clears, 'since you were away' covers 30 days
    Note over B: two tabs pressing +1 month move the clock once, not twice
```

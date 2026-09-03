# Runway backend_rpc spike: the gate can be opened before the browser gets its credentials

**Question.** Can our process register a `backend_rpc` tool with a Runway Characters session
and be the participant that answers it, *before* `/consume` hands the browser its LiveKit
credentials? Every architecture proposal and every judge named this the top risk; the whole
compliance claim ("the model never decides suitability") rests on it.

**Answer.** Yes. One billed session on 3 September 2026 (about one minute, session
`71f2ac47-7e5f-4e1e-a6f2-12857dc9ce99`): a `tools` body with a `backend_rpc` tool was accepted
with 200; the SDK joined the room as `rpc-handler:<sessionId>` and `onConnected` fired **1.65 s
after READY**, before `/consume` was ever called; `/consume` then succeeded normally. The script
is [`evidence/runway-rpc-spike.mjs`](evidence/runway-rpc-spike.mjs). The run log is at the
bottom of this page.

No tool call was observed, and that is the expected outcome of a spike with no browser: the
worker never starts the conversation until a `user:` participant joins (see finding 5). Proving a
live round trip needs the browser client in the loop and is the next step, not this one.

## 1. The SDK: `@runwayml/avatars-node-rpc` 0.1.0

Installed fresh on 3 September 2026: version **0.1.0**, the same version the archived prototype
used. One dependency, `@livekit/rtc-node` (resolved to 0.13.34), which pulls a native N-API
binary per platform (`@livekit/rtc-ffi-bindings-darwin-arm64` here). ESM and CJS builds ship.

The package exports exactly one function and four types:

```ts
createRpcHandler(options: CreateRpcHandlerOptions): Promise<RpcHandler>

interface CreateRpcHandlerOptions {
  apiKey?: string          // Runway API key; required unless `credentials` is given
  sessionId?: string       // required unless `credentials` is given
  baseUrl?: string         // default https://api.dev.runwayml.com
  credentials?: { url: string; token: string; roomName: string }
  tools: Record<string, ToolHandler>
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (error: Error) => void
  debug?: boolean
}
type ToolHandler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>
interface RpcHandler { close(): Promise<void>; readonly connected: boolean }
```

What it does, from `dist/index.js` (short enough to read in full):

1. `POST {baseUrl}/v1/realtime_sessions/{sessionId}/connect_backend` with
   `Authorization: Bearer <apiKey>`, `X-Runway-Version: 2024-11-06`, `Content-Type:
   application/json` and **no body**. This endpoint is **not in Runway's published OpenAPI
   spec** (nor is `/consume`; the spec lists only `get` and `delete` on
   `/v1/realtime_sessions/{id}`). The response is `{ url, token, roomName }`.
2. `new Room()` from `@livekit/rtc-node`, `room.connect(url, token)`.
3. For each key in `tools`, `localParticipant.registerRpcMethod(name, …)`. The wrapper rejects
   any caller whose identity does not start with `worker:`, parses the payload as JSON, takes
   `parsed.args ?? parsed`, awaits the handler, and returns `JSON.stringify(result)`. A thrown
   handler becomes an `RpcError(APPLICATION_ERROR, message)` so the worker does not sit on its
   timeout.
4. Calls `onConnected()` synchronously, then resolves with `{ close, connected }`.

So `onConnected` and the promise resolving are the same moment; an `open()` that awaits
`createRpcHandler` has its gate. `onDisconnected` is wired to `RoomEvent.Disconnected`.
`connected` reads `room.isConnected`. There is no way to reach the underlying `Room`, the remote
participant list, or the `/connect_backend` response through the public surface; the spike
observed the latter by wrapping `globalThis.fetch`.

Two operational notes for whoever writes `adapters/runway/rpc-host.ts`:

- `debug: true` prints with `console.log`, and `@livekit/rtc-node` writes pino JSON lines
  (`"name":"lk-rtc"`, level 20) to stdout on its own. Leave `debug` off in the API and expect
  the LiveKit lines regardless.
- After `room.disconnect()` the native binding kept the event loop alive; the spike ends with
  `process.exit(0)`. The API is long-lived so this does not matter there, but a CLI or test
  that opens a handler must not wait for a natural exit.

## 2. The `tools` body that Runway accepted (200)

The brief said "parameters JSON schema". Runway's spec (`https://docs.dev.runwayml.com/openapi.json`,
`POST /v1/realtime_sessions` → `tools[]`) says otherwise: **`parameters` is an array of typed
parameter objects**, at most 20 per tool and at most 20 tools, and that is the form the prototype
used and the form this run sent. The exact body, minus the character id:

```json
{
  "model": "gwm1_avatars",
  "avatar": { "type": "custom", "avatarId": "<RUNWAY_CHARACTER_ID>" },
  "maxDuration": 120,
  "personality": "You are Uday, a wealth adviser at IDBI Bank. Speak briefly. You never judge whether a product suits a customer yourself: you call check_suitability and repeat its verdict.",
  "startScript": "Before greeting anyone, call check_suitability with product_name \"LIC Market Plus ULIP\" and monthly_amount 5000, then say the verdict out loud in one sentence.",
  "tools": [
    {
      "type": "backend_rpc",
      "name": "check_suitability",
      "description": "Run a named product through the bank's deterministic suitability rules before recommending, endorsing or agreeing to it. Returns verdict PASS or BLOCKED with the rule and the reason. You must call this before naming any product as suitable, including one the customer raised. You may not reach a suitability conclusion yourself.",
      "timeoutSeconds": 6,
      "parameters": [
        { "type": "string", "name": "product_name", "description": "The product under discussion, as close to the shelf name as possible.", "required": true },
        { "type": "number", "name": "monthly_amount", "description": "The monthly rupee amount under discussion. 0 if none has been named.", "required": false }
      ]
    }
  ]
}
```

Response: `200 { "id": "<uuid>" }` after 4.2 s. The conversation record afterwards echoed
`tools: [backend_rpc:check_suitability]`, so the declaration was stored, not merely tolerated.

The spec's constraints, so `packages/contracts/src/tools/` can mirror them instead of
discovering them at runtime:

| Field | Constraint |
|---|---|
| `type` | `backend_rpc` or `client_event` |
| `name` | `^[a-zA-Z_][a-zA-Z0-9_]*$`, 1–64 chars |
| `description` | 1–1024 chars |
| `timeoutSeconds` | `backend_rpc` only; number, **1–8**, default 4 |
| `parameters[]` | max 20; each `{ name, description, type, required? (default **true**) }` |
| `parameters[].type` | `string` (optional `enum`, ≤20 values of ≤64 chars), `integer`, `number`, `boolean`, `array` (with `items.type` of a scalar) |
| `maxDuration` | integer 10–1800, default 300 |
| `tools` | max 20 |

Note `required` defaults to **true**; an optional argument must say `required: false`
explicitly. A `zod-to-json-schema` step is the wrong tool here; the mapping from a zod object to
this array is a dozen lines and should be written by hand and tested against the fixture above.

## 3. `onConnected`: fired, 1,649 ms after READY, before `/consume`

| Moment | Elapsed from script start | Note |
|---|---|---|
| `POST /v1/realtime_sessions` returned | 4.17 s | the create call itself is the slow part |
| first poll: `NOT_READY` | 4.44 s | `queued` never appeared this run |
| `READY` | 5.46 s | `sessionKey` is a `stk_…` string of 275 chars; `expiresAt` = createdAt + 5 min |
| `/connect_backend` → 200 | 5.79 s | `{ url: "wss://runway-5y2mkmh5.livekit.cloud", token: <404-char JWT>, roomName: <sessionId> }` |
| `onConnected` | 7.11 s | local identity `rpc-handler:<sessionId>`; remote participants: none |
| `/consume` → 200 | 7.50 s | see §4 |

The handler joined from a laptop behind home NAT with no configuration. The hidden participant
is visible to nothing else: at the moment it joined the room had no other participants, and the
worker only arrives later.

## 4. The `/consume` grant

`POST /v1/realtime_sessions/{id}/consume`, `Authorization: Bearer <sessionKey>`,
`Content-Type: application/json`, body `{}` → **200**:

```json
{ "url": "wss://runway-5y2mkmh5.livekit.cloud", "token": "<295-char JWT>", "roomName": "<sessionId>" }
```

Same three keys as `/connect_backend`, same LiveKit host, same room. The JWT payload (not a
secret without its signature) carries `sub: "user:<sessionId>"`, `video.room: <sessionId>`,
and the grants `roomJoin` and `room`. The transport's `url ?? livekitUrl ?? wsUrl` fallback
chain in `apps/api/src/providers/runway.ts` is wider than it needs to be; `url` and `token` are
the real names, and `roomName` is also present.

So the room holds three identities in a live call: `worker:<id>` (Runway's avatar),
`user:<id>` (the browser) and `rpc-handler:<id>` (us). The SDK's caller check
(`callerIdentity.startsWith('worker:')`) is what stops a browser from invoking our tools
directly; keep it.

## 5. What happened after `/consume` with no browser: `TALKING_AVATAR.NO_PARTICIPANT`

This is the finding the run was not designed for and the one that changes the lifecycle design.

- ~3 s after `/consume`, `GET /v1/realtime_sessions/{id}` reported **`RUNNING`**. Consuming
  starts the worker; nobody had joined over WebRTC.
- ~18 s after that (21 s billed duration), `onDisconnected` fired on our handler and the session
  was **`FAILED`** with `failure: "No participants joined the session"`,
  `failureCode: "TALKING_AVATAR.NO_PARTICIPANT"`.

Two consequences:

1. **The hidden RPC participant does not count as a participant.** Runway waits for the
   `user:` identity specifically. The gate being open does not keep a session alive.
2. **The browser has roughly 20 seconds after `/consume` to connect**, or Runway ends the session
   itself. The API therefore must not consume until the client is actually ready to join, and
   must treat a `FAILED` with this code as "the client never arrived", not as a provider fault.
   On the positive side, an abandoned grant stops billing on its own after ~20 s; it does not run
   to `maxDuration`.

Our `DELETE` on the already-failed session still returned **204**, so cancelling on every
failure path remains safe.

Because the worker never started talking, the `startScript` that told it to call
`check_suitability` on its first turn never ran, which is why `toolCalls: 0` says nothing about
whether the model obeys the tool instruction. That is the next spike, with the web client
joining.

## 6. `GET /v1/avatar_conversations/{id}` after the session ended

Available **immediately** (200 on the first read, 0.3 s after the cancel), and unchanged on a
second read 8 s later:

```json
{
  "status": "failed", "duration": 21,
  "tools": ["backend_rpc:check_suitability"],
  "transcript": [],
  "failure": "No participants joined the session", "failureCode": "TALKING_AVATAR.NO_PARTICIPANT",
  "keys": ["id","name","avatar","createdAt","maxDuration","transcript","recordingUrl","tools","status","startedAt","endedAt","duration","failure","failureCode"]
}
```

This narrows the question `runway.md` left open. The record exists and is complete the moment
the session ends, including the tool declarations. The transcript was empty here because nothing
was said, not because it populates later. Whether a *cancelled* conversation with real turns
keeps them is still untested; the spec's `TranscriptEntry` is
`{ role: 'user'|'assistant', content: string|null, timestamp, toolCalls?: [{id?, name, arguments}], toolResults?: [{id?, name, result, error, durationMs}] }`,
which is the shape the reconciliation against our own `advice_records` should be written to.
The conversation `status` values seen in the spec are active / completed / failed.

## 7. Posture for the build

Nothing failed, so the fallback ("Tier 0 ships prompt-only and the Record tab labels avatar
advice rule-verified on screen, not gate-verified on the wire") is **not needed**. The adapter
can be written to the SDK as it is:

- `adapters/runway/rpc-host.ts` wraps `createRpcHandler({ apiKey, sessionId, baseUrl, tools })`;
  `open()` awaits it under an 8 s timeout and treats resolution as `onConnected`.
- Lifecycle: create (with tools) → READY → `open()` → **client signals it is ready to join** →
  `/consume` → client joins within 20 s. `consume()` from any state other than "gated" throws.
- On `onDisconnected`, or a poll showing `FAILED`/`COMPLETED`/`CANCELLED`, close the handler
  and cancel; `DELETE` is safe on a dead session.
- Pin `@runwayml/avatars-node-rpc@0.1.0` in `apps/api` (a new dependency, as the build plan
  anticipated) and confine every import of it to the adapter. The container base must be
  glibc (Debian slim), as `07-testing-deployment.md` already says, for the rtc-node binary.
- Do not rely on the conversation transcript as the audit trail until the follow-up spike with a
  joined browser shows `toolResults` on the assistant turn; the handler writes the verdict to
  `advice_records` before returning, regardless.

## The run, verbatim (secrets already redacted by the script)

```
+     0ms 1. creating session with tools…
+  4171ms    POST /v1/realtime_sessions -> 200 {"id":"71f2ac47-7e5f-4e1e-a6f2-12857dc9ce99"}
+  4171ms 2. polling to READY…
+  4437ms    NOT_READY
+  5460ms    READY (queued seen: false) {"id":"71f2ac47-…","createdAt":"2026-09-03T00:24:14.312Z","status":"READY","expiresAt":"2026-09-03T00:29:15.786Z","sessionKey":"stk_ey…(275 chars)"}
+  5460ms 3. opening backend RPC handler (before /consume)…
+  5788ms    /connect_backend -> 200 {"url":"wss://runway-5y2mkmh5.livekit.cloud","token":"eyJhbG…(404 chars)","roomName":"71f2ac47-7e5f-4e1e-a6f2-12857dc9ce99"}
{"level":20,"time":1788395057480,"pid":41344,"name":"lk-rtc","msg":"Connect callback received"}
[avatars-node-rpc] Local identity: rpc-handler:71f2ac47-7e5f-4e1e-a6f2-12857dc9ce99
[avatars-node-rpc] Registered RPC methods: check_suitability
[avatars-node-rpc] Remote participants: (none)
+  7109ms    onConnected fired, 1649ms after READY
+  7109ms    handler open; connected=true
+  7109ms 4. consuming (only now that the gate is up)…
+  7499ms    POST /consume -> 200 {"url":"wss://runway-5y2mkmh5.livekit.cloud","token":"eyJhbG…(295 chars)","roomName":"71f2ac47-7e5f-4e1e-a6f2-12857dc9ce99"}
+  7499ms    grant JWT payload: {"sub":"user:71f2ac47-7e5f-4e1e-a6f2-12857dc9ce99","room":"71f2ac47-7e5f-4e1e-a6f2-12857dc9ce99","grants":["roomJoin","room"]}
+  7499ms 5. waiting up to 45s for a tool call (no browser is connected)…
+ 10765ms    session status now RUNNING; rpc connected=true
+ 25830ms    onDisconnected fired
+ 25988ms    session status now FAILED; rpc connected=false
+ 52648ms    no tool call within 45s (expected without a browser participant)
+ 52649ms 6. rpc handler closed
+ 52914ms 7. DELETE session -> 204 (billing stopped)
+ 53179ms    session after cancel: {"id":"71f2ac47-…","createdAt":"2026-09-03T00:24:14.312Z","status":"FAILED","failure":"No participants joined the session","failureCode":"TALKING_AVATAR.NO_PARTICIPANT"}
+ 53455ms 8.1 GET /v1/avatar_conversations -> 200 {"status":"failed","duration":21,"tools":["backend_rpc:check_suitability"],"turns":0,"keys":[…]}
+ 62238ms 8.2 GET /v1/avatar_conversations -> 200 (identical)
+ 62238ms summary: {"readyAfterMs":5460,"onConnectedAfterReadyMs":1649,"onDisconnectedFired":true,"toolCalls":0}
```

The JWT `ttlSeconds` line printed nothing because the grant carries no `nbf`; the evidence
script now falls back to `iat` so the next run records the token lifetime.

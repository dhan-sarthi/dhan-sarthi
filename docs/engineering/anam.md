# Anam: what we verified before moving off Runway

Runway's credits ran out, so Anam (`api.anam.ai`) was tried as the avatar provider. This note
records what a live call actually proved on 20 September 2026, so the migration is not designed
against the documentation — which is wrong or silent about the two things that matter most.

Everything below was measured by [`evidence/anam-call-check.mjs`](evidence/anam-call-check.mjs).
The captured frame is [`evidence/anam-video-verified-2026-09-20.png`](evidence/anam-video-verified-2026-09-20.png).
Each run bills real minutes against a one-slot org.

## The API surface we would use

| Call | Purpose |
|---|---|
| `POST /v1/auth/session-token` | The whole of create-wait-consume in one call. Returns a JWT valid one hour. Takes `clientLabel` and `personaConfig` |
| `GET /v1/sessions/concurrency` | `{limit, active, canStartSession, estimatedWaitSeconds}` — unbilled |
| `GET /v1/avatars/{id}` | Unbilled. The credential health probe |
| `GET /v1/sessions?limit=n` | Past sessions with `clientLabel`, `sessionLengthMs`, `exitStatus` |
| `POST /v1/sessions/{id}/stop` | Stop the session and the billing |
| `GET /v1/sessions/{id}/transcript` | `{durationMs, totalMessages, messages:[{role,message,timestamp,…}]}` |

Bearer is the raw `ANAM_API_KEY`. No version header. Base `https://api.anam.ai`.

## The three things a live call proved

### Video renders, and faster than Runway's

| | |
|---|---|
| Lifecycle | token → `CONNECTION_ESTABLISHED` → `SESSION_READY` → `VIDEO_PLAY_STARTED`, no polling |
| First lit frame | ~10 s from page load, against Runway's ~5 s of provisioning plus keyframe warm-up |
| Resolution | 576×384, ramping to **1152×768** and oscillating between the two |
| Frames | ~25 fps sustained, 1097 frames over 53 s |
| Pixels | mean luma 113, about 190 distinct colours: a lit, photorealistic face |

There is no `READY` state to wait for and no `queued` flag to misread, so the entire class of bug
that cost twelve dead Runway sessions does not exist here.

### Inline webhook tools fire, and carry our header

This was the open question, and the documentation does not answer it: webhook tools are documented
as created in the Lab and attached to a persona by id, and it says nothing about declaring one
inline at session creation. A live call settles it. Declared inline in `personaConfig.tools`:

```json
{ "type": "server", "subtype": "webhook", "name": "check_suitability",
  "url": "https://…/api/v1/avatar/tool/check_suitability", "method": "POST",
  "headers": { "X-Call-Token": "<per-call secret>" },
  "parameters": { "type": "object", "properties": { "productId": { "type": "string" } },
                  "required": ["productId"] },
  "awaitResponse": true }
```

the model called it, our endpoint received `POST {"productId":"sip-balanced-01"}` with
`x-call-token` **intact**, and it spoke our canned verdict back to the customer word for word:

> Rohan, this SIP appears suitable. A surplus of thirty three thousand rupees a month covers the
> five thousand rupee SIP with room to spare.

That is the whole gate, preserved. The tools stay answered by our process, the advice still comes
from the server, and the per-call header is what ties a tool call to one customer's session —
**there is no request signing**, so that header is the only thing standing between our gate and
anyone who learns the URL. Client tools declared in the same array fired too, which is the
replacement for Runway's `client_event`.

### The video track is landscape unless you ask, and 768×1152 is the only portrait it allows

`sessionOptions.videoWidth` / `videoHeight` change the track's shape, and they matter because the
app plays the call full-bleed on a phone: the default 1152×768 has to be cropped to about 2:3,
which throws away two thirds of the frame and leaves a face zoomed past the eyebrows. 768×1152
brings that down to a quarter, and reads as a normal head-and-shoulders shot.

It is the only portrait size on offer. Each of these was refused:

| Requested | Result |
|---|---|
| 768×1152 | **accepted** — the track arrives at exactly that |
| 720×1280 · 768×1536 · 768×1344 · 576×1152 | `POST /v1/engine/session` → `400 Invalid request to start session` |

The refusal lands when the browser connects, not when the token is minted — which is the next
section, and the reason a change here can only be tested against a live call.

### `POST /v1/auth/session-token` validates nothing

It accepted a bogus `avatarId`, a tool with `"type": "nonsense"`, and a webhook tool with no
`url` — all `200`. The token only names a stored config; every mistake in it surfaces when the
browser connects, as a closed connection. So:

- a minted token is **not** a health check. `probe()` stays `GET /v1/avatars/{id}`.
- capacity is not learned from it either. A full org answers `429` at connect time, and
  `GET /v1/sessions/concurrency` is the only honest thing to render availability from.

## Capabilities, honestly

| Capability | Status |
|---|---|
| Transcript | `GET /v1/sessions/{id}/transcript`, roles `persona` / `user`, with `durationMs` for the minute budget |
| Tool calls in the transcript | **absent**. Runway put `toolCalls`/`toolResults` on the assistant turn; Anam's transcript is speech only, so the record of what the gate was asked has to be our own webhook log |
| Context injection | at session start via `systemPrompt` and `initialMessage` |
| Mid-call context push | **`addContext()` exists** — undocumented, on the client. Runway had no equivalent at all |
| Injecting a user turn | **`sendUserMessage()` exists** — undocumented. `talk()` only moves the mouth without involving the LLM, so `sendUserMessage` is the only way to drive a conversation from code, and the only way this spike could provoke a tool call |
| Session id | client-side from `SESSION_READY`; server-side recoverable from `GET /v1/sessions` by the `clientLabel` we set |
| Brain | Anam-hosted (GPT 5 Chat, Gemini 3 Flash, Qwen, Llama…) or `CUSTOMER_CLIENT_V1` to disable it and drive every utterance ourselves |

## What the account does not have

- **Concurrency limit 1.** The same single-slot shape as Runway Tier 1, so the lease, the
  waitlist and the reaper all stay. `estimatedWaitSeconds` is now a real number rather than a guess.
- **One custom avatar slot, and it is Uday's.** Putting a face on Anam means taking the previous
  one off; there is no second slot and no undo. Priya held it until 20 September 2026. The source
  stills for both now live in [`packages/assets/avatars/`](../../packages/assets/avatars/), which
  is the only thing that makes the swap reversible — see that README to put either back.
  Uday was created from the same portrait the text tier shows, so the face does not change between
  tiers: [`evidence/anam-uday-verified-2026-09-20.png`](evidence/anam-uday-verified-2026-09-20.png)
  is a frame off the live stream.
- **No Indian voice in the *stock* catalogue.** All ten stock voices are GB, US and FR, and the
  list endpoint ignores every filter — that really is the whole catalogue. Uday's voice is a clone
  (`05a1d703-…`, "Uday", IN MALE, Cartesia), made in the Lab rather than through the API.

## Reading a Lab persona, and why we do not use one

A persona built in Anam's Lab is a container: a face, a voice, a brain and a prompt under one id.
Handy to make, and `personaConfig` will take a bare `personaId` — but a session created that way
carries the Lab's prompt, not the brief this API builds from the customer's own statement, and
not the webhook tools that are the gate. So a Lab persona is treated here as a **source of ids,
not a session config**: read it once, take the three ids out, and keep building the session the
way we already do.

```bash
curl -s https://api.anam.ai/v1/personas/<personaId> -H "Authorization: Bearer $ANAM_API_KEY" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['avatar']['id'], d['voice']['id'], d['llmId'])"
```

Those three become `ANAM_AVATAR_ID`, `ANAM_VOICE_ID` and `ANAM_LLM_ID`. A persona id itself is
never stored — nothing in the app resolves one at runtime.

## Running the check

```bash
npm i --prefix /tmp/evidence playwright-core localtunnel
EVIDENCE_DEPS=/tmp/evidence/node_modules node docs/engineering/evidence/anam-call-check.mjs
```

It opens a temporary public tunnel, because the webhook is called from Anam's servers and not
from the browser. The echo behind it answers one canned payload and holds nothing.

## How it is wired, and how to swap

`AVATAR_PROVIDER` picks the adapter and nothing else changes: the same routes, the same
credential pool, the same lease, the same daily minute budget, the same reaper and waitlist, the
same brief, the same three tools and the same audit trail. See
[ADR-0013](../architecture/adr/ADR-0013.md) for why it is built this way.

```
apps/api/src/adapters/anam/
  transport.ts      Anam's HTTP surface, under the same breaker and deadlines as Runway's
  provider.ts       AvatarProvider: create-wait-consume collapsed onto one token mint
  tool-gate.ts      AvatarRpcHost: a map write, because there is no room to join
  tool-webhook.ts   the doorman on POST /api/v1/avatar/tool/:callId/:tool
  call-registry.ts  the one object the three of them share
```

To run on Anam:

```bash
AVATAR_PROVIDER=anam
ANAM_API_KEY=…            # the raw key, sent as a Bearer
ANAM_AVATAR_ID=…          # what AvatarCredential calls characterId
ANAM_VOICE_ID=…           # account-wide, not per credential
ANAM_LLM_ID=…             # or CUSTOMER_CLIENT_V1 to disable Anam's brain entirely
ANAM_PUBLIC_BASE_URL=…    # NOT localhost: Anam calls the tool gate from its own servers
```

To go back to Runway, set `AVATAR_PROVIDER=runway`. Nothing else has to move — the client reads
`transport` off the grant and loads the other SDK.

`ANAM_PUBLIC_BASE_URL` is the one genuinely awkward requirement, and the config refuses to start
without it. Tools declared with a URL nobody can reach would leave the model answering from its
own head, which is worse than shipping no gate. In local development it is a tunnel; point it at
a small proxy rather than at the API directly, or restarting the API takes the tunnel down with it.

## What the swap cost

| | Runway | Anam |
|---|---|---|
| Time from tap to a grant | create + poll + consume | **one call, ~1.7 s measured** |
| Tool calls in the provider transcript | on the assistant turn | **absent** — our own gate ledger is the record |
| A dead call frees its slot | seconds, from the handle going dark | the `/end` beacon, then the reaper at the cap |
| Mid-call context | impossible | `addContext()` |
| Gate authentication | the room | a per-call secret, unsigned by the provider |

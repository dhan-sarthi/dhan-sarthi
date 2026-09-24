# Runway Characters: what we verified and what we learned

Runway Characters is the avatar provider. It owns the whole conversation: microphone audio in,
Uday's cloned voice out, photorealistic video out over WebRTC via LiveKit. The API in
`apps/api/src/providers/runway.ts` is a thin transport over it; this note records the behaviour
that transport depends on, so nobody has to rediscover it against a billed session.

## The API surface we use

| Call | Purpose |
|---|---|
| `POST /v1/realtime_sessions` | Create a session: `model: gwm1_avatars`, `avatar: {type: 'custom', avatarId}`, `maxDuration`, `personality` (≤10,000 chars), `startScript` (≤2,000 chars), `tools` |
| `GET /v1/realtime_sessions/{id}` | Poll until `status: READY`; `FAILED` and `CANCELLED` are terminal |
| `POST /v1/realtime_sessions/{id}/consume` | One shot. Bearer is the session key. Returns LiveKit `url` and `token` |
| `DELETE /v1/realtime_sessions/{id}` | Cancel; a 404 means it is already gone |
| `GET /v1/avatars/{id}` | Unbilled. Used as the credential health probe |
| `GET /v1/avatar_conversations/{id}` | Transcript after the call, with `toolCalls` and `toolResults` on assistant turns |

Header `X-Runway-Version: 2024-11-06`. Base URL `https://api.dev.runwayml.com`.

**Every non-GET request needs `Content-Type: application/json`, even with an empty body.**
Without it `/consume` answers 400 "Incorrect content type". The transport sets it and sends `{}`
by default.

## Video renders in a real browser

For weeks this was the project's largest open risk, on the belief that headless Chromium has no
H.264 decoder and the path therefore could not be tested locally. That belief was wrong for the
Chromium that ships with Playwright: `RTCRtpReceiver.getCapabilities('video')` lists
`video/H264` and `canPlayType` returns "probably".

Measured on 2 September 2026 with [`evidence/runway-video-check.mjs`](evidence/runway-video-check.mjs);
the captured frame is [`evidence/webrtc-video-verified-2026-09-02.png`](evidence/webrtc-video-verified-2026-09-02.png).

| | |
|---|---|
| Session lifecycle | create → `NOT_READY` → `READY` in ~2 s → `/consume` → LiveKit credentials |
| Room | `wss://runway-*.livekit.cloud`, region India South, LiveKit 1.13.6 |
| Worker | joins as `worker:<sessionId>`, publishes audio **and** video |
| Resolution | 556×360, ramping to **1088×704** |
| Frames | decoding continuously: 16 / 38 / 62 / 88 / 115 over 5 s, about 26 fps |
| Pixels | mean luma 71.6, about 220 distinct colours: a lit, photorealistic face, not a black frame |

Two things to carry forward:

- **Measure pixels, not track subscription.** The first attempt reported success on a subscribed
  track and produced a black screenshot, because the room was disconnected inside the page before
  the capture and the first fifteen frames are keyframe warm-up.
- **The first five seconds have no video** while the worker provisions. The client therefore keeps
  the portrait up, dimmed, with a designed waiting state, and reveals the `<video>` only once
  `requestVideoFrameCallback` has fired.

The check script hardcodes paths from the machine it was written on; edit the `.env` and
Chromium paths at the top before running it. Each run bills real minutes.

## `queued: true` is not contention

Runway sets `queued: true` on the first poll of essentially every session and clears it a second
later. Treating it as a tier ceiling, and throwing a 409 the moment it appeared, aborted and
deleted every session about a second after creating it. The app then reported "the avatar service
is at capacity" permanently while the account sat idle. It cost twelve dead sessions to find.

Only `FAILED`, `CANCELLED` and the timeout may end the wait. Queued for the entire window is the
one signal that means capacity.

## Cancelling before READY does not free the slot

The worker carries on provisioning, so an aborted session keeps the Tier 1 slot occupied and the
next request looks like contention. Any diagnosis of "we are at capacity" has to rule out our own
orphans first. `GET /v1/avatar_conversations?limit=25` lists past sessions with status; there is
no endpoint that lists live realtime sessions.

## Capabilities, honestly

| Capability | Status |
|---|---|
| Transcript | live over the data channel, and fetchable after the call — but only if the session ends cleanly |
| Context injection | at session start only, via `personality` and `startScript` |
| Mid-call context push | **does not exist**. The model pulls facts through tools |
| Tool calling | `backend_rpc` (round trip to our process, 1–8 s timeout) and `client_event` (fire-and-forget to the UI). **Verified on a live call**: the model called `check_suitability` and spoke our verdict back |
| Barge-in | **unverified**. Runway documents it nowhere. UI copy must not claim it |
| Languages | **Hindi is understood; answering it is a prompt rule, unconfirmed live.** The session takes no language parameter. The recogniser transcribes Hindi word for word (22 and 25 Sep 2026); on 25 Sep the model then said "I can only speak English." See [avatar-accounts.md](avatar-accounts.md#language-understood-not-yet-answered) |

The `backend_rpc` handler (`@runwayml/avatars-node-rpc`) joins the LiveKit room as a hidden
participant and holds that connection for the life of the conversation. This is why the API must
be a persistent process rather than a function.

## Settled: the transcript needs a clean end

`GET /v1/avatar_conversations/{id}` returned zero turns after every cancelled session, which left
open whether it populates asynchronously or needs the session to end properly. It needs the clean
end. A session that ends returns the full transcript with `toolCalls` and `toolResults` attached
to the assistant's turn; a session that is cancelled returns nothing, however long you wait. See
[the live call](avatar-live-call.md) for the record of a 122-second session that ended cleanly.

Teardown is therefore not only about the bill. It is what makes the audit trail retrievable, so
the reconciler runs after the end call rather than on a timer. The API still records every verdict
itself inside the tool handler, because our ledger must not depend on a provider endpoint.

`startScript` is spoken **verbatim**: anything in it that reads as a stage direction is read aloud
to the customer. Write the opening as the words themselves.

## Cost

$0.20 per minute: 2 credits when a session is handed over, then 2 per six seconds with a customer in
the room. A created, READY session that is never handed over costs nothing (measured 22 September
2026, [avatar-accounts.md](avatar-accounts.md#what-runway-bills-measured)); that is what lets the
app ready a call before the tap. Tier 1 allows one concurrent session per
account; pooling requires more accounts, each with its own Character. Teardown is wired on every
path in the API (`/end` beacon on page hide, cancel on any failed grant, a reaper before each
new grant, and an operator `release-all`), but a hard-killed browser bills until the session cap.

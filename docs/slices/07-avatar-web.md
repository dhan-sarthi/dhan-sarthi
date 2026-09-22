# Slice 07 — The live avatar, web tier

Status: **wired and working on Expo's web target, with Runway first and Anam as the fallback.**
The native path is not built. Brought up to date on 22 September 2026; the credit blocker this
slice was first written around is kept below as history.

> **Note, 2026-09-20.** "Web tier" here means **Expo's web target inside `apps/mobile`**, not the
> deleted `apps/web`. Mobile paths in this slice are relative to `apps/mobile` — `src/avatar/` is
> `apps/mobile/src/avatar/`, all of it live — and everything else is named in full. The one
> reference below to `apps/web` is provenance for a port that has already happened, and the app it
> names no longer exists; see the amendment on [ADR-0001](../architecture/adr/ADR-0001.md). The two
> non-obvious facts about the call have since been written into the code that holds them, so the
> slice is no longer the only copy: `apps/mobile/src/avatar/useAvatarCall.ts:9-12` for both, and
> `apps/mobile/src/avatar/AvatarStage.tsx:12-14` for the painted-frame reveal on its own. A second
> provider (Anam) has since landed behind the same port
> ([ADR-0013](../architecture/adr/ADR-0013.md)), which is why the hook speaks of "the provider".

## How a call runs now

The Uday tab opens on his face (slice 05), and while the customer looks at it the app gets a call
ready. It fetches the call SDKs — LiveKit's for Runway first, then Anam's — and asks the API to
ready a call: `POST /api/v1/avatar/session/prepare` claims an account, creates the session, waits
for it and opens our tool gate, then stops. That costs nothing on Runway until the call is handed
over, and one visit readies at most twice (`PREPARE_ROUNDS` in `src/avatar/useAvatarCall.ts`).

"Start a call" opens the microphone on the tap, alongside `POST /api/v1/avatar/session`, which
hands the readied call over or builds one. The grant names its transport, `livekit` or `anam`,
and that field is the only provider-shaped line in the client: `TRANSPORTS` loads
`src/avatar/transports/livekit.ts` or `anam.ts`, and the states, the copy and the teardown are
shared. Hanging up hands the account back through `/end`, and if the screen unmounts mid-call
the hook tears the call down and hands it back the same way.

On the server, `AVATAR_PROVIDER=runway,anam` builds one ordered chain from the numbered account
slots in `apps/api/.env`: Runway's accounts, then Anam's. A grant takes the first account that
is free, not benched and on a line that is up. An account that refuses — out of credit, busy, a
bad key — is benched and the next one is tried in the same request, so the customer sees a
longer "Connecting…" rather than an error (`apps/api/src/application/avatar/`). Balances are read
off the request path: at start-up, after every call, and at most once a minute when the call
screen asks for availability. The owner's rule, 22 September 2026: Runway's Uday is the better
face, so Runway goes first and Anam takes a call only when Runway cannot.
[`docs/engineering/avatar-accounts.md`](../engineering/avatar-accounts.md) has the chain as it is
configured, what Runway bills, and the latency: tap to first word fell from 17.3 s to 9.2 s once
calls were readied.

## The client

`src/avatar/useAvatarCall.ts` — the call, ported from `apps/web/src/lib/avatar.ts`, which had
already been through a real billed session and knew two things that are not obvious. Both
transports keep them (`src/avatar/transports/types.ts`):

- The worker publishes audio several seconds before a decodable video frame, so the video is
  revealed on the first *painted* frame — `requestVideoFrameCallback` on LiveKit, Anam's
  `VIDEO_PLAY_STARTED` — not on track subscription. Revealing on subscription shows a black
  rectangle that reads as broken.
- A stream going away under us is not the customer hanging up, and must not be reported as if it
  were. It reads *"The call dropped. Try again."*

Three more came out of billed Runway calls on 22 September 2026, in
`src/avatar/transports/livekit.ts`: the transport publishes the microphone (it used to publish
nothing, so Uday could be seen and heard but could not hear the customer); LiveKit's adaptive
stream and dynacast are off, as in Runway's own client; and a hang-up sends `END_CALL` on the
data channel before leaving. With the server waiting up to `AVATAR_END_GRACE_SECONDS` for Runway
to end the session itself, that is what keeps the transcript and the recording.

`src/avatar/AvatarStage.tsx` — the stage. It fills the screen; it used to be a 220px tile above
a chat feed. A still of Uday cropped to the video's framing (`UDAY_CALL_STILL` in
`@dhan/assets`) is up from the first moment and stays, dimmed, until a frame is painted, so
connecting is the picture coming alive rather than one crop being swapped for another.
`src/avatar/frame.ts` frames the call by the track's real shape: on a phone held upright,
Runway's landscape 1088×704 frame shows 36% of its width, from the top of the screen down; a
portrait track, Anam's, fills the stage. Scrims at top and bottom keep the controls legible over
the video.

Web only. The video element is a DOM node, which works because Expo's web target renders
through react-dom. The native path needs `@livekit/react-native` and a build containing WebRTC,
and lands with the Android build.

## Two bugs found

**1. `POST /avatar/session` needs an `Idempotency-Key`** and the client was not sending one.
It returned 400 before ever reaching Runway. Unlike the decision route — whose key is derived
so a retry of the same choice collapses — each call attempt is genuinely new: it leases a
credential and starts billing. So the key is random per attempt (`avatarSession` in
`src/api/client.ts`).

**2. The availability chip was lying.** After Runway refused, the app still advertised
*"Face to face available · 240 min left today"* and let the customer tap it again.

`minutesLeftToday` is **this app's own budget counter, not Runway's balance**. At the time the
server tracked only what it had spent and had no idea what the provider had left. An
out-of-credits account fails identically every time, so the breaker never tripped either — it
was closed because nothing was *wrong*, the account was just empty.

Fixed client-side first: a 502 or 503 from the grant sets `providerDown`, which withdraws the
call button for as long as the tab stays mounted — in a tab navigator, the session — and the
line where the button was says *"No live call right now. I'll answer in text."* There is no chip
any more; that one line (`CallLine` in `app/(tabs)/uday.tsx`) says it.

The server-side half, which this slice recorded as worth doing later, is done:
`/avatar/availability` counts only accounts that are free, not benched and on a line that is up
(`availability()` in `apps/api/src/application/avatar/avatar-session.service.ts`), and an account
whose balance is read below `AVATAR_MIN_CREDITS` is benched as out of credits
(`credential-health.ts` in the same folder). An empty account now withdraws the button before
anyone taps it.

## The fallback ladder

Nothing hard-fails. What the call screen says when a call cannot be had, from `CallLine` in
`app/(tabs)/uday.tsx` and the reasons in `useAvatarCall.ts`:

| What happened | What the call screen says |
|---|---|
| Face to face not configured, or switched off | *"Face to face isn't switched on for this account."* |
| Every account in use, benched or out of credit | *"Not available right now"*, and no "Start a call" |
| A queue for the slot | How many are ahead, and the wait where it is known |
| The day's minutes gone | *"No minutes left today"* |
| The grant answered 409 | *"I'm with another customer. I'll answer in text for now."* |
| The grant answered 429, 502 or 503 | *"No live call right now. I'll answer in text."* |
| The connection failed, or dropped mid-call | *"Couldn't connect. Try again."* or *"The call dropped. Try again."* |

Only a 502 or 503 withdraws the button, for as long as the tab stays mounted; after the others
it stays up. "Chat in text" is there in every case, and the text tier keeps answering from the
engine with full evidence. When this slice was first written the out-of-credits path was
verified on screen: the chip went offline, the button disappeared, a plain line said a live
call was not possible, and text carried on. Nothing broke, nothing lied.

## What the blocker turned out to be

When this slice was first written the blocker was not Xcode and not the build. It was Runway
itself:

```
avatar session failed
  label: "runway-1"
  kind: "http"
  err: "You do not have enough credits to run this task."
```

The whole path worked — grant requested, provider reached, error handled, text tier takes
over. The account was out of credits. A second provider answered it first: Anam, behind the same
port, on 20 September 2026 ([ADR-0013](../architecture/adr/ADR-0013.md)). The account chain
answered it for good on 22 September, with Runway's accounts ahead of Anam's and any account that
runs dry benched rather than asked again.

## Not my failures, at the time

`pnpm --filter @dhan/api test` was **148/150** when this slice was written, failing on
`apps/api/test/ports/bank-data.contract.test.ts` → "reproduces the generator to the rupee". The
cause was in-flight work adding a multi-institution concept (IDBI / HDFC / Kotak / ICICI) whose
memory-adapter round-trip did not carry `institution` yet. That work has landed — the memory adapter
carries it (`apps/api/src/adapters/memory/bank-data.memory.ts:227`) — and CONTRIBUTING.md records
the whole tree at 865 tests, zero failures, on 22 September 2026.

## Next

1. **One live Hindi call.** On a recorded test call Runway's model understood a Hindi question
   and answered in English. The brief now carries a language rule, and only a live call can show
   whether Runway follows it (`docs/engineering/avatar-accounts.md`, "Language").
2. **Android:** `eas build -p android --profile development` — free, no Xcode, no Apple
   account. Then write `AvatarStage.native.tsx` against `@livekit/react-native`. Not started:
   `apps/mobile` has no `eas.json`, no `@livekit/react-native` dependency and no native stage.

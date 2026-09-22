# Avatar accounts: Runway first, three deep, Anam last

The owner's rule, 22 September 2026: whoever opens a call (a judge, most likely) should see
Runway's Uday, because it is the better face. Anam takes a call only when Runway cannot. Runway
allows one live session per account, so the same rule has to cover capacity as well as credit. The
answer is a chain of accounts, tried in order, inside one request.

Everything below was measured on live calls against the owner's Runway account, inside a 100-credit
test budget. The ledger is at the bottom. The harness is
[`evidence/avatar-latency-check.mjs`](evidence/avatar-latency-check.mjs).

## The chain

```
runway-1 → runway-2 → runway-3 → anam-1 → anam-2 → anam-3
```

`AVATAR_PROVIDER=runway,anam` builds both providers. The accounts are numbered slots in
`apps/api/.env`. A grant takes the first account that is:

| Check | Where | Why an account is skipped |
|---|---|---|
| free | the lease store | someone is on a call with it (one call per account) |
| not benched | `CredentialHealth` | it refused recently: no credit, busy, bad key |
| on a live line | the provider's circuit breaker | the provider itself is failing |

If that account refuses, the attempt is torn down (cancelled, lease released) and the next account
is tried in the same request. The customer sees a slightly longer "Connecting…", not an error.

| Refusal | Benched for | The provider's other accounts |
|---|---|---|
| Out of credits: a 4xx naming credit, or a balance under `AVATAR_MIN_CREDITS` | 30 min | tried |
| Busy: `queued` for 6 s, or a 409/429 | 1 min | tried |
| Refused: bad key, missing character (any other 4xx) | 10 min | tried |
| Provider failing: 5xx, timeout, breaker open, gate would not join | not benched | skipped for this grant |

Two softeners keep a single-account setup working:

- A queue is left after 6 s only when another account is there to take the call. On the last
  account it is waited out (up to 20 s). A slow start beats a refusal.
- If every account is benched for a *guess* (busy, failing), the grant tries them once more rather
  than answer 502. Out-of-credit and refused keys stay benched.

Balances come from Runway's unbilled `GET /v1/organization`: at boot, after every call, and at most
once a minute when the call screen asks for availability. They are never read on the grant itself.
A call's cap is never longer than its account can pay for.

## Adding an account

1. On the new Runway account, create Uday from the same photo and voice. A Character belongs to
   the account that made it.
2. Paste its key and character id into the next empty slot in `apps/api/.env`:
   `RUNWAY_API_KEY_2=…` and `RUNWAY_CHARACTER_ID_2=…`.
3. Restart the API. The boot line `avatar accounts checked` lists every account with its balance
   and whether it is benched.

Anam slots work the same way (`ANAM_API_KEY_n`, `ANAM_AVATAR_ID_n`). A second Anam account also
needs `ANAM_VOICE_ID_n`, because a cloned voice belongs to the account that cloned it.

## What Runway bills, measured

| Session state | Credits | Lives for |
|---|---|---|
| Created, READY, gate open, never handed over | **0** | ~21 s after READY, then `TALKING_AVATAR.NO_PARTICIPANT` |
| Handed over (`/consume`), nobody joins | 2 (the up-front charge) | ~20 s |
| A customer in the room | 2 up front + 2 per 6 s | until the hang-up or the cap |

Every create counts against the account's **50 sessions a day**, used or not.

## Latency: 17.3 s → 9.2 s from tap to first word

Test 1 was a cold start. Test 2 readied the call while the customer looked at the screen.

| | Cold (test 1) | Readied (test 2) |
|---|---|---|
| Tap → grant | 8.4 s | **0.7 s** |
| of which: Runway create | 5.3 s (2.3–6.5 s across runs) | done before the tap |
| of which: READY | 0.7 s | done before the tap |
| of which: our tool gate joins | 2.2 s | done before the tap |
| Grant → first frame | 8.0 s | 7.6 s |
| **Tap → first word** | **17.3 s** | **9.2 s** (10.4 s in test 3) |

**How the readying works.** When the Uday screen gains focus, the app calls
`POST /api/v1/avatar/session/prepare`. The server claims an account, creates the session, waits for
READY and opens the gate, then stops. The tap's `POST /avatar/session` hands that call over in one
round trip. It is free, and it is usable for 16 s after READY (Runway kills it at ~21 s). A visit
readies at most twice. An account with fewer than 15 sessions left today is never readied ahead. A
customer who asks for a call takes the account back from a session that only readied one.

**What is left is Runway's.** About 8 s passes between the customer joining and the first frame.
Consuming the worker early does not help: consumed 6 s before a browser joined, it still took 8.0 s
to the first frame. The worker's start-up is triggered by the participant, not by `/consume`.

Client changes in the same pass: the SDK is fetched when the tab opens, the microphone is opened on
the tap alongside the grant request, and LiveKit's adaptive stream and dynacast are off, matching
Runway's own client.

## Three bugs the live calls found

1. **The app never published the microphone.** The LiveKit transport joined, subscribed and
   published nothing, so Uday could be seen and heard but could not hear the customer. It now
   publishes the track opened on the tap.
2. **Every hang-up destroyed the transcript.** `/end` cancelled the session at once, and a
   cancelled Runway session keeps no transcript and no recording. The client now sends `END_CALL`
   (as Runway's own client does) and the server waits up to `AVATAR_END_GRACE_SECONDS` (20) for
   the session to complete by itself. Measured: 7 s for a short call, 11.6 s for a 60 s one. The
   test-3 call ended `status: ended`, with a recording and the full transcript.
3. **The call-start rate limit ignored its setting.** `AVATAR_SESSIONS_PER_IP_PER_HOUR` was read by
   nothing, so every deployment ran at the registry's 5 an hour per IP. A room of judges on one
   venue network is one IP. The setting is now honoured.

## Framing

Runway sends 1088×704 and offers no portrait size. Its docs recommend 1088×704 for the reference
image, and the stream follows it. Filling a phone's full height shows a third of that width: a
face, with the ears and hair cut off. That is what "too zoomed in" meant. Half the width, the
second try, left a third of the screen as a gradient, which read as half a video call.

The stage now shows **36% of the width, from the top of the screen down**. That is his whole head
and his shoulders, filling about nine-tenths of the stage. The last strip, where the call's one
button sits, fades into the ink. It was compared on the real frame against 33% (full screen) and
40% (which brought the empty strip back). During a call the only control is "End the call";
ending it brings back "Start a call" and "Chat in text". The still shown before the video is
Runway's own first frame, framed the same way, so the picture comes alive in place. A portrait
track (Anam) still fills the stage.

## Language: understood, not yet answered

Test 3 asked in Hindi. Runway's recogniser got it word for word: *"Uday, मेरे credit card पर कितना
ब्याज लग रहा है और मुझे पहले क्या करना चाहिए?"*. The model called the right tools (`query_spend`,
`get_plan`) and answered with the right figures. **It answered in English.** The recording,
transcribed by Whisper, is English throughout. It had translated the question into English for the
tool and read the English answer back.

The brief now opens and closes with the language rule, and both "say what the tool returns" rules
say *in the customer's language*. Replayed offline against gpt-4o-mini and gpt-4.1-mini (the same
greeting, Hindi question and tool results), Hindi now gets Hindi 8/8 and English gets English 8/8.
The same models already answered Hindi correctly with the earlier brief, so this is Runway's model,
and the replay cannot prove it will listen. **One live Hindi call still has to confirm it.** If
Runway will not follow the rule, the remaining route is Runway's ElevenLabs integration
(`integration: {type: 'elevenlabs'}`): ElevenLabs runs a multilingual conversation and Runway
renders Uday. That is a larger change.

Anam cannot detect language by itself. Its recogniser listens for `ANAM_LANGUAGE_CODE` (default
English), so Hindi on the Anam fallback needs `ANAM_LANGUAGE_CODE=hi`, at some cost to English.

## The test ledger

Budget: 100 credits, from 440. Spent: 88. Balance after: 352.

| Run | What | Credits |
|---|---|---|
| Test 1 | cold call, English + Hindi, 80 s cap | 28 |
| Idle billing | READY + gate, never consumed, 30 s | 0 |
| Shelf life | READY, never consumed, watched until it died | 0 |
| Consume billing | consumed, nobody joined, 13 s | 2 |
| Pre-consumed join | consumed 6 s before a browser joined | 6 |
| First readied attempt | readying queued for 6 s; account benched; tap refused | 2 (unexplained) |
| Test 2 | readied call, English + Hindi | 28 |
| Test 3 | readied call, Hindi, recorded | 22 |

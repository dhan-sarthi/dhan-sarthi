# Slice 07 — The live avatar, web tier

Status: **wired and working. Blocked on Runway credits, not on code.**

> **Note, 2026-09-20.** "Web tier" here means **Expo's web target inside `apps/mobile`**, not the
> deleted `apps/web`. Every file this slice names is an `apps/mobile` file — `src/avatar/` is
> `apps/mobile/src/avatar/` — and all of it is live. The one reference below to `apps/web` is
> provenance for a port that has already happened, and the app it names no longer exists; see the
> amendment on [ADR-0001](../architecture/adr/ADR-0001.md). The two non-obvious facts about the
> call have since been written into the code that holds them, so the slice is no longer the only
> copy: `apps/mobile/src/avatar/useAvatarCall.ts:9-12` for both, and
> `apps/mobile/src/avatar/AvatarStage.tsx:12-14` for the painted-frame reveal on its own. A second
> provider (Anam) has since landed behind the same port ([ADR-0013](../architecture/adr/ADR-0013.md)),
> which is why the hook now speaks of "the provider" where this slice says Runway.

## What the blocker actually turned out to be

Not Xcode. Not the build. Runway itself:

```
avatar session failed
  label: "runway-1"
  kind: "http"
  err: "You do not have enough credits to run this task."
```

The whole path works — grant requested, provider reached, error handled, text tier takes
over. **The account is out of credits.** Top it up and the call should connect.

## What landed

`src/avatar/useAvatarCall.ts` — the call, ported from `apps/web/src/lib/avatar.ts`, which had
already been through a real billed session and knows two things that are not obvious:

- The worker publishes audio several seconds before a decodable video frame, so the tile is
  revealed on `requestVideoFrameCallback` — the first *painted* frame — not on track
  subscription. Revealing on subscription shows a black rectangle that reads as broken.
- A room disconnecting under us is not the customer hanging up, and must not be reported as
  if it were.

`src/avatar/AvatarStage.tsx` — the tile. Holds its place in the layout from the moment the
call starts so nothing jumps when video arrives.

Web only. The video element is a DOM node, which works because Expo's web target renders
through react-dom. The native path needs `@livekit/react-native` and a build containing
WebRTC, and lands with the Android build.

## Two bugs found

**1. `POST /avatar/session` needs an `Idempotency-Key`** and the client was not sending one.
It returned 400 before ever reaching Runway. Unlike the decision route — whose key is derived
so a retry of the same choice collapses — each call attempt is genuinely new: it leases a
credential and starts billing. So the key is random per attempt.

**2. The availability chip was lying.** After Runway refused, the app still advertised
*"Face to face available · 240 min left today"* and let the customer tap it again.

`minutesLeftToday` is **this app's own budget counter, not Runway's balance**. The server
tracks what it has spent; it has no idea what the provider has left. An out-of-credits
account fails identically every time, so the breaker never trips either — it is closed
because nothing is *wrong*, the account is just empty.

Fixed client-side: a 502/503 from the provider now downgrades the chip to *"Face to face is
offline — answering in text"* and withdraws the button for the rest of the session. Verified
on screen.

**Worth doing server-side later:** `/avatar/availability` should reflect a known provider
refusal, otherwise every client has to learn this the same way.

## The fallback ladder, verified

Tapping "Talk to Uday" with no credits gives: chip goes offline, button disappears, a plain
line — *"A live call is not possible right now. I will answer in text."* — and the text tier
keeps answering from the engine with full evidence. Nothing breaks, nothing lies.

## Not my failures

`pnpm --filter @dhan/api test` is **148/150**, failing on
`bank-data.contract.test.ts` → "reproduces the generator to the rupee". The cause is
in-flight uncommitted work adding a multi-institution concept (IDBI / HDFC / Kotak / ICICI)
across `packages/core/src/types.ts`, `packages/fixtures/src/personas.ts` and `generate.ts` —
482 insertions. The memory adapter's round-trip does not carry `institution` yet, so the
regenerated file and the adapter's file differ. Untouched by this slice; these tests passed
twice earlier today before that work appeared.

## Next

1. **Top up Runway credits**, then re-test the call on web. Should be minutes.
2. **Android:** `eas build -p android --profile development` — free, no Xcode, no Apple
   account. Then write `AvatarStage.native.tsx` against `@livekit/react-native`.

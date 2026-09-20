# Uday framing spike

Answers **one** question, then gets deleted:

> Does Uday's face survive a crop to ~55% of the screen?

`docs/product/destination.md` chose the **reflowing split** for the call screen — the video region
shrinks from full-bleed to 460/844 of the height and re-crops to keep his face centred, with the
advice card on solid ground beneath it. That choice is conditional. If Runway composes the
Character centre-of-frame with headroom, cropping to 55% may cut across his chin, and the fallback
is the **lower third** (he stays full-bleed and never moves; the card rises over the bottom ~28%).

A fake avatar provider cannot answer this. It needs a real, billed session.

## Before you run it

**1. `RUNWAY_CHARACTER_ID` must be set in the repo's `.env`.** It is currently empty, and
`apps/api/src/config.ts` refuses to boot when `AVATAR_PROVIDER=runway` without it. The API key is
already there. Get the character id from the Runway dashboard.

**2. Point the spike at your machine, not localhost.** `localhost` on a handset *is* the handset.
Edit `API_BASE` at the top of `App.tsx`:

```bash
ipconfig getifaddr en0     # macOS — your LAN address
```

Phone and laptop must be on the same wifi. Cleartext `http://` to a LAN IP is already permitted in
`app.json` for both platforms (`usesCleartextTraffic` on Android, `NSAllowsLocalNetworking` on
iOS) — without those it fails silently, which is the usual afternoon lost here.

**3. Expo Go will not work.** `@livekit/react-native-webrtc` is native code, so this needs a dev
build. That is the real cost of this spike and the reason to do it now rather than in week three.

## Run

```bash
cd ../.. && pnpm dev:api          # BANK_SOURCE=memory, no Postgres needed
```

```bash
npx expo run:ios --device         # or: npx expo run:android
```

First build takes a while — it compiles WebRTC. Subsequent runs are fast.

No Xcode or Android Studio? Use a cloud build instead:

```bash
npx eas build --profile development --platform ios
```

## What to look at

Tap **Call Uday**, wait for his first frame (the grant carries `expectVideoAfterMs` — the worker
needs about five seconds after READY before it publishes a decodable one).

Then use the rig at the bottom to switch between `none` · `action` · `refusal` and **watch his
face**, not the card:

- Is he still centred when the box shrinks?
- Does the crop cut his chin or the top of his head?
- Is his mouth clear of the card edge? Lip sync is part of the illusion.

If any of those fail, the answer is the lower third, and `destination.md` already names it as the
fallback. Record whichever it is in that file's Open section.

## Notes

- Versions are pinned to `@livekit/react-native@^2` deliberately. v3 ships no Expo config plugin,
  and the standalone `@livekit/react-native-expo-plugin` peers on v2. v2 is the tested Expo path.
- `AudioSession.startAudioSession()` is called on mount. Without it the phone routes audio to the
  earpiece and you will think the thing is broken.
- The call burns real Runway minutes against `RUNWAY_DAILY_MINUTE_BUDGET` (240/day) with a 600s
  per-call cap. End the call when you have your answer.
- This is outside the pnpm workspace on purpose — `apps/*` and `packages/*` are globbed, and Metro
  plus pnpm symlinks is a multi-day time sink you do not need for a throwaway.

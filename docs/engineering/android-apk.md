# The Android APK

The app on a phone, installed from a file, with Uday's live call working. Built 22 September
2026.

## Why an APK and not Expo Go

The call is WebRTC. In a browser the web target gets it free; on a phone it is native code
(`@livekit/react-native-webrtc`) that Expo Go does not contain. So the phone needs a build of its
own. It is a release build with the JavaScript inside it: it needs no laptop, no Metro and no
Expo account, and it talks to the deployment's API over HTTPS.

Expo Go still opens the rest of the app. `src/avatar/globals.native.ts` installs WebRTC only when
the build has it, and the video view loads only when a call has video, so in Expo Go a call fails
to connect, says so, and the text tier carries on.

## Build it

```bash
infra/scripts/build-apk.sh team-sandbox      # → apps/mobile/build/dhan-sarthi-<version>.apk
```

About two minutes once the caches are warm; the first build downloads Gradle and compiles WebRTC
and the native modules, which took about fifteen. The API URL is the terraform output
`deploy-web.sh` uses, baked in as `EXPO_PUBLIC_API_URL`; `API_URL=https://…` overrides it, and
plain `http` is refused because a release build blocks cleartext traffic.

Needs JDK 17 and the Android SDK: platform 36, build-tools 36.0.0, NDK 27.1.12297006 and CMake
3.22.1, which is what React Native 0.86 asks for. On this Mac they are Homebrew's `openjdk@17`
and the SDK at `~/Library/Android/sdk`, installed with the command-line `sdkmanager`.

`apps/mobile/android` is generated and gitignored: every build runs `expo prebuild --clean`, so
`app.json` (the LiveKit plugin, the permissions, the icon) is the whole native configuration. The
microphone is the only sensitive permission the app asks for; the camera permission LiveKit's
library declares is removed, because the app never sends video.

It is signed with the debug keystore the Expo template ships. That is right for installing by
hand and wrong for the Play Store. Each build is signed with the same key, so a new APK installs
over an old one and keeps the customer signed in. It carries `arm64-v8a` (every phone sold in
years) and `armeabi-v7a` (older 32-bit phones), about 86 MB.

## Install it

Over USB with debugging on: `adb install -r apps/mobile/build/dhan-sarthi-0.1.0.apk`. Or send the
file to the phone (Drive, email, a chat app), open it, and allow "Install unknown apps" for
whatever opened it when Android asks. Play Protect may warn about an unknown developer; that is
the debug signature, and "Install anyway" is the answer.

## How the call works on a phone

The screen and `useAvatarCall` are shared with the web. What differs is behind the transport seam
in `src/avatar/transports/types.ts`, where Metro picks a `.native.ts` twin on a phone:

| Piece | Web | Phone |
|---|---|---|
| Runway (LiveKit) | `livekit.ts` builds a `<video>` | `livekit.native.ts` hands the stream up by URL |
| Anam | `anam.ts`, `streamToVideoElement` | `anam.native.ts`, `stream()` |
| The picture | the transport's element in the stage | `CallVideo.native.tsx`, react-native-webrtc's view |
| First painted frame | `requestVideoFrameCallback` | the view's `onDimensionsChange` |
| Audio out | an `<audio>` element | the phone's audio device, loudspeaker, via `transports/phone.ts` |

The rule both kept from billed calls holds on the phone: nothing is revealed until a frame is
painted. The native view paints itself black from the moment it has a track, so it waits at one
pixel until the first frame reports its size, with Uday's still dimmed behind "Connecting…"; if
the size never comes, it is revealed after ten seconds anyway.

## What was verified, and how

On the Android emulator (API 35), with the release APK:

- **The call path, end to end, without spending a credit.** A private API behind a small proxy
  answered `/avatar/session` with a grant for a local LiveKit dev server, and the LiveKit CLI
  published a moving test pattern at Runway's 1088×704 plus a quiet tone into the room. The APK
  asked for the microphone, joined the room, published the microphone track (the server listed
  it), received the video and revealed it on the first frame ("First frame rendered" in the native
  log), played the audio as a voice call routed to the loudspeaker, and on "End the call" handed
  the session back and left the room. Hanging up while still connecting ends the session and
  never shows a call.
- **The app itself against the live deployment**: onboarding to the tabs over HTTPS to
  CloudFront, the text tier answering with its evidence, and every tab and Home pane rendering as
  it does on the web.

Not verified: a real Runway or Anam call on a phone (each costs credits; ask first), and the Anam
transport on a phone at all — its SDK needs nothing a phone lacks once WebRTC is installed, but no
Anam session has been run through it.

## What the web target could not catch

The app had only ever run in a browser. Five problems were native-only, and every one of them is
the kind the web target will keep hiding, so they are worth knowing before the next native change:

1. **A worklet calling a plain function crashes the app.** On a phone `useAnimatedStyle` and
   `useDerivedValue` run on the UI thread, which can only call worklets; the web runs them on the
   JavaScript thread, where anything goes. `Button` called `timing()` inside one and the APK died
   on the first frame. The helpers in `src/ui/motion.ts` are worklets now — and a worklet does not
   capture what its default parameters read, which was the second crash.
2. **NativeWind and Reanimated together dropped every class.** NativeWind folds `style` into one
   object with the classes; Reanimated 4.5 drops any single style object carrying an animated
   handle. So every button was a bare label and every progress fill was invisible, on the phone
   only. `src/ui/animated-interop.native.ts` lifts the handles out before NativeWind merges and
   puts them back after.
3. **Parallel writes to the session conflict.** The session row is guarded by an optimistic
   version. The consent step sent its five grants at once and a phone delivers them within
   milliseconds, so two came back 409 and onboarding stopped at "Couldn't record your consent".
   Consent and the category caps in `set-limit.tsx` now write one at a time.
4. **Gradle bundles without pnpm's `NODE_PATH`.** `npx expo` runs through pnpm's shim, which
   quietly makes hoisted packages resolvable; the Gradle bundle step calls `node` directly. So
   `babel-preset-expo` and `@babel/plugin-transform-react-jsx` (named as a string by NativeWind's
   preset) are declared in `apps/mobile` now.
5. **The keyboard covered the field it was typing into.** Android 15 draws apps edge to edge, so
   the window no longer shrinks for the keyboard, and `KeyboardAvoidingView`'s `height` behaviour
   did nothing: Uday's chat box sat under the keys with the question typed blind, and a form's
   Next button with it. All three avoiding views (`Screen`, `Sheet`, the chat) use `padding` now.
   The code step also dismisses the keyboard when the sixth digit submits, instead of carrying it
   over the consent button.

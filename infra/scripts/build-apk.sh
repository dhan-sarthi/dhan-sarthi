#!/usr/bin/env bash
#
# Build the Android APK: the same app the web deployment serves, with Uday's live call working.
#
#   infra/scripts/build-apk.sh <env>
#
#   env   team-sandbox | idbi-sandbox
#
# Why an APK rather than Expo Go: the call is WebRTC, and WebRTC on a phone is native code
# (`@livekit/react-native-webrtc`) that Expo Go does not contain. This is a release build with the
# JavaScript bundled in, so it needs no laptop, no Metro and no Expo account: install it and it
# talks to the environment's API over HTTPS.
#
# The API URL is baked in at build time as EXPO_PUBLIC_API_URL, from the same terraform output
# deploy-web.sh uses. API_URL=https://… overrides it. Plain http is refused: a release build blocks
# cleartext traffic, so an http URL builds fine and then fails on the phone with no error shown.
#
# `apps/mobile/android` is generated, not kept. `expo prebuild --clean` writes it fresh from
# app.json every time (it is gitignored), so the plugins and permissions in app.json are the whole
# native configuration and a hand edit under android/ does not survive the next build.
#
# Signed with the debug keystore the Expo template ships. That is right for installing by hand and
# for a demo, and wrong for the Play Store. Every build is signed with the same key, so a new APK
# installs over an old one and keeps the customer signed in.
#
# Needs JDK 17 and the Android SDK: platform 36, build-tools 36.0.0, NDK 27.1.12297006 and CMake
# 3.22.1, which is what React Native 0.86 asks for. The defaults are where Homebrew's openjdk@17
# and the command-line sdkmanager put them.

set -euo pipefail

ENV="${1:?usage: build-apk.sh <env>}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
MOBILE="$ROOT/apps/mobile"
OUT="$MOBILE/build"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$PATH"
[[ -x "$JAVA_HOME/bin/java" ]] || { echo "no JDK 17 at $JAVA_HOME (brew install openjdk@17)" >&2; exit 2; }
[[ -d "$ANDROID_HOME/platforms/android-36" ]] || { echo "no Android SDK platform 36 under $ANDROID_HOME" >&2; exit 2; }

if [[ -n "${API_URL:-}" ]]; then
  URL="${API_URL%/}"
else
  [[ -f "$TF_DIR/envs/$ENV.tfvars" ]] || { echo "no tfvars for '$ENV'" >&2; exit 2; }
  URL="$(terraform -chdir="$TF_DIR" output -raw app_url)"
fi
[[ "$URL" == https://* ]] || { echo "API URL must be https, got '$URL'" >&2; exit 2; }

echo "==> prebuild (android/ regenerated from app.json)"
# Prebuild rewrites package.json's `ios` and `android` scripts to `expo run:*`. They are kept as
# they were: this script is how the APK gets built, and those scripts still open Expo Go.
SCRIPTS_BACKUP="$(mktemp)"
cp "$MOBILE/package.json" "$SCRIPTS_BACKUP"
(cd "$MOBILE" && CI=1 npx expo prebuild --platform android --clean --no-install)
cp "$SCRIPTS_BACKUP" "$MOBILE/package.json"
rm -f "$SCRIPTS_BACKUP"
echo "sdk.dir=$ANDROID_HOME" > "$MOBILE/android/local.properties"

echo "==> assembleRelease (EXPO_PUBLIC_API_URL=$URL)"
# arm64-v8a is every phone sold in years and the emulator on an Apple-silicon Mac; armeabi-v7a is
# older 32-bit phones. x86 and x86_64 serve only Intel emulators and add tens of megabytes of WebRTC.
# The bundle step passes --reset-cache itself, so an EXPO_PUBLIC_ value cannot come from a stale
# Metro cache the way it can in `expo export` (see deploy-web.sh).
(cd "$MOBILE/android" && EXPO_PUBLIC_API_URL="$URL" ./gradlew assembleRelease \
  -PreactNativeArchitectures=arm64-v8a,armeabi-v7a --console=plain)

APK="$MOBILE/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || { echo "gradle produced no $APK" >&2; exit 3; }

# The bundle is Hermes bytecode, whose string table keeps the URL readable. Assert it is there,
# rather than that localhost is absent: client.ts keeps a localhost fallback in every bundle.
# Read from a file, not a pipe: `grep -q` stops at the first match, `unzip` dies of SIGPIPE, and
# under pipefail a bundle that has the URL reads as one that does not.
HOST="${URL#https://}"
BUNDLE="$(mktemp)"
unzip -p "$APK" assets/index.android.bundle > "$BUNDLE"
if ! LC_ALL=C grep -aqF "$HOST" "$BUNDLE"; then
  rm -f "$BUNDLE"
  echo "bundle does not contain $HOST; EXPO_PUBLIC_API_URL did not take" >&2
  exit 4
fi
rm -f "$BUNDLE"

VERSION="$(node -p "require('$MOBILE/app.json').expo.version")"
mkdir -p "$OUT"
DEST="$OUT/dhan-sarthi-$VERSION.apk"
cp "$APK" "$DEST"

echo "==> $DEST"
echo "    $(du -h "$DEST" | cut -f1), sha256 $(shasum -a 256 "$DEST" | cut -d' ' -f1)"
echo "    talks to $URL"
echo "    install over USB: adb install -r \"$DEST\""

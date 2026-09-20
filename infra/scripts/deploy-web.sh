#!/usr/bin/env bash
#
# Export the Expo web bundle and publish it to the environment's S3 bucket behind CloudFront.
#
#   infra/scripts/deploy-web.sh <env>
#
#   env   team-sandbox | idbi-sandbox
#
# `apps/mobile` is the product and the only client; `apps/web` was deleted on 20 Sep 2026
# (docs/architecture/adr/ADR-0001.md). The name of this script is historical.
#
# The API URL is baked in at export time as EXPO_PUBLIC_API_URL, read by
# `apps/mobile/src/api/client.ts`. It is set to the CloudFront origin, because CloudFront routes
# `/` to this bucket and `/api/*` to the ALB — so the browser stays same-origin, and the same
# value is what the Android APK needs as an absolute URL.
#
# Expo's output splits cleanly by cache policy:
#   _expo/static/**  hashed js and css   -> immutable
#   assets/**        hashed images       -> immutable
#   index.html       the SPA shell       -> no-cache
#   metadata.json    the export manifest -> no-cache

set -euo pipefail

ENV="${1:?usage: deploy-web.sh <env>}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
MOBILE="$ROOT/apps/mobile"
DIST="$MOBILE/dist"

[[ -f "$TF_DIR/envs/$ENV.tfvars" ]] || { echo "no tfvars for '$ENV'" >&2; exit 2; }

BUCKET="$(terraform -chdir="$TF_DIR" output -raw web_bucket)"
DISTRIBUTION="$(terraform -chdir="$TF_DIR" output -raw cloudfront_distribution_id)"
URL="$(terraform -chdir="$TF_DIR" output -raw app_url)"

echo "==> export (EXPO_PUBLIC_API_URL=$URL)"
rm -rf "$DIST"
# --clear is not optional. Metro caches the transformed bundle, and EXPO_PUBLIC_* values are
# inlined at transform time — so a cached bundle silently keeps whatever URL the last export
# used. The failure is invisible: the export succeeds and the hashes look fine.
(cd "$MOBILE" && EXPO_PUBLIC_API_URL="$URL" npx expo export --platform web --output-dir dist --clear)

[[ -f "$DIST/index.html" ]] || { echo "export produced no index.html" >&2; exit 3; }

# Assert the URL is present, rather than asserting localhost is absent: client.ts keeps a
# localhost fallback branch for Metro, so that string is in every bundle and proves nothing.
HOST="${URL#https://}"
if ! grep -rqF "$HOST" "$DIST/_expo" 2>/dev/null; then
  echo "bundle does not contain $HOST; EXPO_PUBLIC_API_URL did not take" >&2
  exit 4
fi

# And assert no synthetic customer reaches the bucket. This script used to take an
# `offline-fallback` argument, false for the bank artefact, because `apps/web` built an offline
# simulation chunk out of `@dhan/fixtures` and the IDBI build had to ship without it. The chunk
# went with the app and `apps/mobile` does not depend on `@dhan/fixtures` at all today, so the
# flag is retired — but the posture behind it is not. `packages/fixtures/src/index.ts` says
# nothing real ever lives there; the mirror of that is that nothing invented ever lives on a URL
# a reviewer will read as the bank's, where invented customers are indistinguishable from a leak
# until someone looks up the account numbers.
#
# The markers are persona employer names: plain string literals in
# `packages/fixtures/src/personas.ts` that survive minification, are in the built `dist/` the
# exports map resolves to, and appear nowhere in `apps/mobile` or in the four workspace packages
# it does depend on. Any path that pulls fixtures back into the app puts at least one of them in
# the export; a clean bundle has none.
#
# Unconditional, unlike the old flag: that one was per-environment because there was a chunk to
# switch on, and there is no such chunk now. Wanting one back in a demo build is a decision to
# reopen here on purpose, not something to discover from a green deploy.
for MARKER in 'Acme Technologies Pvt Ltd' 'Zeta Consulting India' 'Kumar Hardware & Sanitary'; do
  if grep -rqF "$MARKER" "$DIST" 2>/dev/null; then
    echo "bundle contains @dhan/fixtures data ('$MARKER'); no synthetic customers go to $URL" >&2
    exit 5
  fi
done

echo "==> sync hashed bundles (immutable)"
aws s3 sync "$DIST/_expo" "s3://$BUCKET/_expo" \
  --delete \
  --cache-control "public, max-age=31536000, immutable"

if [[ -d "$DIST/assets" ]]; then
  aws s3 sync "$DIST/assets" "s3://$BUCKET/assets" \
    --delete \
    --cache-control "public, max-age=31536000, immutable"
fi

echo "==> sync the shell (no-cache)"
aws s3 sync "$DIST" "s3://$BUCKET" \
  --exclude "_expo/*" \
  --exclude "assets/*" \
  --delete \
  --cache-control "no-cache"

echo "==> invalidate $DISTRIBUTION"
INVALIDATION="$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" \
  --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION" --id "$INVALIDATION"

echo "==> published to $URL"

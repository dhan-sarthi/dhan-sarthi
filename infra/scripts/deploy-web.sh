#!/usr/bin/env bash
#
# Build the web bundle and publish it to the environment's S3 bucket behind CloudFront.
#
#   infra/scripts/deploy-web.sh <env> [offline-fallback]
#
#   env               team-sandbox | idbi-sandbox
#   offline-fallback  VITE_OFFLINE_FALLBACK for the build: true (public review URL, default) or
#                     false (the bank artefact; the offline simulation chunk must be absent)
#
# Hashed assets under /assets are uploaded immutable; index.html is uploaded no-cache so a deploy
# is picked up on the next load; then the distribution is invalidated.

set -euo pipefail

ENV="${1:?usage: deploy-web.sh <env> [offline-fallback]}"
OFFLINE="${2:-true}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
DIST="$ROOT/apps/web/dist"

[[ -f "$TF_DIR/envs/$ENV.tfvars" ]] || { echo "no tfvars for '$ENV'" >&2; exit 2; }

BUCKET="$(terraform -chdir="$TF_DIR" output -raw web_bucket)"
DISTRIBUTION="$(terraform -chdir="$TF_DIR" output -raw cloudfront_distribution_id)"
URL="$(terraform -chdir="$TF_DIR" output -raw app_url)"

echo "==> build (VITE_OFFLINE_FALLBACK=$OFFLINE)"
(cd "$ROOT" && pnpm install --frozen-lockfile && VITE_OFFLINE_FALLBACK="$OFFLINE" pnpm build)

if [[ "$OFFLINE" == "false" ]] && grep -rl "@dhan/fixtures" "$DIST/assets" >/dev/null 2>&1; then
  echo "bank build contains the fixtures chunk; refusing to publish" >&2
  exit 3
fi

echo "==> sync assets (immutable)"
aws s3 sync "$DIST/assets" "s3://$BUCKET/assets" \
  --delete \
  --cache-control "public, max-age=31536000, immutable"

echo "==> sync everything else (no-cache)"
aws s3 sync "$DIST" "s3://$BUCKET" \
  --exclude "assets/*" \
  --delete \
  --cache-control "no-cache"

echo "==> invalidate $DISTRIBUTION"
INVALIDATION="$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/*" \
  --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION" --id "$INVALIDATION"

echo "==> published to $URL"

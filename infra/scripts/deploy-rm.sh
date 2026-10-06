#!/usr/bin/env bash
#
# Build the RM console (apps/rm) and publish it under /rm/ on the environment's CloudFront
# distribution, in the same bucket as the mobile web export.
#
#   infra/scripts/deploy-rm.sh <env>
#
#   env   team-sandbox | idbi-sandbox
#
# Same bucket and distribution as deploy-web.sh, so the console reaches /api/* on its own origin
# and production runs with CORS off. Three pieces make that safe:
#   - the console lives under the `rm/` key prefix, and deploy-web.sh excludes `rm/*` from its
#     --delete sync;
#   - CloudFront routes `/rm*` through the `rm-spa` viewer-request function (cdn.tf), which
#     rewrites a path with no file extension to /rm/index.html, so a deep link loads the console
#     rather than falling through to the distribution's 403/404 page, which is the mobile shell;
#   - the build sets RM_BASE=/rm/, so asset URLs and the router's basename carry the prefix.
#
# Vite's output splits by cache policy:
#   rm/assets/**    hashed js and css -> immutable
#   rm/index.html   the SPA shell     -> no-cache
#   rm/favicon.svg  generated         -> no-cache

set -euo pipefail

ENV="${1:?usage: deploy-rm.sh <env>}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
RM="$ROOT/apps/rm"
DIST="$RM/dist"

[[ -f "$TF_DIR/envs/$ENV.tfvars" ]] || { echo "no tfvars for '$ENV'" >&2; exit 2; }

BUCKET="$(terraform -chdir="$TF_DIR" output -raw web_bucket)"
DISTRIBUTION="$(terraform -chdir="$TF_DIR" output -raw cloudfront_distribution_id)"
URL="$(terraform -chdir="$TF_DIR" output -raw app_url)"

# The function is what makes /rm/customers/<cif> load the console; publishing without it gives
# every deep link the mobile app instead. Fail early rather than ship that.
if ! aws cloudfront get-distribution-config --id "$DISTRIBUTION" \
  --query "DistributionConfig.CacheBehaviors.Items[?PathPattern=='/rm*'] | [0].PathPattern" \
  --output text | grep -qF '/rm*'; then
  echo "distribution $DISTRIBUTION has no /rm* behaviour; apply cdn.tf first (see infra/terraform/README.md)" >&2
  exit 3
fi

echo "==> build apps/rm with RM_BASE=/rm/"
# The package's build script runs the token, kit and bundle checks; check-bundle fails the build
# if any @dhan/fixtures persona string reaches dist/.
(cd "$RM" && RM_BASE=/rm/ GIT_SHA="$(git -C "$ROOT" rev-parse --short HEAD)" pnpm build)

[[ -f "$DIST/index.html" ]] || { echo "build produced no index.html" >&2; exit 4; }
grep -qF 'src="/rm/assets/' "$DIST/index.html" || {
  echo "index.html does not load its scripts from /rm/assets/; RM_BASE did not take" >&2
  exit 5
}

echo "==> sync hashed assets (immutable)"
aws s3 sync "$DIST/assets" "s3://$BUCKET/rm/assets" \
  --delete \
  --cache-control "public, max-age=31536000, immutable"

echo "==> sync the shell (no-cache)"
aws s3 sync "$DIST" "s3://$BUCKET/rm" \
  --exclude "assets/*" \
  --delete \
  --cache-control "no-cache"

echo "==> invalidate /rm* on $DISTRIBUTION"
INVALIDATION="$(aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/rm*" \
  --query 'Invalidation.Id' --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION" --id "$INVALIDATION"

echo "==> published to $URL/rm/"

#!/usr/bin/env bash
#
# The RM console's first release, in the order infra/terraform/README.md ("Releasing the RM
# console the first time") explains: image, seed task, migrate + reseed, API, CloudFront route,
# console. Every `terraform apply` is targeted and asks for confirmation; read each plan.
#
#   infra/scripts/release-rm-console.sh <env> [tag]
#
#   env   team-sandbox | idbi-sandbox
#   tag   image tag; defaults to rm-<short sha>
#
# Terraform state is local and lives in one checkout. If this checkout has none, point TF_STATE
# at that file and it is symlinked here (never copied: two copies of one state diverge).
#
#   TF_STATE=../dhan-sarthi-smartwealth/infra/terraform/terraform.tfstate \
#     AWS_PROFILE=own infra/scripts/release-rm-console.sh team-sandbox
#
# Step 3 runs the seed with --force, which erases every live customer session.

set -euo pipefail

ENV="${1:?usage: release-rm-console.sh <env> [tag]}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
VARS="envs/$ENV.tfvars"
TAG="${2:-rm-$(git -C "$ROOT" rev-parse --short HEAD)}"

[[ -f "$TF_DIR/$VARS" ]] || { echo "no tfvars for '$ENV'" >&2; exit 2; }
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo "the tree has uncommitted changes; release from a clean tree" >&2; exit 2; }

if [[ ! -e "$TF_DIR/terraform.tfstate" ]]; then
  [[ -n "${TF_STATE:-}" && -f "$TF_STATE" ]] || { echo "no terraform.tfstate here; set TF_STATE to the state file" >&2; exit 2; }
  STATE="$(cd "$(dirname "$TF_STATE")" && pwd)/$(basename "$TF_STATE")"
  cp "$STATE" "$STATE.before-rm-console-$(date +%Y%m%d-%H%M%S)"
  ln -s "$STATE" "$TF_DIR/terraform.tfstate"
  [[ -f "$TF_DIR/.terraform.lock.hcl" ]] || cp "$(dirname "$STATE")/.terraform.lock.hcl" "$TF_DIR/" 2>/dev/null || true
fi
terraform -chdir="$TF_DIR" init -input=false >/dev/null

tf_apply() { terraform -chdir="$TF_DIR" apply -input=true -var-file="$VARS" -var "api_image_tag=$TAG" "$@"; }

REGION="$(terraform -chdir="$TF_DIR" output -raw aws_region 2>/dev/null || echo ap-south-1)"
REPO="$(terraform -chdir="$TF_DIR" output -raw ecr_repository_url)"
CLUSTER="$(terraform -chdir="$TF_DIR" output -raw ecs_cluster)"
SERVICE="$(terraform -chdir="$TF_DIR" output -raw ecs_service)"
DISTRIBUTION="$(terraform -chdir="$TF_DIR" output -raw cloudfront_distribution_id)"
URL="$(terraform -chdir="$TF_DIR" output -raw app_url)"

echo "==> 1/6 build and push $REPO:$TAG"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${REPO%%/*}"
docker buildx build --platform linux/amd64 --file "$ROOT/apps/api/Dockerfile" \
  --tag "$REPO:$TAG" --push "$ROOT"

echo "==> 2/6 point the seed task at $TAG"
tf_apply -target=aws_ecs_task_definition.seed

echo "==> 3/6 migrate (0015, 0016) and reseed fifty customers + the RM desk; live sessions are erased"
"$ROOT/infra/scripts/seed-remote.sh" "$ENV" --force

echo "==> 4/6 roll the API to $TAG"
tf_apply -target=aws_ecs_service.api
aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "$SERVICE"

echo "==> 5/6 add the /rm* route (CloudFront takes a few minutes)"
tf_apply -target=aws_cloudfront_distribution.web
aws cloudfront wait distribution-deployed --id "$DISTRIBUTION"

echo "==> 6/6 publish the console"
(cd "$ROOT" && pnpm install --frozen-lockfile && pnpm -r --filter './packages/*' build)
"$ROOT/infra/scripts/deploy-rm.sh" "$ENV"
"$ROOT/infra/scripts/smoke.sh" "$URL"

echo "==> released: $URL/rm/  (sign in 204117 / desk-204117)"

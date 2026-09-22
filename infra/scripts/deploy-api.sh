#!/usr/bin/env bash
#
# Build the API image, push it to the environment's ECR repository, point the task definition at
# the new tag and wait for the rolling deploy to settle.
#
#   infra/scripts/deploy-api.sh <env> [tag] [platform]
#
#   env        team-sandbox | idbi-sandbox (must have been applied once)
#   tag        image tag; defaults to the short git sha
#   platform   docker platform; defaults to linux/amd64 (cpu_architecture = X86_64 in tfvars)
#
# Runs from a laptop or from deploy.yml; needs docker buildx, the AWS CLI and terraform. Deploy
# outside an announced demo window: a live avatar call at deploy time is drained for up to
# 120 s and then ended with end_reason='deploy'.

set -euo pipefail

ENV="${1:?usage: deploy-api.sh <env> [tag] [platform]}"
TAG="${2:-$(git rev-parse --short HEAD)}"
PLATFORM="${3:-linux/amd64}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"
VARS="$TF_DIR/envs/$ENV.tfvars"

[[ -f "$VARS" ]] || { echo "no tfvars for '$ENV' at $VARS" >&2; exit 2; }

REGION="$(terraform -chdir="$TF_DIR" output -raw aws_region 2>/dev/null || echo ap-south-1)"
REPO="$(terraform -chdir="$TF_DIR" output -raw ecr_repository_url)"
CLUSTER="$(terraform -chdir="$TF_DIR" output -raw ecs_cluster)"
SERVICE="$(terraform -chdir="$TF_DIR" output -raw ecs_service)"
REGISTRY="${REPO%%/*}"

# Every avatar key the task will read has to exist in the secret, or the new task cannot start
# (the circuit breaker would roll it back, after minutes). Key names only; no value is printed.
SECRET="dhan-sarthi/$ENV/runway"
KEYS="$(echo 'jsonencode(var.avatar_secret_keys)' \
  | terraform -chdir="$TF_DIR" console -var-file="envs/$ENV.tfvars" | sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g')"
HELD="$(aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET" \
  --query SecretString --output text | python3 -c 'import json,sys; print(json.dumps(sorted(json.load(sys.stdin))))')"
MISSING="$(python3 -c 'import json,sys; want=json.loads(sys.argv[1]); held=set(json.loads(sys.argv[2])); print(" ".join(k for k in want if k not in held))' "$KEYS" "$HELD")"
if [[ -n "$MISSING" ]]; then
  echo "the task would read $MISSING, which $SECRET does not hold; run infra/scripts/put-avatar-secret.sh $ENV first" >&2
  exit 3
fi

echo "==> login to $REGISTRY"
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRY"

echo "==> build $REPO:$TAG for $PLATFORM"
docker buildx build \
  --platform "$PLATFORM" \
  --file "$ROOT/apps/api/Dockerfile" \
  --tag "$REPO:$TAG" \
  --tag "$REPO:latest" \
  --push \
  "$ROOT"

echo "==> apply with api_image_tag=$TAG"
terraform -chdir="$TF_DIR" apply -input=false -auto-approve \
  -var-file="envs/$ENV.tfvars" -var "api_image_tag=$TAG"

echo "==> wait for $SERVICE to stabilise"
aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "$SERVICE"

echo "==> deployed $REPO:$TAG"
aws ecs describe-services --region "$REGION" --cluster "$CLUSTER" --services "$SERVICE" \
  --query 'services[0].{running:runningCount,desired:desiredCount,taskDefinition:taskDefinition}' \
  --output table

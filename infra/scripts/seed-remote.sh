#!/usr/bin/env bash
#
# Run the seed as a one-off Fargate task against the environment's RDS instance: migrate, write
# 42 months per persona, record the seed hash, verify. Never on boot (ADR-0012).
#
#   infra/scripts/seed-remote.sh <env> [--force] [--check]
#
#   --force   reseed even though sessions exist (they are truncated with everything else)
#   --check   regenerate in memory and compare the content hash only; no writes
#
# Follows the task's log stream and exits with the container's exit code. No bastion; the
# database is never public.

set -euo pipefail

ENV="${1:?usage: seed-remote.sh <env> [--force] [--check]}"
shift
SEED_ARGS=("$@")

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TF_DIR="$ROOT/infra/terraform"

[[ -f "$TF_DIR/envs/$ENV.tfvars" ]] || { echo "no tfvars for '$ENV'" >&2; exit 2; }

REGION="$(terraform -chdir="$TF_DIR" output -raw aws_region 2>/dev/null || echo ap-south-1)"
CLUSTER="$(terraform -chdir="$TF_DIR" output -raw ecs_cluster)"
FAMILY="$(terraform -chdir="$TF_DIR" output -raw seed_task_definition)"
SG="$(terraform -chdir="$TF_DIR" output -raw task_security_group_id)"
SUBNETS="$(terraform -chdir="$TF_DIR" output -json private_subnet_ids | jq -r 'join(",")')"
LOG_GROUP="$(terraform -chdir="$TF_DIR" output -raw log_group)"

COMMAND='["node","dist/cli/seed.js"'
for a in "${SEED_ARGS[@]:-}"; do
  [[ -n "$a" ]] && COMMAND+=",\"$a\""
done
COMMAND+=']'

echo "==> run $FAMILY on $CLUSTER with ${SEED_ARGS[*]:-no flags}"
TASK_ARN="$(aws ecs run-task \
  --region "$REGION" \
  --cluster "$CLUSTER" \
  --task-definition "$FAMILY" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=DISABLED}" \
  --overrides "{\"containerOverrides\":[{\"name\":\"seed\",\"command\":$COMMAND}]}" \
  --query 'tasks[0].taskArn' --output text)"

TASK_ID="${TASK_ARN##*/}"
echo "==> task $TASK_ID; waiting for it to stop"
aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK_ARN"

echo "==> log"
aws logs get-log-events \
  --region "$REGION" \
  --log-group-name "$LOG_GROUP" \
  --log-stream-name "seed/seed/$TASK_ID" \
  --start-from-head \
  --query 'events[].message' --output text || echo "(log stream not available yet)"

EXIT_CODE="$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode' --output text)"
echo "==> seed exit code: $EXIT_CODE"
[[ "$EXIT_CODE" == "0" ]]

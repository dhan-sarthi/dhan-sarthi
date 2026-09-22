#!/usr/bin/env bash
#
# Copy the numbered avatar accounts from a local env file into the environment's avatar secret
# (dhan-sarthi/<env>/runway), merged over whatever the secret already holds.
#
#   infra/scripts/put-avatar-secret.sh <env> [env-file]
#
#   env        team-sandbox | idbi-sandbox
#   env-file   defaults to apps/api/.env
#
# Copies RUNWAY_API_KEY_n, RUNWAY_CHARACTER_ID_n, ANAM_API_KEY_n, ANAM_AVATAR_ID_n,
# ANAM_VOICE_ID_n, ANAM_LLM_ID_n and the account-wide ANAM_VOICE_ID / ANAM_LLM_ID, where set.
# Refuses when a key the environment's tfvars injects (avatar_secret_keys) would still be missing,
# because the API task cannot start without it. Prints key names only, never a value.
#
# Then roll the task onto the new values: `infra/scripts/deploy-api.sh <env> <tag>`, or
# `aws ecs update-service --force-new-deployment` when the tfvars did not change.

set -euo pipefail

ENV="${1:?usage: put-avatar-secret.sh <env> [env-file]}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${2:-$ROOT/apps/api/.env}"
TF_DIR="$ROOT/infra/terraform"
VARS="$TF_DIR/envs/$ENV.tfvars"

[[ -f "$VARS" ]] || { echo "no tfvars for '$ENV' at $VARS" >&2; exit 2; }
[[ -f "$ENV_FILE" ]] || { echo "no env file at $ENV_FILE" >&2; exit 2; }

REGION="$(terraform -chdir="$TF_DIR" output -raw aws_region 2>/dev/null || echo ap-south-1)"
SECRET="dhan-sarthi/$ENV/runway"

umask 077
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

aws secretsmanager get-secret-value --region "$REGION" --secret-id "$SECRET" \
  --query SecretString --output text > "$WORK/current.json"

python3 - "$WORK/current.json" "$ENV_FILE" "$VARS" "$WORK/merged.json" <<'PY'
import json, re, sys

current_path, env_path, vars_path, out_path = sys.argv[1:5]
current = json.load(open(current_path))

wanted = re.compile(
    r'^(RUNWAY_API_KEY_\d|RUNWAY_CHARACTER_ID_\d|ANAM_API_KEY_\d|ANAM_AVATAR_ID_\d'
    r'|ANAM_VOICE_ID(_\d)?|ANAM_LLM_ID(_\d)?)$'
)
found = {}
for line in open(env_path):
    m = re.match(r'^\s*([A-Z0-9_]+)\s*=\s*(.*)$', line)
    if not m or not wanted.match(m.group(1)):
        continue
    value = m.group(2).strip().strip('"').strip("'")
    if value:
        found[m.group(1)] = value

merged = {**current, **found}

block = re.search(r'avatar_secret_keys\s*=\s*\[(.*?)\]', open(vars_path).read(), re.S)
required = re.findall(r'"([A-Z0-9_]+)"', block.group(1)) if block else []
missing = [k for k in required if not merged.get(k)]
if missing:
    sys.exit(f"the task would read {', '.join(missing)}, which neither {env_path} nor the secret has")

json.dump(merged, open(out_path, 'w'))
print('copied:', ', '.join(sorted(found)) or '(nothing)')
print('secret now holds:', ', '.join(sorted(merged)))
PY

aws secretsmanager put-secret-value --region "$REGION" --secret-id "$SECRET" \
  --secret-string "file://$WORK/merged.json" --query 'VersionId' --output text >/dev/null
echo "==> $SECRET updated"

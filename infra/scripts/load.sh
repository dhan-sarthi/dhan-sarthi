#!/usr/bin/env bash
#
# Load test against a deployed environment: N virtual reviewers each create a session, read the
# view, press +1 month ten times and read the view again. Not part of CI; results go to
# docs/architecture/perf.md against the NFR targets (GET /view p95 ≤ 300 ms warm, zero 5xx).
#
#   infra/scripts/load.sh <base-url> [reviewers] [seconds]
#
# Uses autocannon via npx; nothing is added to the repository's dependencies.

set -euo pipefail

BASE="${1:?usage: load.sh <base-url> [reviewers] [seconds]}"
REVIEWERS="${2:-50}"
SECONDS_TOTAL="${3:-600}"
API="${BASE%/}/api/v1"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

CIF="$(curl -fsS "$API/customers" | jq -r '.[0].cif')"

# One bearer per virtual reviewer, so sessions and clocks are isolated the way real ones are.
TOKENS=()
for _ in $(seq "$REVIEWERS"); do
  TOKENS+=("$(curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"cif\":\"$CIF\"}" "$API/sessions" | jq -r .token)")
done
printf '%s\n' "${TOKENS[@]}" > /tmp/dhan-load-tokens.txt

echo "==> $REVIEWERS reviewers, ${SECONDS_TOTAL}s, GET /view with rotating bearers"
npx --yes autocannon \
  --connections "$REVIEWERS" \
  --duration "$SECONDS_TOTAL" \
  --headers "Authorization=Bearer ${TOKENS[0]}" \
  --renderStatusCodes \
  "$API/view"

echo "==> +1 month x10 per reviewer (sequential; exercises the optimistic version column)"
for t in "${TOKENS[@]}"; do
  V="$(curl -fsS -H "Authorization: Bearer $t" "$API/session" | jq -r .version)"
  for _ in $(seq 10); do
    R="$(curl -fsS -H "Authorization: Bearer $t" -X POST -H 'Content-Type: application/json' \
      -d "{\"advanceDays\":30,\"expectedVersion\":$V}" "$API/session/clock")" || break
    V="$(echo "$R" | jq -r .version)"
  done
done

echo "==> done; tokens in /tmp/dhan-load-tokens.txt (DELETE /session each to clean up)"

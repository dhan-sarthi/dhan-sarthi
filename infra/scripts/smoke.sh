#!/usr/bin/env bash
#
# Post-deploy smoke: health, customers, a session, a view, a decision, avatar availability.
# Exercises the deterministic path end to end; never opens a billed avatar session.
#
#   infra/scripts/smoke.sh <base-url>
#
#   base-url   e.g. https://d1234.cloudfront.net or http://localhost:8080
#
# Every check prints "ok <what>" and the script exits 0; the first failure prints the response
# and exits 1.

set -euo pipefail

BASE="${1:?usage: smoke.sh <base-url>}"
BASE="${BASE%/}"
API="$BASE/api/v1"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

fail() {
  echo "FAIL $1" >&2
  echo "$2" >&2
  exit 1
}

# 1. health
HEALTH="$(curl -fsS --max-time 10 "$API/health")" || fail "health unreachable" ""
[[ "$(echo "$HEALTH" | jq -r .ok)" == "true" ]] || fail "health not ok" "$HEALTH"
echo "ok health · bank=$(echo "$HEALTH" | jq -r '.bank.source // "?"') avatar=$(echo "$HEALTH" | jq -r '.avatar.provider // "?"')"

# 2. customers
CUSTOMERS="$(curl -fsS --max-time 10 "$API/customers")" || fail "customers" ""
CIF="$(echo "$CUSTOMERS" | jq -r '.[0].cif')"
[[ -n "$CIF" && "$CIF" != "null" ]] || fail "no customers" "$CUSTOMERS"
echo "ok customers · $(echo "$CUSTOMERS" | jq -r 'length') personas, first $CIF"

# 3. session
SESSION="$(curl -fsS --max-time 10 -X POST -H 'Content-Type: application/json' \
  -d "{\"cif\":\"$CIF\"}" "$API/sessions")" || fail "session create" ""
TOKEN="$(echo "$SESSION" | jq -r .token)"
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || fail "no token" "$SESSION"
AUTH=(-H "Authorization: Bearer $TOKEN")
echo "ok session · asOf=$(echo "$SESSION" | jq -r .session.asOf)"

# 4. view
VIEW="$(curl -fsS --max-time 15 "${AUTH[@]}" "$API/view")" || fail "view" ""
# The daily plan's one primary action (a list of actions in the first cut of the view).
ACTION_ID="$(echo "$VIEW" | jq -r '.plan.primary.id // empty')"
[[ -n "$ACTION_ID" ]] || fail "view has no action" "$(echo "$VIEW" | jq -c '.meta')"
echo "ok view · snapshot=$(echo "$VIEW" | jq -r .meta.snapshotId) roadmap v$(echo "$VIEW" | jq -r .meta.roadmapVersion) action=$ACTION_ID"

# 5. decision (idempotent; a rerun replays the stored response)
KEY="smoke-$(date +%s)-$RANDOM"
DECISION="$(curl -fsS --max-time 15 "${AUTH[@]}" -X POST \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $KEY" \
  -d '{"kind":"deferred","note":"smoke"}' "$API/actions/$ACTION_ID/decision")" || fail "decision" ""
[[ "$(echo "$DECISION" | jq -r '.decision.kind')" == "deferred" ]] || fail "decision shape" "$DECISION"
echo "ok decision · roadmap v$(echo "$DECISION" | jq -r .roadmapVersion)"

# 6. record chain
VERIFY="$(curl -fsS --max-time 10 "${AUTH[@]}" "$API/record/verify")" || fail "record verify" ""
[[ "$(echo "$VERIFY" | jq -r .ok)" == "true" ]] || fail "chain broken" "$VERIFY"
echo "ok record · chain length $(echo "$VERIFY" | jq -r .length)"

# 7. avatar availability (public, unbilled)
AVAIL="$(curl -fsS --max-time 10 "$API/avatar/availability")" || fail "availability" ""
echo "ok availability · enabled=$(echo "$AVAIL" | jq -r .enabled) available=$(echo "$AVAIL" | jq -r .available) minutesLeft=$(echo "$AVAIL" | jq -r .minutesLeftToday)"

# 8. erase the smoke session so it does not count against anyone's limits
curl -fsS --max-time 10 "${AUTH[@]}" -X DELETE "$API/session" >/dev/null || fail "erase" ""
echo "ok erase"

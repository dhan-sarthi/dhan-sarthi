#!/usr/bin/env python3
"""
Generates `scripts/capture-idbi.sh` from the OpenAPI files in `docs/idbi-openapi/`.

Why a generator: the 29 exported specs carry 42 sample request bodies between them, and
transcribing those by hand is how a capture ends up testing a typo. This reads the specs and
emits one dependency-free bash script — curl and coreutils only — because the machine that can
reach IDBI's sandbox is a teammate's laptop, not this repo's CI.

The sandbox allow-lists IP addresses and asks for no credential, so the emitted script sends no
key. The two bureau calls (408 CIBIL, 415 CKYC) are the exception: their sample bodies embed
real-looking logins, which are replaced here with placeholders the script fills from the
environment. Nothing credential-shaped is written into a tracked file.

Run: python3 scripts/build-capture-idbi.py
"""

import glob
import json
import os
import re
import sys

import yaml

SPEC_DIR = 'docs/idbi-openapi'
OUT = 'scripts/capture-idbi.sh'

# Which calls are safe to fire unasked. A capture run should not create a lead in the bank or
# push a consent event at somebody, so anything with a side effect waits for a flag.
READ = {362, 365, 391, 393, 394, 402, 404, 433, 441, 442, 473, 538, 591, 592, 593, 595, 739}
WRITES = {428, 497, 498, 508, 590}   # creates a lead / injects an event / sends an OTP
BUREAU = {408, 415}                  # a real bureau pull, and carries its own credentials

TIER_NOTE = {
    428: 'creates a lead in the bank',
    497: 'injects a consent event (this is an inbound webhook)',
    498: 'injects a data event (this is an inbound webhook)',
    508: 'may send an OTP (otpRequired=Y); bank-staff data, not our users',
    590: 'creates a consent request, may notify the customer',
    408: 'a real CIBIL pull; needs bureau credentials in the environment',
    415: 'a CKYC search; needs an apiToken in the environment',
}

# Probes the specs do not cover but the mapping needs. 393's own sample carries a
# `paginationDetails` block, which is the cursor for a *second* page, so replaying it verbatim
# never shows us what a first page looks like — and a first page is what the adapter asks for.
# The narrow window answers the other open question: whether 20 rows is a page size or simply
# all the sandbox holds.
EXTRAS = [
    {
        'api': 393,
        'name': 'getFullAccountStatementWithPaginationtest',
        'url': '/Development/getFullAccountStatementWithPaginationtest',
        'method': 'POST',
        'label': 'probe: first page, no cursor',
        'tier': 'read',
        'body': {
            'input': {
                'acid': '660100100003',
                'branchId': '105',
                'fromDate': '2025-05-01T00:00:00.000',
                'toDate': '2025-05-27T00:00:00.000',
                'sortIn': 'D',
            }
        },
    },
    {
        'api': 393,
        'name': 'getFullAccountStatementWithPaginationtest',
        'url': '/Development/getFullAccountStatementWithPaginationtest',
        'method': 'POST',
        'label': 'probe: 10-day window, is 20 a page size',
        'tier': 'read',
        'body': {
            'input': {
                'acid': '660100100003',
                'branchId': '105',
                'fromDate': '2025-05-01T00:00:00.000',
                'toDate': '2025-05-10T00:00:00.000',
                'sortIn': 'D',
            }
        },
    },
]

# Credentials that must not be committed. Sample value -> environment variable.
SECRETS = {
    'BN0120DC01_UAT003': 'IDBI_CIBIL_USER',
    'Smile$369258147': 'IDBI_CIBIL_PASS',
    'BN01208899_UATC2CNPE1': 'IDBI_CIBIL_MEMBER',
    'eeyczaswtvoxsjm+mZ3ft': 'IDBI_CIBIL_MEMBER_PASS',
    '3420c172-fba9-44ac-ba95-2a9bb66f788f': 'IDBI_CKYC_TOKEN',
}


def tier_of(api):
    if api in WRITES:
        return 'writes'
    if api in BUREAU:
        return 'bureau'
    return 'read'


def collect():
    calls = []
    for path in sorted(glob.glob(os.path.join(SPEC_DIR, '*.yaml'))):
        doc = yaml.safe_load(open(path))
        for url, ops in (doc.get('paths') or {}).items():
            for method, op in ops.items():
                summary = (op.get('summary') or '').strip()
                m = re.match(r'(?:API\s+)?(\d{3})', summary)
                if not m:
                    print(f'skipped, no API number in summary: {summary!r}', file=sys.stderr)
                    continue
                api = int(m.group(1))
                name = url.rsplit('/', 1)[-1]
                examples = (
                    (op.get('requestBody') or {})
                    .get('content', {})
                    .get('application/json', {})
                    .get('examples', {})
                ) or {}
                for i, (label, ex) in enumerate(examples.items(), start=1):
                    raw = ex.get('value')
                    if raw is None:
                        continue
                    # Re-serialise compactly so the body is one shell-safe line. A sample that
                    # is not valid JSON is a spec bug: carry it through verbatim and let the
                    # capture record what the sandbox says about it.
                    try:
                        body = json.dumps(json.loads(raw), separators=(',', ':'))
                    except json.JSONDecodeError:
                        body = ' '.join(raw.split())
                    for literal, var in SECRETS.items():
                        body = body.replace(literal, f'__{var}__')
                    if "'" in body:
                        raise SystemExit(f'body for {name} contains a single quote; fix the emitter')
                    calls.append(
                        {
                            'api': api,
                            'name': name,
                            'url': url,
                            'method': method.upper(),
                            'sample': i,
                            'label': ' '.join(label.split()),
                            'tier': tier_of(api),
                            'body': body,
                        }
                    )
    # Extras continue the sample numbering for their endpoint, so a probe never overwrites the
    # capture of a spec sample.
    for extra in EXTRAS:
        used = [c['sample'] for c in calls if c['api'] == extra['api'] and c['name'] == extra['name']]
        body = json.dumps(extra['body'], separators=(',', ':'))
        if "'" in body:
            raise SystemExit(f"extra for {extra['name']} contains a single quote; fix the emitter")
        calls.append({**extra, 'sample': (max(used) if used else 0) + 1, 'body': body})

    calls.sort(key=lambda c: (c['api'], c['name'], c['sample']))
    return calls


HEADER = r'''#!/usr/bin/env bash
# Captures one real response per IDBI sandbox API, so the adapter can be mapped against what
# the bank actually sends rather than what we guessed. GENERATED — edit
# scripts/build-capture-idbi.py and regenerate, do not edit this file.
#
# Run it from a machine whose IP IDBI has allow-listed. The sandbox wants no credential; the
# allow-list is the whole gate, so a 403 here means the wrong network, not a missing key.
#
#   ./scripts/capture-idbi.sh                  # safe reads only
#   ./scripts/capture-idbi.sh --writes         # also the calls that change something
#   ./scripts/capture-idbi.sh --bureau         # also CIBIL and CKYC (needs credentials, below)
#   ./scripts/capture-idbi.sh --only 393       # redo one API
#
# Then hand back the whole output directory.
set -uo pipefail

BASE="${IDBI_BASE:-https://sandboxpocgatewayprod.idbi.bank.in}"
DELAY="${IDBI_DELAY:-1}"          # seconds between calls; the sandbox's rate limit is unknown
TIMEOUT="${IDBI_TIMEOUT:-30}"
OUT="idbi-capture-$(date +%Y%m%d-%H%M%S)"
WANT_WRITES=0
WANT_BUREAU=0
ONLY=""

while [ $# -gt 0 ]; do
  case "$1" in
    --writes) WANT_WRITES=1 ;;
    --bureau) WANT_BUREAU=1 ;;
    --only)   ONLY="${2:-}"; shift ;;
    --out)    OUT="${2:-}"; shift ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

mkdir -p "$OUT" || exit 1
SUMMARY="$OUT/summary.tsv"
printf 'api\tname\tsample\ttier\thttp\tbytes\tatlas_request_id\tlabel\n' > "$SUMMARY"

ok=0; failed=0; skipped=0

printf '\n  capturing to %s\n  base %s\n\n' "$OUT" "$BASE"
printf '  %-5s %-46s %-3s %-6s %-5s %s\n' API NAME S TIER HTTP BYTES
printf '  %s\n' "----------------------------------------------------------------------------------"

call() {
  api="$1"; name="$2"; sample="$3"; tier="$4"; label="$5"; path="$6"; body="$7"

  if [ -n "$ONLY" ] && [ "$ONLY" != "$api" ]; then skipped=$((skipped+1)); return; fi
  if [ "$tier" = "writes" ] && [ "$WANT_WRITES" -eq 0 ]; then skipped=$((skipped+1)); return; fi
  if [ "$tier" = "bureau" ] && [ "$WANT_BUREAU" -eq 0 ]; then skipped=$((skipped+1)); return; fi

  # Bureau bodies carry placeholders instead of committed credentials.
  if [ "$tier" = "bureau" ]; then
    body=$(printf '%s' "$body" \
      | sed -e "s|__IDBI_CIBIL_USER__|${IDBI_CIBIL_USER:-}|g" \
            -e "s|__IDBI_CIBIL_PASS__|${IDBI_CIBIL_PASS:-}|g" \
            -e "s|__IDBI_CIBIL_MEMBER__|${IDBI_CIBIL_MEMBER:-}|g" \
            -e "s|__IDBI_CIBIL_MEMBER_PASS__|${IDBI_CIBIL_MEMBER_PASS:-}|g" \
            -e "s|__IDBI_CKYC_TOKEN__|${IDBI_CKYC_TOKEN:-}|g")
  fi

  stem="$OUT/${api}-${name}-s${sample}"
  printf '%s' "$body" > "$stem.request.json"

  http=$(printf '%s' "$body" | curl -sS -m "$TIMEOUT" -X POST "$BASE$path" \
    -H 'Content-Type: application/json' \
    -H "TransactionId: $(uuidgen 2>/dev/null || date +%s)" \
    -H 'ApplicationId: dhan-sarthi-capture' \
    -D "$stem.headers.txt" -o "$stem.response.json" \
    -w '%{http_code}' --data-binary @- 2>"$stem.curl-error.txt")
  rc=$?

  [ -s "$stem.curl-error.txt" ] || rm -f "$stem.curl-error.txt"
  if [ $rc -ne 0 ]; then http="curl:$rc"; fi

  bytes=$(wc -c < "$stem.response.json" 2>/dev/null | tr -d ' ')
  rid=$(grep -i '^x-atlas-request-id:' "$stem.headers.txt" 2>/dev/null | tr -d '\r' | awk '{print $2}')

  # Pretty-print when it is JSON, so a diff between runs is readable.
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys;p=sys.argv[1];d=json.load(open(p));json.dump(d,open(p,"w"),indent=2,sort_keys=True)' \
      "$stem.response.json" 2>/dev/null
  fi

  printf '  %-5s %-46s %-3s %-6s %-5s %s\n' "$api" "$name" "$sample" "$tier" "$http" "${bytes:-0}"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$api" "$name" "$sample" "$tier" "$http" "${bytes:-0}" "${rid:-}" "$label" >> "$SUMMARY"

  case "$http" in 2*) ok=$((ok+1)) ;; *) failed=$((failed+1)) ;; esac
  sleep "$DELAY"
}

'''

FOOTER = r'''
printf '\n  %s\n' "----------------------------------------------------------------------------------"
printf '  ok %s   failed %s   skipped %s\n' "$ok" "$failed" "$skipped"
printf '  summary: %s\n' "$SUMMARY"

if [ "$failed" -gt 0 ] && [ "$ok" -eq 0 ]; then
  printf '\n  Everything failed. If the responses are HTML 403 from awselb, this machine is not\n'
  printf '  on the IDBI allow-list rather than missing a key.\n'
fi

printf '\n  Hand back the whole directory:\n    tar -czf %s.tar.gz %s\n\n' "$OUT" "$OUT"
'''


def main():
    calls = collect()
    if not calls:
        raise SystemExit(f'no samples found under {SPEC_DIR}/')

    lines = [HEADER]
    noted = set()
    for c in calls:
        note = TIER_NOTE.get(c['api'])
        if note and c['api'] not in noted:
            lines.append(f"# API {c['api']}: {note}\n")
            noted.add(c['api'])
        lines.append(
            "call '{api}' '{name}' '{sample}' '{tier}' '{label}' '{url}' '{body}'\n".format(**c)
        )
    lines.append(FOOTER)

    with open(OUT, 'w') as fh:
        fh.write(''.join(lines))
    os.chmod(OUT, 0o755)

    by_tier = {}
    for c in calls:
        by_tier[c['tier']] = by_tier.get(c['tier'], 0) + 1
    apis = sorted({c['api'] for c in calls})
    print(f'wrote {OUT}')
    print(f'  {len(calls)} calls over {len(apis)} APIs')
    print(f'  APIs: {apis}')
    for tier in ('read', 'writes', 'bureau'):
        print(f'  {tier:7} {by_tier.get(tier, 0)} calls')


if __name__ == '__main__':
    main()

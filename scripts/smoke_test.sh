#!/usr/bin/env bash
# Post-deploy smoke test for game-factory.tech.
#
# Verifies critical endpoints serve the expected content type and shape
# after a CF Pages deploy. Auto-recovers from the most common failure
# mode (PostHog secrets disappearing) by invoking restore_secrets.sh and
# re-checking once.
#
# Exit codes:
#   0 — everything healthy
#   1 — at least one critical failure even after recovery attempts
#
# Usage:
#   bash Gallery/scripts/smoke_test.sh                  (once-off)
#   bash Gallery/scripts/smoke_test.sh --quiet          (CI: only echo failures)

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SITE="${SITE:-https://game-factory.tech}"
QUIET=0
for a in "$@"; do
  [[ "$a" == "--quiet" ]] && QUIET=1
  [[ "$a" == --site=* ]] && SITE="${a#--site=}"
done

ok=true
fail() { echo "  ❌ $*"; ok=false; }
pass() { (( QUIET )) || echo "  ✅ $*"; }
note() { (( QUIET )) || echo "  · $*"; }

(( QUIET )) || echo "Smoke test for $SITE"

bust="$(date +%s%N)"

# 1. Gallery index serves HTML 200
status=$(curl -s -o /dev/null -w "%{http_code}" "$SITE/?b=$bust")
[[ "$status" == "200" ]] && pass "/ → 200" || fail "/ → $status"

# 2. games.json is a JSON array (or {games:[…]}) with >= 6 items
games_json=$(curl -s "$SITE/games.json?b=$bust")
count=$(printf '%s' "$games_json" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if isinstance(d, list): print(len(d))
    elif isinstance(d, dict): print(len(d.get('games', [])))
    else: print(0)
except Exception:
    print(-1)
" 2>/dev/null || echo "-1")
if [[ "$count" =~ ^[0-9]+$ ]] && [[ "$count" -ge 6 ]]; then
  pass "/games.json → $count games"
else
  fail "/games.json → parse failed or count=$count (expected ≥6)"
fi

# 3. /api/counts returns application/json
counts_ct=$(curl -sI "$SITE/api/counts?b=$bust" | awk -F': *' 'tolower($1)=="content-type" {print tolower($2); exit}' | tr -d '\r\n')
if [[ "$counts_ct" == application/json* ]]; then
  pass "/api/counts → application/json"
else
  fail "/api/counts → '$counts_ct' (expected application/json)"
fi

# 4. /posthog-init serves the real PostHog snippet, not the no-op stub
ph_check() {
  local body
  body=$(curl -s "$SITE/posthog-init?b=$(date +%s%N)")
  printf '%s' "$body" | grep -q "posthog\.init.*phc_"
}
if ph_check; then
  pass "/posthog-init → real PostHog snippet"
else
  fail "/posthog-init → no-op stub (secrets likely vanished, attempting auto-recovery)"
  if bash "$ROOT/Gallery/scripts/restore_secrets.sh" >/dev/null 2>&1; then
    note "secrets re-applied; waiting 8s for CF function to refresh"
    sleep 8
    if ph_check; then
      pass "/posthog-init → recovered after restore_secrets"
      ok=true
    else
      fail "/posthog-init → still stub after restore (CF may still be propagating; re-check in a minute)"
    fi
  else
    fail "restore_secrets.sh itself failed — check wrangler auth"
  fi
fi

if $ok; then
  (( QUIET )) || echo "✅ All smoke tests passed"
  exit 0
else
  echo "❌ Smoke test detected failures on $SITE"
  exit 1
fi

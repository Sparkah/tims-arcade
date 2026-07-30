#!/usr/bin/env bash
# Revert the latest Gallery commit only when the target remains on the
# D1-authoritative discovery architecture.
#
# The pre-D1 Gallery exposes curated-hidden games in server-visible manifests
# and share pages. Crossing that boundary would republish them, so this script
# refuses such a rollback and requires a forward repair instead.

set -uo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1
RB_TOKEN=""

cd "$(git rev-parse --show-toplevel)"
BAD_FULL="$(git rev-parse HEAD)"
BAD_HASH="$(git log -1 --pretty=%h)"
BAD_SUBJ="$(git log -1 --pretty='%s')"
TARGET_USES_D1=0
if git show HEAD^:functions/_lib/publicCatalogue.js 2>/dev/null \
    | grep -q 'GALLERY_DB'; then
  TARGET_USES_D1=1
fi

echo "⚠️  Rolling back last commit on $(git rev-parse --abbrev-ref HEAD)"
echo "    Bad commit: $BAD_HASH — $BAD_SUBJ"
if [[ "$TARGET_USES_D1" != "1" ]]; then
  echo "    Target: pre-D1 discovery (automatic rollback forbidden)"
  if [[ "$DRY_RUN" == "1" ]]; then
    echo "(dry-run; would refuse because hidden games would be republished)"
    exit 0
  fi
  echo "❌ cross-cutover rollback refused: the target republishes curated-hidden games." >&2
  echo "   Keep D1 authoritative and repair forward." >&2
  exit 8
fi
echo "    Target: D1-authoritative discovery"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "(dry-run; not reverting)"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCK="$SCRIPT_DIR/push_lock.sh"
for required in curl jq npx; do
  if ! command -v "$required" >/dev/null 2>&1; then
    echo "❌ rollback requires $required" >&2
    exit 2
  fi
done

cleanup_rollback() {
  local original_status=$?
  local cleanup_failed=0
  if [[ -n "$RB_TOKEN" && -x "$LOCK" ]]; then
    if ! bash "$LOCK" release "$RB_TOKEN" 2>/dev/null; then
      echo "⚠️  rollback push lock could not be released cleanly." >&2
      cleanup_failed=1
    fi
  fi
  if [[ "$cleanup_failed" == "1" ]]; then original_status=6; fi
  trap - EXIT
  exit "$original_status"
}
trap cleanup_rollback EXIT

read_live_curation_marker() {
  curl -fsS -D - -o /dev/null \
    "https://game-factory.tech/api/hidden?rollback-check=$(date +%s%N)" \
    | awk -F': *' 'tolower($1)=="x-gallery-curation" {print tolower($2)}' \
    | tr -d '\r\n'
}

push_main_verified() {
  if git push --no-verify origin HEAD:main; then return 0; fi
  echo "⚠️  push reported failure; verifying the remote ref." >&2
  if ! git fetch origin main -q; then return 2; fi
  [[ "$(git rev-parse origin/main)" == "$(git rev-parse HEAD)" ]]
}

wait_for_deployed_commit() {
  local expected="$1"
  local deadline source marker
  deadline=$(( $(date +%s) + 480 ))
  while (( $(date +%s) < deadline )); do
    source="$(npx --yes wrangler pages deployment list \
      --project-name=tims-arcade --json 2>/dev/null \
      | jq -r '.[] | select(.Environment == "Production") | .Source' \
      | head -1 || true)"
    marker="$(read_live_curation_marker || true)"
    if [[ "$source" == "$expected" && "$marker" == "d1-v1" ]]; then return 0; fi
    echo "   waiting for D1 rollback deploy (source=${source:-unknown}, marker=${marker:-none})..."
    sleep 15
  done
  return 1
}

# A D1→D1 revert is only valid while D1 is actually authoritative.
if [[ "$(read_live_curation_marker || true)" != "d1-v1" ]]; then
  echo "❌ cannot prove d1-v1 is currently authoritative; rollback refused." >&2
  exit 7
fi

if [[ -x "$LOCK" ]]; then
  if [[ "${ROLLBACK_FORCE:-0}" == "1" ]]; then
    bash "$LOCK" release "" >/dev/null 2>&1
    RB_TOKEN="$(bash "$LOCK" acquire "rollback-FORCE" "$BAD_HASH" $$)"
    echo "⚠️  ROLLBACK_FORCE=1 - stole the Gallery push lock (intentional override)"
  else
    RB_TOKEN="$(bash "$LOCK" acquire "rollback" "$BAD_HASH" $$)" || {
      echo "🔒 Gallery push lock held by another agent - rollback deferred:" >&2
      bash "$LOCK" holder 2>/dev/null | sed 's/^/     /' >&2
      exit 3
    }
  fi
fi

# The local lock cannot stop GitHub UI or another machine, so verify main again
# immediately before creating the revert.
if ! git fetch origin main -q \
   || [[ "$(git rev-parse origin/main)" != "$BAD_FULL" ]]; then
  echo "❌ origin/main changed before rollback; refusing to revert." >&2
  exit 3
fi

if ! git revert --no-edit HEAD; then
  echo "❌ revert failed (merge conflict?). Manual intervention needed." >&2
  exit 2
fi

PUSH_STATUS=0
push_main_verified || PUSH_STATUS=$?
if [[ "$PUSH_STATUS" != "0" ]]; then
  echo "❌ rollback push was not verified; production authority was not changed." >&2
  exit 5
fi

EXPECTED_SOURCE="$(git rev-parse --short=7 HEAD)"
echo "✓ revert pushed. Waiting for Cloudflare source $EXPECTED_SOURCE..."
if ! wait_for_deployed_commit "$EXPECTED_SOURCE"; then
  echo "🚨 rollback commit did not become the proven D1 production deployment." >&2
  exit 6
fi

if bash "$SCRIPT_DIR/smoke_test.sh" --quiet; then
  if [[ -f "$SCRIPT_DIR/indexnow_notify.py" ]] \
      && ! python3 "$SCRIPT_DIR/indexnow_notify.py" --submit; then
    echo "⚠️  rollback is live, but IndexNow notification failed; next verified deploy will retry."
  fi
  echo "✅ rollback healthy"
  exit 0
fi

echo "🚨 rollback deployed but production smoke failed; repair forward." >&2
exit 1

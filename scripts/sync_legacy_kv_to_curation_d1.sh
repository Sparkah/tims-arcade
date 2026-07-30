#!/usr/bin/env bash
# Transactional legacy-KV → D1 handoff.
#
# --prepare: while legacy-v2 is live, freeze D1, lock the legacy POST route,
# wait for KV edge propagation, and copy the stable KV set into D1.
# --finalize: only after d1-v1 is proven live, copy the still-locked KV set one
# final time and atomically enable D1 writes. The legacy lock stays closed.
# --abort: before D1 code lands, restore legacy writes and the prior D1 state.
# No flag is a read-only state report.

set -euo pipefail

MODE="${1:-check}"
if [[ "$MODE" != "check" \
   && "$MODE" != "--prepare" \
   && "$MODE" != "--finalize" \
   && "$MODE" != "--abort" ]]; then
  echo "usage: $0 [--prepare|--finalize|--abort]" >&2
  exit 2
fi

ROOT="${GALLERY_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"
SITE="${SITE:-https://game-factory.tech}"
LEGACY_WRITE_KEY="curation:legacy-write-enabled"
LEGACY_BRIDGE_COMMIT="fafdc26d5371c2e424c29031824bc3056551ddf0"
HANDOFF_COMPLETE=0
PREPARE_MUTATION_STARTED=0
ORIGINAL_D1_WRITES=""
command -v jq >/dev/null 2>&1 || {
  echo "curation handoff: jq is required" >&2
  exit 2
}

recover_failed_prepare() {
  local original_status=$?
  local recovery_failed=0
  if [[ "$MODE" == "--prepare" \
     && "$PREPARE_MUTATION_STARTED" == "1" \
     && "$HANDOFF_COMPLETE" != "1" ]]; then
    if ! prove_legacy_bridge_authoritative; then
      trap - EXIT
      echo "curation handoff: authority changed; forcing both stores frozen" >&2
      npx --yes wrangler kv key put "$LEGACY_WRITE_KEY" "0" --binding VOTES --remote \
        >/dev/null 2>&1 || recovery_failed=1
      npx --yes wrangler d1 execute gallery-curation --remote \
        --command "UPDATE gallery_curation_state SET write_enabled = 0 WHERE singleton = 1 AND ready = 1;" \
        >/dev/null 2>&1 || recovery_failed=1
      frozen_d1="$(npx --yes wrangler d1 execute gallery-curation --remote --json \
        --command "SELECT ready, write_enabled FROM gallery_curation_state WHERE singleton = 1;" \
        2>/dev/null || true)"
      frozen_ready="$(printf '%s' "$frozen_d1" | jq -r '.[0].results[0].ready // empty' 2>/dev/null || true)"
      frozen_writes="$(printf '%s' "$frozen_d1" | jq -r '.[0].results[0].write_enabled // empty' 2>/dev/null || true)"
      frozen_legacy="$(npx --yes wrangler kv key get "$LEGACY_WRITE_KEY" --binding VOTES --remote 2>/dev/null || true)"
      if [[ "$frozen_ready" != "1" || "$frozen_writes" != "0" || "$frozen_legacy" != "0" ]]; then
        recovery_failed=1
      fi
      if [[ "$recovery_failed" == "1" ]]; then
        echo "curation handoff: CRITICAL authority freeze could not be verified" >&2
      else
        echo "curation handoff: both authorities frozen; continue only with verified --finalize" >&2
      fi
      exit 6
    fi
    echo "curation handoff: restoring pre-prepare write authorities" >&2
    if [[ "$ORIGINAL_D1_WRITES" == "0" || "$ORIGINAL_D1_WRITES" == "1" ]]; then
      npx --yes wrangler d1 execute gallery-curation --remote \
        --command "UPDATE gallery_curation_state SET write_enabled = $ORIGINAL_D1_WRITES WHERE singleton = 1 AND ready = 1;" \
        >/dev/null 2>&1 || recovery_failed=1
    fi
    npx --yes wrangler kv key put "$LEGACY_WRITE_KEY" "1" --binding VOTES --remote \
      >/dev/null 2>&1 || recovery_failed=1
    if [[ "$recovery_failed" == "1" ]]; then
      echo "curation handoff: CRITICAL prepare recovery failed; inspect both write authorities" >&2
      original_status=6
    fi
  fi
  trap - EXIT
  exit "$original_status"
}
trap recover_failed_prepare EXIT

live_marker() {
  curl -fsS -D - -o /dev/null \
    "$SITE/api/hidden?curation-check=$(date +%s%N)" \
    | awk -F': *' 'tolower($1)=="x-gallery-curation" {print tolower($2)}' \
    | tr -d '\r\n'
}

latest_production_source() {
  npx --yes wrangler pages deployment list \
    --project-name=tims-arcade --json 2>/dev/null \
    | jq -r '.[] | select(.Environment == "Production") | .Source' \
    | head -1
}

prove_legacy_bridge_authoritative() {
  local remote source marker
  git fetch origin main -q || return 1
  remote="$(git rev-parse origin/main)"
  source="$(latest_production_source || true)"
  marker="$(live_marker || true)"
  [[ "$remote" == "$LEGACY_BRIDGE_COMMIT" \
     && "$source" == "${LEGACY_BRIDGE_COMMIT:0:7}" \
     && "$marker" == "legacy-v2" ]]
}

prove_d1_authoritative() {
  local remote source marker
  git fetch origin main -q || return 1
  remote="$(git rev-parse origin/main)"
  source="$(latest_production_source || true)"
  marker="$(live_marker || true)"
  git show origin/main:functions/_lib/publicCatalogue.js 2>/dev/null \
    | grep -q 'GALLERY_DB' \
    && [[ "$source" == "${remote:0:7}" && "$marker" == "d1-v1" ]]
}

read_kv_state() {
  KV_RAW="$(npx --yes wrangler kv key get 'hidden:set' --binding VOTES --remote)"
  KV_HIDDEN="$(printf '%s' "$KV_RAW" | jq -ec '.')"
  KV_NORMALIZED="$(printf '%s' "$KV_HIDDEN" | jq -ec '
    if type != "array"
       or (all(.[]; (type == "string") and test("^[a-z0-9_-]{1,64}$")) | not)
    then error("legacy KV curation is malformed")
    else sort | unique
    end
  ')"
  if [[ "$KV_HIDDEN" != "$KV_NORMALIZED" ]]; then
    echo "curation handoff: legacy KV list is not sorted and unique" >&2
    return 1
  fi
  UPDATED_AT="$(npx --yes wrangler kv key get 'hidden:updatedAt' --binding VOTES --remote 2>/dev/null \
    || date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
  if [[ ! "$UPDATED_AT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]]; then
    echo "curation handoff: legacy timestamp is malformed" >&2
    return 1
  fi
}

read_d1_state() {
  D1_STATE="$(npx --yes wrangler d1 execute gallery-curation --remote --json \
    --command "SELECT hidden_json, revision, ready, write_enabled FROM gallery_curation_state WHERE singleton = 1;")"
  READY="$(printf '%s' "$D1_STATE" | jq -er '.[0].results[0].ready')"
  WRITE_ENABLED="$(printf '%s' "$D1_STATE" | jq -er '.[0].results[0].write_enabled')"
}

verify_exact_state() {
  local expected_writes="$1"
  local d1_after d1_rows d1_snapshot d1_ready d1_writes kv_after legacy_writes
  d1_after="$(npx --yes wrangler d1 execute gallery-curation --remote --json \
    --command "SELECT slug FROM gallery_hidden_games ORDER BY slug; SELECT hidden_json, ready, write_enabled FROM gallery_curation_state WHERE singleton = 1;")"
  d1_rows="$(printf '%s' "$d1_after" | jq -ec '[.[0].results[].slug]')"
  d1_snapshot="$(printf '%s' "$d1_after" | jq -ec '.[1].results[0].hidden_json | fromjson')"
  d1_ready="$(printf '%s' "$d1_after" | jq -er '.[1].results[0].ready')"
  d1_writes="$(printf '%s' "$d1_after" | jq -er '.[1].results[0].write_enabled')"
  kv_after="$(npx --yes wrangler kv key get 'hidden:set' --binding VOTES --remote | jq -ec '.')"
  legacy_writes="$(npx --yes wrangler kv key get "$LEGACY_WRITE_KEY" --binding VOTES --remote)"
  if [[ "$d1_rows" != "$KV_HIDDEN" \
     || "$d1_snapshot" != "$KV_HIDDEN" \
     || "$kv_after" != "$KV_HIDDEN" \
     || "$d1_ready" != "1" \
     || "$d1_writes" != "$expected_writes" \
     || "$legacy_writes" != "0" ]]; then
    echo "curation handoff: exact-state verification failed" >&2
    return 1
  fi
}

reconcile_d1() {
  local final_write_enabled="$1"
  local values insert_sql restore_sql
  values="$(printf '%s' "$KV_HIDDEN" | jq -r --arg ts "$UPDATED_AT" '
    map("(\u0027" + . + "\u0027,\u0027" + $ts + "\u0027)") | join(",")
  ')"
  insert_sql=""
  if [[ -n "$values" ]]; then
    insert_sql="INSERT INTO gallery_hidden_games (slug, updated_at) VALUES $values;"
  fi
  restore_sql="SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM gallery_curation_state
    WHERE singleton = 1 AND ready = 1 AND write_enabled = 0
  ) THEN 1
  ELSE json_extract('curation-state-changed', '\$')
END;
UPDATE gallery_curation_state SET ready = 0, write_enabled = 1 WHERE singleton = 1;
DELETE FROM gallery_hidden_games;
$insert_sql
UPDATE gallery_curation_state
SET hidden_json = '$KV_HIDDEN',
    updated_at = '$UPDATED_AT',
    revision = revision + 1,
    ready = 1,
    write_enabled = $final_write_enabled
WHERE singleton = 1;"
  # Wrangler sends the statement batch transactionally. The lazy invalid-JSON
  # branch aborts the entire batch unless D1 is still frozen at transaction
  # start, so a delayed duplicate finalizer cannot erase a mutation accepted
  # after the first finalizer enabled writes.
  npx --yes wrangler d1 execute gallery-curation --remote --command "$restore_sql"
}

read_kv_state
read_d1_state
ORIGINAL_D1_WRITES="$WRITE_ENABLED"
COUNT="$(printf '%s' "$KV_HIDDEN" | jq 'length')"
HASH="$(printf '%s' "$KV_HIDDEN" | shasum -a 256 | awk '{print $1}')"
MARKER="$(live_marker || true)"
LEGACY_WRITES_RAW="$(npx --yes wrangler kv key get "$LEGACY_WRITE_KEY" --binding VOTES --remote 2>&1 || true)"
LEGACY_WRITES=""
if [[ "$LEGACY_WRITES_RAW" == "0" || "$LEGACY_WRITES_RAW" == "1" ]]; then
  LEGACY_WRITES="$LEGACY_WRITES_RAW"
fi
echo "curation handoff: KV count=$COUNT sha256=$HASH D1 ready=$READY write_enabled=$WRITE_ENABLED legacy_lock=${LEGACY_WRITES:-unset} live=${MARKER:-none}"

if [[ "$MODE" == "check" ]]; then
  echo "curation handoff: dry-run; use --prepare before deploy and --finalize after d1-v1 is live"
  exit 0
fi

if [[ "$MODE" == "--abort" ]]; then
  if ! prove_legacy_bridge_authoritative; then
    echo "curation handoff: --abort requires bridge commit fafdc26 on main and live" >&2
    exit 1
  fi
  npx --yes wrangler d1 execute gallery-curation --remote \
    --command "UPDATE gallery_curation_state SET write_enabled = 1 WHERE singleton = 1 AND ready = 1;"
  npx --yes wrangler kv key put "$LEGACY_WRITE_KEY" "1" --binding VOTES --remote
  read_d1_state
  ABORT_LEGACY_WRITES="$(npx --yes wrangler kv key get "$LEGACY_WRITE_KEY" --binding VOTES --remote)"
  if [[ "$READY" != "1" || "$WRITE_ENABLED" != "1" || "$ABORT_LEGACY_WRITES" != "1" ]]; then
    echo "curation handoff: abort verification failed" >&2
    exit 1
  fi
  echo "curation handoff: ABORTED — legacy writes restored; D1 is ready for a later retry"
  exit 0
fi

if [[ "$MODE" == "--prepare" ]]; then
  if ! prove_legacy_bridge_authoritative; then
    echo "curation handoff: --prepare requires bridge commit fafdc26 on main and live" >&2
    exit 1
  fi
  # Freeze D1 first. If a D1 deployment races this handoff, its mutation route
  # starts read-only. Pre-arm recovery because the remote update can succeed
  # even when its client transport reports failure.
  PREPARE_MUTATION_STARTED=1
  npx --yes wrangler d1 execute gallery-curation --remote \
    --command "UPDATE gallery_curation_state SET write_enabled = 0 WHERE singleton = 1 AND ready = 1;"
  read_d1_state
  if [[ "$READY" != "1" || "$WRITE_ENABLED" != "0" ]]; then
    echo "curation handoff: D1 mutation freeze did not persist" >&2
    exit 1
  fi
  if ! prove_legacy_bridge_authoritative; then
    echo "curation handoff: bridge authority changed while freezing D1" >&2
    exit 1
  fi
  npx --yes wrangler kv key put "$LEGACY_WRITE_KEY" "0" --binding VOTES --remote
  echo "curation handoff: waiting 66s for the legacy mutation lock to propagate"
  sleep 33
  sleep 33
  if ! prove_legacy_bridge_authoritative; then
    echo "curation handoff: bridge authority changed during prepare" >&2
    exit 1
  fi
  if [[ "$(npx --yes wrangler kv key get "$LEGACY_WRITE_KEY" --binding VOTES --remote)" != "0" ]]; then
    echo "curation handoff: legacy mutation lock did not persist" >&2
    exit 1
  fi
  # Read only after the legacy write lock has propagated. D1 has remained
  # frozen throughout the propagation window.
  read_kv_state
  reconcile_d1 0
  verify_exact_state 0
  HANDOFF_COMPLETE=1
  echo "curation handoff: PREPARED — legacy and D1 mutations frozen; deploy d1-v1 now"
  exit 0
fi

if ! prove_d1_authoritative; then
  echo "curation handoff: --finalize requires origin/main's D1 source and d1-v1 to be live" >&2
  exit 1
fi
if [[ "$LEGACY_WRITES" != "0" || "$READY" != "1" || "$WRITE_ENABLED" != "0" ]]; then
  echo "curation handoff: --finalize requires legacy locked and D1 ready/frozen" >&2
  exit 1
fi
# Re-read and reinstall the locked KV snapshot after the new code is serving,
# then enable D1 in the same transaction. This is the authority handoff.
read_kv_state
# Refuse to erase a D1-only mutation if a deployment raced the first freeze.
# A clean prepare leaves rows, singleton snapshot, and locked KV byte-identical.
verify_exact_state 0
reconcile_d1 1
verify_exact_state 1
echo "curation handoff: FINALIZED — D1 authoritative and writable; legacy bridge remains locked"

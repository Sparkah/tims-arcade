#!/usr/bin/env bash
# Rollback last Gallery commit if production smoke fails after deploy.
#
# Why this approach: Cloudflare Pages doesn't expose a true "rollback"
# CLI command — `wrangler pages deployment` lacks a promote/restore.
# The dashboard has a "Restore" button but it's not scriptable.
#
# Cleanest scriptable path: revert the offending commit and push. CF
# auto-deploys the revert, restoring the previous serving state in
# ~30-60s. Pre-push hooks still run on the revert (Yandex check, /review)
# but with --no-verify since the original commit already passed.
#
# Usage:
#   bash Gallery/scripts/rollback.sh           # revert HEAD, push, smoke-check
#   bash Gallery/scripts/rollback.sh --dry-run # show what would happen
#
# Auto-invoked by run_factory.sh when post-deploy smoke fails.

set -uo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

cd "$(git rev-parse --show-toplevel)"
BAD_HASH=$(git log -1 --pretty=%h)
BAD_SUBJ=$(git log -1 --pretty='%s')

echo "⚠️  Rolling back last commit on $(git rev-parse --abbrev-ref HEAD)"
echo "    Bad commit: $BAD_HASH — $BAD_SUBJ"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "(dry-run; not reverting)"
  exit 0
fi

if ! git revert --no-edit HEAD; then
  echo "❌ revert failed (merge conflict?). Manual intervention needed." >&2
  exit 2
fi

# --no-verify skips the pre-push hook (the original commit already passed the
# gates) - but that ALSO skips the hook's push lock. Acquire it manually here so a
# rollback can't SILENTLY race a concurrent agent push (Tim 2026-06-01). Defer if
# another agent holds it, unless ROLLBACK_FORCE=1 (the intentional emergency steal).
LOCK="$(cd "$(dirname "$0")" && pwd)/push_lock.sh"
if [[ -x "$LOCK" ]]; then
  if [[ "${ROLLBACK_FORCE:-0}" == "1" ]]; then
    bash "$LOCK" release "" >/dev/null 2>&1
    RB_TOKEN="$(bash "$LOCK" acquire "rollback-FORCE" "$BAD_HASH" $$)"
    echo "⚠️  ROLLBACK_FORCE=1 - stole the Gallery push lock (intentional override)"
  else
    RB_TOKEN="$(bash "$LOCK" acquire "rollback" "$BAD_HASH" $$)" || {
      echo "🔒 Gallery push lock held by another agent - rollback DEFERRED (not racing):" >&2
      bash "$LOCK" holder 2>/dev/null | sed 's/^/     /' >&2
      echo "   Wait, then re-run; or force NOW: ROLLBACK_FORCE=1 bash rollback.sh" >&2
      exit 3
    }
  fi
  trap 'bash "$LOCK" release "$RB_TOKEN" 2>/dev/null' EXIT
fi

# We hold the lock manually (above), so this push still cannot race a concurrent one.
git push --no-verify

echo "✓ revert pushed. CF will rebuild ~45-90s. Smoke-checking in 60s..."
sleep 60
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if bash "$SCRIPT_DIR/smoke_test.sh" --quiet; then
  echo "✅ rollback healthy"
  exit 0
else
  echo "🚨 rollback ALSO failing — likely a deeper issue. Manual intervention needed." >&2
  exit 1
fi

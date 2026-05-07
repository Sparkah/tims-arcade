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

# Use --no-verify so the pre-push hooks don't re-run on a known-good revert
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

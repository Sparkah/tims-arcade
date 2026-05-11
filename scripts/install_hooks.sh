#!/usr/bin/env bash
# Install Gallery git hooks into .git/hooks/.
# Re-run after a fresh clone — `.git/hooks/` isn't tracked.
#
# Usage:
#   bash Gallery/scripts/install_hooks.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GALLERY_DIR="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$GALLERY_DIR/.git/hooks"

if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "✕ $HOOKS_DIR not found — is this a git repo?" >&2
  exit 1
fi

# pre-push: two-stage quality gate before CF Pages auto-deploys.
#   Stage 1 — mechanical Yandex rejection-pattern check. BLOCKING.
#   Stage 2 — 6-axis AI scorecard via Claude. BLOCKING — avg ≥ 5.0 (configurable).
# Bypass either with `git push --no-verify` (use sparingly).
cat > "$HOOKS_DIR/pre-push" <<'HOOK'
#!/usr/bin/env bash
# Pre-push: two-stage gate before Cloudflare Pages auto-deploy.
#   Stage 1: mechanical Yandex check  (Shared/skills/yandex-presubmit/check.sh --gallery)
#   Stage 2: 6-axis AI scorecard      (Gallery/scripts/pre_push_review.sh)
# Bypass entirely: `git push --no-verify`.
# Tune stage 2: REVIEW_THRESHOLD=4.5 git push   (default 5.0 — strict)
set -uo pipefail

CHECKER="/Users/timmarkin/Desktop/Agents/Shared/skills/yandex-presubmit/check.sh"
if [[ -x "$CHECKER" ]]; then
  if ! "$CHECKER" --gallery; then
    echo "" >&2
    echo "🚫 Push aborted by stage-1 Yandex pre-submit gate." >&2
    echo "   Fix violations above OR re-push with --no-verify." >&2
    exit 1
  fi
else
  echo "pre-push: $CHECKER missing — skipping stage 1" >&2
fi

REVIEW_SCRIPT="/Users/timmarkin/Desktop/Agents/Gallery/scripts/pre_push_review.sh"
if [[ -x "$REVIEW_SCRIPT" ]]; then
  if ! bash "$REVIEW_SCRIPT"; then
    echo "" >&2
    echo "🚫 Push aborted by stage-2 AI scorecard gate." >&2
    exit 1
  fi
else
  echo "pre-push: $REVIEW_SCRIPT missing — skipping stage 2" >&2
fi

exit 0
HOOK
chmod +x "$HOOKS_DIR/pre-push"

echo "✓ Installed Gallery pre-push hook → $HOOKS_DIR/pre-push"
echo "  Stage 1: mechanical Yandex pre-submit gate (BLOCKING)"
echo "  Stage 2: 6-axis AI scorecard via Claude    (BLOCKING — avg ≥ ${REVIEW_THRESHOLD:-5.0})"
echo "  Bypass: git push --no-verify        (use sparingly)"
echo "  Relax:  REVIEW_THRESHOLD=4.5 git push"

#!/usr/bin/env bash
# Install Gallery git hooks into .git/hooks/.
# Re-run after a fresh clone - .git/hooks/ isn't tracked.
#
# The pre-push hook is a TRACKED file (scripts/hooks/pre-push) so it can never
# drift from what's actually enforced - this installer just copies it into place.
# (Before 2026-06-01 the hook was an inline heredoc here that had gone stale: it
# had lost the cover-art + webp gates, and a reinstall would have silently dropped
# the new Gallery push lock too. Tracking the hook file fixes that class of bug.)
#
# Usage:
#   bash Gallery/scripts/install_hooks.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GALLERY_DIR="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$(git -C "$GALLERY_DIR" rev-parse --path-format=absolute --git-path hooks 2>/dev/null || true)"
SRC="$SCRIPT_DIR/hooks/pre-push"

if [[ -z "$HOOKS_DIR" ]]; then
  echo "✕ could not resolve git hooks dir - is $GALLERY_DIR a git repo?" >&2
  exit 1
fi
mkdir -p "$HOOKS_DIR"
if [[ ! -f "$SRC" ]]; then
  echo "✕ tracked hook source missing: $SRC" >&2
  exit 1
fi

cp "$SRC" "$HOOKS_DIR/pre-push"
chmod +x "$HOOKS_DIR/pre-push"

echo "✓ Installed Gallery pre-push hook -> $HOOKS_DIR/pre-push (from tracked scripts/hooks/pre-push)"
echo "  Stage -1:  Gallery push lock        (serialises concurrent pushes)"
echo "  Stage 0:   cover-art gate           (BLOCKING)"
echo "  Stage 0.5: thumb .webp gate         (BLOCKING)"
echo "  Stage 0.7: play-button visibility   (BLOCKING)"
echo "  Stage 0.8: KV list-op guard         (BLOCKING - new unguarded VOTES.list())"
echo "  Stage 0.9: Yandex golden regression (BLOCKING on template/gate changes)"
echo "  Stage 1:   mechanical Yandex gate   (BLOCKING for changed games; full-gallery report-only)"
echo "             Scope: YANDEX_STAGE1_SCOPE=auto|report|full, YANDEX_STAGE1_REPORT=summary|full|0"
echo "  Stage 2:   6-axis AI scorecard      (BLOCKING - avg >= ${REVIEW_THRESHOLD:-5.0})"
echo "  Bypass: git push --no-verify        (use sparingly)"
echo "  Relax:  REVIEW_THRESHOLD=4.5 git push"

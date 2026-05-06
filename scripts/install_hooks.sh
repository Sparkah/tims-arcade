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

# pre-push: run yandex-presubmit/check.sh against every Gallery game folder.
# Block push on hard violations (console.*, external CDNs, missing SDK).
cat > "$HOOKS_DIR/pre-push" <<'HOOK'
#!/usr/bin/env bash
# Pre-push: mechanical Yandex pre-submit checks against Gallery/games/N_*/.
# Bypass with `git push --no-verify`.
set -uo pipefail
CHECKER="/Users/timmarkin/Desktop/Agents/Shared/skills/yandex-presubmit/check.sh"
if [[ ! -x "$CHECKER" ]]; then
  echo "pre-push: $CHECKER missing — skipping" >&2
  exit 0
fi
if ! "$CHECKER" --gallery; then
  echo ""
  echo "🚫 Push aborted. Fix violations above or use --no-verify." >&2
  exit 1
fi
exit 0
HOOK
chmod +x "$HOOKS_DIR/pre-push"

echo "✓ Installed Gallery pre-push hook → $HOOKS_DIR/pre-push"
echo "  Tests every Gallery/games/N_*/index.html for hard Yandex rejections."
echo "  Bypass: git push --no-verify"

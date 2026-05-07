#!/usr/bin/env bash
# Pre-push review pass — invokes Claude /review against the pending diff.
#
# Advisory by default: BLOCKING-tier findings warn but don't abort the push.
# Hard-block if you want by changing $BLOCK_ON_FAIL=1 below.
#
# Bypass entirely: `git push --no-verify`.

set -uo pipefail

CLAUDE_BIN="/Users/timmarkin/.local/bin/claude"
REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKSPACE="/Users/timmarkin/Desktop/Agents"
LOG_DIR="$WORKSPACE/Shared/data/pre-push-reviews"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/review-$(basename "$REPO_ROOT")-$(date +%Y%m%d-%H%M%S).log"

BLOCK_ON_FAIL=0   # set to 1 to make P0 findings abort the push

if [[ ! -x "$CLAUDE_BIN" ]]; then
  echo "pre-push-review: claude binary not found at $CLAUDE_BIN — skipping" >&2
  exit 0
fi

# What changed since main? If we're on main itself, diff is the latest commit.
BASE_REF="origin/main"
if ! git rev-parse --quiet --verify "$BASE_REF" >/dev/null 2>&1; then
  BASE_REF="HEAD~1"
fi
DIFF="$(git diff "$BASE_REF"...HEAD 2>/dev/null || git diff HEAD~1 2>/dev/null || true)"
if [[ -z "$DIFF" ]]; then
  echo "pre-push-review: no diff vs $BASE_REF, skipping" >&2
  exit 0
fi

# Brief the model: we want a TIGHT report, not full /review prose.
# /review can be slow on big diffs; we cap the diff size and ask for terse output.
DIFF_TRUNCATED="$(printf '%s' "$DIFF" | head -c 60000)"

PROMPT="You are reviewing a git diff before push. Output ONLY a YAML block in this shape:

\`\`\`yaml
verdict: clean | nits | warn | block
findings:
  - severity: P0 | P1 | P2
    file: path:line
    issue: one-line summary
    fix: one-line recommendation
\`\`\`

P0 = will cause user-visible failure or security issue. P1 = serious bug or
regression risk. P2 = nit. If nothing critical, set verdict: clean and an
empty findings list.

Be ruthless about P0 — recent regressions in this codebase: a stray
\`getElementById('frame')\` against a dynamically-created iframe nuked play.html
chrome. Hardcoded credentials would also be P0. Things like 'this style
could be more idiomatic' are P2.

Repo root: $REPO_ROOT
Diff (truncated to 60KB):
---
$DIFF_TRUNCATED
---"

echo "" >&2
echo "🔍 pre-push: running Claude /review on diff (~$(printf '%s' "$DIFF" | wc -c) chars)..." >&2
echo "   log: $LOG" >&2

if "$CLAUDE_BIN" --print --dangerously-skip-permissions "$PROMPT" >"$LOG" 2>&1; then
  if grep -qE "verdict:\s*block" "$LOG" || grep -qE "severity:\s*P0" "$LOG"; then
    echo "" >&2
    echo "⚠️  Review surfaced P0/blocker findings:" >&2
    sed -n '/verdict:/,/^---$/p' "$LOG" | head -30 >&2
    echo "" >&2
    if [[ "$BLOCK_ON_FAIL" == "1" ]]; then
      echo "🚫 Push aborted by review. Re-push with --no-verify to bypass." >&2
      exit 1
    else
      echo "(advisory only — push continues; flip BLOCK_ON_FAIL=1 in this script to make P0 fatal)" >&2
    fi
  else
    verdict=$(grep -oE "verdict:\s*\w+" "$LOG" | head -1)
    echo "✓ pre-push review ${verdict:-clean} (full log: $LOG)" >&2
  fi
else
  echo "⚠️  Claude review failed or timed out — skipping advisory check (full log: $LOG)" >&2
fi

exit 0

#!/usr/bin/env bash
# pre_push_review.sh — 6-axis AI scorecard gate for production deploys.
#
# Runs `claude --print` against the pending diff with a strict 6-axis
# scorecard prompt (correctness, security, regression_risk, deploy_safety,
# code_health, documentation). Each axis is scored 1-5. Push is BLOCKED
# unless the AVERAGE score ≥ REVIEW_THRESHOLD (default 5.0 — strict).
#
# Configurable env vars (override per-push):
#   REVIEW_THRESHOLD   default "5.0"   — avg score required to pass
#   REVIEW_FAIL_OPEN   default "0"     — set 1 to keep pushing when the
#                                        AI itself errors (no scorecard)
#
# Examples:
#   REVIEW_THRESHOLD=4.5 git push      # relax — allow some 4s
#   REVIEW_FAIL_OPEN=1   git push      # AI down? push anyway
#   git push --no-verify               # bypass gate entirely

set -uo pipefail

CLAUDE_BIN="/Users/timmarkin/.local/bin/claude"
REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKSPACE="/Users/timmarkin/Desktop/Agents"
LOG_DIR="$WORKSPACE/Shared/data/pre-push-reviews"
mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/review-$(basename "$REPO_ROOT")-$TS.log"

THRESHOLD="${REVIEW_THRESHOLD:-5.0}"

# Pre-flight checks. Skip the gate (no-op) if the toolchain isn't available
# rather than breaking pushes — but log loudly so Tim notices.
if [[ ! -x "$CLAUDE_BIN" ]]; then
  echo "pre-push-review: claude binary not at $CLAUDE_BIN — skipping" >&2
  exit 0
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "pre-push-review: jq not in PATH — skipping (install jq for the scorecard gate)" >&2
  exit 0
fi

# Resolve diff vs upstream main.
BASE_REF="origin/main"
if ! git rev-parse --quiet --verify "$BASE_REF" >/dev/null 2>&1; then
  BASE_REF="HEAD~1"
fi
DIFF="$(git diff "$BASE_REF"...HEAD 2>/dev/null || git diff HEAD~1 2>/dev/null || true)"
if [[ -z "$DIFF" ]]; then
  echo "pre-push-review: no diff vs $BASE_REF, skipping" >&2
  exit 0
fi

DIFF_TRUNCATED="$(printf '%s' "$DIFF" | head -c 60000)"
DIFF_SIZE="$(printf '%s' "$DIFF" | wc -c | tr -d ' ')"

PROMPT="You are reviewing a git diff before push. The diff will deploy to https://game-factory.tech via Cloudflare Pages auto-deploy as soon as the push lands. Your job is a strict 6-axis scorecard.

Score EACH axis from 1 to 5 (integers only):
  - correctness     — does the diff implement the intent? logic bugs, type errors, broken control flow, missing error paths
  - security        — secrets/credentials leaked? unsanitized inputs? XSS-prone code (innerHTML with user data)? auth bypass?
  - regression_risk — does it touch shared code (gf-lib.js, style.css, app.js, index.html) in a way that could break unrelated games or pages?
  - deploy_safety   — will Cloudflare Pages build and serve this correctly? broken syntax? missing referenced files? stale imports? bad cache headers?
  - code_health     — \`console.log\` left in production? hardcoded URLs/secrets? hacks without TODO? dead code? duplicated logic?
  - documentation   — non-obvious changes have a why-comment? new shared APIs have a usage note? complex CSS rules have a brief WHY explanation?

5 = production-grade for THIS codebase's pragmatic bar (solo dev, vanilla JS, casual games gallery on CF Pages). Do NOT dock points for style nits, perfect-world ideals, or theoretical improvements — only dock for real issues a careful reviewer would flag in a PR. Boilerplate cache-busting or mechanical sync changes that are obviously safe should score 5 across the board.

OUTPUT FORMAT — JSON ONLY, no prose, no markdown fences:

{
  \"scores\": {
    \"correctness\": <1-5>,
    \"security\": <1-5>,
    \"regression_risk\": <1-5>,
    \"deploy_safety\": <1-5>,
    \"code_health\": <1-5>,
    \"documentation\": <1-5>
  },
  \"findings\": [
    {\"severity\": \"P0|P1|P2\", \"axis\": \"<axis-name>\", \"file\": \"path:line\", \"issue\": \"one line\", \"fix\": \"one line\"}
  ],
  \"summary\": \"one-line overall verdict\"
}

Findings list is for items that cost the diff points. Empty list is fine if every axis scored 5.

Repo: $REPO_ROOT
Diff (truncated to 60KB):
---
$DIFF_TRUNCATED
---"

echo "" >&2
echo "🔍 pre-push: 6-axis AI scorecard on diff (${DIFF_SIZE} chars)..." >&2
echo "   threshold: avg ≥ ${THRESHOLD} to pass" >&2
echo "   log: $LOG" >&2

RAW="$("$CLAUDE_BIN" --print --dangerously-skip-permissions "$PROMPT" 2>&1)"
echo "$RAW" > "$LOG"

# Extract the first JSON object from raw output. Claude sometimes wraps
# in ```json fences or adds preamble — be tolerant.
JSON="$(printf '%s' "$RAW" | awk '
  /^\{/    { inj=1 }
  inj      { print }
  /^\}/    { if (inj) exit }
')"

if [[ -z "$JSON" ]] || ! printf '%s' "$JSON" | jq -e . >/dev/null 2>&1; then
  echo "" >&2
  echo "pre-push-review: couldn't parse scorecard output — see $LOG" >&2
  if [[ "${REVIEW_FAIL_OPEN:-0}" == "1" ]]; then
    echo "(REVIEW_FAIL_OPEN=1 so push continues anyway)" >&2
    exit 0
  fi
  echo "🚫 push aborted. Set REVIEW_FAIL_OPEN=1 to bypass when the AI errors." >&2
  exit 1
fi

# Persist parsed JSON alongside the raw log for audit / future analytics.
echo "$JSON" > "${LOG%.log}.json"

# Pretty-print scorecard to stderr
echo "" >&2
for axis in correctness security regression_risk deploy_safety code_health documentation; do
  printf '   %-18s %s/5\n' "${axis}:" "$(jq -r ".scores.${axis}" <<<"$JSON")" >&2
done

AVG="$(jq -r '.scores | (add / length) | (. * 100 | round) / 100' <<<"$JSON")"
echo "" >&2
echo "   AVERAGE: ${AVG} / 5   (threshold ${THRESHOLD})" >&2

# Pass/block decision via awk float comparison
PASS="$(awk -v a="$AVG" -v t="$THRESHOLD" 'BEGIN { print (a + 0 >= t + 0) ? "1" : "0" }')"

# Findings
NFIND="$(jq -r '.findings | length' <<<"$JSON")"
if [[ "$NFIND" -gt 0 ]]; then
  echo "" >&2
  echo "   findings:" >&2
  jq -r '.findings[] | "     [\(.severity)] (\(.axis)) \(.file)\n       issue: \(.issue)\n       fix:   \(.fix)"' <<<"$JSON" >&2
fi

SUMMARY="$(jq -r '.summary // ""' <<<"$JSON")"
[[ -n "$SUMMARY" ]] && echo "   summary: $SUMMARY" >&2

echo "" >&2
if [[ "$PASS" == "1" ]]; then
  echo "✓ pre-push scorecard: passed (avg ${AVG} ≥ ${THRESHOLD})" >&2
  exit 0
else
  echo "🚫 pre-push scorecard: BLOCKED (avg ${AVG} < ${THRESHOLD})" >&2
  echo "   Fix the findings above OR:" >&2
  echo "     • lower the bar: REVIEW_THRESHOLD=4.5 git push" >&2
  echo "     • bypass entirely (use sparingly): git push --no-verify" >&2
  exit 1
fi

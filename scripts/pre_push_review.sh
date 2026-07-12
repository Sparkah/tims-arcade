#!/usr/bin/env bash
# pre_push_review.sh — 6-axis AI scorecard gate for production deploys.
#
# Runs a non-interactive, read-only `codex exec` against the pending diff with a strict 6-axis
# scorecard prompt (correctness, security, regression_risk, deploy_safety,
# code_health, documentation). Each axis is scored 1-5. Push is BLOCKED
# unless the AVERAGE score ≥ REVIEW_THRESHOLD (default 5.0 — strict).
#
# Configurable env vars (override per-push):
#   REVIEW_THRESHOLD   default "5.0"   — avg score required to pass
#   REVIEW_TIMEOUT_SECONDS default "420" — max seconds to wait for the
#                                        AI review command before treating
#                                        it as an AI error
#   CODEX_BIN          optional Codex CLI path (defaults to command -v codex)
#   CODEX_MODEL        optional explicit review model
#   MAX_REVIEW_CHARS   default "500000" — fail closed above this complete-diff limit
#
# Examples:
#   REVIEW_THRESHOLD=4.5 git push      # relax — allow some 4s
# AI/tooling errors fail closed: a production push must have a valid scorecard.

set -uo pipefail

CODEX_BIN="${CODEX_BIN:-$(command -v codex 2>/dev/null || true)}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKSPACE="${AGENTS_ROOT:-/Users/timmarkin/Agents}"
LOG_DIR="${REVIEW_LOG_DIR:-$WORKSPACE/Shared/data/pre-push-reviews}"
REVIEW_RULES_FILE="${CODEX_REVIEW_RULES_FILE:-$WORKSPACE/Shared/tools/vibe-relay/no-command.rules}"
mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG="$LOG_DIR/review-$(basename "$REPO_ROOT")-$TS.log"

THRESHOLD="${REVIEW_THRESHOLD:-5.0}"
TIMEOUT_SECONDS="${REVIEW_TIMEOUT_SECONDS:-420}"

# Pre-flight checks fail closed. Silently skipping this gate would turn an
# exhausted subscription or broken install into an unreviewed production deploy.
if [[ -z "$CODEX_BIN" || ! -x "$CODEX_BIN" ]]; then
  echo "pre-push-review: Codex CLI not found (set CODEX_BIN)" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "pre-push-review: jq not in PATH — cannot validate scorecard" >&2
  exit 1
fi
if [[ ! -f "$REVIEW_RULES_FILE" || -L "$REVIEW_RULES_FILE" ]]; then
  echo "pre-push-review: regular no-command rules file not found: $REVIEW_RULES_FILE" >&2
  exit 1
fi

# Fast deterministic gate for the partner entitlement, zero-charge paths,
# owner/operator build logs, queue lane isolation, stale-job recovery, and UI
# semantics. The script uses a synthetic identity unless a caller supplies an
# explicit test identity; no real allowlist email is committed.
if ! node "$REPO_ROOT/scripts/check_partner_creator.js"; then
  echo "pre-push-review: partner creator regression failed" >&2
  exit 1
fi

# Resolve diff vs upstream main.
BASE_REF="origin/main"
if ! git rev-parse --quiet --verify "$BASE_REF" >/dev/null 2>&1; then
  BASE_REF="HEAD~1"
fi
# REVIEW_WORKTREE=1 → score uncommitted working-tree changes (used by the
# on-demand /diff-review skill for mid-session review, BEFORE commit/push).
# Default (unset) → score what a push would deploy: BASE_REF...HEAD.
if [[ "${REVIEW_WORKTREE:-0}" == "1" ]]; then
  DIFF="$(git diff HEAD 2>/dev/null || true)"
  [[ -z "$DIFF" ]] && DIFF="$(git diff 2>/dev/null || true)"
  if [[ -z "$DIFF" ]]; then
    echo "pre-push-review: no uncommitted changes to review" >&2
    exit 0
  fi
else
  DIFF="$(git diff "$BASE_REF"...HEAD 2>/dev/null || git diff HEAD~1 2>/dev/null || true)"
  if [[ -z "$DIFF" ]]; then
    echo "pre-push-review: no diff vs $BASE_REF, skipping" >&2
    exit 0
  fi
fi

DIFF_SIZE="$(printf '%s' "$DIFF" | wc -c | tr -d ' ')"
MAX_REVIEW_CHARS="${MAX_REVIEW_CHARS:-500000}"
if ! [[ "$MAX_REVIEW_CHARS" =~ ^[0-9]+$ ]] || (( MAX_REVIEW_CHARS < 60000 )); then
  echo "pre-push-review: invalid MAX_REVIEW_CHARS=$MAX_REVIEW_CHARS" >&2
  exit 1
fi
if (( DIFF_SIZE > MAX_REVIEW_CHARS )); then
  echo "pre-push-review: diff is ${DIFF_SIZE} chars, above the ${MAX_REVIEW_CHARS}-char full-review limit" >&2
  echo "Split the deploy into smaller commits; this gate never truncates unreviewed files." >&2
  exit 1
fi

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
Complete diff (${DIFF_SIZE} chars; no truncation):
---
$DIFF
---"

echo "" >&2
echo "🔍 pre-push: 6-axis AI scorecard on diff (${DIFF_SIZE} chars)..." >&2
echo "   threshold: avg ≥ ${THRESHOLD} to pass" >&2
echo "   log: $LOG" >&2

if ! [[ "$TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || (( TIMEOUT_SECONDS <= 0 )); then
  echo "pre-push-review: invalid REVIEW_TIMEOUT_SECONDS=$TIMEOUT_SECONDS" >&2
  exit 1
fi

RAW=$(CODEX_BIN="$CODEX_BIN" CODEX_MODEL="${CODEX_MODEL:-}" REPO_ROOT="$REPO_ROOT" REVIEW_TIMEOUT_SECONDS="$TIMEOUT_SECONDS" REVIEW_RULES_FILE="$REVIEW_RULES_FILE" python3 /dev/fd/3 3<<'PY' <<<"$PROMPT" 2>&1
import json
import os
import shutil
import subprocess
import sys
import tempfile

codex_bin = os.environ["CODEX_BIN"]
model = os.environ.get("CODEX_MODEL", "").strip()
repo_root = os.environ["REPO_ROOT"]
prompt = sys.stdin.read()
timeout = int(os.environ["REVIEW_TIMEOUT_SECONDS"])
rules_source = os.environ["REVIEW_RULES_FILE"]

schema = {
    "type": "object",
    "additionalProperties": False,
    "required": ["scores", "findings", "summary"],
    "properties": {
        "scores": {
            "type": "object",
            "additionalProperties": False,
            "required": ["correctness", "security", "regression_risk", "deploy_safety", "code_health", "documentation"],
            "properties": {axis: {"type": "integer", "minimum": 1, "maximum": 5} for axis in [
                "correctness", "security", "regression_risk", "deploy_safety", "code_health", "documentation"
            ]},
        },
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["severity", "axis", "file", "issue", "fix"],
                "properties": {
                    "severity": {"type": "string", "enum": ["P0", "P1", "P2"]},
                    "axis": {"type": "string"},
                    "file": {"type": "string"},
                    "issue": {"type": "string"},
                    "fix": {"type": "string"},
                },
            },
        },
        "summary": {"type": "string"},
    },
}

# Keep deployment/service credentials out of the reviewer environment. Codex
# uses the caller's persistent CODEX_HOME only for CLI authentication; its HOME,
# TMP and working tree are isolated. OAuth auth is never copied because refresh
# tokens are single-use and a discarded copy eventually invalidates itself.
source_codex_home = os.environ.get("CODEX_HOME") or os.path.join(os.path.expanduser("~"), ".codex")
source_auth = os.path.join(source_codex_home, "auth.json")
if not os.path.isfile(source_auth) or os.path.islink(source_auth):
    print("pre-push-review: persistent Codex auth is unavailable", file=sys.stderr)
    sys.exit(2)
allowed_env = ("PATH", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "COLORTERM", "SSL_CERT_FILE")
child_env_base = {key: os.environ[key] for key in allowed_env if key in os.environ}

with tempfile.TemporaryDirectory(prefix="gallery-codex-review-") as tmp:
    isolated_home = os.path.join(tmp, "home")
    review_workspace = os.path.join(tmp, "workspace")
    rules_dir = os.path.join(review_workspace, ".codex", "rules")
    os.makedirs(isolated_home, mode=0o700)
    os.makedirs(rules_dir, mode=0o700)
    rules_path = os.path.join(rules_dir, "reviewer.rules")
    shutil.copyfile(rules_source, rules_path)
    os.chmod(rules_path, 0o600)
    schema_path = os.path.join(tmp, "scorecard.schema.json")
    output_path = os.path.join(tmp, "scorecard.json")
    with open(schema_path, "w", encoding="utf-8") as handle:
        json.dump(schema, handle)
    child_env = dict(child_env_base)
    child_env.update({
        "HOME": isolated_home,
        "CODEX_HOME": source_codex_home,
        "TMPDIR": tmp,
        "TMP": tmp,
        "TEMP": tmp,
        "CI": "1",
        "NO_COLOR": "1",
    })
    args = [
        codex_bin,
        "-a", "never",
        "--sandbox", "read-only",
        "-C", review_workspace,
        "-c", "sandbox_workspace_write.network_access=false",
        "-c", "web_search=\"disabled\"",
        "-c", f"projects.{json.dumps(review_workspace)}.trust_level=\"trusted\"",
        "-c", "skills.include_instructions=false",
        "-c", "skills.bundled.enabled=false",
        "--disable", "shell_tool",
        "--disable", "multi_agent",
        "--disable", "browser_use",
        "--disable", "computer_use",
        "--disable", "in_app_browser",
        "--disable", "image_generation",
        "--disable", "apps",
        "--disable", "plugins",
        "--disable", "remote_plugin",
        "--disable", "tool_suggest",
        "--disable", "skill_mcp_dependency_install",
        "--disable", "hooks",
        "exec", "--ephemeral", "--ignore-user-config",
        "--skip-git-repo-check", "--output-schema", schema_path,
        "-o", output_path, "-",
    ]
    if model:
        args.extend(["-m", model])
    try:
        result = subprocess.run(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            input=prompt,
            text=True,
            timeout=timeout,
            env=child_env,
            cwd=review_workspace,
        )
    except subprocess.TimeoutExpired as exc:
        if exc.stdout:
            sys.stdout.write(exc.stdout if isinstance(exc.stdout, str) else exc.stdout.decode("utf-8", "replace"))
        print(f"pre-push-review: Codex review timed out after {timeout}s", file=sys.stderr)
        sys.exit(124)
    if result.returncode != 0:
        sys.stdout.write(result.stdout or "")
        sys.exit(result.returncode)
    try:
        with open(output_path, "r", encoding="utf-8") as handle:
            sys.stdout.write(handle.read())
    except OSError as exc:
        print(f"pre-push-review: Codex produced no scorecard: {exc}", file=sys.stderr)
        sys.exit(2)
PY
)
REVIEW_STATUS=$?
echo "$RAW" > "$LOG"

if (( REVIEW_STATUS != 0 )); then
  echo "" >&2
  echo "pre-push-review: Codex review command failed with status $REVIEW_STATUS — see $LOG" >&2
  echo "🚫 push aborted. Restore Codex auth/tooling and run the review again." >&2
  exit 1
fi

# Extract the first JSON object. --output-schema + -o normally makes RAW pure
# JSON; the tolerant parser keeps older Codex CLI output compatible.
JSON="$(printf '%s' "$RAW" | awk '
  /^\{/    { inj=1 }
  inj      { print }
  /^\}/    { if (inj) exit }
')"

if [[ -z "$JSON" ]] || ! printf '%s' "$JSON" | jq -e . >/dev/null 2>&1; then
  echo "" >&2
  echo "pre-push-review: couldn't parse scorecard output — see $LOG" >&2
  echo "🚫 push aborted. Codex must return a valid scorecard." >&2
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
  echo "   Fix the findings above, then run the review again." >&2
  exit 1
fi

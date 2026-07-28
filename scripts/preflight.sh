#!/usr/bin/env bash
# preflight.sh — run EVERY push gate locally, non-aborting, and report all
# failures at once.
#
# Why this exists (2026-07-28): the pre-push hook runs its stages sequentially
# and aborts at the first failure, so a single ~10-minute pipeline reveals
# exactly ONE blocker. Shipping one small change cost six pushes: cover art,
# then a security assertion, then the diff ceiling, then a Yandex live-state
# artifact, then Latin text in a RU listing, then the scorecard. Each was real;
# discovering them one at a time was the waste.
#
# This runs the same gate scripts, keeps going after a failure, and prints a
# consolidated report. It does NOT weaken anything: identical checks, identical
# thresholds, just all of them and earlier.
#
# Usage:
#   bash Gallery/scripts/preflight.sh              # mechanical gates only (fast)
#   bash Gallery/scripts/preflight.sh --review     # + the 6-axis AI scorecard
#   bash Gallery/scripts/preflight.sh --game ice_sweeper   # focus one game
#   bash Gallery/scripts/preflight.sh --worktree   # also check uncommitted work
#
# Scope: by default only the games your PUSH changes (origin/main...HEAD). This
# tree accumulates sync drift across the whole catalogue, so folding in
# uncommitted changes reported 81 failing games for a push that touched one.
#
# Exit 0 = every gate passed. Exit 1 = at least one would block a push.

set -uo pipefail

GALLERY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_ROOT="${AGENTS_ROOT:-$(cd "$GALLERY_ROOT/.." && pwd)}"
WITH_REVIEW=0
WITH_WORKTREE=0
ONLY_GAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --review) WITH_REVIEW=1; shift ;;
    --worktree) WITH_WORKTREE=1; shift ;;   # also check uncommitted changes
    --game)
      # Reject a missing value instead of `shift 2`-ing past the end. With
      # errexit off, a failed `shift 2` consumes nothing and $# never reaches 0,
      # so `preflight.sh --game` spun forever instead of complaining.
      if [[ -z "${2:-}" ]]; then echo "--game needs a slug, e.g. --game ice_sweeper" >&2; exit 2; fi
      ONLY_GAME="$2"; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

RESULTS=()
FAILED=0
SUCCESS=0
# Each gate's FULL output is kept on disk. The summary shows one line per gate,
# but a one-line summary of a scorecard finding is useless for acting on it.
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gallery-preflight.XXXXXX")"

# Keep the logs when there is something to read (a failure, or an interrupted
# run); drop them when every gate passed and nobody will ever open them. Without
# this a clean run silently left a temp dir behind every time.
cleanup_logs() {
  # Only ever delete a path this script made: non-empty, and still matching the
  # mktemp template. A bare `rm -rf $VAR` is how a good day ends badly.
  if (( SUCCESS )) && [[ -n "${LOG_DIR:-}" && "$LOG_DIR" == */gallery-preflight.?????? && -d "$LOG_DIR" ]]; then
    rm -rf "$LOG_DIR"
  fi
}
trap cleanup_logs EXIT

run_gate() {
  local name="$1"; shift
  local out rc slug
  slug="$(printf '%s' "$name" | tr -cs '[:alnum:]' '-')"
  out="$("$@" 2>&1)"; rc=$?
  printf '%s\n' "$out" > "$LOG_DIR/$slug.log"
  if (( rc == 0 )); then
    RESULTS+=("PASS|$name|")
  else
    FAILED=1
    # Keep the first genuinely useful line, not the banner.
    local detail
    detail="$(printf '%s\n' "$out" | grep -viE '^\s*$' \
              | grep -iE 'HARD|FAIL|✕|✗|missing|error|above the|BLOCKED|duplicate' \
              | head -1 | cut -c1-150)"
    [[ -z "$detail" ]] && detail="$(printf '%s\n' "$out" | tail -1 | cut -c1-150)"
    RESULTS+=("FAIL|$name|$detail")
  fi
}

# A gate whose script is missing must FAIL, never quietly disappear. The old
# `[[ -f script ]] && run_gate ...` form dropped the gate from the report
# entirely when the file was renamed or absent, so the run still ended with "all
# gates clear" having never checked security, play-visibility, the KV budget or
# manifest dupes. An unverifiable gate is not a passed gate.
gate_or_fail() {
  local name="$1" script="$2"; shift 2
  if [[ ! -e "$script" ]]; then
    FAILED=1
    RESULTS+=("FAIL|$name|gate script missing: ${script#"$GALLERY_ROOT/"} — cannot verify, so not passed")
    return
  fi
  run_gate "$name" "$@"
}

echo "preflight: running every push gate locally (nothing aborts early)"
echo

# ── the mechanical gates, in hook order ──────────────────────────────────────
run_gate "stage-0    cover art" \
  env GALLERY_ROOT="$GALLERY_ROOT" AGENTS_ROOT="$AGENTS_ROOT" \
  bash "$GALLERY_ROOT/scripts/check_art.sh" --quiet

gate_or_fail "stage-0.6  security P0" "$GALLERY_ROOT/scripts/check_security_p0.js" \
  env GALLERY_ROOT="$GALLERY_ROOT" AGENTS_ROOT="$AGENTS_ROOT" \
  node "$GALLERY_ROOT/scripts/check_security_p0.js"

gate_or_fail "stage-0.7  play visible" "$GALLERY_ROOT/scripts/check_play_visible.js" \
  env GALLERY_ROOT="$GALLERY_ROOT" AGENTS_ROOT="$AGENTS_ROOT" \
  node "$GALLERY_ROOT/scripts/check_play_visible.js" --quiet

gate_or_fail "stage-0.8  KV list budget" "$GALLERY_ROOT/scripts/check_kv_list.sh" \
  bash "$GALLERY_ROOT/scripts/check_kv_list.sh"

gate_or_fail "stage-0.85 manifest dupes" "$GALLERY_ROOT/scripts/check_manifest_dupes.sh" \
  bash "$GALLERY_ROOT/scripts/check_manifest_dupes.sh"

# ── stage 1: Yandex presubmit on the games this push actually changes ────────
# The hook resolves a gallery slug to its SOURCE dir via games.source.json,
# because status.json and the promo/rejection artifacts live there.
CHANGED_SLUGS=()
if [[ -n "$ONLY_GAME" ]]; then
  CHANGED_SLUGS=("$ONLY_GAME")
else
  # Scope = what the PUSH would carry (origin/main...HEAD). Folding in the dirty
  # working tree scanned 81 games when the push touched 1: this tree accumulates
  # sync drift across the whole catalogue, so most of those "failures" were for
  # games not being pushed at all. Chasing phantom blockers is worse than no
  # tool. --worktree opts back in for a pre-commit check.
  # Resolve the base ref BEFORE diffing against it. `git diff origin/main...HEAD`
  # with an unresolvable ref fails, and with stderr suppressed that failure looks
  # exactly like "no games changed": scope comes back empty, every Yandex check
  # is skipped, and the run still ends with "all gates clear". A stale clone or a
  # remote named anything but origin would silently disarm the whole tool, so
  # this is a hard stop rather than a warning.
  BASE_REF="${BASE_REF:-origin/main}"
  if ! git -C "$GALLERY_ROOT" rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null 2>&1; then
    echo "preflight: cannot resolve '$BASE_REF' — scope would be empty and every" >&2
    echo "           per-game gate silently skipped. Run: git fetch origin" >&2
    echo "           (override with BASE_REF=<ref> if your remote differs)" >&2
    exit 2
  fi

  # Every git call here is captured with its exit status checked. Piping them
  # straight into the read loop threw the status away: a `diff` that failed (a
  # shallow clone has no merge base, so `A...HEAD` errors outright) produced no
  # output, which is indistinguishable from "no games changed" — scope came back
  # empty, every per-game gate was skipped, and the run reported success.
  # Verifying that BASE_REF *resolves* was not enough; the diff itself must work.
  scope_fatal() {
    echo "preflight: could not compute the push range — refusing to continue." >&2
    echo "           $1" >&2
    echo "           git: $(printf '%s' "$2" | head -2 | tr '\n' ' ')" >&2
    echo "           An empty scope silently skips every per-game gate, so this" >&2
    echo "           is fatal rather than a warning. A shallow clone has no merge" >&2
    echo "           base: git fetch --unshallow origin" >&2
    exit 2
  }

  scope_raw=""
  if ! scope_raw="$(git -C "$GALLERY_ROOT" diff --name-only "$BASE_REF...HEAD" 2>&1)"; then
    scope_fatal "diff $BASE_REF...HEAD failed" "$scope_raw"
  fi
  if (( WITH_WORKTREE )); then
    # `diff HEAD` lists only TRACKED edits, so a brand-new game — every file
    # untracked — scoped to nothing and the tool reported "all gates clear" for a
    # game it never opened. ls-files --others covers what git has never seen.
    if ! wt_raw="$(git -C "$GALLERY_ROOT" diff --name-only HEAD 2>&1)"; then
      scope_fatal "diff HEAD (worktree) failed" "$wt_raw"
    fi
    if ! un_raw="$(git -C "$GALLERY_ROOT" ls-files --others --exclude-standard 2>&1)"; then
      scope_fatal "ls-files --others failed" "$un_raw"
    fi
    scope_raw="$scope_raw"$'\n'"$wt_raw"$'\n'"$un_raw"
  fi

  while IFS= read -r s; do [[ -n "$s" ]] && CHANGED_SLUGS+=("$s"); done < <(
    printf '%s\n' "$scope_raw" | awk -F/ '$1=="games" && $2!="" {print $2}' | sort -u
  )
fi

CHECKER="$AGENTS_ROOT/Shared/skills/yandex-presubmit/check.sh"
if (( ${#CHANGED_SLUGS[@]} == 0 )); then
  RESULTS+=("SKIP|stage-1    Yandex (no changed games)|")
elif [[ ! -e "$CHECKER" ]]; then
  # Was a SKIP, which still allowed exit 0 and "all gates clear" — the push gate
  # most likely to catch a moderation rejection reported as merely absent.
  FAILED=1
  RESULTS+=("FAIL|stage-1    yandex|checker missing: $CHECKER — cannot verify ${#CHANGED_SLUGS[@]} changed game(s)")
else
  for slug in "${CHANGED_SLUGS[@]}"; do
    src_rel="$(python3 - "$GALLERY_ROOT" "$slug" <<'PY' 2>/dev/null
import json, sys
root, slug = sys.argv[1], sys.argv[2]
for g in json.load(open(f"{root}/games.source.json")):
    if g.get("slug") == slug:
        print((g.get("gameDir") or "").rstrip("/")); break
PY
)"
    # Check the SOURCE dir: that is where the presubmit inputs live (promo text,
    # YANDEX_REJECTIONS.live.json). Checking the published payload reports a
    # missing live-rejection artifact for every game holding an appId.
    #
    # Only build that path when the lookup actually returned something. An empty
    # src_rel made "$AGENTS_ROOT/$src_rel" collapse to AGENTS_ROOT itself, which
    # IS a directory - so the -d fallback never fired and the checker was aimed
    # at the entire workspace instead of one game.
    target=""
    if [[ -n "$src_rel" && -d "$AGENTS_ROOT/$src_rel" ]]; then
      target="$AGENTS_ROOT/$src_rel"
    elif [[ -d "$GALLERY_ROOT/games/$slug" ]]; then
      target="$GALLERY_ROOT/games/$slug"          # published copy: still a real check
    fi
    if [[ -z "$target" ]]; then
      FAILED=1
      RESULTS+=("FAIL|stage-1    yandex: $slug|unknown slug — not in games.source.json and no games/$slug")
      continue
    fi
    run_gate "stage-1    yandex: $slug" bash "$CHECKER" "$target"
  done
fi

# ── stage 2: the AI scorecard. Expensive, and the one that catches real bugs ──
# It runs LAST in the hook, so every mechanical failure above delays learning
# about correctness problems. Locally it can run first-class, before any push.
if (( WITH_REVIEW )); then
  echo "  running the 6-axis scorecard (this takes a few minutes)..."
  run_gate "stage-2    AI scorecard" bash "$GALLERY_ROOT/scripts/pre_push_review.sh"
else
  RESULTS+=("SKIP|stage-2    AI scorecard (pass --review)|")
fi

# ── report ───────────────────────────────────────────────────────────────────
echo
printf '  %-34s %s\n' "GATE" "RESULT"
printf '  %-34s %s\n' "──────────────────────────────────" "──────"
for r in "${RESULTS[@]}"; do
  IFS='|' read -r status name detail <<< "$r"
  case "$status" in
    PASS) printf '  %-34s ✓\n' "$name" ;;
    SKIP) printf '  %-34s –\n' "$name" ;;
    FAIL) printf '  %-34s ✗  %s\n' "$name" "$detail" ;;
  esac
done
echo

if (( FAILED )); then
  echo "preflight: at least one gate would BLOCK the push. Fix all of the above, then re-run."
  echo "           full output per gate: $LOG_DIR"
  exit 1
fi
echo "preflight: all gates clear."
[[ $WITH_REVIEW -eq 0 ]] && echo "           (scorecard not run — use --review before a real push)"
SUCCESS=1          # nothing to read in the logs; the EXIT trap drops them
exit 0

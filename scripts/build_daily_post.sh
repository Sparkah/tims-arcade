#!/usr/bin/env bash
# Build the daily-batch Telegram post DETERMINISTICALLY from
# Gallery/games.source.json + a list of iteration metadata, and
# verify every URL returns 200 BEFORE printing the message.
#
# Why this exists: 2026-05-08 the leader skill prose-substituted slugs
# from build-agent reports and produced "echolocator" instead of
# "echo_locator". Two broken Telegram posts went out with 404 links.
# Never again — slugs come from the canonical manifest (games.source.json)
# and every URL is curl-checked before the post body is emitted.
#
# Usage:
#   bash Gallery/scripts/build_daily_post.sh \
#     --new "echo_locator,gravity_mailman,forge_heir" \
#     --new-hooks "<hook1>|<hook2>|<hook3>" \
#     --iter "clean_sweep:daily leaderboard|daily_dodge:skin unlocks|tire_escape:live BEST pip" \
#     --photo /path/to/cover.png
#
# Behaviour:
#   - ABORTS if any URL doesn't return 200. Won't print, won't post.
#   - Looks up titles from games.source.json (so spelling matches).
#   - Outputs the post body to stdout. Pipe to notify.sh --public.
#
# Separator notes (2026-05-20 fix):
#   --new        comma-delimited slugs ([a-z0-9_-] regex safe)
#   --new-hooks  pipe-delimited hooks (hook text may contain commas)
#   --iter       PIPE-delimited pairs `slug:feature|slug:feature|...`
#                Changed from comma: an iteration feature like
#                "golden sprinkles (+3s, x5 combo)" contains a comma and
#                broke the comma-split parser, causing the 2026-05-20
#                public-post abort. A NO-pipe string is a SINGLE pair and is
#                NOT comma-split (2026-06-01 fix): under the 1-new+1-iteration
#                run shape every run has exactly one pair / no pipe, and the
#                old comma fallback shredded its feature commas into bogus
#                slugs and aborted EVERY iteration post.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE_JSON="$ROOT/Gallery/games.source.json"
SITE="https://game-factory.tech"

NEW_SLUGS=""
NEW_HOOKS=""
ITER_PAIRS=""
PHOTO=""
DRY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --new)         NEW_SLUGS="$2"; shift 2 ;;
    --new-hooks)   NEW_HOOKS="$2"; shift 2 ;;
    --iter)        ITER_PAIRS="$2"; shift 2 ;;
    --photo)       PHOTO="$2"; shift 2 ;;
    --dry-run)     DRY=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ ! -f "$SOURCE_JSON" ]]; then
  echo "❌ $SOURCE_JSON not found" >&2; exit 2
fi

# ── helpers ────────────────────────────────────────────────────────────────
title_for() {
  local slug="$1"
  jq -r --arg s "$slug" '.[] | select(.slug == $s) | .title' "$SOURCE_JSON"
}
verify_url() {
  local slug="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$SITE/p/$slug")
  if [[ "$code" != "200" ]]; then
    echo "❌ /p/$slug returned $code — refusing to publish broken link" >&2
    return 1
  fi
  return 0
}

DATE=$(date -u +%Y-%m-%d)
MSG_LINES=("🎮 Fresh on Tim's Game Lab — $DATE" "")
ANY_NEW=0; ANY_ITER=0
ABORT=0

# ── new section ────────────────────────────────────────────────────────────
if [[ -n "$NEW_SLUGS" ]]; then
  IFS=',' read -ra new_arr <<< "$NEW_SLUGS"
  IFS='|' read -ra hook_arr <<< "${NEW_HOOKS:-}"
  if [[ ${#new_arr[@]} -gt 0 ]]; then
    MSG_LINES+=("✨ NEW (${#new_arr[@]}):")
    for i in "${!new_arr[@]}"; do
      slug="${new_arr[$i]}"
      title=$(title_for "$slug")
      hook="${hook_arr[$i]:-}"
      if [[ -z "$title" ]]; then
        echo "❌ slug '$slug' not found in games.source.json — refusing to publish" >&2
        ABORT=1; continue
      fi
      verify_url "$slug" || ABORT=1
      if [[ -n "$hook" ]]; then
        MSG_LINES+=("  • $title — $hook → $SITE/p/$slug")
      else
        MSG_LINES+=("  • $title → $SITE/p/$slug")
      fi
      ANY_NEW=1
    done
    MSG_LINES+=("")
  fi
fi

# ── iteration section ──────────────────────────────────────────────────────
if [[ -n "$ITER_PAIRS" ]]; then
  # Pairs are pipe-delimited (a feature text routinely contains commas, e.g.
  # "a streak, idle rewards, and a mission"). With >1 iteration there's a pipe;
  # with exactly ONE iteration there is none, so a NO-pipe string is a SINGLE
  # pair and must NOT be comma-split. The old comma fallback shredded every
  # one-iteration feature into bogus slugs and ABORTED the post on EVERY run
  # once the shape became 1-new+1-iteration (Tim 2026-06-01). finalize_run.sh
  # is the only caller and always pipe-joins, so nothing relies on comma-split.
  if [[ "$ITER_PAIRS" == *"|"* ]]; then
    IFS='|' read -ra iter_arr <<< "$ITER_PAIRS"
  else
    iter_arr=("$ITER_PAIRS")
  fi
  if [[ ${#iter_arr[@]} -gt 0 ]]; then
    MSG_LINES+=("🔧 UPDATED (${#iter_arr[@]}):")
    for pair in "${iter_arr[@]}"; do
      slug="${pair%%:*}"
      change="${pair#*:}"
      title=$(title_for "$slug")
      if [[ -z "$title" ]]; then
        echo "❌ iter slug '$slug' not in games.source.json" >&2
        ABORT=1; continue
      fi
      verify_url "$slug" || ABORT=1
      MSG_LINES+=("  • $title — $change → $SITE/p/$slug")
      ANY_ITER=1
    done
  fi
fi

if [[ $ANY_NEW -eq 0 && $ANY_ITER -eq 0 ]]; then
  echo "(nothing to post)" >&2
  exit 1
fi

if [[ $ABORT -eq 1 ]]; then
  echo "❌ at least one URL failed verification or slug missing — POST ABORTED" >&2
  exit 1
fi

printf '%s\n' "${MSG_LINES[@]}"
exit 0

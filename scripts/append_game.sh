#!/usr/bin/env bash
# Idempotently add (or update) a game entry in Gallery/games.source.json.
# Game-factory invokes this after building a game; sync_games.sh is then
# called separately to materialise files into Gallery/games/ and Gallery/thumbs/.
#
# Usage:
#   bash append_game.sh \
#     --slug clean_sweep \
#     --game-dir Games/17_clean_sweep \
#     --title "Clean Sweep Donut" \
#     --hook  "Roll a sprinkled donut through dirty rooms..." \
#     [--unpublished]   # default: published=true
#     [--allow-dup]     # override the mechanic-dedup block (intentional clone/replace)
#
# Behaviour:
#   - If a game with the same slug already exists, the entry is REPLACED
#     (so re-running for the same slug is safe).
#   - Otherwise the entry is appended to the end of the array.
#   - addedDate is set to today's date in YYYY-MM-DD.

set -euo pipefail

SLUG="" GAME_DIR="" TITLE="" TITLE_RU="" HOOK="" HOOK_RU="" GENRE="other" PUBLISHED="true" ALLOW_DUP="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)        SLUG="$2"; shift 2 ;;
    --game-dir)    GAME_DIR="$2"; shift 2 ;;
    --title)       TITLE="$2"; shift 2 ;;
    --title-ru)    TITLE_RU="$2"; shift 2 ;;
    --hook)        HOOK="$2"; shift 2 ;;
    --hook-ru)     HOOK_RU="$2"; shift 2 ;;
    --genre)       GENRE="$2"; shift 2 ;;
    --unpublished) PUBLISHED="false"; shift ;;
    --allow-dup)   ALLOW_DUP="true"; shift ;;
    -h|--help)
      sed -n '2,21p' "$0"; exit 0 ;;
    *)
      echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$SLUG" || -z "$GAME_DIR" || -z "$TITLE" || -z "$HOOK" ]]; then
  echo "Error: --slug --game-dir --title --hook are all required."
  echo "Optional: --title-ru --hook-ru --genre <cleaning|arcade|puzzle|dodge|multiplayer|other>"
  exit 1
fi

# Default RU fields to EN if not provided — sync will fall back to EN anyway,
# but keeping the field present makes the source file self-documenting.
[[ -z "$TITLE_RU" ]] && TITLE_RU="$TITLE"
[[ -z "$HOOK_RU" ]] && HOOK_RU="$HOOK"

if ! command -v jq >/dev/null; then
  echo "Error: jq is required. Install with: brew install jq"
  exit 1
fi

GALLERY="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$GALLERY/games.source.json"

if [[ ! -f "$SRC" ]]; then
  # Initialise empty array if file missing
  echo "[]" > "$SRC"
fi

ADDED_DATE="$(date +%Y-%m-%d)"

# ── Mechanic-dedup gate (2026-06-13 incident) ─────────────────────────────────
# The announce ledger dedupes by SLUG, so two DIFFERENT-slug games with the SAME
# mechanic both get announced (gem_cases + critter_crates, bolt_out + bolt_rescue).
# Catch a NEW slug that clones an existing PUBLISHED mechanic HERE, the chokepoint
# where a game first enters the catalog. Only checks NEW slugs (re-appending an
# existing slug is an update -> skip). Non-fatal if the checker is missing.
DEDUPE="$GALLERY/../Shared/skills/game-factory/tools/dedupe_check.py"
IS_NEW_SLUG=$(jq --arg s "$SLUG" 'any(.[]; .slug == $s) | not' "$SRC")
if [[ "$ALLOW_DUP" != "true" && "$IS_NEW_SLUG" == "true" && -f "$DEDUPE" ]] && command -v python3 >/dev/null; then
  set +e
  DEDUPE_OUT=$(python3 "$DEDUPE" --slug "$SLUG" --title "$TITLE" --hook "$HOOK" --genre "$GENRE" 2>/dev/null)
  DEDUPE_RC=$?
  set -e
  if [[ $DEDUPE_RC -eq 2 ]]; then
    echo "$DEDUPE_OUT"
    echo ""
    echo "❌ BLOCKED: \"$TITLE\" ($SLUG) duplicates a PUBLISHED game's mechanic (above)."
    echo "   We already have it on the gallery and likely already announced it; a second"
    echo "   clone double-announces the same game to subscribers (2026-06-13 incident)."
    echo "   Intentional replacement/iteration? re-run with --allow-dup to override."
    exit 3
  elif [[ $DEDUPE_RC -eq 1 ]]; then
    echo "$DEDUPE_OUT"
    echo "⚠ WARNING: possible mechanic overlap (above) — eyeball it; proceeding."
  fi
fi

NEW_ENTRY=$(jq -n \
  --arg slug      "$SLUG" \
  --arg gd        "$GAME_DIR" \
  --arg title     "$TITLE" \
  --arg title_ru  "$TITLE_RU" \
  --arg hook      "$HOOK" \
  --arg hook_ru   "$HOOK_RU" \
  --arg genre     "$GENRE" \
  --arg date      "$ADDED_DATE" \
  --argjson pub   "$PUBLISHED" \
  '{slug:$slug, gameDir:$gd, title:$title, title_ru:$title_ru, hook:$hook, hook_ru:$hook_ru, genre:$genre, addedDate:$date, published:$pub}')

TMP="$(mktemp)"
jq --argjson new "$NEW_ENTRY" \
  'if any(.[]; .slug == $new.slug)
   then map(if .slug == $new.slug then $new else . end)
   else . + [$new]
   end' \
  "$SRC" > "$TMP" && mv "$TMP" "$SRC"

# Detect whether this was an add or update (based on count change)
COUNT=$(jq 'length' "$SRC")
echo "✓ slug=$SLUG written to $SRC (total games: $COUNT)"

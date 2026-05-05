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
#
# Behaviour:
#   - If a game with the same slug already exists, the entry is REPLACED
#     (so re-running for the same slug is safe).
#   - Otherwise the entry is appended to the end of the array.
#   - addedDate is set to today's date in YYYY-MM-DD.

set -euo pipefail

SLUG="" GAME_DIR="" TITLE="" HOOK="" PUBLISHED="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)        SLUG="$2"; shift 2 ;;
    --game-dir)    GAME_DIR="$2"; shift 2 ;;
    --title)       TITLE="$2"; shift 2 ;;
    --hook)        HOOK="$2"; shift 2 ;;
    --unpublished) PUBLISHED="false"; shift ;;
    -h|--help)
      sed -n '2,21p' "$0"; exit 0 ;;
    *)
      echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$SLUG" || -z "$GAME_DIR" || -z "$TITLE" || -z "$HOOK" ]]; then
  echo "Error: --slug --game-dir --title --hook are all required."
  exit 1
fi

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

NEW_ENTRY=$(jq -n \
  --arg slug   "$SLUG" \
  --arg gd     "$GAME_DIR" \
  --arg title  "$TITLE" \
  --arg hook   "$HOOK" \
  --arg date   "$ADDED_DATE" \
  --argjson pub "$PUBLISHED" \
  '{slug:$slug, gameDir:$gd, title:$title, hook:$hook, addedDate:$date, published:$pub}')

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

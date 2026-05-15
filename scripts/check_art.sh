#!/usr/bin/env bash
# Hard gate: every game in Gallery/games.source.json MUST have shippable
# cover art before a push is allowed.
#
# Requirements per published game:
#   1. <gameDir>/yandex_promo/cover_800x470.png      (Yandex Console cover)
#   2. <gameDir>/yandex_promo/icon_512x512.png       (Yandex Console icon)
#   3. Gallery/thumbs/<slug>.png                      (gallery card thumb)
#   4. Each of the above non-empty + a real PNG (sniff magic bytes)
#
# Tim's standing rule (2026-05-15) — multiple games shipped to the gallery
# without art, leaving broken-image glyphs on cards. Production-grade or
# nothing.
#
# Usage:
#   bash Gallery/scripts/check_art.sh            # fails non-zero on any miss
#   bash Gallery/scripts/check_art.sh --quiet    # only fail output
#   bash Gallery/scripts/check_art.sh --slug X   # check one game

set -uo pipefail

ROOT="/Users/timmarkin/Desktop/Agents"
SOURCE_JSON="$ROOT/Gallery/games.source.json"
THUMBS_DIR="$ROOT/Gallery/thumbs"

QUIET=0
FILTER_SLUG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quiet) QUIET=1; shift ;;
    --slug)  FILTER_SLUG="$2"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

[[ ! -f "$SOURCE_JSON" ]] && { echo "✕ missing $SOURCE_JSON"; exit 2; }

# Magic-byte sniff: file must be a real PNG / JPEG / WebP and at least 200
# bytes (rejects 0-byte placeholders + corrupted writes). Some games store
# JPEG content with a .png extension; that's fine for display, so allow it.
is_real_png() {
  local f="$1"
  [[ ! -f "$f" ]] && return 1
  local sz=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
  [[ "$sz" -lt 200 ]] && return 1
  local head=$(xxd -l 12 -p "$f" 2>/dev/null)
  # PNG = 89504e470d0a1a0a; JPEG = ffd8ff*; WebP = 52494646 ... 57454250 (RIFF + WEBP).
  case "$head" in
    89504e470d0a1a0a*) return 0 ;;
    ffd8ff*)           return 0 ;;
    52494646*57454250*) return 0 ;;
  esac
  # Fallback: accept any WebP whose RIFF magic is followed by WEBP at offset 8.
  local riff=$(xxd -l 4 -p "$f" 2>/dev/null)
  local fmt=$(xxd -s 8 -l 4 -p "$f" 2>/dev/null)
  [[ "$riff" == "52494646" && "$fmt" == "57454250" ]]
}

# Return the first existing real PNG from a list of candidate paths, or
# empty string if none. Used so games using flat (`cover_800x470.png`) AND
# per-language layouts (`en/cover_800x470.png`) both pass.
first_real_png() {
  for f in "$@"; do
    is_real_png "$f" && { echo "$f"; return 0; }
  done
  return 1
}

fail=0
total=0
total_failed=0

while IFS=$'\t' read -r slug gameDir published; do
  [[ "$published" == "false" ]] && continue  # unpublished games are exempt
  [[ -n "$FILTER_SLUG" && "$slug" != "$FILTER_SLUG" ]] && continue
  total=$((total + 1))

  game_root="$ROOT/$gameDir"
  # Two layouts: flat (yandex_promo/cover_800x470.png) and per-language
  # (yandex_promo/en/cover_800x470.png). Accept either.
  cover=$(first_real_png \
    "$game_root/yandex_promo/cover_800x470.png" \
    "$game_root/yandex_promo/en/cover_800x470.png" \
    "$game_root/yandex_promo/ru/cover_800x470.png" || true)
  icon=$(first_real_png \
    "$game_root/yandex_promo/icon_512x512.png" \
    "$game_root/yandex_promo/en/icon_512x512.png" \
    "$game_root/yandex_promo/ru/icon_512x512.png"  || true)
  thumb="$THUMBS_DIR/$slug.png"

  miss=()
  [[ -z "$cover" ]] && miss+=("cover_800x470.png missing or empty under $game_root/yandex_promo/[en|ru]/")
  [[ -z "$icon"  ]] && miss+=("icon_512x512.png missing or empty under $game_root/yandex_promo/[en|ru]/")
  is_real_png "$thumb" || miss+=("gallery thumb missing or empty: $thumb")

  if [[ ${#miss[@]} -gt 0 ]]; then
    fail=1
    total_failed=$((total_failed + 1))
    echo "✕ $slug"
    for m in "${miss[@]}"; do echo "    $m"; done
  elif [[ $QUIET -eq 0 ]]; then
    echo "✓ $slug"
  fi
done < <(
  python3 -c "
import json
data = json.load(open('$SOURCE_JSON'))
games = data.get('games', data) if isinstance(data, dict) else data
for g in games:
    slug = g.get('slug', '')
    gd = g.get('gameDir', '')
    pub = 'false' if g.get('published') is False else 'true'
    if slug and gd:
        print(f'{slug}\t{gd}\t{pub}')
"
)

echo ""
if [[ $fail -eq 0 ]]; then
  echo "✓ Cover-art gate: all $total published games have shippable art."
  exit 0
else
  echo "✕ Cover-art gate: $total_failed of $total games failed."
  echo ""
  echo "To fix:"
  echo "  bash Shared/skills/game-factory/tools/gen_cover.sh \\"
  echo "    --game-dir Games/<N>_<slug> \\"
  echo "    --title <title> --hook <hook>"
  echo "  node Shared/skills/game-factory/tools/take_screenshots.js Games/<N>_<slug>"
  echo "  bash Gallery/scripts/sync_games.sh"
  echo ""
  echo "Or bypass once (NOT recommended) with: git push --no-verify"
  exit 1
fi

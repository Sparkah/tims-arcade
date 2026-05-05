#!/usr/bin/env bash
# Sync Games/N_slug/ folders into Gallery/ for Cloudflare Pages deploy.
#
# Reads metadata from Gallery/games.source.json (the canonical list maintained
# by hand or by the game-factory skill). For each entry:
#   - copies <gameDir>/index.html → Gallery/games/<slug>/index.html
#   - copies <gameDir>/yandex_promo/desktop_en_1.png → Gallery/thumbs/<slug>.png
#   - copies any local assets folder (fonts/, sounds/, data/, images/) into Gallery/games/<slug>/
#
# Then writes Gallery/games.json (the public manifest the site reads).
#
# Usage: bash Gallery/scripts/sync_games.sh

set -euo pipefail

ROOT="/Users/timmarkin/Desktop/Agents"
GALLERY="$ROOT/Gallery"
SRC="$GALLERY/games.source.json"
OUT_GAMES="$GALLERY/games"
OUT_THUMBS="$GALLERY/thumbs"
OUT_MANIFEST="$GALLERY/games.json"

if [[ ! -f "$SRC" ]]; then
  echo "Error: $SRC not found. Create it first (see games.source.json template)."
  exit 1
fi

mkdir -p "$OUT_GAMES" "$OUT_THUMBS"

# We need jq for clean JSON manipulation
if ! command -v jq >/dev/null; then
  echo "Error: jq is required. Install with: brew install jq"
  exit 1
fi

# Iterate entries
COUNT=$(jq 'length' "$SRC")
echo "Syncing $COUNT games from $SRC..."

for ((i = 0; i < COUNT; i++)); do
  SLUG=$(jq -r ".[$i].slug"     "$SRC")
  DIR=$(jq -r  ".[$i].gameDir"  "$SRC")
  PUB=$(jq -r  ".[$i].published // true" "$SRC")

  GAME_DIR="$ROOT/$DIR"
  if [[ ! -d "$GAME_DIR" ]]; then
    echo "  ⚠ skip $SLUG — $GAME_DIR not found"
    continue
  fi

  # Copy index.html
  mkdir -p "$OUT_GAMES/$SLUG"
  cp "$GAME_DIR/index.html" "$OUT_GAMES/$SLUG/index.html"

  # Copy optional asset folders if they exist
  for sub in fonts sounds data images assets; do
    [[ -d "$GAME_DIR/$sub" ]] && cp -R "$GAME_DIR/$sub" "$OUT_GAMES/$SLUG/"
  done

  # Copy thumbnail (use desktop_en_1.png; fallback to desktop_ru_1.png)
  THUMB=""
  for cand in desktop_en_1.png desktop_ru_1.png mobile_en_1.png; do
    if [[ -f "$GAME_DIR/yandex_promo/$cand" ]]; then THUMB="$GAME_DIR/yandex_promo/$cand"; break; fi
  done
  if [[ -n "$THUMB" ]]; then
    cp "$THUMB" "$OUT_THUMBS/$SLUG.png"
  else
    echo "  ⚠ $SLUG has no thumbnail"
  fi

  echo "  ✓ $SLUG (published=$PUB)"
done

# Build games.json from games.source.json (drop gameDir, add what the site needs)
jq 'map({slug, title, hook, addedDate, published: (.published // true)})' "$SRC" > "$OUT_MANIFEST"

# Total file size summary
TOTAL_SIZE=$(du -sh "$GALLERY" | awk '{print $1}')
echo ""
echo "Done. Manifest: $OUT_MANIFEST"
echo "Total Gallery/ size: $TOTAL_SIZE"

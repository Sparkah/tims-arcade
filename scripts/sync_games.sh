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

mkdir -p "$OUT_GAMES" "$OUT_THUMBS" "$GALLERY/previews"

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

  # Copy index.html. If the source uses the multi-platform placeholder
  # (<!-- PLATFORM_SDK -->), substitute the gallery's SDK stub so the game
  # boots inside the iframe without hitting Yandex's real /sdk.js.
  mkdir -p "$OUT_GAMES/$SLUG"
  if grep -q '<!-- PLATFORM_SDK -->' "$GAME_DIR/index.html"; then
    sed 's|<!-- PLATFORM_SDK -->|<script src="/sdk.js"></script>|' \
      "$GAME_DIR/index.html" > "$OUT_GAMES/$SLUG/index.html"
  else
    cp "$GAME_DIR/index.html" "$OUT_GAMES/$SLUG/index.html"
  fi

  # Copy optional asset folders if they exist
  for sub in fonts sounds data images assets sprites; do
    [[ -d "$GAME_DIR/$sub" ]] && cp -R "$GAME_DIR/$sub" "$OUT_GAMES/$SLUG/"
  done

  # Copy optional sibling files used by the game-factory framework
  for sibling in gf-lib.js; do
    [[ -f "$GAME_DIR/$sibling" ]] && cp "$GAME_DIR/$sibling" "$OUT_GAMES/$SLUG/$sibling"
  done

  # Copy thumbnail. Two layouts supported:
  #   1. Flat:        yandex_promo/desktop_en_1.png
  #   2. Per-language: yandex_promo/en/desktop_1.png  (used by 10_running_away)
  THUMB=""
  for cand in \
    desktop_en_1.png desktop_ru_1.png mobile_en_1.png \
    en/desktop_1.png ru/desktop_1.png en/mobile_1.png; do
    if [[ -f "$GAME_DIR/yandex_promo/$cand" ]]; then THUMB="$GAME_DIR/yandex_promo/$cand"; break; fi
  done
  if [[ -n "$THUMB" ]]; then
    cp "$THUMB" "$OUT_THUMBS/$SLUG.png"
  else
    echo "  ⚠ $SLUG has no thumbnail"
  fi

  # Thumb variants for A/B testing — <gameDir>/thumb_variants/v2.png, v3.png, …
  # Default thumb (above) is variant v1. Sync writes them as <slug>__v2.png, __v3.png, …
  THUMB_COUNT=1
  rm -f "$OUT_THUMBS/${SLUG}__v"*.png 2>/dev/null
  if [[ -d "$GAME_DIR/thumb_variants" ]]; then
    for vfile in "$GAME_DIR/thumb_variants"/v*.png; do
      [[ -f "$vfile" ]] || continue
      VNAME=$(basename "$vfile" .png)   # e.g. v2
      cp "$vfile" "$OUT_THUMBS/${SLUG}__${VNAME}.png"
      THUMB_COUNT=$((THUMB_COUNT + 1))
    done
  fi

  # Preview video (3s gameplay loop) — produced by record_preview.js
  HAS_PREVIEW=false
  if [[ -f "$GAME_DIR/preview.webm" ]]; then
    cp "$GAME_DIR/preview.webm" "$GALLERY/previews/$SLUG.webm"
    HAS_PREVIEW=true
  else
    rm -f "$GALLERY/previews/$SLUG.webm" 2>/dev/null
  fi

  # Stash counts for manifest enrichment below
  echo "$SLUG $THUMB_COUNT $HAS_PREVIEW" >> "$GALLERY/.sync.tmp"

  echo "  ✓ $SLUG (published=$PUB, thumbCount=$THUMB_COUNT, preview=$HAS_PREVIEW)"
done

# Build games.json from games.source.json — enrich with thumbCount + hasPreview
TMP_META="$GALLERY/.sync.tmp"
META_JSON=$(awk '{ printf "\"%s\":{\"thumbCount\":%s,\"hasPreview\":%s},", $1, $2, $3 }' "$TMP_META" \
  | sed 's/,$//' | awk '{ print "{" $0 "}" }')
rm -f "$TMP_META"

jq --argjson meta "$META_JSON" '
  map({
    slug,
    title,
    title_ru: (.title_ru // .title),
    title_es: .title_es,
    title_pt: .title_pt,
    title_tr: .title_tr,
    title_ar: .title_ar,
    hook,
    hook_ru: (.hook_ru // .hook),
    hook_es: .hook_es,
    hook_pt: .hook_pt,
    hook_tr: .hook_tr,
    hook_ar: .hook_ar,
    genre: (.genre // "other"),
    addedDate,
    published: (.published // true),
    num: (.gameDir | capture("/(?<n>[0-9]+)_") | .n // ""),
    thumbCount: ($meta[.slug].thumbCount // 1),
    hasPreview: ($meta[.slug].hasPreview // false)
  })
' "$SRC" > "$OUT_MANIFEST"

# ── sitemap.xml + rss.xml + robots.txt ──────────────────────────────────────
# Generated at sync-time so they're static (cached by CF edge, instant serve).

SITE="https://game-factory.tech"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# robots.txt — let everyone in, point at sitemap
cat > "$GALLERY/robots.txt" <<EOF
User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /api/

Sitemap: $SITE/sitemap.xml
EOF

# sitemap.xml — index + per-game share pages
{
  printf '<?xml version="1.0" encoding="UTF-8"?>\n'
  printf '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  printf '  <url><loc>%s/</loc><lastmod>%s</lastmod><priority>1.0</priority></url>\n' "$SITE" "$NOW"
  jq -r --arg site "$SITE" \
    '.[] | select(.published != false) |
      "  <url><loc>" + $site + "/p/" + .slug + "</loc><lastmod>" + .addedDate + "T00:00:00Z</lastmod><priority>0.8</priority></url>"' \
    "$OUT_MANIFEST"
  printf '</urlset>\n'
} > "$GALLERY/sitemap.xml"

# rss.xml — newest games first
{
  printf '<?xml version="1.0" encoding="UTF-8"?>\n'
  printf '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
  printf '<channel>\n'
  printf '  <title>Tim'"'"'s Game Lab</title>\n'
  printf '  <link>%s/</link>\n' "$SITE"
  printf '  <description>Daily HTML5 browser games. New build most days.</description>\n'
  printf '  <language>en</language>\n'
  printf '  <atom:link href="%s/rss.xml" rel="self" type="application/rss+xml"/>\n' "$SITE"
  printf '  <lastBuildDate>%s</lastBuildDate>\n' "$(date -u +'%a, %d %b %Y %H:%M:%S +0000')"
  jq -r --arg site "$SITE" '
    sort_by(.addedDate) | reverse | .[] | select(.published != false) |
    "  <item>\n" +
    "    <title>" + (.title | @html) + "</title>\n" +
    "    <link>" + $site + "/p/" + .slug + "</link>\n" +
    "    <guid isPermaLink=\"true\">" + $site + "/p/" + .slug + "</guid>\n" +
    "    <description>" + (.hook // "" | @html) + "</description>\n" +
    "    <pubDate>" + .addedDate + " 00:00:00 +0000</pubDate>\n" +
    "  </item>"
  ' "$OUT_MANIFEST"
  printf '</channel>\n</rss>\n'
} > "$GALLERY/rss.xml"

# Total file size summary
TOTAL_SIZE=$(du -sh "$GALLERY" | awk '{print $1}')
echo ""
echo "Done. Manifest: $OUT_MANIFEST"
echo "        sitemap: $GALLERY/sitemap.xml"
echo "        rss:     $GALLERY/rss.xml"
echo "        robots:  $GALLERY/robots.txt"
echo "Total Gallery/ size: $TOTAL_SIZE"

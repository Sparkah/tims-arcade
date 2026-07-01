#!/usr/bin/env bash
# Package bloodtread_mobile (the multi-module ES-module game) for the Playgama Bridge.
#
# bloodtread is NOT a single-file Phaser game: index.html loads main.js which imports ~45 ES modules,
# and the game fetches its art/audio at runtime (assets/, sprites/, art_refs/ incl. menu_loop.mp4, audio/
# incl. sfx_candidates/). So we bundle the WHOLE tree (index.html at the zip ROOT), swap the gallery
# <script src="/sdk.js"> + the GameAnalytics <script> for the Playgama Bridge snippet (game_ready fires
# after window.__BT_BOOTED), and drop ONLY proven-dead weight (vendor/GameAnalytics + build-only files).
# The game must load NOTHING external except the Bridge (Playgama #3). Reproducible: bash build_playgama.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$ROOT/builds/playgama_package"
ZIP="$ROOT/builds/bloodtread-playgama.zip"
SNIP="$ROOT/playgama-sdk-snippet.html"

[ -f "$ROOT/index.html" ] || { echo "ERR: index.html not found next to build_playgama.sh"; exit 1; }
[ -f "$SNIP" ] || { echo "ERR: playgama-sdk-snippet.html missing"; exit 1; }
[ -f "$ROOT/playgama-bridge-config.json" ] || { echo "ERR: playgama-bridge-config.json missing"; exit 1; }

rm -rf "$OUT"; mkdir -p "$OUT" "$ROOT/builds"

# Copy the ENTIRE game tree, excluding only build artifacts + build-only inputs + the analytics SDK.
# KEPT (runtime-loaded, verified by grepping the source): all *.js modules, assets/, sprites/, art_refs/
# (menu_loop.mp4 IS the menu <video>; parts/ turrets/ ui/ decals/ are blitted), audio/ (bg_track.mp3 +
# sfx/ + sfx_candidates/ - audio.js SFX_FILES loads ~47 cand_/rep_ samples from sfx_candidates!), favicon,
# playgama-bridge-config.json. DROPPED: vendor/ (GameAnalytics - Playgama #3), builds/, git + build-only.
rsync -a \
  --exclude 'builds/' \
  --exclude 'vendor/' \
  --exclude '.git/' \
  --exclude '.gitignore' \
  --exclude '.DS_Store' \
  --exclude 'build_playgama.sh' \
  --exclude 'playgama-sdk-snippet.html' \
  "$ROOT/" "$OUT/"

# Swap the gallery /sdk.js + GameAnalytics <script> tags for the Playgama Bridge snippet.
python3 - "$OUT/index.html" "$SNIP" <<'PY'
import sys
idx, snip = sys.argv[1], sys.argv[2]
html = open(idx, encoding="utf-8").read()
snippet = open(snip, encoding="utf-8").read().rstrip("\n")
snippet_indented = "\n".join(("  " + ln if ln.strip() else ln) for ln in snippet.split("\n"))

assert '<script src="/sdk.js"></script>' in html, "source /sdk.js tag not found"
assert "GameAnalytics.min.js" in html, "source GameAnalytics tag not found"

html = html.replace(
    '  <script src="/sdk.js"></script>',
    '  <!-- Playgama Bridge (replaces the gallery platform-SDK + analytics tags). Loads NOTHING external but the Bridge. -->\n' + snippet_indented)
html = html.replace('  <script src="vendor/GameAnalytics.min.js" defer></script>\n', '')

assert 'bridge.playgama.com/v1/stable/playgama-bridge.js' in html, "Bridge SDK not injected"
assert '/sdk.js' not in html, "/sdk.js survived the swap"
assert 'GameAnalytics' not in html, "GameAnalytics reference survived"
open(idx, "w", encoding="utf-8").write(html)
print("index.html: /sdk.js + GameAnalytics -> Bridge snippet OK")
PY

# ---- Self-guards (exit 1 on any Playgama-compliance failure) --------------------------------------
grep -q "bridge.playgama.com/v1/stable/playgama-bridge.js" "$OUT/index.html" || { echo "ERR: Bridge SDK string absent"; exit 1; }
grep -q 'src="/sdk.js"' "$OUT/index.html" && { echo "ERR: /sdk.js still present"; exit 1; }
grep -qi "gameanalytics" "$OUT/index.html" && { echo "ERR: GameAnalytics still referenced in index.html"; exit 1; }
[ -e "$OUT/vendor/GameAnalytics.min.js" ] && { echo "ERR: GameAnalytics SDK file still in package"; exit 1; }
# No external <script src="http..."> anywhere in the package other than the Bridge.
EXT="$(grep -rhoE '<script[^>]*src="https?://[^"]+"' "$OUT" --include='*.html' 2>/dev/null | grep -v 'bridge.playgama.com' || true)"
[ -n "$EXT" ] && { echo "ERR: unexpected external script src:"; echo "$EXT"; exit 1; }
# Latin-only filenames (Playgama #29).
NONLATIN="$(LC_ALL=C find "$OUT" -name '*[! -~]*' 2>/dev/null || true)"
[ -n "$NONLATIN" ] && { echo "ERR: non-Latin filename(s):"; echo "$NONLATIN"; exit 1; }

# ---- Zip with index.html as the FIRST entry / at the root (Playgama #28) --------------------------
rm -f "$ZIP"
( cd "$OUT" && zip -q -X "$ZIP" index.html && zip -q -rX "$ZIP" . -x index.html )

FIRST="$(unzip -l "$ZIP" | awk 'NR==4{print $4}')"
[ "$FIRST" = "index.html" ] || { echo "ERR: first zip entry is '$FIRST', not index.html"; exit 1; }

# ---- Report --------------------------------------------------------------------------------------
echo "OK -> $ZIP ($(du -h "$ZIP" | cut -f1))"
echo "first zip entry: $FIRST"
echo "files in zip: $(unzip -l "$ZIP" | tail -1 | awk '{print $2}')"
echo "external <script src=http> other than Bridge: $( [ -z "$EXT" ] && echo none || echo "$EXT" )"
echo "runtime asset dirs bundled: assets=$(find "$OUT/assets" -type f 2>/dev/null | wc -l | tr -d ' ') sprites=$(find "$OUT/sprites" -type f 2>/dev/null | wc -l | tr -d ' ') art_refs=$(find "$OUT/art_refs" -type f 2>/dev/null | wc -l | tr -d ' ') audio=$(find "$OUT/audio" -type f 2>/dev/null | wc -l | tr -d ' ')"
echo "menu_loop.mp4 bundled: $( [ -f "$OUT/art_refs/menu_loop.mp4" ] && echo yes || echo NO ) | bridge-config bundled: $( [ -f "$OUT/playgama-bridge-config.json" ] && echo yes || echo NO )"

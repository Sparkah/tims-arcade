#!/usr/bin/env bash
#
# build_webp_thumbs.sh — convert Gallery/thumbs/*.png to *.webp.
#
# WebP runs ~5-8× smaller than PNG for these screenshots, which is the
# single biggest win on slow networks. Pages with 30 cards drop from
# ~6.5 MB of thumbs to ~1 MB.
#
# Idempotent: skips when the matching .webp is newer than the .png.
# Called at the end of sync_games.sh so each deploy ships both formats.
#
# Standalone bulk run: bash Gallery/scripts/build_webp_thumbs.sh

set -euo pipefail

GALLERY="$(cd "$(dirname "$0")/.." && pwd)"
THUMBS="$GALLERY/thumbs"
QUALITY=85

if ! command -v cwebp >/dev/null; then
  echo "cwebp not found — install with: brew install webp"
  exit 1
fi

shopt -s nullglob
made=0
skipped=0

for png in "$THUMBS"/*.png; do
  webp="${png%.png}.webp"
  if [[ -f "$webp" && "$webp" -nt "$png" ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  cwebp -quiet -q "$QUALITY" "$png" -o "$webp"
  made=$((made + 1))
done

echo "  WebP: $made converted, $skipped up-to-date"

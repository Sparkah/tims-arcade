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
#
# 2026-05-19 incident: launchd cron strips $PATH; cwebp lives in
# /opt/anaconda3/bin or /opt/homebrew/bin so a naive `command -v cwebp`
# failed silently in cron context. 3 games shipped with PNG-only thumbs;
# CF served HTML for the missing .webp (SPA fallback) → broken-image
# cards. Lookup is now PATH-resilient + has a Python Pillow fallback.

set -euo pipefail

GALLERY="$(cd "$(dirname "$0")/.." && pwd)"
THUMBS="$GALLERY/thumbs"
QUALITY=85

# PATH-resilient cwebp lookup
CWEBP_BIN=""
for cand in cwebp /opt/anaconda3/bin/cwebp /opt/homebrew/bin/cwebp /usr/local/bin/cwebp /usr/bin/cwebp; do
  if command -v "$cand" >/dev/null 2>&1; then
    CWEBP_BIN="$cand"; break
  fi
  if [[ -x "$cand" ]]; then
    CWEBP_BIN="$cand"; break
  fi
done

USE_PILLOW=0
if [[ -z "$CWEBP_BIN" ]]; then
  # Fallback: Python Pillow. Slower but ships in every venv.
  if python3 -c 'from PIL import Image' 2>/dev/null; then
    echo "  cwebp not found anywhere on PATH — using Python Pillow fallback (slower)"
    USE_PILLOW=1
  else
    echo "❌ cwebp not found AND Python Pillow not installed."
    echo "   Install one of:"
    echo "     brew install webp"
    echo "     /opt/anaconda3/bin/pip install Pillow"
    exit 1
  fi
fi

shopt -s nullglob
made=0
skipped=0
failed=0

for png in "$THUMBS"/*.png; do
  webp="${png%.png}.webp"
  if [[ -f "$webp" && "$webp" -nt "$png" ]]; then
    skipped=$((skipped + 1))
    continue
  fi
  if [[ $USE_PILLOW -eq 1 ]]; then
    # Paths via argv — single-quoted heredoc + sys.argv means apostrophes
    # in filenames don't break the python source.
    if python3 - "$png" "$webp" "$QUALITY" <<'PY' 2>/dev/null
import sys
from PIL import Image
src, dst, q = sys.argv[1], sys.argv[2], int(sys.argv[3])
Image.open(src).save(dst, 'WEBP', quality=q)
PY
    then
      made=$((made + 1))
    else
      echo "  ⚠ Pillow failed for $(basename "$png")"
      failed=$((failed + 1))
    fi
  else
    if "$CWEBP_BIN" -quiet -q "$QUALITY" "$png" -o "$webp" 2>/dev/null; then
      made=$((made + 1))
    else
      echo "  ⚠ cwebp failed for $(basename "$png")"
      failed=$((failed + 1))
    fi
  fi
done

echo "  WebP: $made converted, $skipped up-to-date, $failed failed (binary=$CWEBP_BIN, pillow=$USE_PILLOW)"

# Hard exit on any failure — sync_games.sh has a webp-completeness gate
# downstream, but failing here too gives a clearer error in launchd logs.
if (( failed > 0 )); then
  exit 1
fi

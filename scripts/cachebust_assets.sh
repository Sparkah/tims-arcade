#!/usr/bin/env bash
#
# cachebust_assets.sh — append ?v=<content-hash> to every <link>/<script>
# reference of a Gallery static asset.
#
# Why: Cloudflare Pages serves /style.css and /*.js with
# `cache-control: max-age=14400, must-revalidate`. Browsers reuse the
# cached copy for 4 hours without revalidating, so a CSS or JS change
# isn't visible to returning visitors until they hard-reload. Versioning
# the URL with a content hash forces a fresh fetch whenever the file
# changes, and keeps the cache hot when it doesn't.
#
# Idempotent: rerunning with no asset changes is a no-op (the existing
# hash query string is replaced with the same hash).
#
# Invoked at the tail of sync_games.sh so every deploy publishes a
# consistent HTML+asset version pair.

set -euo pipefail

GALLERY="$(cd "$(dirname "$0")/.." && pwd)"
cd "$GALLERY"

# Content-hashed assets (filenames at Gallery root, served from /<name>).
# Anything referenced as `/posthog-init` (a CF Pages Function, not a static
# file) is intentionally excluded.
ASSETS="style.css app.js identity.js sdk.js"

shopt -s nullglob
changed=0
summary=""

for a in $ASSETS; do
  [[ -f "$a" ]] || continue
  # macOS BSD md5 -q; pin to first 8 hex chars for short query strings
  h=$(md5 -q "$a" | cut -c1-8)
  # Escape dots for the regex
  escaped="${a//./\\.}"
  for html in *.html; do
    # Match: (href|src)="/<asset>"  OR  (href|src)="/<asset>?v=xxxx"
    # Replace with: (href|src)="/<asset>?v=HASH"
    # Delimiter is '#' because '|' inside the pattern would conflict with
    # BSD sed treating the regex delimiter as an alternation boundary.
    sed -i '' -E "s#(href|src)=\"/${escaped}(\\?v=[a-f0-9]+)?\"#\\1=\"/${escaped}?v=${h}\"#g" "$html"
  done
  summary+="  /${a}?v=${h}"$'\n'
  changed=1
done

if [[ $changed -eq 1 ]]; then
  echo "[cachebust] versioned static-asset URLs in HTML:"
  printf '%s' "$summary"
else
  echo "[cachebust] no static assets to version"
fi
